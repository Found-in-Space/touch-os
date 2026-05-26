import type { DisplayNode } from "../core/component.js";
import type { SystemCommandInputEvent } from "../core/events.js";
import type { Rect } from "../core/geometry.js";
import type { RuntimeServices } from "../services/contracts.js";
import type { TouchAppManifest } from "../apps/manifest.js";
import type { TouchAppRegistry } from "../apps/registry.js";
import type { AppShellAction, AppShellMode } from "./app-shell-events.js";
import type { AppShellSession } from "./app-session.js";

export interface AppShellPresentationContext {
  shellId: string;
  services: RuntimeServices;
  sessions: readonly AppShellSession[];
  registry: TouchAppRegistry;
  activeSessionId?: string;
  mode: AppShellMode;
  homeEnabled: boolean;
  taskSwitcherEnabled: boolean;
  launcherEnabled: boolean;
  launcherVisible: boolean;
  taskSwitcherVisible: boolean;
  renderSessionContent(session: AppShellSession): DisplayNode<unknown, unknown>;
  emitShellAction(action: AppShellAction): void;
}

export interface AppShellPresentation {
  readonly kind: string;

  getInitialMode?(ctx: AppShellPresentationContext): AppShellMode;

  render(ctx: AppShellPresentationContext): DisplayNode<unknown, unknown>;

  handleSystemCommand?(
    command: SystemCommandInputEvent,
    ctx: AppShellPresentationContext
  ): AppShellAction | undefined;

  resolveLaunchRect?(
    app: TouchAppManifest,
    ctx: AppShellPresentationContext
  ): Rect | undefined;
}
