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
  copyInsets,
  copyRect,
  createInsets,
  createRect,
  insetRect,
  type Insets,
  type Rect,
  type Size
} from "../core/geometry.js";
import type {
  OpenAppOptions,
  TouchAppEvent,
  TouchAppStorage,
  TouchAppSurfaceApi,
  TouchAppSurfaceContext
} from "../apps/context.js";
import type { TouchAppManifest } from "../apps/manifest.js";
import type { TouchAppRegistry } from "../apps/registry.js";
import type { SystemCommandInputEvent } from "../core/events.js";
import type { RuntimeServices } from "../services/contracts.js";
import { resolveWindowChromeHeight, type WindowControl } from "../containers/window.js";
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
} from "./app-hosting.js";
import {
  applyWindowStateChange,
  copyTouchWindowState,
  createWindowManagerChangeOutput,
  type TouchWindowState,
  type WindowManagerAppHostMode,
  type WindowManagerChange,
  type WindowManagerUtilityWindowPolicy
} from "../window-manager/window-state.js";
import type { AppShellAction, AppShellChange, AppShellMode } from "./app-shell-events.js";
import type {
  AppShellPresentation,
  AppShellPresentationAppSurface
} from "./app-shell-presentations.js";
import type { AppShellSession, AppShellSessionSeed } from "./app-session.js";
import { createDesktopWindowPresentation } from "./presentations/desktop-window-presentation.js";
import {
  createWindowLayerId,
  parseLauncherActionId,
  parseShellActionId,
  parseTaskCloseActionId,
  parseTaskActionId
} from "./presentations/desktop-window-presentation.js";

export interface AppShellProps {
  registry: TouchAppRegistry;

  presentation?: AppShellPresentation;

  appHostMode?: WindowManagerAppHostMode;

  initialSessions?: readonly AppShellSessionSeed[];

  launcher?: boolean;
  taskSwitcher?: boolean;
  homeKey?: boolean;
  keepAlive?: boolean;

  appStates?: Readonly<Record<string, unknown>>;
  getAppState?(session: AppShellSession): unknown;

  forwardAppOutputs?: boolean;

  storage?: TouchAppStorage;
  surfaces?: TouchAppSurfaceApi;

  onAppEvent?(event: TouchAppEvent): void;
  onShellChange?(change: AppShellChange): void;

  utilityWindows?: WindowManagerUtilityWindowPolicy;
  pointerOpaque?: boolean;
  constraintPadding?: number | Partial<Insets>;
  focusOnPress?: boolean;
  windowControls?: readonly WindowControl[];
}

interface AppShellState {
  records: Map<string, WindowManagerAppWindow>;
  nextLaunchIndex: number;
  mode: AppShellMode;
  activeSessionId: string | undefined;
  launcherVisible: boolean;
  taskSwitcherVisible: boolean;
}

type ShellContext = {
  id: string;
  state: AppShellState;
  props: AppShellProps;
  services: RuntimeServices;
  emit(output: RuntimeOutput): void;
  invalidateLayout(): void;
  invalidateRender(): void;
};

const DEFAULT_LAUNCH_SIZE: Size = { width: 320, height: 220 };
const CASCADE_STEP = 24;

