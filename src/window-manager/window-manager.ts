import type {
  ActionEvent,
  RuntimeOutput,
  WindowStateChangeEvent
} from "../core/actions.js";
import {
  type ComponentEvent,
  type DisplayComponent,
  type DisplayNode,
  createNode,
  isDisplayEvent,
  isRuntimeOutputEvent
} from "../core/component.js";
import {
  ZERO_INSETS,
  copyInsets,
  copyRect,
  createInsets,
  createRect,
  insetRect,
  type Insets,
  type Rect,
  type Size
} from "../core/geometry.js";
import { createButton } from "../components/button.js";
import { createTextLabel } from "../components/text-label.js";
import {
  createWindow,
  resolveWindowChromeHeight,
  type WindowProps
} from "../containers/window.js";
import { createWindowLayer } from "../containers/window-layer.js";
import { createSurfaceShell } from "../containers/surface-shell.js";
import type {
  OpenAppOptions,
  TouchAppEvent,
  TouchAppSurfaceContext
} from "../apps/context.js";
import type { TouchAppManifest } from "../apps/manifest.js";
import type { RuntimeServices } from "../services/contracts.js";
import {
  createHostedAppInputEvent,
  createWindowManagerAppWindow,
  ensureHostedAppWindow,
  publishHostedAppWindow,
  renderAppWindowContent,
  scopeRuntimeOutput,
  stripRuntimeOutputScope,
  unpublishHostedAppWindow,
  updateAppWindowSurface,
  type WindowManagerAppWindow
} from "./app-window.js";
import {
  applyWindowStateChange,
  copyTouchWindowState,
  createWindowManagerChangeOutput,
  mapTouchWindowModeToWindowMode,
  type TouchWindowState,
  type WindowManagerChange,
  type WindowManagerProps
} from "./window-state.js";

interface WindowManagerState {
  records: Map<string, WindowManagerAppWindow>;
  nextLaunchIndex: number;
}

type ManagerContext = {
  id: string;
  state: WindowManagerState;
  props: WindowManagerProps;
  services: RuntimeServices;
  emit(output: RuntimeOutput): void;
  invalidateLayout(): void;
  invalidateRender(): void;
};

const DEFAULT_WINDOW_CONTROLS = ["minimize", "maximize", "fullscreen", "close"] as const;
const DEFAULT_LAUNCH_SIZE: Size = { width: 320, height: 220 };
const CASCADE_STEP = 24;
const UTILITY_Z_BASE = -10;

const WindowManagerComponent: DisplayComponent<WindowManagerProps, WindowManagerState> = {
  kind: "window-manager",
  mount(ctx) {
    const state: WindowManagerState = {
      records: new Map(),
      nextLaunchIndex: 0
    };
    seedInitialWindows(state, ctx);
    return state;
  },
  update(ctx) {
    syncLiveRecords(ctx);
  },
  getChildren(ctx) {
    syncLiveRecords(ctx);
    const windows = [
      ...getVisibleAppWindows(ctx).map((record) => createWindowForRecord(ctx, record)),
      ...createUtilityWindows(ctx)
    ];

    return [
      createWindowLayer(createWindowLayerId(ctx.id), {
        windows,
        pointerOpaque: ctx.props.pointerOpaque ?? true,
        ...(ctx.props.constraintPadding !== undefined
          ? { constraintPadding: ctx.props.constraintPadding }
          : {}),
        ...(ctx.props.focusOnPress !== undefined ? { focusOnPress: ctx.props.focusOnPress } : {})
      })
    ];
  },
  measure(ctx) {
    const layerId = createWindowLayerId(ctx.id);
    ctx.measureChild(layerId, {
      minWidth: 0,
      minHeight: 0,
      maxWidth: ctx.constraints.maxWidth,
      maxHeight: ctx.constraints.maxHeight
    });

    return {
      width: ctx.constraints.maxWidth,
      height: ctx.constraints.maxHeight
    };
  },
  layout(ctx) {
    ctx.setChildBounds(createWindowLayerId(ctx.id), ctx.bounds);
    ctx.setContentBounds(ctx.bounds);
  },
  render() {
    return [];
  },
  handleEvent(ctx) {
    if (isDisplayEvent(ctx.event)) {
      handleHostedDisplayEvent(ctx, ctx.event);
      return;
    }

    if (!isRuntimeOutputEvent(ctx.event)) {
      return;
    }

    if (isWindowLayerOutput(ctx.id, ctx.event)) {
      handleWindowLayerOutput(ctx, ctx.event);
      return;
    }

    if (handleManagerActionOutput(ctx, ctx.event)) {
      return;
    }

    const record = findRecordForOutput(ctx.state, ctx.event);
    if (record?.runtime) {
      record.runtime.handleOutput(stripRuntimeOutputScope(ctx.event, record.namespacePrefix));
    }
  },
  dispose(ctx) {
    for (const record of ctx.state.records.values()) {
      closeRecord(record, ctx.services.surfaces);
    }
    ctx.state.records.clear();
  }
};

