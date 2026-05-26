import type {
  AppEventOutput,
  ChangeRequestEvent,
  NavigationRequestEvent,
  RuntimeOutput,
  WindowManagerChangeEvent,
  WindowStateChangeEvent
} from "../core/actions.js";
import type { DisplayNode } from "../core/component.js";
import type { RenderSnapshot } from "../core/draw.js";
import type { DisplayEvent, InputEvent } from "../core/events.js";
import type { Rect } from "../core/geometry.js";
import { createRuntime, type DisplayRuntime } from "../core/runtime.js";
import { createEmbeddedSurface } from "../components/embedded-surface.js";
import { createTextLabel } from "../components/text-label.js";
import {
  createTouchAppInstance,
  type TouchAppModule,
  type TouchAppRuntimeInstance
} from "../apps/define-app.js";
import type {
  TouchAppActions,
  TouchAppStorage,
  TouchAppSurfaceApi,
  TouchAppSurfaceContext,
  TouchAppWindowApi
} from "../apps/context.js";
import type {
  EmbeddedSurfaceChange,
  EmbeddedSurfaceService,
  ThemeService
} from "../services/contracts.js";
import {
  drawRenderSnapshotToCanvasContext,
  type CanvasSurfaceContextLike
} from "../rendering/canvas-snapshot-renderer.js";
import {
  copyTouchWindowState,
  type TouchWindowState,
  type WindowManagerAppHostMode
} from "../window-manager/window-state.js";

export interface WindowManagerAppWindow {
  window: TouchWindowState;
  hostMode: WindowManagerAppHostMode;
  namespacePrefix: string;
  runtime: TouchAppRuntimeInstance<unknown> | undefined;
  hosted: HostedAppWindow | undefined;
  hostedSurfaceComponentId: string;
  forwardAppOutputs: boolean;
  lastPublishedRevision: number | undefined;
  lastPublishedWidth: number | undefined;
  lastPublishedHeight: number | undefined;
  active: boolean;
  suspended: boolean;
  closed: boolean;
  titleOverridden: boolean;
}

export interface HostedAppWindow {
  window: TouchWindowState;
  runtime: DisplayRuntime;
  surfaceSourceId: string;
}

export interface CreateWindowManagerAppWindowOptions {
  window: TouchWindowState;
  app: TouchAppModule<unknown> | undefined;
  hostMode?: WindowManagerAppHostMode;
  surface: TouchAppSurfaceContext;
  theme: ThemeService;
  actions: TouchAppActions;
  windows: Partial<TouchAppWindowApi>;
  storage?: TouchAppStorage;
  surfaces?: TouchAppSurfaceApi;
  forwardAppOutputs?: boolean;
}

export interface EnsureHostedAppWindowOptions {
  root: DisplayNode<unknown, unknown>;
  surface: TouchAppSurfaceContext;
  theme: ThemeService;
  surfaces: EmbeddedSurfaceService;
}

export interface ScopeDisplayNodeIdsOptions {
  prefix: string;
}

export interface TouchRuntimeSurfaceHandle {
  kind: "touch-os-render-snapshot";
  width: number;
  height: number;
  revision: number;
  snapshot: RenderSnapshot;
  draw(context: CanvasSurfaceContextLike, rect: Rect): void;
}

export function createWindowManagerAppWindow(
  options: CreateWindowManagerAppWindowOptions
): WindowManagerAppWindow {
  const record: WindowManagerAppWindow = {
    window: copyTouchWindowState(options.window),
    hostMode: options.hostMode ?? "same-runtime",
    namespacePrefix: createAppWindowNamespace(options.window),
    runtime: undefined,
    hosted: undefined,
    hostedSurfaceComponentId: createHostedAppSurfaceComponentId(options.window),
    forwardAppOutputs: options.forwardAppOutputs ?? false,
    lastPublishedRevision: undefined,
    lastPublishedWidth: undefined,
    lastPublishedHeight: undefined,
    active: false,
    suspended: false,
    closed: false,
    titleOverridden: false
  };

  if (options.app) {
    record.runtime = createTouchAppInstance(options.app, {
      instanceId: options.window.instanceId,
      windowId: options.window.id,
      surface: options.surface,
      theme: options.theme,
      actions: options.actions,
      windows: options.windows,
      ...(options.storage ? { storage: options.storage } : {}),
      ...(options.surfaces ? { surfaces: options.surfaces } : {})
    });
  }

  return record;
}

