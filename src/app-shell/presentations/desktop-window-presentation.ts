import { createButton } from "../../components/button.js";
import { createTextLabel } from "../../components/text-label.js";
import { createSurfaceShell } from "../../containers/surface-shell.js";
import {
  createWindow,
  type WindowControl,
  type WindowProps
} from "../../containers/window.js";
import { createWindowLayer } from "../../containers/window-layer.js";
import type { DisplayNode } from "../../core/component.js";
import {
  copyInsets,
  copyRect,
  createInsets,
  createRect,
  insetRect,
  type Insets,
  type Rect
} from "../../core/geometry.js";
import type { TouchAppManifest } from "../../apps/manifest.js";
import {
  mapTouchWindowModeToWindowMode,
  type WindowManagerUtilityWindowPolicy
} from "../../window-manager/window-state.js";
import type { AppShellAction } from "../app-shell-events.js";
import type {
  AppShellPresentation,
  AppShellPresentationContext
} from "../app-shell-presentations.js";
import type { AppShellSession } from "../app-session.js";

export interface DesktopWindowPresentationOptions {
  utilityWindows?: WindowManagerUtilityWindowPolicy;
  pointerOpaque?: boolean;
  constraintPadding?: number | Partial<Insets>;
  focusOnPress?: boolean;
  windowControls?: readonly WindowControl[];
}

const DEFAULT_WINDOW_CONTROLS = ["minimize", "maximize", "fullscreen", "close"] as const;
const UTILITY_Z_BASE = -10;

export function createDesktopWindowPresentation(
  options: DesktopWindowPresentationOptions = {}
): AppShellPresentation {
  return {
    kind: "desktop-window",
    getInitialMode() {
      return "desktop";
    },
    render(ctx) {
      const policy = options.utilityWindows ?? "front";
      const utilityBaseZ = policy === "front" ? getNextSessionZIndex(ctx.sessions) : UTILITY_Z_BASE;
      const windows: DisplayNode<WindowProps, unknown>[] = [
        ...ctx.sessions.map((session) => createWindowForSession(ctx, session, options))
      ];

      if (policy !== "none") {
        if (ctx.launcherEnabled && ctx.launcherVisible) {
          windows.push(createLauncherWindow(ctx, utilityBaseZ, options));
        }
        if (ctx.taskSwitcherEnabled && ctx.taskSwitcherVisible) {
          windows.push(createTaskSwitcherWindow(ctx, utilityBaseZ + 1, options));
        }
      }

      return createWindowLayer(createWindowLayerId(ctx.shellId), {
        windows,
        pointerOpaque: options.pointerOpaque ?? true,
        ...(options.constraintPadding !== undefined
          ? { constraintPadding: options.constraintPadding }
          : {}),
        ...(options.focusOnPress !== undefined ? { focusOnPress: options.focusOnPress } : {})
      });
    },
    handleSystemCommand(command) {
      if (command.command === "home") {
        return { type: "toggle-launcher" };
      }
      if (command.command === "app-switcher") {
        return { type: "toggle-task-switcher" };
      }
      return undefined;
    },
    resolveAppSurface(request, ctx) {
      const rect = request.session
        ? resolveSessionRect(request.session, ctx, options)
        : request.app.preferredWindow
          ? createCascadedLaunchRect(ctx, {
              width: request.app.preferredWindow.width,
              height: request.app.preferredWindow.height
            }, options)
          : undefined;
      if (!rect) {
        return undefined;
      }
      return {
        rect,
        safeArea: copyInsets(ctx.services.surface.getMetrics().safeArea)
      };
    }
  };
}

function createWindowForSession(
  ctx: AppShellPresentationContext,
  session: AppShellSession,
  options: DesktopWindowPresentationOptions
): DisplayNode<WindowProps, unknown> {
  return createWindow(session.id, {
    title: session.title,
    rect: copyRect(session.rect),
    zIndex: session.zIndex,
    mode: mapTouchWindowModeToWindowMode(session.mode),
    movable: session.movable,
    resizable: session.resizable,
    ...(session.minSize ? { minSize: session.minSize } : {}),
    ...(session.maxSize ? { maxSize: session.maxSize } : {}),
    controls: options.windowControls ?? DEFAULT_WINDOW_CONTROLS,
    child: session.mode === "minimized"
      ? createTextLabel(`${session.id}:minimized`, { text: session.title })
      : ctx.renderSessionContent(session)
  });
}