export function createWindowManager(
  id: string,
  props: WindowManagerProps
): DisplayNode<WindowManagerProps, WindowManagerState> {
  return createNode(id, WindowManagerComponent, props);
}

function seedInitialWindows(
  state: WindowManagerState,
  ctx: Omit<ManagerContext, "state">
): void {
  const seedCtx = { ...ctx, state };
  for (const source of ctx.props.initialWindows ?? []) {
    const record = createRecord(seedCtx, copyTouchWindowState(source));
    state.records.set(record.window.id, record);
    state.nextLaunchIndex += 1;
    if (record.window.mode === "minimized") {
      suspendRecord(record, ctx.services.surfaces);
    }
  }

  const focused = [...state.records.values()].find(
    (record) => record.window.focused && record.window.mode !== "minimized" && !record.closed
  );
  if (focused) {
    focusRecord(seedCtx, focused.window.id);
  }
}

function syncLiveRecords(ctx: ManagerContext): void {
  for (const record of ctx.state.records.values()) {
    if (record.closed) {
      continue;
    }

    updateAppWindowSurface(record, createSurfaceContext(ctx, record.window));
    if (record.window.mode === "minimized") {
      suspendRecord(record, ctx.services.surfaces);
    } else if (record.suspended) {
      resumeRecord(record);
    }
  }
}

function createRecord(ctx: ManagerContext, window: TouchWindowState): WindowManagerAppWindow {
  let record: WindowManagerAppWindow | undefined;
  record = createWindowManagerAppWindow({
    window,
    app: ctx.props.registry.get(window.appId),
    hostMode: resolveAppHostMode(ctx.props),
    surface: createSurfaceContext(ctx, window),
    theme: ctx.services.theme,
    actions: {
      emit(event) {
        if (record) {
          emitAppEvent(ctx, record, event);
        }
      }
    },
    windows: {
      setTitle(title) {
        if (!record || record.closed) {
          return;
        }
        record.window.title = title;
        record.titleOverridden = true;
        emitManagerChange(ctx, {
          type: "set-title",
          windowId: record.window.id,
          appId: record.window.appId,
          instanceId: record.window.instanceId,
          title
        });
        ctx.invalidateLayout();
      },
      requestClose() {
        if (!record || record.closed) {
          return;
        }
        const closedWindow = copyTouchWindowState(record.window);
        closeRecord(record, ctx.services.surfaces);
        ctx.state.records.delete(record.window.id);
        emitManagerChange(ctx, {
          type: "request-close",
          window: closedWindow
        });
        ctx.invalidateLayout();
      },
      requestResize(size) {
        if (!record || record.closed || !record.window.resizable) {
          return;
        }
        resizeRecord(ctx, record, size);
      },
      openApp(appId, options) {
        openApp(ctx, appId, options);
      }
    },
    ...(ctx.props.storage ? { storage: ctx.props.storage } : {}),
    ...(ctx.props.surfaces ? { surfaces: ctx.props.surfaces } : {})
  });

  return record;
}