export function renderAppWindowContent(
  record: WindowManagerAppWindow,
  appState: unknown
): DisplayNode<unknown, unknown> {
  if (record.hosted) {
    return createEmbeddedSurface(record.hostedSurfaceComponentId, {
      sourceId: record.hosted.surfaceSourceId,
      interactive: true,
      acceptsForwardedInput: true,
      preserveAspectRatio: false,
      viewportPadding: 0,
      fallbackLabel: `${record.window.title} unavailable`
    });
  }

  const root = record.runtime
    ? record.runtime.render(appState)
    : createTextLabel("missing-app", {
        text: `Missing app: ${record.window.appId}`,
        tone: "muted"
      });

  return scopeDisplayNodeIds(root, { prefix: record.namespacePrefix });
}

export function ensureHostedAppWindow(
  record: WindowManagerAppWindow,
  options: EnsureHostedAppWindowOptions
): HostedAppWindow {
  if (!record.hosted) {
    record.hosted = {
      window: copyTouchWindowState(record.window),
      runtime: createRuntime({
        root: options.root,
        surface: options.surface,
        services: {
          theme: options.theme,
          surfaces: createNamespacedEmbeddedSurfaceService(options.surfaces, record.namespacePrefix)
        }
      }),
      surfaceSourceId: createHostedAppSurfaceSourceId(record.window)
    };
    return record.hosted;
  }

  record.hosted.window = copyTouchWindowState(record.window);
  record.hosted.runtime.resize(options.surface);
  record.hosted.runtime.setRoot(options.root);
  return record.hosted;
}

export function unpublishHostedAppWindow(
  record: WindowManagerAppWindow,
  surfaces: EmbeddedSurfaceService
): void {
  if (!record.hosted) {
    return;
  }

  surfaces.unpublish(record.hosted.surfaceSourceId);
  record.lastPublishedRevision = undefined;
  record.lastPublishedWidth = undefined;
  record.lastPublishedHeight = undefined;
}

export function publishHostedAppWindow(
  record: WindowManagerAppWindow,
  surfaces: EmbeddedSurfaceService
): void {
  if (!record.hosted) {
    return;
  }

  const snapshot = record.hosted.runtime.render();
  const metrics = record.hosted.runtime.getServices().surface.getMetrics();
  if (
    record.lastPublishedRevision === snapshot.revision &&
    record.lastPublishedWidth === metrics.width &&
    record.lastPublishedHeight === metrics.height
  ) {
    return;
  }

  record.lastPublishedRevision = snapshot.revision;
  record.lastPublishedWidth = metrics.width;
  record.lastPublishedHeight = metrics.height;
  surfaces.publish(record.hosted.surfaceSourceId, {
    available: true,
    handle: createTouchRuntimeSurfaceHandle(snapshot, metrics.width, metrics.height),
    sourceWidth: metrics.width,
    sourceHeight: metrics.height,
    refreshState: "updating",
    sourceType: "touch-os-runtime"
  });
}