const AppShellComponent: DisplayComponent<AppShellProps, AppShellState> = {
  kind: "app-shell",
  mount(ctx) {
    const presentation = resolvePresentation(ctx.props);
    const state: AppShellState = {
      records: new Map(),
      nextLaunchIndex: 0,
      mode: presentation.kind === "tablet-home" ? "home" : "desktop",
      activeSessionId: undefined,
      launcherVisible: ctx.props.launcher ?? false,
      taskSwitcherVisible: ctx.props.taskSwitcher ?? false
    };
    seedInitialSessions(state, ctx);
    state.activeSessionId = getFocusedRecord(state)?.window.id;
    state.mode = presentation.getInitialMode?.(createPresentationContext({ ...ctx, state })) ?? state.mode;
    return state;
  },
  update(ctx) {
    syncLiveRecords(ctx);
  },
  getChildren(ctx) {
    syncLiveRecords(ctx);
    const presentation = resolvePresentation(ctx.props);
    return [presentation.render(createPresentationContext(ctx))];
  },
  measure(ctx) {
    const childId = getPresentationRootId(ctx);
    ctx.measureChild(childId, {
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
    ctx.setChildBounds(getPresentationRootId(ctx), ctx.bounds);
    ctx.setContentBounds(ctx.bounds);
  },
  render() {
    return [];
  },
  handleEvent(ctx) {
    if (isDisplayEvent(ctx.event)) {
      if (ctx.event.type === "system-command") {
        handleSystemCommand(ctx, ctx.event);
        return;
      }
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

    if (handleShellActionOutput(ctx, ctx.event)) {
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

export function createAppShell(
  id: string,
  props: AppShellProps
): DisplayNode<AppShellProps, AppShellState> {
  return createNode(id, AppShellComponent, props);
}

function seedInitialSessions(
  state: AppShellState,
  ctx: Omit<ShellContext, "state">
): void {
  const seedCtx = { ...ctx, state };
  for (const seed of ctx.props.initialSessions ?? []) {
    const window = createSeedWindowState(seedCtx, seed);
    const record = createRecord(seedCtx, window);
    state.records.set(record.window.id, record);
    state.nextLaunchIndex += 1;
    if (record.window.mode === "minimized") {
      suspendRecord(record, ctx.services.surfaces);
    }
  }

  const focused = getFocusedRecord(state);
  if (focused) {
    focusRecord(seedCtx, focused.window.id);
  }
}

function syncLiveRecords(ctx: ShellContext): void {
  for (const record of ctx.state.records.values()) {
    if (record.closed) {
      continue;
    }

    record.forwardAppOutputs = ctx.props.forwardAppOutputs ?? false;
    syncPresentationSessionRect(ctx, record);
    updateAppWindowSurface(record, createSurfaceContext(ctx, record.window));
    if (record.window.mode === "minimized") {
      suspendRecord(record, ctx.services.surfaces);
    } else if (record.suspended && shouldResumeRecord(ctx, record)) {
      resumeRecord(record);
    }
  }
}

function syncPresentationSessionRect(ctx: ShellContext, record: WindowManagerAppWindow): void {
  const presentation = resolvePresentation(ctx.props);
  if (presentation.kind === "desktop-window" || record.window.mode === "minimized") {
    return;
  }

  const rect = resolvePresentationAppSurface(ctx, record.window)?.rect;
  if (!rect || areRectsEqual(rect, record.window.rect)) {
    return;
  }

  record.window.rect = rect;
  record.window.movable = false;
  record.window.resizable = false;
}

function createPresentationContext(ctx: ShellContext) {
  const sessions = getVisibleRecords(ctx).map(createSessionFromRecord);
  const presentation = resolvePresentation(ctx.props);
  return {
    shellId: ctx.id,
    services: ctx.services,
    sessions,
    registry: ctx.props.registry,
    ...(ctx.state.activeSessionId ? { activeSessionId: ctx.state.activeSessionId } : {}),
    mode: ctx.state.mode,
    homeEnabled: ctx.props.homeKey ?? false,
    taskSwitcherEnabled: ctx.props.taskSwitcher ?? false,
    launcherEnabled: ctx.props.launcher ?? false,
    launcherVisible: ctx.state.launcherVisible,
    taskSwitcherVisible: ctx.state.taskSwitcherVisible,
    renderSessionContent(session: AppShellSession) {
      const record = ctx.state.records.get(session.id);
      if (!record) {
        return renderAppWindowContent(createMissingRecord(session), undefined);
      }
      syncAppSessionContent(ctx, record);
      return renderAppWindowContent(record, resolveAppState(ctx.props, session));
    },
    emitShellAction(action: AppShellAction) {
      applyShellAction(ctx, action);
    },
    presentation
  };
}

function getPresentationRootId(ctx: Pick<ShellContext, "id" | "props">): string {
  const presentation = resolvePresentation(ctx.props);
  return presentation.kind === "desktop-window"
    ? createWindowLayerId(ctx.id)
    : `${ctx.id}:tablet-screen`;
}

function createRecord(ctx: ShellContext, window: TouchWindowState): WindowManagerAppWindow {
  let record: WindowManagerAppWindow | undefined;
  record = createWindowManagerAppWindow({
    window,
    app: ctx.props.registry.get(window.appId),
    hostMode: ctx.props.appHostMode ?? "same-runtime",
    surface: createSurfaceContext(ctx, window),
    theme: ctx.services.theme,
    forwardAppOutputs: ctx.props.forwardAppOutputs ?? false,
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
        emitShellChange(ctx, {
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
        if (ctx.state.activeSessionId === record.window.id) {
          ctx.state.activeSessionId = undefined;
        }
        emitShellChange(ctx, {
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

function syncAppSessionContent(ctx: ShellContext, record: WindowManagerAppWindow): void {
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
    root: record.runtime.render(resolveAppState(ctx.props, createSessionFromRecord(record))),
    surface,
    theme: ctx.services.theme,
    surfaces: ctx.services.surfaces
  });
  flushHostedAppOutputs(ctx, record);
  publishHostedAppWindow(record, ctx.services.surfaces);
}

function handleSystemCommand(ctx: ShellContext, event: SystemCommandInputEvent): void {
  if (!(ctx.props.homeKey ?? false) && event.source !== "touch") {
    return;
  }

  const presentation = resolvePresentation(ctx.props);
  const action = presentation.handleSystemCommand?.(event, createPresentationContext(ctx)) ??
    createDefaultSystemCommandAction(event);
  if (action) {
    applyShellAction(ctx, action);
  }
}

function createDefaultSystemCommandAction(
  event: SystemCommandInputEvent
): AppShellAction | undefined {
  if (event.command === "home") {
    return { type: "home" };
  }
  if (event.command === "app-switcher") {
    return { type: "toggle-task-switcher" };
  }
  if (event.command === "back") {
    return { type: "home" };
  }
  return undefined;
}

function handleShellActionOutput(ctx: ShellContext, output: RuntimeOutput): boolean {
  if (output.type !== "action") {
    return false;
  }

  const shellAction = parseShellActionId(ctx.id, output.actionId);
  if (shellAction) {
    applyShellAction(ctx, shellAction);
    return true;
  }

  const appId = parseLauncherActionId(ctx.id, output.actionId);
  if (appId) {
    openOrActivateFromLauncher(ctx, appId);
    return true;
  }

  const sessionId = parseTaskActionId(ctx.id, output.actionId);
  if (sessionId) {
    applyShellAction(ctx, { type: "activate-session", sessionId });
    return true;
  }

  const closeSessionId = parseTaskCloseActionId(ctx.id, output.actionId);
  if (closeSessionId) {
    applyShellAction(ctx, { type: "close-session", sessionId: closeSessionId });
    return true;
  }

  return false;
}

function applyShellAction(ctx: ShellContext, action: AppShellAction): void {
  switch (action.type) {
    case "open-app":
      openApp(ctx, action.appId, action.options ?? {});
      break;
    case "activate-session":
      restoreAndFocusRecord(ctx, action.sessionId);
      ctx.state.activeSessionId = action.sessionId;
      ctx.state.mode = resolvePresentation(ctx.props).kind === "tablet-home" ? "app" : ctx.state.mode;
      ctx.state.taskSwitcherVisible = false;
      emitModeChange(ctx);
      break;
    case "close-session":
      closeSession(ctx, action.sessionId);
      break;
    case "resize-session": {
      const record = ctx.state.records.get(action.sessionId);
      if (record) {
        resizeRecord(ctx, record, action.size);
      }
      break;
    }
    case "set-mode":
      ctx.state.mode = action.mode;
      emitModeChange(ctx);
      ctx.invalidateLayout();
      break;
    case "home":
      performHome(ctx);
      break;
    case "toggle-launcher":
      ctx.state.launcherVisible = !ctx.state.launcherVisible;
      ctx.invalidateLayout();
      break;
    case "toggle-task-switcher":
      toggleTaskSwitcher(ctx);
      break;
  }
}

function openOrActivateFromLauncher(ctx: ShellContext, appId: string): void {
  if (resolvePresentation(ctx.props).kind === "tablet-home") {
    const existing = [...ctx.state.records.values()].find(
      (record) => !record.closed && record.window.appId === appId
    );
    if (existing) {
      applyShellAction(ctx, { type: "activate-session", sessionId: existing.window.id });
      return;
    }
  }

  openApp(ctx, appId);
}

function openApp(
  ctx: ShellContext,
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
    ctx.state.activeSessionId = record.window.id;
    if (resolvePresentation(ctx.props).kind === "tablet-home") {
      ctx.state.mode = "app";
    }
  }

  emitShellChange(ctx, {
    type: "open-app",
    window: record.window,
    targetAppId: appId,
    options
  });
  ctx.invalidateLayout();
  return record;
}

function createSeedWindowState(ctx: ShellContext, seed: AppShellSessionSeed): TouchWindowState {
  const app = ctx.props.registry.get(seed.appId);
  const launchNumber = ctx.state.nextLaunchIndex + 1;
  const instanceId = seed.instanceId ?? `${sanitizeId(seed.appId)}-${launchNumber}`;
  const id = seed.windowId ?? seed.id ?? `${instanceId}-window`;
  const preferred = app?.manifest.preferredWindow;
  const rect = seed.rect
    ? copyRect(seed.rect)
    : resolvePresentationLaunchSurface(ctx, app?.manifest ?? createFallbackManifest(seed.appId))?.rect ??
      createCascadedLaunchRect(
        ctx,
        preferred
          ? { width: preferred.width, height: preferred.height }
          : DEFAULT_LAUNCH_SIZE
      );

  return {
    id,
    appId: seed.appId,
    instanceId,
    title: seed.title ?? app?.manifest.name ?? seed.appId,
    rect,
    zIndex: seed.zIndex ?? getNextRecordZIndex(ctx.state),
    mode: seed.mode ?? "normal",
    focused: seed.focused ?? false,
    movable: seed.movable ?? resolvePresentation(ctx.props).kind === "desktop-window",
    resizable: seed.resizable ?? preferred?.resizable ?? true,
    ...(seed.minSize ? { minSize: seed.minSize } : optionalMinSize(preferred)),
    ...(seed.maxSize ? { maxSize: seed.maxSize } : optionalMaxSize(preferred))
  };
}

function createLaunchedWindowState(
  ctx: ShellContext,
  appId: string,
  manifest: TouchAppManifest | undefined,
  options: OpenAppOptions
): TouchWindowState {
  const launchNumber = ctx.state.nextLaunchIndex + 1;
  const instanceId = options.instanceId ?? `${sanitizeId(appId)}-${launchNumber}`;
  const id = options.windowId ?? `${instanceId}-window`;
  const preferred = manifest?.preferredWindow;
  const minSize = resolveMinSize(preferred);
  const maxSize = resolveMaxSize(preferred);
  const presentation = resolvePresentation(ctx.props);
  const resolvedRect = options.rect
    ? copyRect(options.rect)
    : resolvePresentationLaunchSurface(ctx, manifest ?? createFallbackManifest(appId))?.rect ??
      createCascadedLaunchRect(
        ctx,
        preferred
          ? { width: preferred.width, height: preferred.height }
          : DEFAULT_LAUNCH_SIZE
      );
  const partialWindow = {
    ...(minSize ? { minSize } : {}),
    ...(maxSize ? { maxSize } : {})
  };
  const rect = clampManagedRect(resolvedRect, partialWindow, getShellConstraintRect(ctx));

  return {
    id,
    appId,
    instanceId,
    title: manifest?.name ?? appId,
    rect,
    zIndex: getNextRecordZIndex(ctx.state),
    mode: "normal",
    focused: false,
    movable: presentation.kind === "desktop-window",
    resizable: presentation.kind === "desktop-window" ? preferred?.resizable ?? true : false,
    ...(minSize ? { minSize } : {}),
    ...(maxSize ? { maxSize } : {})
  };
}

function handleWindowLayerOutput(
  ctx: ShellContext,
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
    if (ctx.state.activeSessionId === output.windowId) {
      ctx.state.activeSessionId = undefined;
    }
    emitShellChange(ctx, {
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
      ctx.state.activeSessionId = output.windowId;
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

  emitShellChange(ctx, {
    type: "window-state",
    window: record.window,
    output
  });
}

function handleHostedDisplayEvent(ctx: ShellContext, event: ComponentEvent): void {
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

function drainHostedForwardedInput(ctx: ShellContext, record: WindowManagerAppWindow): void {
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

function flushHostedAppOutputs(
  ctx: Pick<ShellContext, "emit">,
  record: WindowManagerAppWindow
): void {
  if (!record.hosted) {
    return;
  }

  for (const output of record.hosted.runtime.takeOutputs()) {
    record.runtime?.handleOutput(output);
    if (record.forwardAppOutputs) {
      ctx.emit(scopeRuntimeOutput(output, record.namespacePrefix));
    }
  }
}

function performHome(ctx: ShellContext): void {
  if (resolvePresentation(ctx.props).kind === "desktop-window") {
    ctx.state.launcherVisible = !ctx.state.launcherVisible;
    ctx.invalidateLayout();
    return;
  }

  if (ctx.state.mode === "home") {
    return;
  }

  const active = ctx.state.activeSessionId
    ? ctx.state.records.get(ctx.state.activeSessionId)
    : undefined;
  if (active) {
    if (ctx.props.keepAlive) {
      deactivateRecord(active);
      unpublishHostedAppWindow(active, ctx.services.surfaces);
    } else {
      suspendRecord(active, ctx.services.surfaces);
    }
  }
  ctx.state.mode = "home";
  ctx.state.activeSessionId = undefined;
  ctx.state.taskSwitcherVisible = false;
  emitModeChange(ctx);
  ctx.invalidateLayout();
}

function toggleTaskSwitcher(ctx: ShellContext): void {
  if (resolvePresentation(ctx.props).kind === "desktop-window") {
    ctx.state.taskSwitcherVisible = !ctx.state.taskSwitcherVisible;
    ctx.invalidateLayout();
    return;
  }

  ctx.state.mode = ctx.state.mode === "task-switcher"
    ? ctx.state.activeSessionId ? "app" : "home"
    : "task-switcher";
  emitModeChange(ctx);
  ctx.invalidateLayout();
}

function closeSession(ctx: ShellContext, sessionId: string): void {
  const record = ctx.state.records.get(sessionId);
  if (!record || record.closed) {
    return;
  }

  const previousMode = ctx.state.mode;
  const closedWindow = copyTouchWindowState(record.window);
  closeRecord(record, ctx.services.surfaces);
  ctx.state.records.delete(sessionId);
  if (ctx.state.activeSessionId === sessionId) {
    ctx.state.activeSessionId = undefined;
    if (resolvePresentation(ctx.props).kind === "tablet-home" && ctx.state.mode !== "task-switcher") {
      ctx.state.mode = "home";
    }
  }
  emitShellChange(ctx, {
    type: "window-state",
    window: closedWindow
  });
  if (ctx.state.mode !== previousMode) {
    emitModeChange(ctx);
  }
  ctx.invalidateLayout();
}

function restoreAndFocusRecord(ctx: ShellContext, sessionId: string): void {
  const record = ctx.state.records.get(sessionId);
  if (!record || record.closed) {
    return;
  }

  if (record.window.mode === "minimized") {
    record.window.mode = "normal";
    resumeRecord(record);
  }

  focusRecord(ctx, sessionId);
  emitShellChange(ctx, {
    type: "window-state",
    window: record.window
  });
  ctx.invalidateLayout();
}

function resizeRecord(ctx: ShellContext, record: WindowManagerAppWindow, size: Size): void {
  const next = clampManagedRect(
    createRect(record.window.rect.x, record.window.rect.y, size.width, size.height),
    record.window,
    getShellConstraintRect(ctx)
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
  emitShellChange(ctx, {
    type: "request-resize",
    window: record.window,
    size: {
      width: next.width,
      height: next.height
    }
  });
  ctx.invalidateLayout();
}

function focusRecord(ctx: ShellContext, windowId: string): boolean {
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

  ctx.state.activeSessionId = windowId;
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

function emitAppEvent(
  ctx: Pick<ShellContext, "id" | "props" | "emit">,
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

function emitShellChange(
  ctx: Pick<ShellContext, "id" | "props" | "emit">,
  change: WindowManagerChange
): void {
  ctx.props.onShellChange?.(createAppShellChange(change));
  ctx.emit(createWindowManagerChangeOutput(ctx.id, change));
}

function emitModeChange(ctx: ShellContext): void {
  ctx.props.onShellChange?.({
    type: "shell-mode",
    mode: ctx.state.mode,
    ...(ctx.state.activeSessionId ? { sessionId: ctx.state.activeSessionId } : {})
  });
}

function createAppShellChange(change: WindowManagerChange): AppShellChange {
  return {
    type: change.type,
    ...(change.windowId ? { windowId: change.windowId, sessionId: change.windowId } : {}),
    ...(change.appId ? { appId: change.appId } : {}),
    ...(change.instanceId ? { instanceId: change.instanceId } : {}),
    ...(change.window ? { session: createSessionFromWindow(change.window) } : {}),
    ...(change.event ? { event: change.event } : {}),
    ...(change.output ? { output: change.output } : {}),
    ...(change.title !== undefined ? { title: change.title } : {}),
    ...(change.size ? { size: change.size } : {}),
    ...(change.targetAppId ? { targetAppId: change.targetAppId } : {}),
    ...(change.options ? { options: change.options } : {})
  };
}

function findRecordForOutput(
  state: AppShellState,
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
  shellId: string,
  event: ComponentEvent
): event is WindowStateChangeEvent {
  return event.type === "window-state-change" && event.componentId === createWindowLayerId(shellId);
}

function getVisibleRecords(ctx: Pick<ShellContext, "state">): readonly WindowManagerAppWindow[] {
  return [...ctx.state.records.values()].filter((record) => !record.closed);
}

function getFocusedRecord(state: AppShellState): WindowManagerAppWindow | undefined {
  return [...state.records.values()].find(
    (record) => record.window.focused && record.window.mode !== "minimized" && !record.closed
  );
}

function createSessionFromRecord(record: WindowManagerAppWindow): AppShellSession {
  return {
    ...createSessionFromWindow(record.window),
    active: record.active,
    suspended: record.suspended,
    hostMode: record.hostMode
  };
}

function createSessionFromWindow(window: TouchWindowState): AppShellSession {
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
    ...(window.minSize ? { minSize: window.minSize } : {}),
    ...(window.maxSize ? { maxSize: window.maxSize } : {}),
    active: false,
    suspended: false,
    hostMode: "same-runtime"
  };
}

function createMissingRecord(session: AppShellSession): WindowManagerAppWindow {
  return {
    window: copyTouchWindowState(session),
    hostMode: session.hostMode,
    namespacePrefix: `${session.appId}:${session.instanceId}:${session.id}:`,
    runtime: undefined,
    hosted: undefined,
    hostedSurfaceComponentId: `${session.appId}:${session.instanceId}:${session.id}:surface`,
    forwardAppOutputs: false,
    lastPublishedRevision: undefined,
    lastPublishedWidth: undefined,
    lastPublishedHeight: undefined,
    active: false,
    suspended: false,
    closed: false,
    titleOverridden: false
  };
}

function resolveAppState(props: AppShellProps, session: AppShellSession): unknown {
  const customState = props.getAppState?.(session);
  if (customState !== undefined) {
    return customState;
  }

  return resolveMappedAppState(props.appStates, session.instanceId) ??
    resolveMappedAppState(props.appStates, session.id) ??
    resolveMappedAppState(props.appStates, session.appId);
}

function shouldResumeRecord(ctx: ShellContext, record: WindowManagerAppWindow): boolean {
  const presentation = resolvePresentation(ctx.props);
  if (presentation.kind !== "tablet-home") {
    return true;
  }
  return ctx.state.mode === "app" && ctx.state.activeSessionId === record.window.id;
}

function resolvePresentation(props: AppShellProps): AppShellPresentation {
  return props.presentation ?? createDesktopWindowPresentation({
    ...(props.utilityWindows !== undefined ? { utilityWindows: props.utilityWindows } : {}),
    ...(props.pointerOpaque !== undefined ? { pointerOpaque: props.pointerOpaque } : {}),
    ...(props.constraintPadding !== undefined ? { constraintPadding: props.constraintPadding } : {}),
    ...(props.focusOnPress !== undefined ? { focusOnPress: props.focusOnPress } : {}),
    ...(props.windowControls !== undefined ? { windowControls: props.windowControls } : {})
  });
}

function createSurfaceContext(ctx: ShellContext, window: TouchWindowState): TouchAppSurfaceContext {
  const metrics = ctx.services.surface.getMetrics();
  const chromeHeight = resolvePresentation(ctx.props).kind === "desktop-window"
    ? resolveWindowChromeHeight(ctx.services.theme.getTokens())
    : 0;
  const surface = resolvePresentationAppSurface(ctx, window);
  const rect = surface?.rect ?? resolveEffectiveWindowRect(ctx, window);
  return {
    width: rect.width,
    height: Math.max(0, rect.height - chromeHeight),
    pixelDensity: metrics.pixelDensity,
    safeArea: surface ? copyInsets(surface.safeArea) : copyInsets(metrics.safeArea)
  };
}

function resolvePresentationLaunchSurface(
  ctx: ShellContext,
  app: TouchAppManifest
): AppShellPresentationAppSurface | undefined {
  return resolvePresentation(ctx.props).resolveAppSurface(
    { app },
    createPresentationContext(ctx)
  );
}

function resolvePresentationAppSurface(
  ctx: ShellContext,
  window: TouchWindowState
): AppShellPresentationAppSurface | undefined {
  const app = ctx.props.registry.get(window.appId)?.manifest ?? createFallbackManifest(window.appId);
  return resolvePresentation(ctx.props).resolveAppSurface(
    {
      app,
      session: createSessionFromWindow(window)
    },
    createPresentationContext(ctx)
  );
}

function resolveEffectiveWindowRect(
  ctx: Pick<ShellContext, "services" | "props">,
  window: TouchWindowState
): Rect {
  const metrics = ctx.services.surface.getMetrics();
  const full = createRect(0, 0, metrics.width, metrics.height);
  if (resolvePresentation(ctx.props).kind !== "desktop-window") {
    return copyRect(window.rect);
  }
  if (window.mode === "fullscreen") {
    return full;
  }
  if (window.mode === "maximized") {
    return insetRect(full, createInsets(ctx.props.constraintPadding ?? 0));
  }
  return copyRect(window.rect);
}

function createCascadedLaunchRect(ctx: ShellContext, size: Size): Rect {
  const constraint = getShellConstraintRect(ctx);
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

function getShellConstraintRect(ctx: Pick<ShellContext, "services" | "props">): Rect {
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

function areRectsEqual(first: Rect, second: Rect): boolean {
  return (
    first.x === second.x &&
    first.y === second.y &&
    first.width === second.width &&
    first.height === second.height
  );
}

function getNextRecordZIndex(state: AppShellState): number {
  let maxZIndex = -1;
  for (const record of state.records.values()) {
    maxZIndex = Math.max(maxZIndex, record.window.zIndex);
  }
  return maxZIndex + 1;
}

function optionalMinSize(preferred: TouchAppManifest["preferredWindow"] | undefined): { minSize: Size } | Record<string, never> {
  const minSize = resolveMinSize(preferred);
  return minSize ? { minSize } : {};
}

function optionalMaxSize(preferred: TouchAppManifest["preferredWindow"] | undefined): { maxSize: Size } | Record<string, never> {
  const maxSize = resolveMaxSize(preferred);
  return maxSize ? { maxSize } : {};
}

function resolveMinSize(preferred: TouchAppManifest["preferredWindow"] | undefined): Size | undefined {
  return preferred && (preferred.minWidth || preferred.minHeight)
    ? {
        width: preferred.minWidth ?? 0,
        height: preferred.minHeight ?? 0
      }
    : undefined;
}

function resolveMaxSize(preferred: TouchAppManifest["preferredWindow"] | undefined): Size | undefined {
  return preferred && (preferred.maxWidth || preferred.maxHeight)
    ? {
        width: preferred.maxWidth ?? Number.POSITIVE_INFINITY,
        height: preferred.maxHeight ?? Number.POSITIVE_INFINITY
      }
    : undefined;
}

function createFallbackManifest(appId: string): TouchAppManifest {
  return {
    id: appId,
    name: appId,
    version: "0.0.0"
  };
}

function resolveMappedAppState(
  states: Readonly<Record<string, unknown>> | undefined,
  key: string
): unknown {
  if (!states || !Object.prototype.hasOwnProperty.call(states, key)) {
    return undefined;
  }
  return states[key];
}

function sanitizeId(value: string): string {
  const sanitized = value.trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return sanitized.length > 0 ? sanitized : "app";
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}
