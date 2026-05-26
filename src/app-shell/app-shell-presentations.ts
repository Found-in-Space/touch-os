import type { DisplayNode } from "../core/component.js";
import type { SystemCommandInputEvent } from "../core/events.js";
import type { Insets, Rect } from "../core/geometry.js";
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

/** Describes the app or running session whose presentation-owned surface is being resolved. */
export interface AppShellPresentationAppSurfaceRequest {
  app: TouchAppManifest;
  session?: AppShellSession;
}

/** Presentation-owned app surface rect plus any safe area that remains local to the app. */
export interface AppShellPresentationAppSurface {
  rect: Rect;
  safeArea: Insets;
}

export interface AppShellPresentation {
  readonly kind: string;

  getInitialMode?(ctx: AppShellPresentationContext): AppShellMode;

  render(ctx: AppShellPresentationContext): DisplayNode<unknown, unknown>;

  handleSystemCommand?(
    command: SystemCommandInputEvent,
    ctx: AppShellPresentationContext
  ): AppShellAction | undefined;

  /** Resolves launch/session placement and the safe area exposed through the app context. */
  resolveAppSurface(
    request: AppShellPresentationAppSurfaceRequest,
    ctx: AppShellPresentationContext
  ): AppShellPresentationAppSurface | undefined;
}