function createWindowForRecord(
  ctx: ManagerContext,
  record: WindowManagerAppWindow
): DisplayNode<WindowProps, unknown> {
  syncAppWindowContent(ctx, record);
  return createWindow(record.window.id, {
    title: record.window.title,
    rect: copyRect(record.window.rect),
    zIndex: record.window.zIndex,
    mode: mapTouchWindowModeToWindowMode(record.window.mode),
    movable: record.window.movable,
    resizable: record.window.resizable,
    ...(record.window.minSize ? { minSize: record.window.minSize } : {}),
    ...(record.window.maxSize ? { maxSize: record.window.maxSize } : {}),
    controls: ctx.props.windowControls ?? DEFAULT_WINDOW_CONTROLS,
    child: record.window.mode === "minimized"
      ? createTextLabel(`${record.namespacePrefix}minimized`, { text: record.window.title })
      : renderAppWindowContent(record, resolveAppState(ctx.props, record.window))
  });
}

function syncAppWindowContent(ctx: ManagerContext, record: WindowManagerAppWindow): void {
  if (record.hostMode !== "child-runtime" || !record.runtime || record.closed) {
    return;
  }

  if (record.suspended || record.window.mode === "minimized") {
    unpublishHostedAppWindow(record, ctx.services.surfaces);
    return;
  }

  const surface = createSurfaceContext(ctx, record.window);
  updateAppWindowSurface(record, surface);
  ensureHostedAppWindow(record, {
    root: record.runtime.render(resolveAppState(ctx.props, record.window)),
    surface,
    theme: ctx.services.theme,
    surfaces: ctx.services.surfaces
  });
  flushHostedAppOutputs(ctx, record);
  publishHostedAppWindow(record, ctx.services.surfaces);
}

function getVisibleAppWindows(ctx: Pick<ManagerContext, "state">): readonly WindowManagerAppWindow[] {
  return [...ctx.state.records.values()].filter((record) => !record.closed);
}

function createUtilityWindows(ctx: ManagerContext): DisplayNode<WindowProps, unknown>[] {
  const windows: DisplayNode<WindowProps, unknown>[] = [];
  if (ctx.props.launcher) {
    windows.push(createLauncherWindow(ctx));
  }
  if (ctx.props.taskSwitcher) {
    windows.push(createTaskSwitcherWindow(ctx));
  }
  return windows;
}

function createLauncherWindow(ctx: ManagerContext): DisplayNode<WindowProps, unknown> {
  const manifests = ctx.props.registry.list();
  const shellId = `${ctx.id}:launcher:shell`;
  const content = createSurfaceShell(shellId, {
    header: createTextLabel(`${ctx.id}:launcher:title`, {
      text: "Apps"
    }),
    children: manifests.length > 0
      ? manifests.map((manifest) =>
          createButton(`${ctx.id}:launcher:open:${sanitizeId(manifest.id)}`, {
            label: manifest.name,
            actionId: createLauncherActionId(ctx.id, manifest.id)
          })
        )
      : [
          createTextLabel(`${ctx.id}:launcher:empty`, {
            text: "No apps",
            tone: "muted"
          })
        ],
    bodyPadding: 8,
    bodyGap: 6,
    scrollbar: "auto"
  });

  return createWindow(createLauncherWindowId(ctx.id), {
    title: "Apps",
    rect: createLauncherRect(ctx),
    zIndex: UTILITY_Z_BASE,
    mode: "normal",
    movable: true,
    resizable: false,
    controls: [],
    child: content
  });
}

function createTaskSwitcherWindow(ctx: ManagerContext): DisplayNode<WindowProps, unknown> {
  const records = getVisibleAppWindows(ctx);
  const shellId = `${ctx.id}:tasks:shell`;
  const content = createSurfaceShell(shellId, {
    header: createTextLabel(`${ctx.id}:tasks:title`, {
      text: "Windows"
    }),
    children: records.length > 0
      ? records.map((record) =>
          createButton(`${ctx.id}:tasks:focus:${sanitizeId(record.window.id)}`, {
            label: createTaskButtonLabel(record.window),
            actionId: createTaskActionId(ctx.id, record.window.id)
          })
        )
      : [
          createTextLabel(`${ctx.id}:tasks:empty`, {
            text: "No running apps",
            tone: "muted"
          })
        ],
    bodyPadding: 8,
    bodyGap: 6,
    scrollbar: "auto"
  });

  return createWindow(createTaskSwitcherWindowId(ctx.id), {
    title: "Windows",
    rect: createTaskSwitcherRect(ctx),
    zIndex: UTILITY_Z_BASE + 1,
    mode: "normal",
    movable: true,
    resizable: false,
    controls: [],
    child: content
  });
}

