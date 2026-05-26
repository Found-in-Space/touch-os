import type { Rect, Size } from "./geometry.js";

export interface ActionEvent {
  type: "action";
  actionId: string;
  componentId: string;
  payload?: Record<string, unknown>;
}

export interface ChangeRequestEvent<TValue = unknown> {
  type: "change-request";
  componentId: string;
  field: string;
  value: TValue;
}

export interface NavigationRequestEvent {
  type: "navigation-request";
  componentId: string;
  containerId: string;
  intent: "push" | "replace" | "back";
  pageId?: string;
}

export type WindowMode = "normal" | "minimized" | "maximized" | "closed";

export type WindowStateChangeReason =
  | "focus"
  | "move"
  | "close"
  | "minimize"
  | "maximize"
  | "restore";

export interface WindowStateChangeEvent {
  type: "window-state-change";
  componentId: string;
  windowId: string;
  change: WindowStateChangeReason;
  rect: Rect;
  zIndex: number;
  focused: boolean;
  mode: WindowMode;
  previousRect?: Rect;
  previousZIndex?: number;
  previousMode?: WindowMode;
  persistenceKey?: string;
}

export interface AppEventOutput {
  type: "app-event";
  componentId: string;
  appId: string;
  instanceId: string;
  windowId: string;
  event: {
    type: string;
    [key: string]: unknown;
  };
}

export type WindowManagerChangeReason =
  | "window-state"
  | "set-title"
  | "request-close"
  | "request-resize"
  | "open-app";

export interface WindowManagerOpenAppRequest {
  appId: string;
  instanceId?: string;
  windowId?: string;
  rect?: Rect;
  activate?: boolean;
  payload?: Record<string, unknown>;
}

export interface WindowManagerChangeEvent {
  type: "window-manager-change";
  componentId: string;
  change: WindowManagerChangeReason;
  windowId?: string;
  appId?: string;
  instanceId?: string;
  title?: string;
  rect?: Rect;
  size?: Size;
  zIndex?: number;
  focused?: boolean;
  mode?: WindowMode | "fullscreen";
  targetAppId?: string;
  options?: WindowManagerOpenAppRequest;
}

export type RuntimeOutput =
  | ActionEvent
  | ChangeRequestEvent<unknown>
  | NavigationRequestEvent
  | WindowStateChangeEvent
  | AppEventOutput
  | WindowManagerChangeEvent;
