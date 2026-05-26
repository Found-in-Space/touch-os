import type { RuntimeOutput } from "../core/actions.js";
import type { Rect, Size } from "../core/geometry.js";
import type { OpenAppOptions, TouchAppEvent } from "../apps/context.js";
import type { AppShellSession } from "./app-session.js";

export type AppShellAction =
  | { type: "open-app"; appId: string; options?: OpenAppOptions }
  | { type: "activate-session"; sessionId: string }
  | { type: "close-session"; sessionId: string }
  | { type: "resize-session"; sessionId: string; size: Size }
  | { type: "set-mode"; mode: AppShellMode }
  | { type: "home" }
  | { type: "toggle-launcher" }
  | { type: "toggle-task-switcher" };

export type AppShellMode =
  | "home"
  | "app"
  | "desktop"
  | "task-switcher";

export type AppShellChangeReason =
  | "window-state"
  | "set-title"
  | "request-close"
  | "request-resize"
  | "open-app"
  | "activate-session"
  | "close-session"
  | "shell-mode";

export interface AppShellChange {
  type: AppShellChangeReason;
  sessionId?: string;
  windowId?: string;
  appId?: string;
  instanceId?: string;
  session?: AppShellSession;
  event?: TouchAppEvent;
  output?: RuntimeOutput;
  title?: string;
  size?: Size;
  rect?: Rect;
  targetAppId?: string;
  options?: OpenAppOptions;
  mode?: AppShellMode;
}
