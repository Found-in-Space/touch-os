import type {
  WindowManagerChangeEvent,
  WindowMode,
  WindowStateChangeEvent
} from "../core/actions.js";
import {
  copyRect,
  copySize,
  type Insets,
  type Rect,
  type Size
} from "../core/geometry.js";
import type { TouchAppRegistry } from "../apps/registry.js";
import type {
  OpenAppOptions,
  TouchAppEvent,
  TouchAppStorage,
  TouchAppSurfaceApi
} from "../apps/context.js";
import type { WindowControl } from "../containers/window.js";

export type TouchWindowMode = "normal" | "minimized" | "maximized" | "fullscreen";

export type WindowManagerAppHostMode = "same-runtime" | "child-runtime";

export type WindowManagerUtilityWindowPolicy = "none" | "back" | "front";

export interface TouchWindowState {
  id: string;
  appId: string;
  instanceId: string;
  title: string;
  rect: Rect;
  zIndex: number;
  mode: TouchWindowMode;
  focused: boolean;
  movable: boolean;
  resizable: boolean;
  minSize?: Size;
  maxSize?: Size;
}

export interface WindowManagerChange {
  type: WindowManagerChangeEvent["change"];
  windowId?: string;
  appId?: string;
  instanceId?: string;
  window?: TouchWindowState;
  event?: TouchAppEvent;
  output?: WindowStateChangeEvent;
  title?: string;
  size?: Size;
  targetAppId?: string;
  options?: OpenAppOptions;
}

export interface WindowManagerProps {
  registry: TouchAppRegistry;
  initialWindows?: readonly TouchWindowState[];
  launcher?: boolean;
  taskSwitcher?: boolean;
  appHostMode?: WindowManagerAppHostMode;
  utilityWindows?: WindowManagerUtilityWindowPolicy;
  pointerOpaque?: boolean;
  constraintPadding?: number | Partial<Insets>;
  focusOnPress?: boolean;
  windowControls?: readonly WindowControl[];
  appStates?: Readonly<Record<string, unknown>>;
  getAppState?(window: TouchWindowState): unknown;
  forwardAppOutputs?: boolean;
  storage?: TouchAppStorage;
  surfaces?: TouchAppSurfaceApi;
  onWindowChange?(change: WindowManagerChange): void;
  onAppEvent?(event: TouchAppEvent): void;
}

export function copyTouchWindowState(window: TouchWindowState): TouchWindowState {
  return {
    id: window.id,
    appId: window.appId,
    instanceId: window.instanceId,
    title: window.title,
    rect: copyRect(window.rect),
    zIndex: window.zIndex,
    mode: window.mode,
    focused: window.focused,
    movable: window.movable,
    resizable: window.resizable,
    ...(window.minSize ? { minSize: copySize(window.minSize) } : {}),
    ...(window.maxSize ? { maxSize: copySize(window.maxSize) } : {})
  };
}

export function applyWindowStateChange(
  window: TouchWindowState,
  output: WindowStateChangeEvent
): TouchWindowState {
  return {
    ...window,
    rect: copyRect(output.rect),
    zIndex: output.zIndex,
    focused: output.focused,
    mode: output.mode === "closed" ? window.mode : output.mode
  };
}

export function createWindowManagerChangeOutput(
  componentId: string,
  change: WindowManagerChange
): WindowManagerChangeEvent {
  const output: WindowManagerChangeEvent = {
    type: "window-manager-change",
    componentId,
    change: change.type
  };

  if (change.windowId) {
    output.windowId = change.windowId;
  }
  if (change.appId) {
    output.appId = change.appId;
  }
  if (change.instanceId) {
    output.instanceId = change.instanceId;
  }
  if (change.window) {
    output.windowId = change.window.id;
    output.appId = change.window.appId;
    output.instanceId = change.window.instanceId;
    output.rect = copyRect(change.window.rect);
    output.zIndex = change.window.zIndex;
    output.focused = change.window.focused;
    output.mode = change.window.mode;
  }
  if (change.title !== undefined) {
    output.title = change.title;
  }
  if (change.size) {
    output.size = copySize(change.size);
  }
  if (change.targetAppId) {
    output.targetAppId = change.targetAppId;
  }
  if (change.options && change.targetAppId) {
    output.options = {
      appId: change.targetAppId,
      ...(change.options.instanceId ? { instanceId: change.options.instanceId } : {}),
      ...(change.options.windowId ? { windowId: change.options.windowId } : {}),
      ...(change.options.rect ? { rect: copyRect(change.options.rect) } : {}),
      ...(change.options.activate !== undefined ? { activate: change.options.activate } : {}),
      ...(change.options.payload ? { payload: change.options.payload } : {})
    };
  }

  return output;
}

export function mapTouchWindowModeToWindowMode(
  mode: TouchWindowMode
): Exclude<WindowMode, "closed"> {
  return mode;
}
