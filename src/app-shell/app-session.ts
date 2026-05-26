import type { Rect, Size } from "../core/geometry.js";
import type { TouchWindowMode } from "../window-manager/window-state.js";

export interface AppShellSession {
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
  active: boolean;
  suspended: boolean;
  hostMode: "same-runtime" | "child-runtime";
}

export interface AppShellSessionSeed {
  id?: string;
  appId: string;
  instanceId?: string;
  windowId?: string;
  title?: string;
  rect?: Rect;
  zIndex?: number;
  mode?: TouchWindowMode;
  focused?: boolean;
  movable?: boolean;
  resizable?: boolean;
  minSize?: Size;
  maxSize?: Size;
}
