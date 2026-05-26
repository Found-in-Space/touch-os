import {
  type ComponentEvent,
  type DisplayComponent,
  type DisplayNode,
  createNode,
  isDisplayEvent
} from "../core/component.js";
import type {
  WindowMode,
  WindowStateChangeEvent,
  WindowStateChangeReason
} from "../core/actions.js";
import {
  clamp,
  copyRect,
  createPoint,
  createRect,
  insetRect,
  rectContainsPoint,
  type Insets,
  type Point,
  type Rect
} from "../core/geometry.js";
import { resolvePadding, resolvePointerOpaqueHit, type PointerOpaqueProps } from "./shared.js";
import {
  isWindowDragHandleTargetId,
  resolveWindowChromeHeight,
  resolveWindowControlFromTargetId,
  type WindowControl,
  type WindowProps
} from "./window.js";

export interface WindowLayerProps extends PointerOpaqueProps {
  windows: readonly DisplayNode<WindowProps, unknown>[];
  constraintPadding?: number | Partial<Insets>;
  focusOnPress?: boolean;
}

interface WindowLayerEntry {
  id: string;
  rect: Rect;
  zIndex: number;
  mode: WindowMode;
  focused: boolean;
  previousRect: Rect | undefined;
  sourceIndex: number;
}

interface WindowDragState {
  windowId: string;
  pointerId: string;
  startPoint: Point;
  startRect: Rect;
  active: boolean;
}

interface WindowLayerState {
  entries: Map<string, WindowLayerEntry>;
  drags: Map<string, WindowDragState>;
}

const WindowLayerComponent: DisplayComponent<WindowLayerProps, WindowLayerState> = {
  kind: "window-layer",
  mount(ctx) {
    const state: WindowLayerState = {
      entries: new Map(),
      drags: new Map()
    };
    syncWindowEntries(state, ctx.props);
    return state;
  },
  update(ctx) {
    syncWindowEntries(ctx.state, ctx.props);
  },
  getChildren(ctx) {
    syncWindowEntries(ctx.state, ctx.props);
    return getOrderedVisibleWindows(ctx.props, ctx.state);
  },
  measure(ctx) {
    syncWindowEntries(ctx.state, ctx.props);
    const chromeHeight = resolveWindowChromeHeight(ctx.services.theme.getTokens());
    const constraint = createLocalConstraintRect(
      createRect(0, 0, ctx.constraints.maxWidth, ctx.constraints.maxHeight),
      ctx.props.constraintPadding
    );
    for (const window of getOrderedVisibleWindows(ctx.props, ctx.state)) {
      const entry = getRequiredEntry(ctx.state, window.id);
      const rect = resolveWindowLayoutRect(entry, constraint, chromeHeight);
      ctx.measureChild(window.id, {
        minWidth: 0,
        minHeight: 0,
        maxWidth: rect.width,
        maxHeight: rect.height
      });
    }

    return {
      width: ctx.constraints.maxWidth,
      height: ctx.constraints.maxHeight
    };
  },
  layout(ctx) {
    syncWindowEntries(ctx.state, ctx.props);
    const chromeHeight = resolveWindowChromeHeight(ctx.services.theme.getTokens());
    const constraint = createLocalConstraintRect(ctx.bounds, ctx.props.constraintPadding);
    for (const window of getOrderedVisibleWindows(ctx.props, ctx.state)) {
      const entry = getRequiredEntry(ctx.state, window.id);
      const clamped = clampWindowRect(entry.rect, constraint);
      if (!rectsEqual(entry.rect, clamped)) {
        entry.rect = clamped;
      }

      const localRect = resolveWindowLayoutRect(entry, constraint, chromeHeight);
      ctx.setChildBounds(
        window.id,
        createRect(
          ctx.bounds.x + localRect.x,
          ctx.bounds.y + localRect.y,
          localRect.width,
          localRect.height
        )
      );
    }
    ctx.setContentBounds(ctx.bounds);
  },
  render() {
    return [];
  },
  hitTest(ctx) {
    return resolvePointerOpaqueHit(ctx);
  },
  handleEvent(ctx) {
    if (!isDisplayEvent(ctx.event)) {
      return;
    }

    syncWindowEntries(ctx.state, ctx.props);
    switch (ctx.event.type) {
      case "pointer-down":
        handlePointerDown(ctx);
        break;
      case "drag-start":
      case "drag-move":
        handleDragMove(ctx);
        break;
      case "pointer-up":
        handlePointerUp(ctx);
        break;
      case "drag-end":
      case "cancel":
        clearDrag(ctx.state, ctx.event.pointerId ?? "default");
        break;
      case "press":
        handlePress(ctx);
        break;
    }
  }
};

