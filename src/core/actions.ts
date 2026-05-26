import type { Rect } from "./geometry.js";

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

export type RuntimeOutput =
  | ActionEvent
  | ChangeRequestEvent<unknown>
  | NavigationRequestEvent
  | WindowStateChangeEvent;