function handleManagerActionOutput(ctx: ManagerContext, output: RuntimeOutput): boolean {
  if (output.type !== "action") {
    return false;
  }

  const appId = parseLauncherActionId(ctx.id, output);
  if (appId) {
    openApp(ctx, appId);
    return true;
  }

  const windowId = parseTaskActionId(ctx.id, output);
  if (windowId) {
    restoreAndFocusRecord(ctx, windowId);
    return true;
  }

  return false;
}

function openApp(
  ctx: ManagerContext,
  appId: string,
  options: OpenAppOptions = {}
): WindowManagerAppWindow | undefined {
  const app = ctx.props.registry.get(appId);
  const window = createLaunchedWindowState(ctx, appId, app?.manifest, options);
  const record = createRecord(ctx, window);
  ctx.state.records.set(record.window.id, record);
  ctx.state.nextLaunchIndex += 1;

  if (options.activate ?? true) {
    focusRecord(ctx, record.window.id);
  }

  emitManagerChange(ctx, {
    type: "open-app",
    window: record.window,
    targetAppId: appId,
    options
  });
  ctx.invalidateLayout();
  return record;
}

function createLaunchedWindowState(
  ctx: ManagerContext,
  appId: string,
  manifest: TouchAppManifest | undefined,
  options: OpenAppOptions
): TouchWindowState {
  const launchNumber = ctx.state.nextLaunchIndex + 1;
  const instanceId = options.instanceId ?? `${sanitizeId(appId)}-${launchNumber}`;
  const id = options.windowId ?? `${instanceId}-window`;
  const preferred = manifest?.preferredWindow;
  const resizable = preferred?.resizable ?? true;
  const minSize = preferred && (preferred.minWidth || preferred.minHeight)
    ? {
        width: preferred.minWidth ?? 0,
        height: preferred.minHeight ?? 0
      }
    : undefined;
  const maxSize = preferred && (preferred.maxWidth || preferred.maxHeight)
    ? {
        width: preferred.maxWidth ?? Number.POSITIVE_INFINITY,
        height: preferred.maxHeight ?? Number.POSITIVE_INFINITY
      }
    : undefined;
  const baseRect = options.rect
    ? copyRect(options.rect)
    : createCascadedLaunchRect(
        ctx,
        preferred
          ? { width: preferred.width, height: preferred.height }
          : DEFAULT_LAUNCH_SIZE
      );
  const partialWindow = {
    ...(minSize ? { minSize } : {}),
    ...(maxSize ? { maxSize } : {})
  };
  const rect = clampManagedRect(baseRect, partialWindow, getManagerConstraintRect(ctx));

  return {
    id,
    appId,
    instanceId,
    title: manifest?.name ?? appId,
    rect,
    zIndex: getNextRecordZIndex(ctx.state),
    mode: "normal",
    focused: false,
    movable: true,
    resizable,
    ...(minSize ? { minSize } : {}),
    ...(maxSize ? { maxSize } : {})
  };
}

function handleWindowLayerOutput(
  ctx: ManagerContext,
  output: WindowStateChangeEvent
): void {
  const record = ctx.state.records.get(output.windowId);
  if (!record) {
    return;
  }

  const previousMode = record.window.mode;
  record.window = applyWindowStateChange(record.window, output);

  if (output.change === "close") {
    const closedWindow = copyTouchWindowState(record.window);
    closeRecord(record, ctx.services.surfaces);
    ctx.state.records.delete(output.windowId);
    emitManagerChange(ctx, {
      type: "window-state",
      window: closedWindow,
      output
    });
    ctx.invalidateLayout();
    return;
  }

  if (record.window.mode === "minimized") {
    suspendRecord(record, ctx.services.surfaces);
  } else {
    if (previousMode === "minimized") {
      resumeRecord(record);
    }
    if (output.focused) {
      focusRecord(ctx, output.windowId);
    } else if (record.active) {
      deactivateRecord(record);
    }
  }

  if (output.focused) {
    for (const candidate of ctx.state.records.values()) {
      if (candidate.window.id !== output.windowId) {
        candidate.window.focused = false;
      }
    }
  }

  emitManagerChange(ctx, {
    type: "window-state",
    window: record.window,
    output
  });
}

