import type { RuntimeOutput } from "./actions.js";
import type {
  ComponentChildrenContext,
  ComponentEvent,
  ComponentDisposeContext,
  ComponentEventContext,
  ComponentHitTestContext,
  ComponentLayoutContext,
  ComponentMeasureContext,
  ComponentMountContext,
  ComponentRenderContext,
  ComponentUpdateContext,
  DisplayComponent,
  DisplayNode,
  RuntimeChildDescriptor,
  RuntimeInteractionSnapshot
} from "./component.js";
import type { DrawCommand, RenderSnapshot } from "./draw.js";
import {
  DEFAULT_MODIFIERS,
  type DisplayEvent,
  type InputEvent,
  type ModifierState,
  type PointerType
} from "./events.js";
import {
  clampSize,
  copyRect,
  copySize,
  createPoint,
  createRect,
  insetRect,
  intersectRect,
  rectContainsPoint,
  type LayoutConstraints,
  type Point,
  type Rect,
  type Size
} from "./geometry.js";
import type {
  FocusService,
  MutableLayoutService,
  RuntimeServices,
  ScrollService,
  SurfaceMetrics,
  ThemeTokens,
  TimingService
} from "../services/contracts.js";
import {
  createEmbeddedSurfaceService,
  createMemoryFocusService,
  createMemoryLayoutService,
  createMemoryNavigationService,
  createMemoryScrollService,
  createSurfaceService,
  createThemeService,
  createTimingService
} from "../services/defaults.js";

interface RuntimeNodeState {
  id: string;
  component: DisplayComponent<unknown, unknown>;
  props: unknown;
  state: unknown;
  parentId: string | undefined;
  children: RuntimeNodeState[];
  childLookup: Map<string, RuntimeNodeState>;
  measuredSize: Size;
  bounds: Rect;
  contentBounds: Rect;
  clipRect: Rect | undefined;
  childBounds: Map<string, Rect>;
  childMeasurements: Map<string, Size>;
}

interface HitTestMatch {
  componentId: string;
  targetId: string;
  pathIds: string[];
}

interface ActivePointerState {
  pointerId: string;
  pointerType: PointerType;
  pressure: number | undefined;
  modifiers: ModifierState;
  startPoint: Point;
  lastPoint: Point;
  pathIds: string[];
  componentId: string;
  targetId: string;
  dragging: boolean;
  longPressFired: boolean;
  downTimestamp: number;
}

interface PendingEmission {
  emitterNode: RuntimeNodeState;
  output: RuntimeOutput;
}

export interface RuntimeServiceOverrides extends Partial<Omit<RuntimeServices, "layout">> {
  layout?: MutableLayoutService;
}

export interface RuntimeOptions {
  root: DisplayNode<unknown>;
  surface?: Partial<SurfaceMetrics>;
  theme?: Partial<ThemeTokens>;
  services?: RuntimeServiceOverrides;
  now?: number;
  longPressDelay?: number;
  dragThreshold?: number;
}

export interface DispatchResult {
  handled: boolean;
  componentId: string | undefined;
  targetId: string | undefined;
  outputs: readonly RuntimeOutput[];
}

export interface DisplayRuntime {
  setRoot(root: DisplayNode<unknown>): void;
  render(): RenderSnapshot;
  dispatchInput(event: InputEvent): DispatchResult;
  resize(metrics: Partial<SurfaceMetrics>): void;
  tick(timestamp: number): void;
  takeOutputs(): readonly RuntimeOutput[];
  getServices(): RuntimeServices;
  getInteraction(): RuntimeInteractionSnapshot;
  getBounds(componentId: string): Rect | undefined;
  isLayoutDirty(): boolean;
  isRenderDirty(): boolean;
  dispose(): void;
}

