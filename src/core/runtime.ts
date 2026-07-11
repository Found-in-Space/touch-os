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
  EmbeddedSurfaceChange,
  MutableLayoutService,
  RuntimeInvalidationKind,
  RuntimeInvalidationSource,
  RuntimeServices,
  SurfaceMetrics,
  ThemeTokens
} from "../services/contracts.js";
import {
  createBitmapService,
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

type EffectiveClip = Rect | null | undefined;

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

interface PointerMetadata {
  pointerId: string;
  pointerType: PointerType;
  pressure: number | undefined;
  modifiers: ModifierState;
}

interface TrackedPointerSample extends PointerMetadata {
  point: Point;
}

interface PendingEmission {
  emitterNode: RuntimeNodeState;
  output: RuntimeOutput;
}

interface OutputPropagation {
  consumed: boolean;
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
  invalidateLayout(): void;
  invalidateRender(): void;
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
  let treeDirty = false;
  let renderRevision = 0;
  let sharedSurfaceRevision = 0;
  let sharedRenderSignature = "";
  let outputs: RuntimeOutput[] = [];
  const pendingEmissions: PendingEmission[] = [];
  let commands: DrawCommand[] = [];
  const configuredDragThreshold = options.dragThreshold;
  let eventDispatchDepth = 0;
  let isFlushingEmissions = false;
  let layoutPassDepth = 0;
  let disposed = false;

  const services: RuntimeServices = {
    layout,
    navigation: options.services?.navigation ?? createMemoryNavigationService(),
    scroll: options.services?.scroll ?? createMemoryScrollService(),
    focus:
      options.services?.focus ??
      createMemoryFocusService(
        undefined,
        (direction, currentFocusId, focusableIds) =>
          resolveVisibleFocusableForTraversal(direction, currentFocusId, focusableIds)
      ),
    theme: options.services?.theme ?? createThemeService(options.theme),
    timing:
      options.services?.timing ??
      createTimingService(options.now ?? 0, options.longPressDelay ?? 450),
    surface: options.services?.surface ?? createSurfaceService(options.surface),
    bitmaps: options.services?.bitmaps ?? createBitmapService(),
    surfaces: options.services?.surfaces ?? createEmbeddedSurfaceService()
  };

  let rootDescriptor = options.root;
  let rootNode: RuntimeNodeState | undefined;
  const nodeLookup = new Map<string, RuntimeNodeState>();
  const hoveredMatches = new Map<string, HitTestMatch>();
  const activePointers = new Map<string, ActivePointerState>();
  const latestPointerSamples = new Map<string, TrackedPointerSample>();
  let latestPointerId: string | undefined;
  const focusService = services.focus;
  const timingService = services.timing;
  let focusedComponentId = focusService.getFocusedComponentId();

  const unsubscribeServiceInvalidations = [
    subscribeServiceInvalidation(services.navigation),
    subscribeServiceInvalidation(services.scroll, (kind) => {
      if (kind === "layout") {
        invalidateScrollLayout();
      } else {
        invalidateRender();
      }
    }),
    subscribeServiceInvalidation(services.focus),
    subscribeServiceInvalidation(services.theme),
    subscribeServiceInvalidation(services.surface),
    subscribeServiceInvalidation(services.bitmaps),
    services.surfaces.subscribe((change) => {
      if (isRelevantEmbeddedSurfaceChange(change)) {
        invalidateRender();
      }
    })
  ];

  rootNode = mountNode(rootDescriptor, undefined);

  function invalidateLayout(): void {
    layoutDirty = true;
    renderDirty = true;
  }

  function invalidateComponentTree(): void {
    treeDirty = true;
    invalidateLayout();
  }

  function invalidateRender(): void {
    renderDirty = true;
  }

  function invalidateScrollLayout(): void {
    if (layoutPassDepth > 0) {
      renderDirty = true;
      return;
    }

    invalidateLayout();
  }

  function subscribeServiceInvalidation(
    service: { subscribeInvalidation?: RuntimeInvalidationSource["subscribeInvalidation"] },
    listener: (kind: RuntimeInvalidationKind) => void = applyServiceInvalidation
  ): () => void {
    return service.subscribeInvalidation?.(listener) ?? (() => {});
  }

  function applyServiceInvalidation(kind: RuntimeInvalidationKind): void {
    if (kind === "layout") {
      invalidateLayout();
      return;
    }
    invalidateRender();
  }

  function isRelevantEmbeddedSurfaceChange(change: EmbeddedSurfaceChange): boolean {
    for (const componentId of change.componentIds) {
      if (nodeLookup.has(componentId)) {
        return true;
      }
    }

    if (change.sourceIds.length === 0) {
      return false;
    }

    const changedSources = new Set(change.sourceIds);
    for (const node of nodeLookup.values()) {
      if (node.component.kind !== "embedded-surface") {
        continue;
      }

      const sourceId = getEmbeddedSurfaceSourceId(node.props);
      if (sourceId && changedSources.has(sourceId)) {
        return true;
      }
    }

    return false;
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

        const consumed = dispatchOutputToAncestors(emission.emitterNode, emission.output);
        if (!consumed) {
          outputs.push(emission.output);
        }
      }
    } finally {
      isFlushingEmissions = false;
      if (eventDispatchDepth === 0 && pendingEmissions.length > 0) {
        flushEmissions();
      }
    }
  }

  function dispatchOutputToAncestors(
    emitterNode: RuntimeNodeState,
    output: RuntimeOutput
  ): boolean {
    const path = resolvePathNodes(buildPathToRoot(emitterNode));
    if (path.length <= 1) {
      return false;
    }

    const propagation: OutputPropagation = { consumed: false };
    runComponentDispatch(() => {
      const ancestors = path.slice(0, -1);
      for (const node of [...ancestors].reverse()) {
        node.component.handleEvent?.(createEventContext(node, output, propagation));
        if (propagation.consumed) {
          break;
        }
      }
    });

    invalidateRender();
    return propagation.consumed;
  }

  function createInteractionSnapshot(): RuntimeInteractionSnapshot {
    const hoveredPointerId = resolveTrackedPointerId(hoveredMatches);
    const activePointerId = resolveTrackedPointerId(activePointers);
    const hoveredMatch = hoveredPointerId ? hoveredMatches.get(hoveredPointerId) : undefined;
    const activePointer = activePointerId ? activePointers.get(activePointerId) : undefined;
    return {
      hoveredTargetId: hoveredMatch?.targetId,
      pressedTargetId: activePointer?.targetId,
      focusedComponentId
    };
  }

  function resolveTrackedPointerId<TValue>(entries: Map<string, TValue>): string | undefined {
    if (latestPointerId && entries.has(latestPointerId)) {
      return latestPointerId;
    }

    return [...entries.keys()].at(-1);
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
      invalidateLayout: invalidateComponentTree,
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
    event: ComponentEvent,
    propagation?: OutputPropagation
  ): ComponentEventContext<unknown, unknown> {
    return {
      ...createBaseContext(node),
      bounds: copyRect(node.bounds),
      event,
      consumeOutput() {
        if (propagation) {
          propagation.consumed = true;
        }
      }
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
    cancelInteractionsForSubtree(node);
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

    if (treeDirty) {
      rootNode = reconcileNode(rootNode, rootDescriptor, undefined);
      clearRemovedInteractionReferences();
      treeDirty = false;
    }

    layoutPassDepth += 1;
    try {
      layout.clear();
      const availableBounds = getSurfaceVisibleBounds();
      measureNode(rootNode, unconstrained(availableBounds.width, availableBounds.height));
      layoutNode(rootNode, availableBounds);
      syncFocusVisibility();
    } finally {
      layoutPassDepth -= 1;
    }
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
    const nextSharedRenderSignature = getSharedRenderSignature(commands);
    if (nextSharedRenderSignature !== sharedRenderSignature) {
      sharedRenderSignature = nextSharedRenderSignature;
      sharedSurfaceRevision += 1;
    }
    renderRevision += 1;
    renderDirty = false;
  }

  function normalizeDrawCommand(command: DrawCommand): DrawCommand {
    if (command.type !== "text" || command.fontFamily !== undefined) {
      return command;
    }

    return {
      ...command,
      fontFamily: services.theme.getTokens().typography.fontFamily
    };
  }

  function renderNode(node: RuntimeNodeState, inheritedClip: EffectiveClip): void {
    if (node.bounds.width <= 0 || node.bounds.height <= 0) {
      return;
    }

    const effectiveClip = intersectEffectiveClip(inheritedClip, node.clipRect);
    if (effectiveClip === null) {
      return;
    }
    const nodeCommands = node.component.render?.(createRenderContext(node)) ?? [];

    for (const command of nodeCommands) {
      const commandClip = intersectEffectiveClip(effectiveClip, command.clipRect);
      if (commandClip === null) {
        continue;
      }
      commands.push(withClip(normalizeDrawCommand(command), commandClip));
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
    inheritedClip: EffectiveClip,
    ancestorPath: string[]
  ): HitTestMatch | undefined {
    const effectiveClip = intersectEffectiveClip(inheritedClip, node.clipRect);
    if (effectiveClip === null) {
      return undefined;
    }
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

  function syncFocusVisibility(): void {
    const currentFocus = focusService.getFocusedComponentId();
    if (!currentFocus) {
      return;
    }

    if (isComponentEffectivelyVisible(currentFocus)) {
      return;
    }

    const replacementFocus = resolveVisibleFocusableComponentId(currentFocus);
    if (replacementFocus) {
      focusService.requestFocus(replacementFocus);
      syncFocusEvents();
      return;
    }

    focusService.clearFocus();
    syncFocusEvents();
  }

  function resolveVisibleFocusableComponentId(hiddenComponentId?: string): string | undefined {
    const focusableIds = focusService.getFocusableComponentIds();
    if (focusableIds.length === 0) {
      return undefined;
    }

    const hiddenIndex = hiddenComponentId ? focusableIds.indexOf(hiddenComponentId) : -1;
    const orderedCandidates =
      hiddenIndex === -1
        ? focusableIds
        : [
            ...focusableIds.slice(hiddenIndex + 1),
            ...focusableIds.slice(0, hiddenIndex)
          ];

    return orderedCandidates.find((componentId) => {
      return isComponentEffectivelyVisible(componentId);
    });
  }

  function resolveVisibleFocusableForTraversal(
    direction: 1 | -1,
    currentFocusId: string | undefined,
    focusableIds: readonly string[]
  ): string | undefined {
    ensureLayout();
    const visibleFocusableIds = focusableIds.filter((componentId) => {
      return isComponentEffectivelyVisible(componentId);
    });
    if (visibleFocusableIds.length === 0) {
      return undefined;
    }

    const currentIndex = currentFocusId
      ? visibleFocusableIds.indexOf(currentFocusId)
      : -1;
    if (currentIndex === -1) {
      return direction > 0
        ? visibleFocusableIds[0]
        : visibleFocusableIds[visibleFocusableIds.length - 1];
    }

    return visibleFocusableIds[
      (currentIndex + direction + visibleFocusableIds.length) % visibleFocusableIds.length
    ];
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

  function isComponentEffectivelyVisible(componentId: string): boolean {
    const visibleBounds = getEffectiveVisibleBounds(componentId);
    return Boolean(visibleBounds && visibleBounds.width > 0 && visibleBounds.height > 0);
  }

  function getEffectiveVisibleBounds(componentId: string): Rect | undefined {
    const node = nodeLookup.get(componentId);
    if (!node) {
      return undefined;
    }

    const path = resolvePathNodes(buildPathToRoot(node));
    let visibleBounds: Rect | undefined = getSurfaceVisibleBounds();

    for (const pathNode of path) {
      visibleBounds = intersectRect(visibleBounds, pathNode.clipRect);
      if (!visibleBounds) {
        return undefined;
      }
    }

    return intersectRect(visibleBounds, node.bounds);
  }

  function getSurfaceVisibleBounds(): Rect {
    const surface = services.surface.getMetrics();
    return insetRect(createRect(0, 0, surface.width, surface.height), surface.safeArea);
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

  function trackPointerInput(
    event: {
      pointerId?: string;
      pointerType?: PointerType;
      pressure?: number;
      modifiers?: ModifierState;
    },
    point: Point,
    fallback?: PointerMetadata
  ): PointerMetadata {
    const pointerId = event.pointerId ?? "default";
    const previous = latestPointerSamples.get(pointerId);
    const metadata: PointerMetadata = {
      pointerId,
      pointerType: event.pointerType ?? fallback?.pointerType ?? previous?.pointerType ?? "unknown",
      pressure: event.pressure ?? fallback?.pressure ?? previous?.pressure,
      modifiers: { ...(event.modifiers ?? DEFAULT_MODIFIERS) }
    };
    latestPointerSamples.set(pointerId, {
      ...metadata,
      point: { ...point }
    });
    return metadata;
  }

  function updateActivePointerMetadata(
    pointer: ActivePointerState,
    metadata: PointerMetadata
  ): void {
    pointer.pointerType = metadata.pointerType;
    pointer.pressure = metadata.pressure;
    pointer.modifiers = { ...metadata.modifiers };
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
    metadata: PointerMetadata,
    deltas?: { deltaX: number; deltaY: number }
  ): DisplayEvent {
    const localX = point.x - node.bounds.x;
    const localY = point.y - node.bounds.y;
    const pointerBase = {
      timestamp,
      pointerId: metadata.pointerId,
      pointerType: metadata.pointerType,
      modifiers: { ...metadata.modifiers },
      ...(metadata.pressure === undefined ? {} : { pressure: metadata.pressure })
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

  function updateHover(
    point: Point,
    timestamp: number,
    pointerId: string,
    metadata: PointerMetadata
  ): void {
    const nextMatch = hitTest(point);
    const currentHover = hoveredMatches.get(pointerId);
    if (
      currentHover?.targetId === nextMatch?.targetId &&
      currentHover?.componentId === nextMatch?.componentId
    ) {
      return;
    }

    const previousHover = currentHover;
    if (previousHover) {
      dispatchToPath(previousHover.pathIds, previousHover.targetId, (node) =>
        createPointerDisplayEvent(
          "pointer-leave",
          node,
          point,
          timestamp,
          previousHover.targetId,
          metadata
        )
      );
    }

    if (nextMatch) {
      hoveredMatches.set(pointerId, nextMatch);
    } else {
      hoveredMatches.delete(pointerId);
    }

    if (nextMatch) {
      dispatchToPath(nextMatch.pathIds, nextMatch.targetId, (node) =>
        createPointerDisplayEvent(
          "pointer-enter",
          node,
          point,
          timestamp,
          nextMatch.targetId,
          metadata
        )
      );
    }
  }

  function clearRemovedInteractionReferences(): void {
    for (const [pointerId, hoveredMatch] of hoveredMatches.entries()) {
      if (!nodeLookup.has(hoveredMatch.componentId)) {
        hoveredMatches.delete(pointerId);
      }
    }
    for (const [pointerId, activePointer] of activePointers.entries()) {
      if (!nodeLookup.has(activePointer.componentId)) {
        activePointers.delete(pointerId);
      }
    }
    const currentFocus = focusService.getFocusedComponentId();
    if (currentFocus && !nodeLookup.has(currentFocus)) {
      focusService.clearFocus();
    }
    syncFocusEvents();
  }

  function cancelInteractionsForSubtree(node: RuntimeNodeState): void {
    const pointerIds = new Set<string>();
    for (const [pointerId, pointer] of activePointers) {
      if (pointer.pathIds.includes(node.id)) {
        pointerIds.add(pointerId);
      }
    }
    for (const [pointerId, hover] of hoveredMatches) {
      if (hover.pathIds.includes(node.id)) {
        pointerIds.add(pointerId);
      }
    }
    for (const pointerId of pointerIds) {
      cancelTrackedPointer(pointerId, timingService.now());
    }
  }

  function cancelTrackedPointer(pointerId: string, timestamp: number): void {
    const pointer = activePointers.get(pointerId);
    const hover = hoveredMatches.get(pointerId);
    const sample = latestPointerSamples.get(pointerId);
    const point = sample?.point ?? pointer?.lastPoint ?? createPoint(-1, -1);
    const metadata: PointerMetadata = sample ?? pointer ?? {
      pointerId,
      pointerType: "unknown",
      pressure: undefined,
      modifiers: { ...DEFAULT_MODIFIERS }
    };

    if (pointer) {
      dispatchToPath(pointer.pathIds, pointer.targetId, (pathNode) =>
        createPointerDisplayEvent(
          "cancel",
          pathNode,
          point,
          timestamp,
          pointer.targetId,
          metadata
        )
      );
      activePointers.delete(pointerId);
    }

    if (hover) {
      dispatchToPath(hover.pathIds, hover.targetId, (pathNode) =>
        createPointerDisplayEvent(
          "pointer-leave",
          pathNode,
          point,
          timestamp,
          hover.targetId,
          metadata
        )
      );
      hoveredMatches.delete(pointerId);
    }

    latestPointerSamples.delete(pointerId);
  }

  function cancelAllTrackedPointers(timestamp: number): void {
    const pointerIds = new Set([
      ...activePointers.keys(),
      ...hoveredMatches.keys()
    ]);
    for (const pointerId of pointerIds) {
      cancelTrackedPointer(pointerId, timestamp);
    }
  }

  function matchesActivePointer(pointer: ActivePointerState, pointerId?: string): boolean {
    return pointerId === undefined || pointer.pointerId === pointerId;
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
        const pointerId = event.pointerId ?? "default";
        latestPointerId = pointerId;
        const point = createPoint(event.surfaceX, event.surfaceY);
        const pointer = activePointers.get(pointerId);
        const metadata = trackPointerInput(event, point, pointer);
        if (pointer) {
          updateActivePointerMetadata(pointer, metadata);
        }
        updateHover(point, event.timestamp, pointerId, metadata);
        if (pointer) {
          const deltaX = point.x - pointer.startPoint.x;
          const deltaY = point.y - pointer.startPoint.y;
          if (
            !pointer.dragging &&
            Math.hypot(deltaX, deltaY) >= resolveDragThreshold(pointer.pointerType)
          ) {
            pointer.dragging = true;
            dispatchToPath(pointer.pathIds, pointer.targetId, (node) =>
              createPointerDisplayEvent(
                "drag-start",
                node,
                point,
                event.timestamp,
                pointer.targetId,
                metadata,
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
                metadata,
                { deltaX, deltaY }
              )
            );
            componentId = pointer.componentId;
            targetId = pointer.targetId;
          } else {
            const currentHover = hoveredMatches.get(pointerId);
            if (currentHover) {
              handled = dispatchToPath(currentHover.pathIds, currentHover.targetId, (node) =>
                createPointerDisplayEvent(
                  "pointer-move",
                  node,
                  point,
                  event.timestamp,
                  currentHover.targetId,
                  metadata
                )
              );
              componentId = currentHover.componentId;
              targetId = currentHover.targetId;
            }
          }
          pointer.lastPoint = point;
          activePointers.set(pointerId, pointer);
        } else {
          const currentHover = hoveredMatches.get(pointerId);
          if (currentHover) {
            handled = dispatchToPath(currentHover.pathIds, currentHover.targetId, (node) =>
              createPointerDisplayEvent(
                "pointer-move",
                node,
                point,
                event.timestamp,
                currentHover.targetId,
                metadata
              )
            );
            componentId = currentHover.componentId;
            targetId = currentHover.targetId;
          }
        }
        break;
      }

      case "pointer-down": {
        const pointerId = event.pointerId ?? "default";
        latestPointerId = pointerId;
        const point = createPoint(event.surfaceX, event.surfaceY);
        const metadata = trackPointerInput(event, point);
        const match = hitTest(point);
        updateHover(point, event.timestamp, pointerId, metadata);
        if (match) {
          const activePointer: ActivePointerState = {
            ...metadata,
            startPoint: point,
            lastPoint: point,
            pathIds: match.pathIds,
            componentId: match.componentId,
            targetId: match.targetId,
            dragging: false,
            longPressFired: false,
            downTimestamp: event.timestamp
          };
          activePointers.set(pointerId, activePointer);
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
        const pointerId = event.pointerId ?? "default";
        latestPointerId = pointerId;
        const point = createPoint(event.surfaceX, event.surfaceY);
        const releaseMatch = activePointers.get(pointerId);
        if (releaseMatch && !matchesActivePointer(releaseMatch, event.pointerId)) {
          break;
        }
        const metadata = trackPointerInput(event, point, releaseMatch);
        if (releaseMatch) {
          updateActivePointerMetadata(releaseMatch, metadata);
        }
        updateHover(point, event.timestamp, pointerId, metadata);
        if (releaseMatch) {
          const deltaX = point.x - releaseMatch.startPoint.x;
          const deltaY = point.y - releaseMatch.startPoint.y;
          handled = dispatchToPath(releaseMatch.pathIds, releaseMatch.targetId, (node) =>
            createPointerDisplayEvent(
              "pointer-up",
              node,
              point,
              event.timestamp,
              releaseMatch.targetId,
              metadata
            )
          );
          if (releaseMatch.dragging) {
            dispatchToPath(releaseMatch.pathIds, releaseMatch.targetId, (node) =>
              createPointerDisplayEvent(
                "drag-end",
                node,
                point,
                event.timestamp,
                releaseMatch.targetId,
                metadata,
                { deltaX, deltaY }
              )
            );
          }

          const match = hitTest(point);
          if (shouldDispatchPress(releaseMatch, match, point)) {
            dispatchToPath(releaseMatch.pathIds, releaseMatch.targetId, (node) =>
              createPointerDisplayEvent(
                "press",
                node,
                point,
                event.timestamp,
                releaseMatch.targetId,
                metadata
              )
            );
          }
          componentId = releaseMatch.componentId;
          targetId = releaseMatch.targetId;
          activePointers.delete(pointerId);
        }
        break;
      }

      case "cancel": {
        const pointerId = event.pointerId ?? "default";
        latestPointerId = pointerId;
        const point = createPoint(event.surfaceX, event.surfaceY);
        const pointer = activePointers.get(pointerId);
        const metadata = trackPointerInput(event, point, pointer);
        if (pointer) {
          updateActivePointerMetadata(pointer, metadata);
        }
        if (pointer && matchesActivePointer(pointer, event.pointerId)) {
          handled = dispatchToPath(pointer.pathIds, pointer.targetId, (node) =>
            createPointerDisplayEvent(
              "cancel",
              node,
              point,
              event.timestamp,
              pointer.targetId,
              metadata
            )
          );
          componentId = pointer.componentId;
          targetId = pointer.targetId;
          activePointers.delete(pointerId);
        }

        const currentHover = hoveredMatches.get(pointerId);
        if (currentHover) {
          dispatchToPath(currentHover.pathIds, currentHover.targetId, (node) =>
            createPointerDisplayEvent(
              "pointer-leave",
              node,
              point,
              event.timestamp,
              currentHover.targetId,
              metadata
            )
          );
          hoveredMatches.delete(pointerId);
          handled = true;
          componentId = componentId ?? currentHover.componentId;
          targetId = targetId ?? currentHover.targetId;
        }
        latestPointerSamples.delete(pointerId);
        break;
      }

      case "scroll": {
        const pointerId = event.pointerId ?? "default";
        latestPointerId = pointerId;
        const point = createPoint(event.surfaceX, event.surfaceY);
        const match = hitTest(point);
        const activePointer = activePointers.get(pointerId);
        const metadata = trackPointerInput(event, point, activePointer);
        if (activePointer) {
          updateActivePointerMetadata(activePointer, metadata);
        }
        updateHover(point, event.timestamp, pointerId, metadata);
        if (match) {
          handled = dispatchToPath(match.pathIds, match.targetId, (node) =>
            createPointerDisplayEvent(
              "scroll",
              node,
              point,
              event.timestamp,
              match.targetId,
              metadata,
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

      case "system-command": {
        handled = dispatchSystemCommandInput(event);
        componentId = rootNode?.id;
        targetId = rootNode?.id;
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
    if (activePointers.size === 0) {
      return;
    }

    for (const pointer of activePointers.values()) {
      dispatchToPath(pointer.pathIds, pointer.targetId, () => ({
        type: "tick",
        timestamp
      }));

      if (pointer.dragging || pointer.longPressFired) {
        continue;
      }

      if (timestamp - pointer.downTimestamp < timingService.getLongPressDelay()) {
        continue;
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
  }

  function dispatchSystemCommandInput(event: InputEvent & { type: "system-command" }): boolean {
    if (!rootNode) {
      return false;
    }

    runComponentDispatch(() => {
      rootNode?.component.handleEvent?.(createEventContext(rootNode, event));
    });
    invalidateRender();
    return true;
  }

  function shouldDispatchPress(
    releaseMatch: ActivePointerState,
    match: HitTestMatch | undefined,
    point: Point
  ): boolean {
    if (
      !match ||
      match.componentId !== releaseMatch.componentId ||
      match.targetId !== releaseMatch.targetId
    ) {
      return false;
    }

    if (!releaseMatch.dragging) {
      return true;
    }

    const deltaX = point.x - releaseMatch.startPoint.x;
    const deltaY = point.y - releaseMatch.startPoint.y;
    return Math.hypot(deltaX, deltaY) <= resolvePressTolerance(releaseMatch.pointerType);
  }

  function resolveDragThreshold(pointerType: PointerType): number {
    if (configuredDragThreshold !== undefined) {
      return configuredDragThreshold;
    }

    switch (pointerType) {
      case "ray":
      case "controller":
      case "gaze":
        return 24;
      case "touch":
        return 12;
      case "mouse":
      case "stylus":
      case "unknown":
      default:
        return 6;
    }
  }

  function resolvePressTolerance(pointerType: PointerType): number {
    if (configuredDragThreshold !== undefined) {
      return configuredDragThreshold;
    }

    switch (pointerType) {
      case "ray":
      case "controller":
      case "gaze":
        return 40;
      case "touch":
        return 24;
      case "mouse":
      case "stylus":
      case "unknown":
      default:
        return 6;
    }
  }

  function setRoot(root: DisplayNode<unknown>): void {
    if (root === rootDescriptor && rootNode) {
      return;
    }

    rootDescriptor = root;
    rootNode = reconcileNode(rootNode, rootDescriptor, undefined);
    clearRemovedInteractionReferences();
    layoutDirty = true;
    renderDirty = true;
  }

  function resize(metrics: Partial<SurfaceMetrics>): void {
    const previous = services.surface.getMetrics();
    services.surface.update(metrics);
    const next = services.surface.getMetrics();
    if (!surfaceMetricsEqual(previous, next)) {
      invalidateLayout();
    }
  }

  function takeOutputs(): readonly RuntimeOutput[] {
    flushEmissions();
    const nextOutputs = [...outputs];
    outputs = [];
    return nextOutputs;
  }

  function dispose(): void {
    if (disposed) {
      return;
    }
    disposed = true;

    cancelAllTrackedPointers(timingService.now());
    focusService.clearFocus();
    syncFocusEvents();
    flushEmissions();
    for (const unsubscribe of unsubscribeServiceInvalidations) {
      unsubscribe();
    }
    if (rootNode) {
      disposeNode(rootNode);
      rootNode = undefined;
    }
    flushEmissions();
    hoveredMatches.clear();
    activePointers.clear();
    latestPointerSamples.clear();
    latestPointerId = undefined;
    commands = [];
  }

  return {
    setRoot,
    render() {
      rebuildCommands();
      return {
        revision: renderRevision,
        sharedSurfaceRevision,
        commands: [...commands]
      };
    },
    dispatchInput,
    resize,
    invalidateLayout,
    invalidateRender,
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

function getEmbeddedSurfaceSourceId(props: unknown): string | undefined {
  if (typeof props !== "object" || props === null || !("sourceId" in props)) {
    return undefined;
  }

  const sourceId = (props as { sourceId?: unknown }).sourceId;
  return typeof sourceId === "string" ? sourceId : undefined;
}

function getSharedRenderSignature(commands: readonly DrawCommand[]): string {
  return commands
    .map((command) => getSharedCommandSignature(command))
    .filter((signature): signature is string => signature !== undefined)
    .join("|");
}

function getSharedCommandSignature(command: DrawCommand): string | undefined {
  switch (command.type) {
    case "rect":
      return [
        "rect",
        command.componentId,
        command.role ?? "",
        encodeRect(command.rect),
        command.fill ?? "",
        command.stroke ?? "",
        command.strokeWidth ?? 0,
        command.radius ?? 0,
        encodeOptionalRect(command.clipRect)
      ].join(":");
    case "text":
      return [
        "text",
        command.componentId,
        command.role ?? "",
        command.text,
        encodeRect(command.rect),
        command.color,
        command.align ?? "",
        command.verticalAlign ?? "",
        command.fontFamily ?? "",
        command.fontSize ?? 0,
        command.fontWeight ?? 0,
        command.overflow ?? "clip",
        encodeOptionalRect(command.clipRect)
      ].join(":");
    case "line":
      return [
        "line",
        command.componentId,
        command.role ?? "",
        command.x1,
        command.y1,
        command.x2,
        command.y2,
        command.stroke,
        command.strokeWidth ?? 0,
        encodeOptionalRect(command.clipRect)
      ].join(":");
    case "circle":
      return [
        "circle",
        command.componentId,
        command.role ?? "",
        command.cx,
        command.cy,
        command.radius,
        command.fill ?? "",
        command.stroke ?? "",
        command.strokeWidth ?? 0,
        encodeOptionalRect(command.clipRect)
      ].join(":");
    case "bitmap":
      return [
        "bitmap",
        command.componentId,
        command.role ?? "",
        encodeRect(command.rect),
        command.handle.width,
        command.handle.height,
        command.handle.revision,
        command.fit ?? "",
        command.opacity ?? 1,
        command.sampling ?? "linear",
        encodeOptionalRect(command.clipRect)
      ].join(":");
    case "surface":
      if ((command.compositionMode ?? "copy") === "composite") {
        return undefined;
      }
      return [
        "surface",
        command.componentId,
        command.role ?? "",
        command.sourceId ?? "",
        encodeRect(command.rect),
        command.compositionMode ?? "copy",
        command.mirrorX ? "1" : "0",
        command.surfaceRevision ?? 0,
        encodeOptionalRect(command.clipRect)
      ].join(":");
  }
}

function encodeRect(rect: Rect): string {
  return `${rect.x},${rect.y},${rect.width},${rect.height}`;
}

function encodeOptionalRect(rect: Rect | undefined): string {
  return rect ? encodeRect(rect) : "";
}

function surfaceMetricsEqual(left: SurfaceMetrics, right: SurfaceMetrics): boolean {
  return (
    left.width === right.width &&
    left.height === right.height &&
    left.pixelDensity === right.pixelDensity &&
    left.orientation === right.orientation &&
    left.safeArea.top === right.safeArea.top &&
    left.safeArea.right === right.safeArea.right &&
    left.safeArea.bottom === right.safeArea.bottom &&
    left.safeArea.left === right.safeArea.left
  );
}

function intersectEffectiveClip(
  inheritedClip: EffectiveClip,
  localClip: Rect | undefined
): EffectiveClip {
  if (inheritedClip === null) {
    return null;
  }
  if (localClip && (localClip.width <= 0 || localClip.height <= 0)) {
    return null;
  }
  if (!inheritedClip) {
    return localClip ? copyRect(localClip) : undefined;
  }
  if (!localClip) {
    return copyRect(inheritedClip);
  }

  return intersectRect(inheritedClip, localClip) ?? null;
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