function createLauncherWindow(
  ctx: AppShellPresentationContext,
  zIndex: number,
  options: DesktopWindowPresentationOptions
): DisplayNode<WindowProps, unknown> {
  const manifests = ctx.registry.list();
  const shellId = `${ctx.shellId}:launcher:shell`;
  const content = createSurfaceShell(shellId, {
    header: createTextLabel(`${ctx.shellId}:launcher:title`, {
      text: "Apps"
    }),
    children: manifests.length > 0
      ? manifests.map((manifest) =>
          createButton(`${ctx.shellId}:launcher:open:${sanitizeId(manifest.id)}`, {
            label: manifest.name,
            actionId: createLauncherActionId(ctx.shellId, manifest.id)
          })
        )
      : [
          createTextLabel(`${ctx.shellId}:launcher:empty`, {
            text: "No apps",
            tone: "muted"
          })
        ],
    bodyPadding: 8,
    bodyGap: 6,
    scrollbar: "auto"
  });

  return createWindow(createLauncherWindowId(ctx.shellId), {
    title: "Apps",
    rect: createLauncherRect(ctx, options),
    zIndex,
    mode: "normal",
    movable: true,
    resizable: false,
    controls: [],
    child: content
  });
}

function createTaskSwitcherWindow(
  ctx: AppShellPresentationContext,
  zIndex: number,
  options: DesktopWindowPresentationOptions
): DisplayNode<WindowProps, unknown> {
  const shellId = `${ctx.shellId}:tasks:shell`;
  const content = createSurfaceShell(shellId, {
    header: createTextLabel(`${ctx.shellId}:tasks:title`, {
      text: "Windows"
    }),
    children: ctx.sessions.length > 0
      ? ctx.sessions.map((session) =>
          createButton(`${ctx.shellId}:tasks:focus:${sanitizeId(session.id)}`, {
            label: createTaskButtonLabel(session),
            actionId: createTaskActionId(ctx.shellId, session.id)
          })
        )
      : [
          createTextLabel(`${ctx.shellId}:tasks:empty`, {
            text: "No running apps",
            tone: "muted"
          })
        ],
    bodyPadding: 8,
    bodyGap: 6,
    scrollbar: "auto"
  });

  return createWindow(createTaskSwitcherWindowId(ctx.shellId), {
    title: "Windows",
    rect: createTaskSwitcherRect(ctx, options),
    zIndex,
    mode: "normal",
    movable: true,
    resizable: false,
    controls: [],
    child: content
  });
}

export function createWindowLayerId(shellId: string): string {
  return `${shellId}:windows`;
}

export function createLauncherActionId(shellId: string, appId: string): string {
  return `${shellId}:launcher.open:${appId}`;
}

export function createTaskActionId(shellId: string, sessionId: string): string {
  return `${shellId}:tasks.focus:${sessionId}`;
}

export function createTaskCloseActionId(shellId: string, sessionId: string): string {
  return `${shellId}:tasks.close:${sessionId}`;
}

export function createShellHomeActionId(shellId: string): string {
  return `${shellId}:system.home`;
}

export function createShellTaskSwitcherActionId(shellId: string): string {
  return `${shellId}:system.task-switcher`;
}

export function parseLauncherActionId(shellId: string, actionId: string): string | undefined {
  const prefix = `${shellId}:launcher.open:`;
  return actionId.startsWith(prefix) ? actionId.slice(prefix.length) : undefined;
}

export function parseTaskActionId(shellId: string, actionId: string): string | undefined {
  const prefix = `${shellId}:tasks.focus:`;
  return actionId.startsWith(prefix) ? actionId.slice(prefix.length) : undefined;
}

export function parseTaskCloseActionId(shellId: string, actionId: string): string | undefined {
  const prefix = `${shellId}:tasks.close:`;
  return actionId.startsWith(prefix) ? actionId.slice(prefix.length) : undefined;
}