function handleHostedDisplayEvent(ctx: ManagerContext, event: ComponentEvent): void {
  for (const record of ctx.state.records.values()) {
    if (!record.hosted || record.closed || record.suspended || record.window.mode === "minimized") {
      continue;
    }

    if (event.type === "tick") {
      record.hosted.runtime.tick(event.timestamp);
      flushHostedAppOutputs(ctx, record);
      publishHostedAppWindow(record, ctx.services.surfaces);
      continue;
    }

    drainHostedForwardedInput(ctx, record);
  }
}

function drainHostedForwardedInput(ctx: ManagerContext, record: WindowManagerAppWindow): void {
  if (!record.hosted) {
    return;
  }

  const forwardedEvents = ctx.services.surfaces.takeForwardedEvents(record.hostedSurfaceComponentId);
  if (forwardedEvents.length === 0) {
    return;
  }

  const bounds = ctx.services.layout.getBounds(record.hostedSurfaceComponentId);
  if (!bounds) {
    return;
  }

  const surface = createSurfaceContext(ctx, record.window);
  for (const event of forwardedEvents) {
    const input = createHostedAppInputEvent(event, bounds, surface);
    if (input) {
      record.hosted.runtime.dispatchInput(input);
    }
  }
  flushHostedAppOutputs(ctx, record);
  publishHostedAppWindow(record, ctx.services.surfaces);
}

function flushHostedAppOutputs(ctx: Pick<ManagerContext, "emit">, record: WindowManagerAppWindow): void {
  if (!record.hosted) {
    return;
  }

  for (const output of record.hosted.runtime.takeOutputs()) {
    ctx.emit(scopeRuntimeOutput(output, record.namespacePrefix));
    record.runtime?.handleOutput(output);
  }
}

function emitAppEvent(
  ctx: Pick<ManagerContext, "id" | "props" | "emit">,
  record: WindowManagerAppWindow,
  event: TouchAppEvent
): void {
  const scopedEvent: TouchAppEvent = {
    ...event,
    appId: event.appId ?? record.window.appId,
    instanceId: event.instanceId ?? record.window.instanceId,
    windowId: event.windowId ?? record.window.id
  };

  ctx.props.onAppEvent?.(scopedEvent);
  ctx.emit({
    type: "app-event",
    componentId: ctx.id,
    appId: record.window.appId,
    instanceId: record.window.instanceId,
    windowId: record.window.id,
    event: scopedEvent
  });
}

function emitManagerChange(
  ctx: Pick<ManagerContext, "id" | "props" | "emit">,
  change: WindowManagerChange
): void {
  ctx.props.onWindowChange?.(change);
  ctx.emit(createWindowManagerChangeOutput(ctx.id, change));
}

function restoreAndFocusRecord(ctx: ManagerContext, windowId: string): void {
  const record = ctx.state.records.get(windowId);
  if (!record || record.closed) {
    return;
  }

  if (record.window.mode === "minimized") {
    record.window.mode = "normal";
    resumeRecord(record);
  }

  focusRecord(ctx, windowId);
  emitManagerChange(ctx, {
    type: "window-state",
    window: record.window
  });
  ctx.invalidateLayout();
}

function resizeRecord(ctx: ManagerContext, record: WindowManagerAppWindow, size: Size): void {
  const next = clampManagedRect(
    createRect(record.window.rect.x, record.window.rect.y, size.width, size.height),
    record.window,
    getManagerConstraintRect(ctx)
  );

  if (
    next.x === record.window.rect.x &&
    next.y === record.window.rect.y &&
    next.width === record.window.rect.width &&
    next.height === record.window.rect.height
  ) {
    return;
  }

  record.window.rect = next;
  updateAppWindowSurface(record, createSurfaceContext(ctx, record.window));
  emitManagerChange(ctx, {
    type: "request-resize",
    window: record.window,
    size: {
      width: next.width,
      height: next.height
    }
  });
  ctx.invalidateLayout();
}