export function createHostedAppInputEvent(
  event: DisplayEvent,
  surfaceBounds: Rect,
  surface: TouchAppSurfaceContext
): InputEvent | undefined {
  if (!("localX" in event) || !("localY" in event)) {
    return undefined;
  }

  if (surfaceBounds.width <= 0 || surfaceBounds.height <= 0) {
    return undefined;
  }

  const scaleX = surface.width / surfaceBounds.width;
  const scaleY = surface.height / surfaceBounds.height;
  const surfaceX = clamp(event.localX * scaleX, 0, surface.width);
  const surfaceY = clamp(event.localY * scaleY, 0, surface.height);
  const base = createInputEventBase(event);

  switch (event.type) {
    case "pointer-enter":
    case "pointer-move":
    case "drag-start":
    case "drag-move":
      return {
        ...base,
        type: "pointer-move",
        surfaceX,
        surfaceY
      };
    case "pointer-down":
      return {
        ...base,
        type: "pointer-down",
        surfaceX,
        surfaceY
      };
    case "pointer-up":
      return {
        ...base,
        type: "pointer-up",
        surfaceX,
        surfaceY
      };
    case "pointer-leave":
    case "cancel":
      return {
        ...base,
        type: "cancel",
        surfaceX,
        surfaceY
      };
    case "scroll":
      return {
        ...base,
        type: "scroll",
        surfaceX,
        surfaceY,
        deltaX: event.deltaX * scaleX,
        deltaY: event.deltaY * scaleY
      };
    default:
      return undefined;
  }
}

export function scopeRuntimeOutput(
  output: RuntimeOutput,
  prefix: string
): RuntimeOutput {
  switch (output.type) {
    case "action":
      return {
        ...output,
        componentId: scopeComponentId(output.componentId, prefix)
      };
    case "change-request":
      return {
        ...output,
        componentId: scopeComponentId(output.componentId, prefix)
      };
    case "navigation-request":
      return {
        ...output,
        componentId: scopeComponentId(output.componentId, prefix),
        containerId: scopeComponentId(output.containerId, prefix),
        ...(output.pageId ? { pageId: scopeComponentId(output.pageId, prefix) } : {})
      };
    case "window-state-change":
      return {
        ...output,
        componentId: scopeComponentId(output.componentId, prefix),
        windowId: scopeComponentId(output.windowId, prefix)
      };
    case "app-event":
      return {
        ...output,
        componentId: scopeComponentId(output.componentId, prefix),
        windowId: scopeComponentId(output.windowId, prefix)
      };
    case "window-manager-change":
      return {
        ...output,
        componentId: scopeComponentId(output.componentId, prefix),
        ...(output.windowId ? { windowId: scopeComponentId(output.windowId, prefix) } : {})
      };
    case "system-command":
      return { ...output };
  }
}

export function updateAppWindowSurface(
  record: WindowManagerAppWindow,
  surface: TouchAppSurfaceContext
): void {
  if (!record.runtime) {
    return;
  }

  record.runtime.context.surface.width = surface.width;
  record.runtime.context.surface.height = surface.height;
  record.runtime.context.surface.pixelDensity = surface.pixelDensity;
  record.runtime.context.surface.safeArea = { ...surface.safeArea };
}

export function createAppWindowNamespace(window: TouchWindowState): string {
  return `${window.appId}:${window.instanceId}:${window.id}:`;
}

export function createHostedAppSurfaceSourceId(window: TouchWindowState): string {
  return `${createAppWindowNamespace(window)}surface-source`;
}

export function createHostedAppSurfaceComponentId(window: TouchWindowState): string {
  return `${createAppWindowNamespace(window)}surface`;
}

export function scopeDisplayNodeIds(
  node: DisplayNode<unknown, unknown>,
  options: ScopeDisplayNodeIdsOptions
): DisplayNode<unknown, unknown> {
  return scopeDisplayNode(node, options.prefix);
}

export function stripRuntimeOutputScope(
  output: RuntimeOutput,
  prefix: string
): RuntimeOutput {
  switch (output.type) {
    case "action":
      return {
        ...output,
        componentId: stripDisplayNodeIdScope(output.componentId, prefix)
      };
    case "change-request":
      return stripChangeRequestScope(output, prefix);
    case "navigation-request":
      return stripNavigationScope(output, prefix);
    case "window-state-change":
      return stripWindowStateChangeScope(output, prefix);
    case "app-event":
      return stripAppEventScope(output, prefix);
    case "window-manager-change":
      return stripWindowManagerChangeScope(output, prefix);
    case "system-command":
      return { ...output };
  }
}