export function createRuntime(options: RuntimeOptions): DisplayRuntime {
  const layout = options.services?.layout ?? createMemoryLayoutService();
  let layoutDirty = true;
  let renderDirty = true;
  let renderRevision = 0;
  let outputs: RuntimeOutput[] = [];
  const pendingEmissions: PendingEmission[] = [];
  let commands: DrawCommand[] = [];
  const dragThreshold = options.dragThreshold ?? 6;
  let eventDispatchDepth = 0;
  let isFlushingEmissions = false;

  const services: RuntimeServices = {
    layout,
    navigation:
      options.services?.navigation ?? createMemoryNavigationService(() => invalidateLayout()),
    scroll: options.services?.scroll ?? createMemoryScrollService(() => invalidateRender()),
    focus: options.services?.focus ?? createMemoryFocusService(() => invalidateRender()),
    theme: options.services?.theme ?? createThemeService(options.theme, () => invalidateRender()),
    timing:
      options.services?.timing ??
      createTimingService(options.now ?? 0, options.longPressDelay ?? 450),
    surface: options.services?.surface ?? createSurfaceService(options.surface, () => invalidateLayout()),
    surfaces:
      options.services?.surfaces ?? createEmbeddedSurfaceService(() => invalidateRender())
  };

  const focusService = services.focus;
  const timingService = services.timing;

  let rootDescriptor = options.root;
  let rootNode: RuntimeNodeState | undefined;
  const nodeLookup = new Map<string, RuntimeNodeState>();
  let hoveredMatch: HitTestMatch | undefined;
  let activePointer: ActivePointerState | undefined;
  let focusedComponentId = focusService.getFocusedComponentId();

  rootNode = mountNode(rootDescriptor, undefined);

  function invalidateLayout(): void {
    layoutDirty = true;
    renderDirty = true;
  }

  function invalidateRender(): void {
    renderDirty = true;
  }

  function runComponentDispatch<TValue>(fn: () => TValue): TValue {
    eventDispatchDepth += 1;
    try {
      return fn();
    } finally {
      eventDispatchDepth -= 1;
      if (eventDispatchDepth === 0 && !isFlushingEmissions) {
        flushEmissions();
      }
    }
  }

  function enqueueEmission(emitterNode: RuntimeNodeState, output: RuntimeOutput): void {
    pendingEmissions.push({ emitterNode, output });
    if (eventDispatchDepth === 0 && !isFlushingEmissions) {
      flushEmissions();
    }
  }

  function flushEmissions(): void {
    if (isFlushingEmissions) {
      return;
    }

    isFlushingEmissions = true;
    try {
      while (pendingEmissions.length > 0) {
        const emission = pendingEmissions.shift();
        if (!emission) {
          continue;
        }

        outputs.push(emission.output);
        dispatchOutputToAncestors(emission.emitterNode, emission.output);
      }
    } finally {
      isFlushingEmissions = false;
      if (eventDispatchDepth === 0 && pendingEmissions.length > 0) {
        flushEmissions();
      }
    }
  }

  function dispatchOutputToAncestors(emitterNode: RuntimeNodeState, output: RuntimeOutput): void {
    const path = resolvePathNodes(buildPathToRoot(emitterNode));
    if (path.length <= 1) {
      return;
    }

    runComponentDispatch(() => {
      const ancestors = path.slice(0, -1);
      for (const node of [...ancestors].reverse()) {
        node.component.handleEvent?.(createEventContext(node, output));
      }
    });

    invalidateRender();
  }

  function createInteractionSnapshot(): RuntimeInteractionSnapshot {
    return {
      hoveredTargetId: hoveredMatch?.targetId,
      pressedTargetId: activePointer?.targetId,
      focusedComponentId
    };
  }

  function estimateTextWidth(text: string, fontSize?: number): number {
    const size = fontSize ?? services.theme.getTokens().typography.fontSize;
    return text.length * size * 0.6;
  }

  function createBaseContext(node: RuntimeNodeState) {
    return {
      id: node.id,
      props: node.props,
      state: node.state,
      services,
      interaction: createInteractionSnapshot(),
      emit(output: RuntimeOutput) {
        enqueueEmission(node, output);
      },
      invalidateLayout,
      invalidateRender,
      estimateTextWidth
    };
  }

  function createChildrenContext(node: RuntimeNodeState): ComponentChildrenContext<unknown, unknown> {
    return createBaseContext(node);
  }

  function createMountContext(node: RuntimeNodeState): ComponentMountContext<unknown, unknown> {
    return createBaseContext(node);
  }

  function createUpdateContext(node: RuntimeNodeState): ComponentUpdateContext<unknown, unknown> {
    return createBaseContext(node);
  }

  function createMeasureContext(
    node: RuntimeNodeState,
    constraints: LayoutConstraints
  ): ComponentMeasureContext<unknown, unknown> {
    return {
      ...createBaseContext(node),
      constraints,
      getChildren() {
        return node.children.map<RuntimeChildDescriptor>((child) => ({ id: child.id }));
      },
      measureChild(childId, childConstraints = constraints) {
        const size = measureNode(getRequiredChild(node, childId), childConstraints);
        node.childMeasurements.set(childId, copySize(size));
        return size;
      }
    };
  }

  function createLayoutContext(
    node: RuntimeNodeState,
    bounds: Rect
  ): ComponentLayoutContext<unknown, unknown> {
    return {
      ...createBaseContext(node),
      bounds,
      getChildren() {
        return node.children.map<RuntimeChildDescriptor>((child) => ({ id: child.id }));
      },
      getMeasuredSize(childId) {
        const size = node.childMeasurements.get(childId);
        if (!size) {
          throw new Error(`No measurement recorded for child "${childId}" of "${node.id}".`);
        }
        return copySize(size);
      },
      measureChild(childId, constraints = unconstrained(bounds.width, bounds.height)) {
        const size = measureNode(getRequiredChild(node, childId), constraints);
        node.childMeasurements.set(childId, copySize(size));
        return size;
      },
      setChildBounds(childId, rect) {
        node.childBounds.set(childId, copyRect(rect));
      },
      setContentBounds(rect) {
        node.contentBounds = copyRect(rect);
      },
      setClipRect(rect) {
        node.clipRect = rect ? copyRect(rect) : undefined;
      }
    };
  }

  function createRenderContext(node: RuntimeNodeState): ComponentRenderContext<unknown, unknown> {
    return {
      ...createBaseContext(node),
      bounds: copyRect(node.bounds)
    };
  }

  function createHitTestContext(
    node: RuntimeNodeState,
    point: Point
  ): ComponentHitTestContext<unknown, unknown> {
    return {
      ...createBaseContext(node),
      bounds: copyRect(node.bounds),
      point,
      localPoint: createPoint(point.x - node.bounds.x, point.y - node.bounds.y)
    };
  }

  function createEventContext(
    node: RuntimeNodeState,
    event: ComponentEvent
  ): ComponentEventContext<unknown, unknown> {
    return {
      ...createBaseContext(node),
      bounds: copyRect(node.bounds),
      event
    };
  }

  function createDisposeContext(node: RuntimeNodeState): ComponentDisposeContext<unknown, unknown> {
    return createBaseContext(node);
  }

  function getRequiredChild(node: RuntimeNodeState, childId: string): RuntimeNodeState {
    const child = node.childLookup.get(childId);
    if (!child) {
      throw new Error(`Unknown child "${childId}" requested from "${node.id}".`);
    }
    return child;
  }

  function getChildrenForNode(node: RuntimeNodeState): readonly DisplayNode<unknown, unknown>[] {
    return node.component.getChildren?.(createChildrenContext(node)) ?? [];
  }

  function mountNode(
    descriptor: DisplayNode<unknown, unknown>,
    parentId: string | undefined
  ): RuntimeNodeState {
    if (nodeLookup.has(descriptor.id)) {
      throw new Error(`Duplicate component id "${descriptor.id}" detected.`);
    }

    const node: RuntimeNodeState = {
      id: descriptor.id,
      component: descriptor.component,
      props: descriptor.props,
      state: undefined,
      parentId,
      children: [],
      childLookup: new Map(),
      measuredSize: { width: 0, height: 0 },
      bounds: { x: 0, y: 0, width: 0, height: 0 },
      contentBounds: { x: 0, y: 0, width: 0, height: 0 },
      clipRect: undefined,
      childBounds: new Map(),
      childMeasurements: new Map()
    };

    nodeLookup.set(node.id, node);
    const mountedState = node.component.mount?.(createMountContext(node));
    node.state = mountedState;
    const childDescriptors = getChildrenForNode(node);
    node.children = childDescriptors.map((child) => mountNode(child, node.id));
    node.childLookup = new Map(node.children.map((child) => [child.id, child]));
    return node;
  }

  function reconcileNode(
    existing: RuntimeNodeState | undefined,
    descriptor: DisplayNode<unknown, unknown>,
    parentId: string | undefined
  ): RuntimeNodeState {
    if (
      !existing ||
      existing.id !== descriptor.id ||
      existing.component.kind !== descriptor.component.kind
    ) {
      if (existing) {
        disposeNode(existing);
      }
      return mountNode(descriptor, parentId);
    }

    existing.parentId = parentId;
    existing.component = descriptor.component;
    existing.props = descriptor.props;
    existing.component.update?.(createUpdateContext(existing));

    const nextChildDescriptors = getChildrenForNode(existing);
    const previousChildren = new Map(existing.children.map((child) => [child.id, child]));
    const nextChildren: RuntimeNodeState[] = [];

    for (const childDescriptor of nextChildDescriptors) {
      const previous = previousChildren.get(childDescriptor.id);
      nextChildren.push(reconcileNode(previous, childDescriptor, existing.id));
      previousChildren.delete(childDescriptor.id);
    }

    for (const orphan of previousChildren.values()) {
      disposeNode(orphan);
    }

    existing.children = nextChildren;
    existing.childLookup = new Map(existing.children.map((child) => [child.id, child]));
    return existing;
  }

  function disposeNode(node: RuntimeNodeState): void {
    for (const child of node.children) {
      disposeNode(child);
    }
    node.component.dispose?.(createDisposeContext(node));
    nodeLookup.delete(node.id);
  }

  function measureNode(node: RuntimeNodeState, constraints: LayoutConstraints): Size {
    node.childMeasurements.clear();
    const measured = node.component.measure(createMeasureContext(node, constraints));
    node.measuredSize = clampSize(measured, constraints);
    return copySize(node.measuredSize);
  }

  function layoutNode(node: RuntimeNodeState, bounds: Rect): void {
    node.bounds = copyRect(bounds);
    node.contentBounds = copyRect(bounds);
    node.clipRect = undefined;
    node.childBounds.clear();
    layout.setBounds(node.id, node.bounds);

    if (node.component.layout) {
      node.component.layout(createLayoutContext(node, bounds));
    } else {
      for (const child of node.children) {
        node.childBounds.set(child.id, copyRect(bounds));
      }
    }

    layout.setContentBounds(node.id, node.contentBounds);

    for (const child of node.children) {
      const childBounds = node.childBounds.get(child.id) ?? createRect(bounds.x, bounds.y, 0, 0);
      layoutNode(child, childBounds);
    }
  }

  function ensureLayout(): void {
    syncFocusEvents();

    if (!layoutDirty || !rootNode) {
      return;
    }

    layout.clear();
    const surface = services.surface.getMetrics();
    const availableBounds = insetRect(createRect(0, 0, surface.width, surface.height), surface.safeArea);
    measureNode(rootNode, unconstrained(availableBounds.width, availableBounds.height));
    layoutNode(rootNode, availableBounds);
    layoutDirty = false;
    renderDirty = true;
  }

  function rebuildCommands(): void {
    ensureLayout();
    if (!rootNode || !renderDirty) {
      return;
    }

    commands = [];
    renderNode(rootNode, undefined);
    renderRevision += 1;
    renderDirty = false;
  }

  function renderNode(node: RuntimeNodeState, inheritedClip: Rect | undefined): void {
    if (node.bounds.width <= 0 || node.bounds.height <= 0) {
      return;
    }

    const effectiveClip = intersectRect(inheritedClip, node.clipRect);
    const nodeCommands = node.component.render?.(createRenderContext(node)) ?? [];

    for (const command of nodeCommands) {
      commands.push(withClip(command, intersectRect(effectiveClip, command.clipRect)));
    }

    for (const child of node.children) {
      renderNode(child, effectiveClip);
    }
  }

  function hitTest(point: Point): HitTestMatch | undefined {
    ensureLayout();
    return rootNode ? hitTestNode(rootNode, point, undefined, []) : undefined;
  }

  function hitTestNode(
    node: RuntimeNodeState,
    point: Point,
    inheritedClip: Rect | undefined,
    ancestorPath: string[]
  ): HitTestMatch | undefined {
    const effectiveClip = intersectRect(inheritedClip, node.clipRect);
    if (effectiveClip && !rectContainsPoint(effectiveClip, point)) {
      return undefined;
    }

    const nextPath = [...ancestorPath, node.id];
    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      const child = node.children[index];
      if (!child) {
        continue;
      }
      const childMatch = hitTestNode(child, point, effectiveClip, nextPath);
      if (childMatch) {
        return childMatch;
      }
    }

    if (!rectContainsPoint(node.bounds, point)) {
      return undefined;
    }

    const hit = node.component.hitTest?.(createHitTestContext(node, point)) ?? null;
    if (!hit) {
      return undefined;
    }

    return {
      componentId: node.id,
      targetId: hit.targetId,
      pathIds: nextPath
    };
  }

  function syncFocusEvents(): void {
    const currentFocus = focusService.getFocusedComponentId();
    if (currentFocus === focusedComponentId) {
      return;
    }

    const previousFocus = focusedComponentId;
    focusedComponentId = currentFocus;

    if (previousFocus) {
      dispatchFocusLikeEvent("blur", previousFocus);
    }
    if (currentFocus) {
      dispatchFocusLikeEvent("focus", currentFocus);
    }
  }

  function dispatchFocusLikeEvent(type: "focus" | "blur", componentId: string): void {
    const node = nodeLookup.get(componentId);
    if (!node) {
      return;
    }

    const path = resolvePathNodes(buildPathToRoot(node));
    runComponentDispatch(() => {
      for (const pathNode of [...path].reverse()) {
        const event: DisplayEvent =
          type === "focus"
            ? {
                type,
                timestamp: timingService.now(),
                componentId: pathNode.id,
                targetId: componentId
              }
            : {
                type,
                timestamp: timingService.now(),
                componentId: pathNode.id,
                targetId: componentId
              };
        pathNode.component.handleEvent?.(createEventContext(pathNode, event));
      }
    });
    invalidateRender();
  }

  function resolvePathNodes(pathIds: readonly string[]): RuntimeNodeState[] {
    return pathIds
      .map((pathId) => nodeLookup.get(pathId))
      .filter((node): node is RuntimeNodeState => Boolean(node));
  }

  function buildPathToRoot(node: RuntimeNodeState): string[] {
    const path: string[] = [];
    let current: RuntimeNodeState | undefined = node;
    while (current) {
      path.unshift(current.id);
      current = current.parentId ? nodeLookup.get(current.parentId) : undefined;
    }
    return path;
  }

  function dispatchToPath(
    pathIds: readonly string[],
    targetId: string,
    buildEvent: (node: RuntimeNodeState) => DisplayEvent
  ): boolean {
    const path = resolvePathNodes(pathIds);
    if (path.length === 0) {
      return false;
    }

    runComponentDispatch(() => {
      for (const node of [...path].reverse()) {
        const event = buildEvent(node);
        node.component.handleEvent?.(createEventContext(node, event));
      }
    });

    invalidateRender();
    return Boolean(targetId);
  }

  function createPointerDisplayEvent(
    type:
      | "pointer-enter"
      | "pointer-move"
      | "pointer-leave"
      | "pointer-down"
      | "pointer-up"
      | "press"
      | "long-press"
      | "drag-start"
      | "drag-move"
      | "drag-end"
      | "cancel"
      | "scroll",
    node: RuntimeNodeState,
    point: Point,
    timestamp: number,
    targetId: string,
    activeState?: ActivePointerState,
    deltas?: { deltaX: number; deltaY: number }
  ): DisplayEvent {
    const localX = point.x - node.bounds.x;
    const localY = point.y - node.bounds.y;
    const pointerId = activeState?.pointerId ?? "default";
    const pointerType = activeState?.pointerType ?? "unknown";
    const pressure = activeState?.pressure;
    const modifiers = activeState?.modifiers ?? DEFAULT_MODIFIERS;
    const pointerBase = {
      timestamp,
      pointerId,
      pointerType,
      modifiers,
      ...(pressure === undefined ? {} : { pressure })
    };

    if (type === "scroll") {
      return {
        type,
        ...pointerBase,
        surfaceX: point.x,
        surfaceY: point.y,
        localX,
        localY,
        componentId: node.id,
        targetId,
        deltaX: deltas?.deltaX ?? 0,
        deltaY: deltas?.deltaY ?? 0
      };
    }

    if (type === "drag-start" || type === "drag-move" || type === "drag-end") {
      return {
        type,
        ...pointerBase,
        surfaceX: point.x,
        surfaceY: point.y,
        localX,
        localY,
        componentId: node.id,
        targetId,
        deltaX: deltas?.deltaX ?? 0,
        deltaY: deltas?.deltaY ?? 0
      };
    }

    return {
      type,
      ...pointerBase,
      surfaceX: point.x,
      surfaceY: point.y,
      localX,
      localY,
      componentId: node.id,
      targetId
    };
  }

  function updateHover(point: Point, timestamp: number, pointerState?: ActivePointerState): void {
    const nextMatch = hitTest(point);
    if (hoveredMatch?.targetId === nextMatch?.targetId && hoveredMatch?.componentId === nextMatch?.componentId) {
      return;
    }

    const previousHover = hoveredMatch;
    if (previousHover) {
      dispatchToPath(previousHover.pathIds, previousHover.targetId, (node) =>
        createPointerDisplayEvent("pointer-leave", node, point, timestamp, previousHover.targetId, pointerState)
      );
    }

    hoveredMatch = nextMatch;

    if (nextMatch) {
      dispatchToPath(nextMatch.pathIds, nextMatch.targetId, (node) =>
        createPointerDisplayEvent("pointer-enter", node, point, timestamp, nextMatch.targetId, pointerState)
      );
    }
  }

  function clearRemovedInteractionReferences(): void {
    if (hoveredMatch && !nodeLookup.has(hoveredMatch.componentId)) {
      hoveredMatch = undefined;
    }
    if (activePointer && !nodeLookup.has(activePointer.componentId)) {
      activePointer = undefined;
    }
    const currentFocus = focusService.getFocusedComponentId();
    if (currentFocus && !nodeLookup.has(currentFocus)) {
      focusService.clearFocus();
    }
    syncFocusEvents();
  }

  function dispatchInput(event: InputEvent): DispatchResult {
    timingService.advanceTo(event.timestamp);
    syncFocusEvents();
    ensureLayout();
    clearRemovedInteractionReferences();

    const startOutputIndex = outputs.length;
    let handled = false;
    let componentId: string | undefined;
    let targetId: string | undefined;

    switch (event.type) {
      case "pointer-move": {
        const point = createPoint(event.surfaceX, event.surfaceY);
        updateHover(point, event.timestamp, activePointer);
        const pointer = activePointer;
        if (pointer && pointer.pointerId === (event.pointerId ?? pointer.pointerId)) {
          const deltaX = point.x - pointer.startPoint.x;
          const deltaY = point.y - pointer.startPoint.y;
          if (!pointer.dragging && Math.hypot(deltaX, deltaY) >= dragThreshold) {
            pointer.dragging = true;
            dispatchToPath(pointer.pathIds, pointer.targetId, (node) =>
              createPointerDisplayEvent(
                "drag-start",
                node,
                point,
                event.timestamp,
                pointer.targetId,
                pointer,
                { deltaX, deltaY }
              )
            );
          }
          if (pointer.dragging) {
            handled = dispatchToPath(pointer.pathIds, pointer.targetId, (node) =>
              createPointerDisplayEvent(
                "drag-move",
                node,
                point,
                event.timestamp,
                pointer.targetId,
                pointer,
                { deltaX, deltaY }
              )
            );
            componentId = pointer.componentId;
            targetId = pointer.targetId;
          } else if (hoveredMatch) {
            const currentHover = hoveredMatch;
            handled = dispatchToPath(currentHover.pathIds, currentHover.targetId, (node) =>
              createPointerDisplayEvent(
                "pointer-move",
                node,
                point,
                event.timestamp,
                currentHover.targetId,
                pointer
              )
            );
            componentId = currentHover.componentId;
            targetId = currentHover.targetId;
          }
          pointer.lastPoint = point;
        } else if (hoveredMatch) {
          const currentHover = hoveredMatch;
          handled = dispatchToPath(currentHover.pathIds, currentHover.targetId, (node) =>
            createPointerDisplayEvent("pointer-move", node, point, event.timestamp, currentHover.targetId)
          );
          componentId = currentHover.componentId;
          targetId = currentHover.targetId;
        }
        break;
      }

      case "pointer-down": {
        const point = createPoint(event.surfaceX, event.surfaceY);
        const match = hitTest(point);
        updateHover(point, event.timestamp);
        if (match) {
          const modifiers = event.modifiers ?? DEFAULT_MODIFIERS;
          activePointer = {
            pointerId: event.pointerId ?? "default",
            pointerType: event.pointerType ?? "unknown",
            pressure: event.pressure,
            modifiers,
            startPoint: point,
            lastPoint: point,
            pathIds: match.pathIds,
            componentId: match.componentId,
            targetId: match.targetId,
            dragging: false,
            longPressFired: false,
            downTimestamp: event.timestamp
          };
          focusService.requestFocus(match.componentId);
          syncFocusEvents();
          handled = dispatchToPath(match.pathIds, match.targetId, (node) =>
            createPointerDisplayEvent("pointer-down", node, point, event.timestamp, match.targetId, activePointer)
          );
          componentId = match.componentId;
          targetId = match.targetId;
        }
        break;
      }

      case "pointer-up": {
        const point = createPoint(event.surfaceX, event.surfaceY);
        const releaseMatch = activePointer;
        updateHover(point, event.timestamp, activePointer);
        if (releaseMatch) {
          const deltaX = point.x - releaseMatch.startPoint.x;
          const deltaY = point.y - releaseMatch.startPoint.y;
          handled = dispatchToPath(releaseMatch.pathIds, releaseMatch.targetId, (node) =>
            createPointerDisplayEvent("pointer-up", node, point, event.timestamp, releaseMatch.targetId, releaseMatch)
          );
          if (releaseMatch.dragging) {
            dispatchToPath(releaseMatch.pathIds, releaseMatch.targetId, (node) =>
              createPointerDisplayEvent(
                "drag-end",
                node,
                point,
                event.timestamp,
                releaseMatch.targetId,
                releaseMatch,
                { deltaX, deltaY }
              )
            );
          } else {
            const match = hitTest(point);
            if (
              match &&
              match.componentId === releaseMatch.componentId &&
              match.targetId === releaseMatch.targetId
            ) {
              dispatchToPath(releaseMatch.pathIds, releaseMatch.targetId, (node) =>
                createPointerDisplayEvent("press", node, point, event.timestamp, releaseMatch.targetId, releaseMatch)
              );
            }
          }
          componentId = releaseMatch.componentId;
          targetId = releaseMatch.targetId;
          activePointer = undefined;
        }
        break;
      }

      case "cancel": {
        const point = createPoint(event.surfaceX, event.surfaceY);
        const pointer = activePointer;
        if (pointer) {
          handled = dispatchToPath(pointer.pathIds, pointer.targetId, (node) =>
            createPointerDisplayEvent("cancel", node, point, event.timestamp, pointer.targetId, pointer)
          );
          componentId = pointer.componentId;
          targetId = pointer.targetId;
          activePointer = undefined;
        }
        break;
      }

      case "scroll": {
        const point = createPoint(event.surfaceX, event.surfaceY);
        const match = hitTest(point);
        updateHover(point, event.timestamp, activePointer);
        if (match) {
          handled = dispatchToPath(match.pathIds, match.targetId, (node) =>
            createPointerDisplayEvent(
              "scroll",
              node,
              point,
              event.timestamp,
              match.targetId,
              activePointer,
              { deltaX: event.deltaX, deltaY: event.deltaY }
            )
          );
          componentId = match.componentId;
          targetId = match.targetId;
        }
        break;
      }

      case "focus": {
        focusService.requestFocus(event.componentId);
        syncFocusEvents();
        handled = true;
        componentId = event.componentId;
        break;
      }

      case "blur": {
        if (!event.componentId || focusService.getFocusedComponentId() === event.componentId) {
          focusService.clearFocus();
          syncFocusEvents();
          handled = true;
          componentId = event.componentId;
        }
        break;
      }
    }

    const nextOutputs = outputs.slice(startOutputIndex);
    return {
      handled,
      componentId,
      targetId,
      outputs: nextOutputs
    };
  }

  function tick(timestamp: number): void {
    timingService.advanceTo(timestamp);
    syncFocusEvents();
    const pointer = activePointer;
    if (!pointer || pointer.dragging || pointer.longPressFired) {
      return;
    }

    if (timestamp - pointer.downTimestamp < timingService.getLongPressDelay()) {
      return;
    }

    pointer.longPressFired = true;
    dispatchToPath(pointer.pathIds, pointer.targetId, (node) =>
      createPointerDisplayEvent(
        "long-press",
        node,
        pointer.lastPoint,
        timestamp,
        pointer.targetId,
        pointer
      )
    );
  }

  function setRoot(root: DisplayNode<unknown>): void {
    rootDescriptor = root;
    rootNode = reconcileNode(rootNode, rootDescriptor, undefined);
    clearRemovedInteractionReferences();
    invalidateLayout();
  }

  function resize(metrics: Partial<SurfaceMetrics>): void {
    services.surface.update(metrics);
  }

  function takeOutputs(): readonly RuntimeOutput[] {
    flushEmissions();
    const nextOutputs = [...outputs];
    outputs = [];
    return nextOutputs;
  }

  function dispose(): void {
    if (rootNode) {
      disposeNode(rootNode);
      rootNode = undefined;
    }
    hoveredMatch = undefined;
    activePointer = undefined;
    outputs = [];
    pendingEmissions.length = 0;
    commands = [];
  }

  return {
    setRoot,
    render() {
      rebuildCommands();
      return {
        revision: renderRevision,
        commands: [...commands]
      };
    },
    dispatchInput,
    resize,
    tick,
    takeOutputs,
    getServices() {
      return services;
    },
    getInteraction() {
      syncFocusEvents();
      return createInteractionSnapshot();
    },
    getBounds(componentId) {
      ensureLayout();
      return services.layout.getBounds(componentId);
    },
    isLayoutDirty() {
      return layoutDirty;
    },
    isRenderDirty() {
      return renderDirty;
    },
    dispose
  };
}

function unconstrained(maxWidth: number, maxHeight: number): LayoutConstraints {
  return {
    minWidth: 0,
    maxWidth,
    minHeight: 0,
    maxHeight
  };
}

function withClip<TCommand extends DrawCommand>(
  command: TCommand,
  clipRect: Rect | undefined
): TCommand {
  if (!clipRect) {
    return { ...command };
  }

  return {
    ...command,
    clipRect
  };
}