function focusRecord(ctx: ManagerContext, windowId: string): boolean {
  const target = ctx.state.records.get(windowId);
  if (!target || target.closed || target.window.mode === "minimized") {
    return false;
  }

  let changed = false;
  const nextZIndex = getNextRecordZIndex(ctx.state);
  for (const record of ctx.state.records.values()) {
    if (record.window.id === windowId) {
      if (record.suspended) {
        resumeRecord(record);
      }
      if (!record.active) {
        record.runtime?.activate();
        record.active = true;
        changed = true;
      }
      if (!record.window.focused) {
        record.window.focused = true;
        changed = true;
      }
      if (record.window.zIndex < nextZIndex - 1) {
        record.window.zIndex = nextZIndex;
        changed = true;
      }
      continue;
    }

    if (record.active) {
      record.runtime?.deactivate();
      record.active = false;
      changed = true;
    }
    if (record.window.focused) {
      record.window.focused = false;
      changed = true;
    }
  }

  ctx.services.focus.requestFocus(windowId);
  if (changed) {
    ctx.invalidateLayout();
  }
  return changed;
}

function deactivateRecord(record: WindowManagerAppWindow): void {
  if (record.active) {
    record.runtime?.deactivate();
    record.active = false;
  }
  record.window.focused = false;
}

function suspendRecord(record: WindowManagerAppWindow, surfaces: RuntimeServices["surfaces"]): void {
  if (record.active) {
    record.runtime?.deactivate();
    record.active = false;
  }
  if (!record.suspended) {
    record.runtime?.suspend();
    record.suspended = true;
  }
  record.window.focused = false;
  unpublishHostedAppWindow(record, surfaces);
}

function resumeRecord(record: WindowManagerAppWindow): void {
  if (!record.suspended) {
    return;
  }

  record.runtime?.resume();
  record.suspended = false;
}

function closeRecord(record: WindowManagerAppWindow, surfaces: RuntimeServices["surfaces"]): void {
  if (record.closed) {
    return;
  }

  if (record.active) {
    record.runtime?.deactivate();
    record.active = false;
  }
  record.runtime?.close();
  unpublishHostedAppWindow(record, surfaces);
  record.hosted?.runtime.dispose();
  record.hosted = undefined;
  record.closed = true;
  record.suspended = false;
  record.window.focused = false;
}

function findRecordForOutput(
  state: WindowManagerState,
  output: RuntimeOutput
): WindowManagerAppWindow | undefined {
  const componentId = getOutputComponentId(output);
  return [...state.records.values()].find((record) =>
    componentId?.startsWith(record.namespacePrefix)
  );
}

function getOutputComponentId(output: RuntimeOutput): string | undefined {
  return "componentId" in output ? output.componentId : undefined;
}

function isWindowLayerOutput(
  managerId: string,
  event: ComponentEvent
): event is WindowStateChangeEvent {
  return event.type === "window-state-change" && event.componentId === createWindowLayerId(managerId);
}

function createWindowLayerId(managerId: string): string {
  return `${managerId}:windows`;
}

function createLauncherWindowId(managerId: string): string {
  return `${managerId}:launcher-window`;
}

function createTaskSwitcherWindowId(managerId: string): string {
  return `${managerId}:task-switcher-window`;
}

function createLauncherActionId(managerId: string, appId: string): string {
  return `${managerId}:launcher.open:${appId}`;
}

function createTaskActionId(managerId: string, windowId: string): string {
  return `${managerId}:tasks.focus:${windowId}`;
}

function parseLauncherActionId(managerId: string, output: ActionEvent): string | undefined {
  const prefix = `${managerId}:launcher.open:`;
  return output.actionId.startsWith(prefix) ? output.actionId.slice(prefix.length) : undefined;
}

function parseTaskActionId(managerId: string, output: ActionEvent): string | undefined {
  const prefix = `${managerId}:tasks.focus:`;
  return output.actionId.startsWith(prefix) ? output.actionId.slice(prefix.length) : undefined;
}

function createTaskButtonLabel(window: TouchWindowState): string {
  if (window.mode === "minimized") {
    return `${window.title} (minimized)`;
  }
  if (window.focused) {
    return `${window.title} (focused)`;
  }
  return window.title;
}

function createLauncherRect(ctx: ManagerContext): Rect {
  const constraint = getManagerConstraintRect(ctx);
  return clampManagedRect(
    createRect(constraint.x, constraint.y, Math.min(240, constraint.width), Math.min(220, constraint.height)),
    {},
    constraint
  );
}