export function stripDisplayNodeIdScope(id: string, prefix: string): string {
  return id.startsWith(prefix) ? id.slice(prefix.length) : id;
}

function scopeDisplayNode(
  node: DisplayNode<unknown, unknown>,
  prefix: string
): DisplayNode<unknown, unknown> {
  return {
    id: scopeComponentId(node.id, prefix),
    component: node.component,
    props: scopeComponentProps(node.props, prefix)
  };
}

function scopeComponentProps(props: unknown, prefix: string): unknown {
  if (!isPlainObject(props)) {
    return props;
  }

  const scoped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (shouldPreservePayloadKey(key)) {
      scoped[key] = value;
    } else if (shouldScopeReferenceKey(key)) {
      scoped[key] = typeof value === "string" ? scopeComponentId(value, prefix) : value;
    } else if (shouldScopeStructuralKey(key)) {
      scoped[key] = scopeValue(value, prefix);
    } else {
      scoped[key] = value;
    }
  }
  return scoped;
}

function scopeValue(value: unknown, prefix: string): unknown {
  if (isDisplayNodeValue(value)) {
    return scopeDisplayNode(value, prefix);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => scopeValue(entry, prefix));
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const scoped: Record<string, unknown> = {};
  for (const [key, entryValue] of Object.entries(value)) {
    if (shouldPreservePayloadKey(key)) {
      scoped[key] = entryValue;
    } else if (shouldScopeReferenceKey(key)) {
      scoped[key] = typeof entryValue === "string" ? scopeComponentId(entryValue, prefix) : entryValue;
    } else if (shouldScopeStructuralKey(key)) {
      scoped[key] = scopeValue(entryValue, prefix);
    } else {
      scoped[key] = entryValue;
    }
  }
  return scoped;
}

function scopeComponentId(id: string, prefix: string): string {
  return id.startsWith(prefix) ? id : `${prefix}${id}`;
}

function createTouchRuntimeSurfaceHandle(
  snapshot: RenderSnapshot,
  width: number,
  height: number
): TouchRuntimeSurfaceHandle {
  return {
    kind: "touch-os-render-snapshot",
    width,
    height,
    revision: snapshot.revision,
    snapshot,
    draw(context, rect) {
      drawRenderSnapshotToCanvasContext(context, snapshot, {
        sourceWidth: width,
        sourceHeight: height,
        targetRect: rect
      });
    }
  };
}

