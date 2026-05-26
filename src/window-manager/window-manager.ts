import type {
  RuntimeOutput,
  WindowStateChangeEvent
} from "../core/actions.js";
import {
  type ComponentEvent,
  type DisplayComponent,
  type DisplayNode,
  createNode,
  isRuntimeOutputEvent
} from "../core/component.js";
import {
  ZERO_INSETS,
  copyRect,
  copyInsets
} from "../core/geometry.js";
import { createWindow } from "../containers/window.js";
import { createWindowLayer } from "../containers/window-layer.js";
import type {
  OpenAppOptions,
  TouchAppEvent,
  TouchAppSurfaceContext
} from "../apps/context.js";
import type { RuntimeServices } from "../services/contracts.js";
import {
  createWindowManagerAppWindow,
  renderAppWindowContent,
  stripRuntimeOutputScope,
  updateAppWindowSurface,
  type WindowManagerAppWindow
} from "./app-window.js";
import {
  applyWindowStateChange,
  copyTouchWindowState,
  createWindowManagerChangeOutput,
  mapTouchWindowModeToWindowMode,
  type TouchWindowState,
  type WindowManagerChange,
  type WindowManagerProps
} from "./window-state.js";

interface WindowManagerState {
  records: Map<string, WindowManagerAppWindow>;
}

const DEFAULT_WINDOW_CONTROLS = ["minimize", "maximize", "close"] as const;