export function createWindowLayer(
  id: string,
  props: WindowLayerProps
): DisplayNode<WindowLayerProps, WindowLayerState> {
  return createNode(id, WindowLayerComponent, props);
}

function handlePointerDown(ctx: {
  id: string;
  props: WindowLayerProps;
  state: WindowLayerState;
  bounds: Rect;
  event: ComponentEvent;
  services: { theme: { getTokens(): { controlHeight: number } }; focus: { requestFocus(componentId: string): void } };
  emit(output: WindowStateChangeEvent): void;
  invalidateLayout(): void;
}): void {
  if (!isPointerLikeEvent(ctx.event)) {
    return;
  }

  const point = createPoint(ctx.event.localX, ctx.event.localY);
  const windowId = resolveWindowIdFromTarget(ctx.props, ctx.event.targetId) ??
    findTopWindowAtPoint(
      ctx.props,
      ctx.state,
      ctx.bounds,
      point,
      resolveWindowChromeHeight(ctx.services.theme.getTokens())
    );
  if (!windowId) {
    return;
  }

  if (ctx.props.focusOnPress ?? true) {
    focusWindow(ctx, windowId);
  }

  const window = getWindowById(ctx.props, windowId);
  const entry = ctx.state.entries.get(windowId);
  if (
    !window ||
    !entry ||
    entry.mode === "closed" ||
    entry.mode === "maximized" ||
    (window.props.movable ?? true) === false ||
    !isWindowDragHandleTargetId(windowId, ctx.event.targetId)
  ) {
    return;
  }

  const pointerId = ctx.event.pointerId ?? "default";
  ctx.state.drags.set(pointerId, {
    windowId,
    pointerId,
    startPoint: createPoint(ctx.event.surfaceX, ctx.event.surfaceY),
    startRect: copyRect(entry.rect),
    active: false
  });
}

function handleDragMove(ctx: {
  id: string;
  props: WindowLayerProps;
  state: WindowLayerState;
  bounds: Rect;
  event: ComponentEvent;
  services: { theme: { getTokens(): { controlHeight: number } } };
  emit(output: WindowStateChangeEvent): void;
  invalidateLayout(): void;
}): void {
  if (!isPointerLikeEvent(ctx.event)) {
    return;
  }

  const pointerId = ctx.event.pointerId ?? "default";
  const drag = ctx.state.drags.get(pointerId);
  if (!drag) {
    return;
  }

  drag.active = true;
  applyDraggedRect(ctx, drag, ctx.event.surfaceX, ctx.event.surfaceY);
}

function handlePointerUp(ctx: {
  id: string;
  props: WindowLayerProps;
  state: WindowLayerState;
  bounds: Rect;
  event: ComponentEvent;
  services: { theme: { getTokens(): { controlHeight: number } } };
  emit(output: WindowStateChangeEvent): void;
  invalidateLayout(): void;
}): void {
  if (!isPointerLikeEvent(ctx.event)) {
    return;
  }

  const pointerId = ctx.event.pointerId ?? "default";
  const drag = ctx.state.drags.get(pointerId);
  if (drag?.active) {
    applyDraggedRect(ctx, drag, ctx.event.surfaceX, ctx.event.surfaceY);
  }
  clearDrag(ctx.state, pointerId);
}