export function parseShellActionId(shellId: string, actionId: string): AppShellAction | undefined {
  if (actionId === createShellHomeActionId(shellId)) {
    return { type: "home" };
  }
  if (actionId === createShellTaskSwitcherActionId(shellId)) {
    return { type: "toggle-task-switcher" };
  }
  return undefined;
}

function createLauncherWindowId(shellId: string): string {
  return `${shellId}:launcher-window`;
}

function createTaskSwitcherWindowId(shellId: string): string {
  return `${shellId}:task-switcher-window`;
}

function createTaskButtonLabel(session: AppShellSession): string {
  if (session.mode === "minimized") {
    return `${session.title} (minimized)`;
  }
  if (session.focused) {
    return `${session.title} (focused)`;
  }
  return session.title;
}

function createLauncherRect(
  ctx: AppShellPresentationContext,
  options: DesktopWindowPresentationOptions
): Rect {
  const constraint = getShellConstraintRect(ctx, options);
  return clampRect(
    createRect(constraint.x, constraint.y, Math.min(240, constraint.width), Math.min(220, constraint.height)),
    constraint
  );
}

function createTaskSwitcherRect(
  ctx: AppShellPresentationContext,
  options: DesktopWindowPresentationOptions
): Rect {
  const constraint = getShellConstraintRect(ctx, options);
  const width = Math.min(300, constraint.width);
  const height = Math.min(170, constraint.height);
  return clampRect(
    createRect(constraint.x + constraint.width - width, constraint.y + constraint.height - height, width, height),
    constraint
  );
}

function resolveSessionRect(
  session: AppShellSession,
  ctx: AppShellPresentationContext,
  options: DesktopWindowPresentationOptions
): Rect {
  const metrics = ctx.services.surface.getMetrics();
  const full = createRect(0, 0, metrics.width, metrics.height);
  if (session.mode === "fullscreen") {
    return full;
  }
  if (session.mode === "maximized") {
    return insetRect(full, createInsets(options.constraintPadding ?? 0));
  }
  return copyRect(session.rect);
}

function createCascadedLaunchRect(
  ctx: AppShellPresentationContext,
  size: { width: number; height: number },
  options: DesktopWindowPresentationOptions
): Rect {
  const constraint = getShellConstraintRect(ctx, options);
  const width = Math.min(size.width, constraint.width);
  const height = Math.min(size.height, constraint.height);
  const step = 24;
  const index = ctx.sessions.length;
  const maxOffsetX = Math.max(0, constraint.width - width);
  const maxOffsetY = Math.max(0, constraint.height - height);
  const stepsX = Math.max(1, Math.floor(maxOffsetX / step) + 1);
  const stepsY = Math.max(1, Math.floor(maxOffsetY / step) + 1);
  return createRect(
    constraint.x + (index % stepsX) * step,
    constraint.y + (index % stepsY) * step,
    width,
    height
  );
}

function getShellConstraintRect(
  ctx: AppShellPresentationContext,
  options: DesktopWindowPresentationOptions
): Rect {
  const metrics = ctx.services.surface.getMetrics();
  return insetRect(
    createRect(0, 0, metrics.width, metrics.height),
    createInsets(options.constraintPadding ?? 0)
  );
}

function clampRect(rect: Rect, constraint: Rect): Rect {
  const width = Math.min(rect.width, constraint.width);
  const height = Math.min(rect.height, constraint.height);
  return createRect(
    clamp(rect.x, constraint.x, constraint.x + Math.max(0, constraint.width - width)),
    clamp(rect.y, constraint.y, constraint.y + Math.max(0, constraint.height - height)),
    width,
    height
  );
}

function getNextSessionZIndex(sessions: readonly AppShellSession[]): number {
  let maxZIndex = -1;
  for (const session of sessions) {
    maxZIndex = Math.max(maxZIndex, session.zIndex);
  }
  return maxZIndex + 1;
}

function sanitizeId(value: string): string {
  const sanitized = value.trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return sanitized.length > 0 ? sanitized : "app";
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}