const WindowManagerComponent: DisplayComponent<WindowManagerProps, WindowManagerState> = {
  kind: "window-manager",
  mount(ctx) {
    const state: WindowManagerState = {
      records: new Map()
    };
    syncAppWindows(state, ctx);
    return state;
  },
  update(ctx) {
    syncAppWindows(ctx.state, ctx);
  },
  getChildren(ctx) {
    syncAppWindows(ctx.state, ctx);
    const windows = getVisibleAppWindows(ctx).map((record) =>
      createWindow(record.window.id, {
        title: record.window.title,
        rect: copyRect(record.window.rect),
        zIndex: record.window.zIndex,
        mode: mapTouchWindowModeToWindowMode(record.window.mode),
        movable: record.window.movable,
        controls: ctx.props.windowControls ?? DEFAULT_WINDOW_CONTROLS,
        child: renderAppWindowContent(record, resolveAppState(ctx.props, record.window))
      })
    );

    return [
      createWindowLayer(createWindowLayerId(ctx.id), {
        windows,
        pointerOpaque: ctx.props.pointerOpaque ?? true,
        ...(ctx.props.constraintPadding !== undefined
          ? { constraintPadding: ctx.props.constraintPadding }
          : {}),
        ...(ctx.props.focusOnPress !== undefined ? { focusOnPress: ctx.props.focusOnPress } : {})
      })
    ];
  },
  measure(ctx) {
    const layerId = createWindowLayerId(ctx.id);
    ctx.measureChild(layerId, {
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
    ctx.setChildBounds(createWindowLayerId(ctx.id), ctx.bounds);
    ctx.setContentBounds(ctx.bounds);
  },
  render() {
    return [];
  },
  handleEvent(ctx) {
    if (!isRuntimeOutputEvent(ctx.event)) {
      return;
    }

    if (isWindowLayerOutput(ctx.id, ctx.event)) {
      handleWindowLayerOutput(ctx, ctx.event);
      return;
    }

    const record = findRecordForOutput(ctx.state, ctx.event);
    if (record?.runtime) {
      record.runtime.handleOutput(stripRuntimeOutputScope(ctx.event, record.namespacePrefix));
    }
  },
  dispose(ctx) {
    for (const record of ctx.state.records.values()) {
      closeRecord(record);
    }
    ctx.state.records.clear();
  }
};

export function createWindowManager(
  id: string,
  props: WindowManagerProps
): DisplayNode<WindowManagerProps, WindowManagerState> {
  return createNode(id, WindowManagerComponent, props);
}

function syncAppWindows(
  state: WindowManagerState,
  ctx: {
    id: string;
    props: WindowManagerProps;
    services: RuntimeServices;
    emit(output: RuntimeOutput): void;
    invalidateLayout(): void;
    invalidateRender(): void;
  }
): void {
  const activeWindowIds = new Set<string>();
  for (const window of ctx.props.windows) {
    activeWindowIds.add(window.id);
    const existing = state.records.get(window.id);
    if (
      existing &&
      (existing.window.appId !== window.appId || existing.window.instanceId !== window.instanceId)
    ) {
      closeRecord(existing);
      state.records.delete(window.id);
    }

    const current = state.records.get(window.id);
    if (current) {
      syncExistingRecord(current, window);
      updateAppWindowSurface(current, createSurfaceContext(ctx, current.window));
      if (current.window.focused && !current.closed) {
        activateRecord(state, current.window.id);
        ctx.services.focus.requestFocus(current.window.id);
      }
      continue;
    }

    let record: WindowManagerAppWindow | undefined;
    record = createWindowManagerAppWindow({
      window,
      app: ctx.props.registry.get(window.appId),
      surface: createSurfaceContext(ctx, window),
      theme: ctx.services.theme,
      actions: {
        emit(event) {
          if (!record) {
            return;
          }
          emitAppEvent(ctx, record, event);
        }
      },
      windows: {
        setTitle(title) {
          if (!record) {
            return;
          }
          record.window.title = title;
          record.titleOverridden = true;
          emitManagerChange(ctx, {
            type: "set-title",
            windowId: record.window.id,
            appId: record.window.appId,
            instanceId: record.window.instanceId,
            title
          });
          ctx.invalidateLayout();
        },
        requestClose() {
          if (!record) {
            return;
          }
          closeRecord(record);
          emitManagerChange(ctx, {
            type: "request-close",
            window: record.window
          });
          ctx.invalidateLayout();
        },
        requestResize(size) {
          if (!record) {
            return;
          }
          emitManagerChange(ctx, {
            type: "request-resize",
            window: record.window,
            size
          });
        },
        openApp(appId, options) {
          if (!record) {
            return;
          }
          emitManagerChange(ctx, {
            type: "open-app",
            window: record.window,
            targetAppId: appId,
            ...(options ? { options } : {})
          });
        }
      },
      ...(ctx.props.storage ? { storage: ctx.props.storage } : {}),
      ...(ctx.props.surfaces ? { surfaces: ctx.props.surfaces } : {})
    });

    state.records.set(window.id, record);
    if (window.focused) {
      activateRecord(state, window.id);
      ctx.services.focus.requestFocus(window.id);
    }
  }

  for (const [windowId, record] of state.records) {
    if (!activeWindowIds.has(windowId)) {
      closeRecord(record);
      state.records.delete(windowId);
    }
  }
}

function syncExistingRecord(
  record: WindowManagerAppWindow,
  source: TouchWindowState
): void {
  const live = record.window;
  record.window = {
    ...copyTouchWindowState(source),
    title: record.titleOverridden ? live.title : source.title,
    rect: copyRect(live.rect),
    zIndex: live.zIndex,
    mode: live.mode,
    focused: live.focused
  };
}

function getVisibleAppWindows(ctx: {
  state: WindowManagerState;
}): readonly WindowManagerAppWindow[] {
  return [...ctx.state.records.values()].filter((record) => !record.closed);
}

function handleWindowLayerOutput(
  ctx: {
    id: string;
    state: WindowManagerState;
    props: WindowManagerProps;
    emit(output: RuntimeOutput): void;
    invalidateLayout(): void;
  },
  output: WindowStateChangeEvent
): void {
  const record = ctx.state.records.get(output.windowId);
  if (!record) {
    return;
  }

  record.window = applyWindowStateChange(record.window, output);
  if (output.change === "close") {
    closeRecord(record);
  } else if (output.focused) {
    activateRecord(ctx.state, output.windowId);
  } else if (record.active && !output.focused) {
    deactivateRecord(record);
  }

  if (output.focused) {
    for (const candidate of ctx.state.records.values()) {
      if (candidate.window.id !== output.windowId) {
        candidate.window.focused = false;
      }
    }
  }

  emitManagerChange(ctx, {
    type: "window-state",
    window: record.window,
    output
  });
}

function emitAppEvent(
  ctx: {
    id: string;
    props: WindowManagerProps;
    emit(output: RuntimeOutput): void;
  },
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

function emitManagerChange(
  ctx: {
    id: string;
    props: WindowManagerProps;
    emit(output: RuntimeOutput): void;
  },
  change: WindowManagerChange
): void {
  ctx.props.onWindowChange?.(change);
  ctx.emit(createWindowManagerChangeOutput(ctx.id, change));
}

function activateRecord(state: WindowManagerState, windowId: string): void {
  for (const record of state.records.values()) {
    if (record.window.id === windowId) {
      if (!record.active) {
        record.runtime?.activate();
        record.active = true;
      }
      record.window.focused = true;
      continue;
    }

    if (record.active) {
      record.runtime?.deactivate();
      record.active = false;
    }
    record.window.focused = false;
  }
}

function deactivateRecord(record: WindowManagerAppWindow): void {
  if (record.active) {
    record.runtime?.deactivate();
    record.active = false;
  }
  record.window.focused = false;
}

function closeRecord(record: WindowManagerAppWindow): void {
  if (record.closed) {
    return;
  }

  if (record.active) {
    record.runtime?.deactivate();
    record.active = false;
  }
  record.runtime?.close();
  record.closed = true;
  record.window.focused = false;
}

function findRecordForOutput(
  state: WindowManagerState,
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
  managerId: string,
  event: ComponentEvent
): event is WindowStateChangeEvent {
  return event.type === "window-state-change" && event.componentId === createWindowLayerId(managerId);
}

function createWindowLayerId(managerId: string): string {
  return `${managerId}:windows`;
}

function resolveAppState(props: WindowManagerProps, window: TouchWindowState): unknown {
  return props.appStates?.[window.instanceId] ?? props.appStates?.[window.id];
}

function createSurfaceContext(
  ctx: {
    services: RuntimeServices;
  },
  window: TouchWindowState
): TouchAppSurfaceContext {
  const metrics = ctx.services.surface.getMetrics();
  return {
    width: window.rect.width,
    height: window.rect.height,
    pixelDensity: metrics.pixelDensity,
    safeArea: metrics.safeArea ? copyInsets(metrics.safeArea) : ZERO_INSETS
  };
}