function handlePress(ctx: {
  id: string;
  props: WindowLayerProps;
  state: WindowLayerState;
  bounds: Rect;
  event: ComponentEvent;
  services: { theme: { getTokens(): { controlHeight: number } }; focus: { requestFocus(componentId: string): void } };
  emit(output: WindowStateChangeEvent): void;
  invalidateLayout(): void;
}): void {
  if (!isPointerLikeEvent(ctx.event)) {
    return;
  }

  const windowId = resolveWindowIdFromTarget(ctx.props, ctx.event.targetId);
  if (!windowId) {
    return;
  }

  const control = resolveWindowControlFromTargetId(windowId, ctx.event.targetId);
  if (!control) {
    return;
  }

  applyControl(ctx, windowId, control);
}

function applyDraggedRect(
  ctx: {
    id: string;
    props: WindowLayerProps;
    state: WindowLayerState;
    bounds: Rect;
    event: ComponentEvent;
    services: { theme: { getTokens(): { controlHeight: number } } };
    emit(output: WindowStateChangeEvent): void;
    invalidateLayout(): void;
  },
  drag: WindowDragState,
  surfaceX: number,
  surfaceY: number
): void {
  const entry = ctx.state.entries.get(drag.windowId);
  const window = getWindowById(ctx.props, drag.windowId);
  if (!entry || !window || entry.mode === "closed") {
    return;
  }

  const constraint = createLocalConstraintRect(ctx.bounds, ctx.props.constraintPadding);
  const next = clampWindowRect(
    createRect(
      drag.startRect.x + surfaceX - drag.startPoint.x,
      drag.startRect.y + surfaceY - drag.startPoint.y,
      drag.startRect.width,
      drag.startRect.height
    ),
    constraint
  );
  applyRectChange(ctx, window, entry, next, "move");
}

function applyControl(
  ctx: {
    id: string;
    props: WindowLayerProps;
    state: WindowLayerState;
    bounds: Rect;
    services: { theme: { getTokens(): { controlHeight: number } }; focus: { requestFocus(componentId: string): void } };
    emit(output: WindowStateChangeEvent): void;
    invalidateLayout(): void;
  },
  windowId: string,
  control: WindowControl
): void {
  const window = getWindowById(ctx.props, windowId);
  const entry = ctx.state.entries.get(windowId);
  if (!window || !entry || entry.mode === "closed") {
    return;
  }

  const previousRect = resolveCurrentOutputRect(ctx, entry);
  const previousMode = entry.mode;
  switch (control) {
    case "close":
      entry.mode = "closed";
      entry.focused = false;
      ctx.invalidateLayout();
      emitWindowStateChange(ctx, window, entry, "close", previousRect, previousMode);
      break;
    case "minimize":
      if (entry.mode === "minimized") {
        entry.mode = "normal";
        ctx.invalidateLayout();
        emitWindowStateChange(ctx, window, entry, "restore", previousRect, previousMode);
      } else {
        entry.mode = "minimized";
        ctx.invalidateLayout();
        emitWindowStateChange(ctx, window, entry, "minimize", previousRect, previousMode);
      }
      break;
    case "maximize":
      if (entry.mode === "maximized") {
        entry.mode = "normal";
        if (entry.previousRect) {
          entry.rect = entry.previousRect;
          entry.previousRect = undefined;
        }
        ctx.invalidateLayout();
        emitWindowStateChange(ctx, window, entry, "restore", previousRect, previousMode);
      } else {
        entry.previousRect = copyRect(entry.rect);
        entry.mode = "maximized";
        ctx.invalidateLayout();
        emitWindowStateChange(ctx, window, entry, "maximize", previousRect, previousMode);
      }
      break;
  }
}