function createInputEventBase(event: DisplayEvent): Omit<InputEvent, "type" | "surfaceX" | "surfaceY" | "deltaX" | "deltaY" | "componentId"> {
  return {
    timestamp: event.timestamp,
    ...(event.pointerId ? { pointerId: event.pointerId } : {}),
    ...(event.pointerType ? { pointerType: event.pointerType } : {}),
    ...(event.pressure !== undefined ? { pressure: event.pressure } : {}),
    ...(event.modifiers ? { modifiers: event.modifiers } : {})
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function createNamespacedEmbeddedSurfaceService(
  service: EmbeddedSurfaceService,
  prefix: string
): EmbeddedSurfaceService {
  const mapComponentId = (componentId: string) => scopeComponentId(componentId, prefix);
  const unmapComponentId = (componentId: string) => stripDisplayNodeIdScope(componentId, prefix);

  return {
    attach(componentId, config) {
      service.attach(mapComponentId(componentId), config);
    },
    configure(componentId, config) {
      service.configure(mapComponentId(componentId), config);
    },
    release(componentId) {
      service.release(mapComponentId(componentId));
    },
    subscribe(listener) {
      return service.subscribe((change) => {
        listener(createNamespacedEmbeddedSurfaceChange(change, prefix, unmapComponentId));
      });
    },
    getAttachment(componentId) {
      return service.getAttachment(mapComponentId(componentId));
    },
    getSource(sourceId) {
      return service.getSource(sourceId);
    },
    isAvailable(componentId) {
      return service.isAvailable(mapComponentId(componentId));
    },
    getHandle(componentId) {
      return service.getHandle(mapComponentId(componentId));
    },
    publish(sourceId, update) {
      service.publish(sourceId, update);
    },
    unpublish(sourceId) {
      service.unpublish(sourceId);
    },
    forwardEvent(componentId, event) {
      service.forwardEvent(mapComponentId(componentId), event);
    },
    takeForwardedEvents(componentId) {
      return service.takeForwardedEvents(mapComponentId(componentId));
    }
  };
}

function createNamespacedEmbeddedSurfaceChange(
  change: EmbeddedSurfaceChange,
  prefix: string,
  unmapComponentId: (componentId: string) => string
): EmbeddedSurfaceChange {
  return {
    componentIds: change.componentIds
      .filter((componentId) => componentId.startsWith(prefix))
      .map(unmapComponentId),
    sourceIds: [...change.sourceIds]
  };
}

function shouldScopeReferenceKey(key: string): boolean {
  return (
    key === "containerId" ||
    key === "defaultTargetId" ||
    key === "initialPageId" ||
    key === "pageId" ||
    key === "scrollId"
  );
}

function shouldPreservePayloadKey(key: string): boolean {
  return key === "payload" || key.endsWith("Payload");
}

function shouldScopeStructuralKey(key: string): boolean {
  return (
    key === "child" ||
    key === "children" ||
    key === "header" ||
    key === "footer" ||
    key === "topLeft" ||
    key === "topCenter" ||
    key === "topRight" ||
    key === "bottomLeft" ||
    key === "bottomCenter" ||
    key === "bottomRight"
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  );
}

function isDisplayNodeValue(value: unknown): value is DisplayNode<unknown, unknown> {
  if (!isPlainObject(value)) {
    return false;
  }

  const component = value.component;
  return (
    typeof value.id === "string" &&
    isPlainObject(component) &&
    typeof component.kind === "string" &&
    "props" in value
  );
}

function stripChangeRequestScope(
  output: ChangeRequestEvent<unknown>,
  prefix: string
): ChangeRequestEvent<unknown> {
  return {
    ...output,
    componentId: stripDisplayNodeIdScope(output.componentId, prefix)
  };
}

function stripNavigationScope(
  output: NavigationRequestEvent,
  prefix: string
): NavigationRequestEvent {
  return {
    ...output,
    componentId: stripDisplayNodeIdScope(output.componentId, prefix),
    containerId: stripDisplayNodeIdScope(output.containerId, prefix),
    ...(output.pageId ? { pageId: stripDisplayNodeIdScope(output.pageId, prefix) } : {})
  };
}

function stripWindowStateChangeScope(
  output: WindowStateChangeEvent,
  prefix: string
): WindowStateChangeEvent {
  return {
    ...output,
    componentId: stripDisplayNodeIdScope(output.componentId, prefix),
    windowId: stripDisplayNodeIdScope(output.windowId, prefix)
  };
}

function stripAppEventScope(
  output: AppEventOutput,
  prefix: string
): AppEventOutput {
  return {
    ...output,
    componentId: stripDisplayNodeIdScope(output.componentId, prefix),
    windowId: stripDisplayNodeIdScope(output.windowId, prefix)
  };
}

function stripWindowManagerChangeScope(
  output: WindowManagerChangeEvent,
  prefix: string
): WindowManagerChangeEvent {
  return {
    ...output,
    componentId: stripDisplayNodeIdScope(output.componentId, prefix),
    ...(output.windowId ? { windowId: stripDisplayNodeIdScope(output.windowId, prefix) } : {})
  };
}