function createTaskSwitcherRect(ctx: ManagerContext): Rect {
  const constraint = getManagerConstraintRect(ctx);
  const width = Math.min(300, constraint.width);
  const height = Math.min(170, constraint.height);
  return clampManagedRect(
    createRect(constraint.x + constraint.width - width, constraint.y + constraint.height - height, width, height),
    {},
    constraint
  );
}

function createCascadedLaunchRect(ctx: ManagerContext, size: Size): Rect {
  const constraint = getManagerConstraintRect(ctx);
  const width = Math.min(size.width, constraint.width);
  const height = Math.min(size.height, constraint.height);
  const maxOffsetX = Math.max(0, constraint.width - width);
  const maxOffsetY = Math.max(0, constraint.height - height);
  const stepsX = Math.max(1, Math.floor(maxOffsetX / CASCADE_STEP) + 1);
  const stepsY = Math.max(1, Math.floor(maxOffsetY / CASCADE_STEP) + 1);
  const stepX = ctx.state.nextLaunchIndex % stepsX;
  const stepY = ctx.state.nextLaunchIndex % stepsY;
  return createRect(
    constraint.x + stepX * CASCADE_STEP,
    constraint.y + stepY * CASCADE_STEP,
    width,
    height
  );
}

function getManagerConstraintRect(ctx: ManagerContext): Rect {
  const metrics = ctx.services.surface.getMetrics();
  return insetRect(
    createRect(0, 0, metrics.width, metrics.height),
    createInsets(ctx.props.constraintPadding ?? 0)
  );
}

function clampManagedRect(
  rect: Rect,
  sizing: { minSize?: Size; maxSize?: Size },
  constraint: Rect
): Rect {
  const minWidth = Math.max(0, sizing.minSize?.width ?? 0);
  const minHeight = Math.max(0, sizing.minSize?.height ?? 0);
  const maxWidth = Math.max(minWidth, sizing.maxSize?.width ?? constraint.width);
  const maxHeight = Math.max(minHeight, sizing.maxSize?.height ?? constraint.height);
  const width = Math.min(Math.max(minWidth, rect.width), Math.min(maxWidth, constraint.width));
  const height = Math.min(Math.max(minHeight, rect.height), Math.min(maxHeight, constraint.height));
  return createRect(
    clamp(rect.x, constraint.x, constraint.x + Math.max(0, constraint.width - width)),
    clamp(rect.y, constraint.y, constraint.y + Math.max(0, constraint.height - height)),
    width,
    height
  );
}

function getNextRecordZIndex(state: WindowManagerState): number {
  let maxZIndex = -1;
  for (const record of state.records.values()) {
    maxZIndex = Math.max(maxZIndex, record.window.zIndex);
  }
  return maxZIndex + 1;
}

function resolveAppState(props: WindowManagerProps, window: TouchWindowState): unknown {
  return props.appStates?.[window.instanceId] ?? props.appStates?.[window.id];
}

function resolveAppHostMode(props: WindowManagerProps): "same-runtime" | "child-runtime" {
  return props.appHostMode ?? "same-runtime";
}

function createSurfaceContext(ctx: Pick<ManagerContext, "services" | "props">, window: TouchWindowState): TouchAppSurfaceContext {
  const metrics = ctx.services.surface.getMetrics();
  const chromeHeight = resolveWindowChromeHeight(ctx.services.theme.getTokens());
  const rect = resolveEffectiveWindowRect(ctx, window);
  return {
    width: rect.width,
    height: Math.max(0, rect.height - chromeHeight),
    pixelDensity: metrics.pixelDensity,
    safeArea: metrics.safeArea ? copyInsets(metrics.safeArea) : ZERO_INSETS
  };
}

function resolveEffectiveWindowRect(
  ctx: Pick<ManagerContext, "services" | "props">,
  window: TouchWindowState
): Rect {
  const metrics = ctx.services.surface.getMetrics();
  const full = createRect(0, 0, metrics.width, metrics.height);
  if (window.mode === "fullscreen") {
    return full;
  }
  if (window.mode === "maximized") {
    return insetRect(full, createInsets(ctx.props.constraintPadding ?? 0));
  }
  return copyRect(window.rect);
}

function sanitizeId(value: string): string {
  const sanitized = value.trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return sanitized.length > 0 ? sanitized : "app";
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}