function focusWindow(
  ctx: {
    id: string;
    props: WindowLayerProps;
    state: WindowLayerState;
    bounds: Rect;
    services: { theme: { getTokens(): { controlHeight: number } }; focus: { requestFocus(componentId: string): void } };
    emit(output: WindowStateChangeEvent): void;
    invalidateLayout(): void;
  },
  windowId: string
): void {
  const window = getWindowById(ctx.props, windowId);
  const entry = ctx.state.entries.get(windowId);
  if (!window || !entry || entry.mode === "closed") {
    return;
  }

  const previousRect = resolveCurrentOutputRect(ctx, entry);
  const previousZIndex = entry.zIndex;
  let changed = false;
  for (const candidate of ctx.state.entries.values()) {
    const nextFocused = candidate.id === windowId;
    if (candidate.focused !== nextFocused) {
      candidate.focused = nextFocused;
      changed = true;
    }
  }

  const nextZIndex = getNextZIndex(ctx.state);
  if (entry.zIndex < nextZIndex - 1) {
    entry.zIndex = nextZIndex;
    changed = true;
  }

  ctx.services.focus.requestFocus(windowId);
  if (!changed) {
    return;
  }

  ctx.invalidateLayout();
  emitWindowStateChange(ctx, window, entry, "focus", previousRect, entry.mode, previousZIndex);
}

function applyRectChange(
  ctx: {
    id: string;
    props: WindowLayerProps;
    state: WindowLayerState;
    bounds: Rect;
    services: { theme: { getTokens(): { controlHeight: number } } };
    emit(output: WindowStateChangeEvent): void;
    invalidateLayout(): void;
  },
  window: DisplayNode<WindowProps, unknown>,
  entry: WindowLayerEntry,
  next: Rect,
  change: WindowStateChangeReason
): void {
  if (rectsEqual(entry.rect, next)) {
    return;
  }

  const previousRect = resolveCurrentOutputRect(ctx, entry);
  entry.rect = next;
  ctx.invalidateLayout();
  emitWindowStateChange(ctx, window, entry, change, previousRect, entry.mode);
}

function emitWindowStateChange(
  ctx: {
    id: string;
    bounds: Rect;
    props: WindowLayerProps;
    services: { theme: { getTokens(): { controlHeight: number } } };
    emit(output: WindowStateChangeEvent): void;
  },
  window: DisplayNode<WindowProps, unknown>,
  entry: WindowLayerEntry,
  change: WindowStateChangeReason,
  previousRect: Rect,
  previousMode: WindowMode,
  previousZIndex?: number
): void {
  const output: WindowStateChangeEvent = {
    type: "window-state-change",
    componentId: ctx.id,
    windowId: entry.id,
    change,
    rect: resolveCurrentOutputRect(ctx, entry),
    zIndex: entry.zIndex,
    focused: entry.focused,
    mode: entry.mode
  };

  if (!rectsEqual(previousRect, output.rect)) {
    output.previousRect = previousRect;
  }
  if (previousMode !== output.mode) {
    output.previousMode = previousMode;
  }
  if (previousZIndex !== undefined && previousZIndex !== output.zIndex) {
    output.previousZIndex = previousZIndex;
  }
  if (window.props.persistenceKey) {
    output.persistenceKey = window.props.persistenceKey;
  }

  ctx.emit(output);
}

function syncWindowEntries(state: WindowLayerState, props: WindowLayerProps): void {
  const activeIds = new Set<string>();
  props.windows.forEach((window, index) => {
    activeIds.add(window.id);
    const existing = state.entries.get(window.id);
    if (existing) {
      existing.sourceIndex = index;
      return;
    }

    state.entries.set(window.id, {
      id: window.id,
      rect: sanitizeRect(window.props.rect),
      zIndex: window.props.zIndex ?? index,
      mode: window.props.mode ?? "normal",
      focused: false,
      previousRect: undefined,
      sourceIndex: index
    });
  });

  for (const id of state.entries.keys()) {
    if (!activeIds.has(id)) {
      state.entries.delete(id);
    }
  }
}

function getOrderedVisibleWindows(
  props: WindowLayerProps,
  state: WindowLayerState
): DisplayNode<WindowProps, unknown>[] {
  return props.windows
    .filter((window) => state.entries.get(window.id)?.mode !== "closed")
    .sort((left, right) => {
      const leftEntry = getRequiredEntry(state, left.id);
      const rightEntry = getRequiredEntry(state, right.id);
      return leftEntry.zIndex - rightEntry.zIndex || leftEntry.sourceIndex - rightEntry.sourceIndex;
    });
}

