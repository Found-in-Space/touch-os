import type {
  AppEventOutput,
  ChangeRequestEvent,
  NavigationRequestEvent,
  RuntimeOutput,
  WindowManagerChangeEvent,
  WindowStateChangeEvent
} from "../core/actions.js";
import type { DisplayNode } from "../core/component.js";
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
import type { ThemeService } from "../services/contracts.js";
import { copyTouchWindowState, type TouchWindowState } from "./window-state.js";

export interface WindowManagerAppWindow {
  window: TouchWindowState;
  namespacePrefix: string;
  runtime: TouchAppRuntimeInstance<unknown> | undefined;
  active: boolean;
  closed: boolean;
  titleOverridden: boolean;
}

export interface CreateWindowManagerAppWindowOptions {
  window: TouchWindowState;
  app: TouchAppModule<unknown> | undefined;
  surface: TouchAppSurfaceContext;
  theme: ThemeService;
  actions: TouchAppActions;
  windows: Partial<TouchAppWindowApi>;
  storage?: TouchAppStorage;
  surfaces?: TouchAppSurfaceApi;
}

export interface ScopeDisplayNodeIdsOptions {
  prefix: string;
}

export function createWindowManagerAppWindow(
  options: CreateWindowManagerAppWindowOptions
): WindowManagerAppWindow {
  const record: WindowManagerAppWindow = {
    window: copyTouchWindowState(options.window),
    namespacePrefix: createAppWindowNamespace(options.window),
    runtime: undefined,
    active: false,
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
  const root = record.runtime
    ? record.runtime.render(appState)
    : createTextLabel("missing-app", {
        text: `Missing app: ${record.window.appId}`,
        tone: "muted"
      });

  return scopeDisplayNodeIds(root, { prefix: record.namespacePrefix });
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
    props: scopeValue(node.props, prefix)
  };
}

function scopeValue(value: unknown, prefix: string, key?: string): unknown {
  if (typeof value === "string") {
    return key && shouldScopeReferenceKey(key) ? scopeComponentId(value, prefix) : value;
  }

  if (isDisplayNodeValue(value)) {
    return scopeDisplayNode(value, prefix);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => scopeValue(entry, prefix));
  }

  if (isPlainObject(value)) {
    const scoped: Record<string, unknown> = {};
    for (const [entryKey, entryValue] of Object.entries(value)) {
      scoped[entryKey] = scopeValue(entryValue, prefix, entryKey);
    }
    return scoped;
  }

  return value;
}

function scopeComponentId(id: string, prefix: string): string {
  return id.startsWith(prefix) ? id : `${prefix}${id}`;
}

function shouldScopeReferenceKey(key: string): boolean {
  return (
    key === "componentId" ||
    key === "containerId" ||
    key === "defaultTargetId" ||
    key === "initialPageId" ||
    key === "pageId" ||
    key === "targetId" ||
    key === "windowId"
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