function getRequiredEntry(state: WindowLayerState, windowId: string): WindowLayerEntry {
  const entry = state.entries.get(windowId);
  if (!entry) {
    throw new Error(`Missing window layer state for window "${windowId}".`);
  }
  return entry;
}

function getWindowById(
  props: WindowLayerProps,
  windowId: string
): DisplayNode<WindowProps, unknown> | undefined {
  return props.windows.find((window) => window.id === windowId);
}

function resolveWindowIdFromTarget(
  props: WindowLayerProps,
  targetId: string
): string | undefined {
  return props.windows.find((window) => targetId.startsWith(`${window.id}:`))?.id;
}

function findTopWindowAtPoint(
  props: WindowLayerProps,
  state: WindowLayerState,
  bounds: Rect,
  point: Point,
  chromeHeight: number
): string | undefined {
  const constraint = createLocalConstraintRect(bounds, props.constraintPadding);
  const windows = [...getOrderedVisibleWindows(props, state)].reverse();
  return windows.find((window) => {
    const entry = state.entries.get(window.id);
    return entry
      ? rectContainsPoint(resolveWindowLayoutRect(entry, constraint, chromeHeight), point)
      : false;
  })?.id;
}

function createLocalConstraintRect(
  bounds: Rect,
  padding: number | Partial<Insets> | undefined
): Rect {
  const padded = insetRect(createRect(0, 0, bounds.width, bounds.height), resolvePadding(padding, 0));
  return padded;
}

function resolveWindowLayoutRect(
  entry: WindowLayerEntry,
  constraint: Rect,
  chromeHeight: number
): Rect {
  switch (entry.mode) {
    case "maximized":
      return copyRect(constraint);
    case "minimized": {
      const rect = clampWindowRect(entry.rect, constraint);
      return createRect(rect.x, rect.y, rect.width, Math.min(rect.height, chromeHeight));
    }
    case "closed":
      return createRect(entry.rect.x, entry.rect.y, 0, 0);
    case "normal":
    default:
      return clampWindowRect(entry.rect, constraint);
  }
}

function resolveCurrentOutputRect(
  ctx: {
    bounds: Rect;
    props: WindowLayerProps;
    services: { theme: { getTokens(): { controlHeight: number } } };
  },
  entry: WindowLayerEntry
): Rect {
  return resolveWindowLayoutRect(
    entry,
    createLocalConstraintRect(ctx.bounds, ctx.props.constraintPadding),
    resolveWindowChromeHeight(ctx.services.theme.getTokens())
  );
}

function clampWindowRect(rect: Rect, constraint: Rect): Rect {
  const width = Math.min(Math.max(0, rect.width), constraint.width);
  const height = Math.min(Math.max(0, rect.height), constraint.height);
  return createRect(
    clamp(rect.x, constraint.x, constraint.x + Math.max(0, constraint.width - width)),
    clamp(rect.y, constraint.y, constraint.y + Math.max(0, constraint.height - height)),
    width,
    height
  );
}

function sanitizeRect(rect: Rect): Rect {
  return createRect(
    Number.isFinite(rect.x) ? rect.x : 0,
    Number.isFinite(rect.y) ? rect.y : 0,
    Math.max(0, Number.isFinite(rect.width) ? rect.width : 0),
    Math.max(0, Number.isFinite(rect.height) ? rect.height : 0)
  );
}

function getNextZIndex(state: WindowLayerState): number {
  let maxZIndex = -1;
  for (const entry of state.entries.values()) {
    maxZIndex = Math.max(maxZIndex, entry.zIndex);
  }
  return maxZIndex + 1;
}

function rectsEqual(left: Rect, right: Rect): boolean {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  );
}

function clearDrag(state: WindowLayerState, pointerId: string): void {
  state.drags.delete(pointerId);
}

function isPointerLikeEvent(
  event: ComponentEvent
): event is Extract<ComponentEvent, { surfaceX: number; surfaceY: number; targetId: string }> {
  return "surfaceX" in event && "surfaceY" in event && "targetId" in event;
}
