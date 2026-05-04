import type { DisplayEvent } from "../core/events.js";
import {
  copyInsets,
  copyRect,
  copySize,
  createInsets,
  createSize,
  type Rect
} from "../core/geometry.js";
import type { BitmapHandle, BitmapMetadata } from "../core/draw.js";
import type {
  BitmapAllocation,
  BitmapService,
  BitmapUpdate,
  EmbeddedSurfaceAttachment,
  EmbeddedSurfaceChange,
  EmbeddedSurfaceConfig,
  EmbeddedSurfaceSourceSnapshot,
  EmbeddedSurfaceSourceUpdate,
  EmbeddedSurfaceStateUpdate,
  EmbeddedSurfaceService,
  FocusRegistrationOptions,
  FocusService,
  MutableLayoutService,
  NavigationService,
  NavigationSnapshot,
  ScrollService,
  ScrollState,
  SurfaceMetrics,
  SurfaceService,
  ThemeService,
  ThemeTokens,
  TimingService
} from "./contracts.js";

type ChangeListener = () => void;
type FocusTraversalResolver = (
  direction: 1 | -1,
  focusedComponentId: string | undefined,
  orderedFocusableIds: readonly string[]
) => string | undefined;

interface MemoryNavigationEntry {
  activePageId: string | undefined;
  history: string[];
  pageIds: string[];
}

function emit(listener?: ChangeListener): void {
  listener?.();
}

function cloneBitmapHandle(handle: BitmapHandle): BitmapHandle {
  return {
    kind: "bitmap",
    image: handle.image,
    width: handle.width,
    height: handle.height,
    revision: handle.revision
  };
}

function toBitmapMetadata(handle: BitmapHandle): BitmapMetadata {
  return {
    width: handle.width,
    height: handle.height,
    revision: handle.revision
  };
}

function cloneEmbeddedSurfaceChange(change: EmbeddedSurfaceChange): EmbeddedSurfaceChange {
  return {
    componentIds: [...change.componentIds],
    sourceIds: [...change.sourceIds]
  };
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

function hasOwn<Key extends PropertyKey>(
  value: object,
  key: Key
): value is object & Record<Key, unknown> {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export function createMemoryLayoutService(): MutableLayoutService {
  const bounds = new Map<string, Rect>();
  const contentBounds = new Map<string, Rect>();

  return {
    clear() {
      bounds.clear();
      contentBounds.clear();
    },
    getBounds(componentId) {
      const rect = bounds.get(componentId);
      return rect ? copyRect(rect) : undefined;
    },
    getContentBounds(componentId) {
      const rect = contentBounds.get(componentId);
      return rect ? copyRect(rect) : undefined;
    },
    setBounds(componentId, rect) {
      bounds.set(componentId, copyRect(rect));
    },
    setContentBounds(componentId, rect) {
      contentBounds.set(componentId, copyRect(rect));
    }
  };
}

export function createMemoryNavigationService(onChange?: ChangeListener): NavigationService {
  const entries = new Map<string, MemoryNavigationEntry>();

  function getEntry(containerId: string): MemoryNavigationEntry {
    const entry = entries.get(containerId);
    if (entry) {
      return entry;
    }

    const next: MemoryNavigationEntry = { activePageId: undefined, history: [], pageIds: [] };
    entries.set(containerId, next);
    return next;
  }

  function toSnapshot(entry: MemoryNavigationEntry): NavigationSnapshot {
    return {
      activePageId: entry.activePageId,
      history: [...entry.history],
      pageIds: [...entry.pageIds]
    };
  }

  return {
    registerContainer(containerId, pageIds, initialPageId) {
      const entry = getEntry(containerId);
      entry.pageIds = [...pageIds];
      if (!entry.activePageId || !entry.pageIds.includes(entry.activePageId)) {
        entry.activePageId = initialPageId ?? entry.pageIds[0];
        entry.history = entry.activePageId ? [entry.activePageId] : [];
      }
      emit(onChange);
    },
    unregisterContainer(containerId) {
      if (entries.delete(containerId)) {
        emit(onChange);
      }
    },
    getSnapshot(containerId) {
      const entry = entries.get(containerId);
      return entry ? toSnapshot(entry) : undefined;
    },
    getActivePage(containerId) {
      return entries.get(containerId)?.activePageId;
    },
    push(containerId, pageId) {
      const entry = getEntry(containerId);
      if (!entry.pageIds.includes(pageId)) {
        return;
      }
      entry.activePageId = pageId;
      entry.history.push(pageId);
      emit(onChange);
    },
    replace(containerId, pageId) {
      const entry = getEntry(containerId);
      if (!entry.pageIds.includes(pageId)) {
        return;
      }
      entry.activePageId = pageId;
      if (entry.history.length === 0) {
        entry.history.push(pageId);
      } else {
        entry.history[entry.history.length - 1] = pageId;
      }
      emit(onChange);
    },
    back(containerId) {
      const entry = entries.get(containerId);
      if (!entry || entry.history.length <= 1) {
        return;
      }
      entry.history.pop();
      entry.activePageId = entry.history[entry.history.length - 1];
      emit(onChange);
    }
  };
}

export function createMemoryScrollService(onChange?: ChangeListener): ScrollService {
  const entries = new Map<string, ScrollState>();

  function createState(): ScrollState {
    return {
      offsetX: 0,
      offsetY: 0,
      maxOffsetX: 0,
      maxOffsetY: 0,
      viewport: createSize(0, 0),
      content: createSize(0, 0)
    };
  }

  function getEntry(containerId: string): ScrollState {
    const entry = entries.get(containerId);
    if (entry) {
      return entry;
    }

    const next = createState();
    entries.set(containerId, next);
    return next;
  }

  function clampState(entry: ScrollState): void {
    entry.maxOffsetX = Math.max(0, entry.content.width - entry.viewport.width);
    entry.maxOffsetY = Math.max(0, entry.content.height - entry.viewport.height);
    entry.offsetX = Math.max(0, Math.min(entry.offsetX, entry.maxOffsetX));
    entry.offsetY = Math.max(0, Math.min(entry.offsetY, entry.maxOffsetY));
  }

  function hasChanged(entry: ScrollState, previous: ScrollState): boolean {
    return (
      entry.offsetX !== previous.offsetX ||
      entry.offsetY !== previous.offsetY ||
      entry.maxOffsetX !== previous.maxOffsetX ||
      entry.maxOffsetY !== previous.maxOffsetY ||
      entry.viewport.width !== previous.viewport.width ||
      entry.viewport.height !== previous.viewport.height ||
      entry.content.width !== previous.content.width ||
      entry.content.height !== previous.content.height
    );
  }

  function snapshotState(entry: ScrollState): ScrollState {
    return {
      offsetX: entry.offsetX,
      offsetY: entry.offsetY,
      maxOffsetX: entry.maxOffsetX,
      maxOffsetY: entry.maxOffsetY,
      viewport: copySize(entry.viewport),
      content: copySize(entry.content)
    };
  }

  return {
    register(containerId) {
      getEntry(containerId);
    },
    unregister(containerId) {
      if (entries.delete(containerId)) {
        emit(onChange);
      }
    },
    getState(containerId) {
      const entry = getEntry(containerId);
      return {
        offsetX: entry.offsetX,
        offsetY: entry.offsetY,
        maxOffsetX: entry.maxOffsetX,
        maxOffsetY: entry.maxOffsetY,
        viewport: copySize(entry.viewport),
        content: copySize(entry.content)
      };
    },
    setMetrics(containerId, viewport, content) {
      const entry = getEntry(containerId);
      const previous = snapshotState(entry);
      entry.viewport = copySize(viewport);
      entry.content = copySize(content);
      clampState(entry);
      if (hasChanged(entry, previous)) {
        emit(onChange);
      }
    },
    setOffset(containerId, offsetX, offsetY) {
      const entry = getEntry(containerId);
      const previous = snapshotState(entry);
      entry.offsetX = offsetX;
      entry.offsetY = offsetY;
      clampState(entry);
      if (hasChanged(entry, previous)) {
        emit(onChange);
      }
    },
    scrollBy(containerId, deltaX, deltaY) {
      const entry = getEntry(containerId);
      const previous = snapshotState(entry);
      entry.offsetX += deltaX;
      entry.offsetY += deltaY;
      clampState(entry);
      if (hasChanged(entry, previous)) {
        emit(onChange);
      }
    }
  };
}

export function createMemoryFocusService(
  onChange?: ChangeListener,
  resolveTraversal?: FocusTraversalResolver
): FocusService {
  let focusedComponentId: string | undefined;
  let registrationOrder = 0;
  const focusableEntries = new Map<
    string,
    {
      defaultTargetId: string | undefined;
      order: number;
    }
  >();

  function getOrderedFocusableIds(): string[] {
    return [...focusableEntries.entries()]
      .sort((left, right) => left[1].order - right[1].order)
      .map(([componentId]) => componentId);
  }

  function moveFocus(step: 1 | -1): string | undefined {
    const orderedIds = getOrderedFocusableIds();
    if (orderedIds.length === 0) {
      return undefined;
    }

    const currentIndex = focusedComponentId
      ? orderedIds.indexOf(focusedComponentId)
      : -1;
    const nextComponentId =
      resolveTraversal?.(step, focusedComponentId, orderedIds) ??
      orderedIds[
        currentIndex === -1
          ? step > 0
            ? 0
            : orderedIds.length - 1
          : (currentIndex + step + orderedIds.length) % orderedIds.length
      ];
    if (!nextComponentId || nextComponentId === focusedComponentId) {
      return focusedComponentId;
    }

    focusedComponentId = nextComponentId;
    emit(onChange);
    return focusedComponentId;
  }

  function register(componentId: string, options: FocusRegistrationOptions | undefined): void {
    const existing = focusableEntries.get(componentId);
    const nextDefaultTargetId = options?.defaultTargetId;
    if (existing) {
      if (existing.defaultTargetId === nextDefaultTargetId) {
        return;
      }

      focusableEntries.set(componentId, {
        ...existing,
        defaultTargetId: nextDefaultTargetId
      });
      emit(onChange);
      return;
    }

    focusableEntries.set(componentId, {
      defaultTargetId: nextDefaultTargetId,
      order: registrationOrder
    });
    registrationOrder += 1;
    emit(onChange);
  }

  return {
    registerFocusable(componentId, options) {
      register(componentId, options);
    },
    unregisterFocusable(componentId) {
      const wasFocused = focusedComponentId === componentId;
      if (!focusableEntries.delete(componentId) && !wasFocused) {
        return;
      }

      if (wasFocused) {
        focusedComponentId = undefined;
      }
      emit(onChange);
    },
    requestFocus(componentId) {
      if (focusedComponentId === componentId) {
        return;
      }
      focusedComponentId = componentId;
      emit(onChange);
    },
    clearFocus() {
      if (!focusedComponentId) {
        return;
      }
      focusedComponentId = undefined;
      emit(onChange);
    },
    getFocusedComponentId() {
      return focusedComponentId;
    },
    getFocusableComponentIds() {
      return getOrderedFocusableIds();
    },
    getDefaultTargetId(componentId) {
      const resolvedComponentId = componentId ?? focusedComponentId;
      return resolvedComponentId
        ? focusableEntries.get(resolvedComponentId)?.defaultTargetId
        : undefined;
    },
    focusNext() {
      return moveFocus(1);
    },
    focusPrevious() {
      return moveFocus(-1);
    }
  };
}

export const DEFAULT_THEME_TOKENS: ThemeTokens = {
  backgroundColor: "#11151c",
  surfaceColor: "#1f2937",
  textColor: "#f3f4f6",
  mutedTextColor: "#9ca3af",
  accentColor: "#3b82f6",
  accentTextColor: "#eff6ff",
  borderColor: "#374151",
  focusColor: "#22c55e",
  overlayColor: "rgba(17, 21, 28, 0.65)",
  controlHeight: 36,
  spacing: 8,
  padding: 12,
  radius: 8,
  typography: {
    fontFamily: "ui-sans-serif",
    fontSize: 14,
    lineHeight: 18,
    fontWeight: 500
  }
};

export function createThemeService(
  initialTheme: Partial<ThemeTokens> = {},
  onChange?: ChangeListener
): ThemeService {
  let tokens: ThemeTokens = {
    ...DEFAULT_THEME_TOKENS,
    ...initialTheme,
    typography: {
      ...DEFAULT_THEME_TOKENS.typography,
      ...initialTheme.typography
    }
  };

  return {
    getTokens() {
      return {
        ...tokens,
        typography: { ...tokens.typography }
      };
    },
    update(nextTokens) {
      tokens = {
        ...tokens,
        ...nextTokens,
        typography: {
          ...tokens.typography,
          ...nextTokens.typography
        }
      };
      emit(onChange);
    }
  };
}

export function createTimingService(
  initialNow = 0,
  longPressDelay = 450
): TimingService {
  let currentTime = initialNow;

  return {
    now() {
      return currentTime;
    },
    advanceTo(timestamp) {
      currentTime = timestamp;
    },
    getLongPressDelay() {
      return longPressDelay;
    }
  };
}

export function createSurfaceService(
  initialMetrics: Partial<SurfaceMetrics> = {},
  onChange?: ChangeListener
): SurfaceService {
  let metrics: SurfaceMetrics = {
    width: initialMetrics.width ?? 320,
    height: initialMetrics.height ?? 240,
    pixelDensity: initialMetrics.pixelDensity ?? 1,
    orientation:
      initialMetrics.orientation ??
      (initialMetrics.width === initialMetrics.height
        ? "square"
        : (initialMetrics.width ?? 320) > (initialMetrics.height ?? 240)
          ? "landscape"
          : "portrait"),
    safeArea: copyInsets(createInsets(initialMetrics.safeArea))
  };

  return {
    getMetrics() {
      return {
        ...metrics,
        safeArea: copyInsets(metrics.safeArea)
      };
    },
    update(nextMetrics) {
      metrics = {
        ...metrics,
        ...nextMetrics,
        orientation:
          nextMetrics.orientation ??
          ((nextMetrics.width ?? metrics.width) === (nextMetrics.height ?? metrics.height)
            ? "square"
            : (nextMetrics.width ?? metrics.width) > (nextMetrics.height ?? metrics.height)
              ? "landscape"
              : "portrait"),
        safeArea: nextMetrics.safeArea
          ? copyInsets(createInsets(nextMetrics.safeArea))
          : copyInsets(metrics.safeArea)
      };
      emit(onChange);
    }
  };
}

export function createBitmapService(onChange?: ChangeListener): BitmapService {
  const bitmaps = new Map<string, BitmapHandle>();

  function resolveRevision(existing: BitmapHandle | undefined, revision: number | undefined): number {
    if (revision !== undefined) {
      return revision;
    }
    return existing ? existing.revision + 1 : 0;
  }

  return {
    allocate(bitmapId, bitmap) {
      const handle: BitmapHandle = {
        kind: "bitmap",
        image: bitmap.image,
        width: bitmap.width,
        height: bitmap.height,
        revision: resolveRevision(undefined, bitmap.revision)
      };
      bitmaps.set(bitmapId, handle);
      emit(onChange);
      return cloneBitmapHandle(handle);
    },
    update(bitmapId, bitmap) {
      const existing = bitmaps.get(bitmapId);
      if (!existing) {
        return undefined;
      }

      const next: BitmapHandle = {
        kind: "bitmap",
        image: bitmap.image ?? existing.image,
        width: bitmap.width ?? existing.width,
        height: bitmap.height ?? existing.height,
        revision: resolveRevision(existing, bitmap.revision)
      };
      bitmaps.set(bitmapId, next);
      emit(onChange);
      return cloneBitmapHandle(next);
    },
    getHandle(bitmapId) {
      const handle = bitmaps.get(bitmapId);
      return handle ? cloneBitmapHandle(handle) : undefined;
    },
    getMetadata(bitmapId) {
      const handle = bitmaps.get(bitmapId);
      return handle ? toBitmapMetadata(handle) : undefined;
    },
    release(bitmapId) {
      if (bitmaps.delete(bitmapId)) {
        emit(onChange);
      }
    }
  };
}

interface EmbeddedSurfaceAttachmentRecord {
  sourceId: string;
  interactive: boolean;
  preserveAspectRatio: boolean;
  mirrorX: boolean;
  desiredSourceType: string | undefined;
  refreshPolicy: "manual" | "always" | undefined;
  acceptsForwardedInput: boolean;
  fallbackLabel: string | undefined;
  compositionMode: "copy" | "composite";
  forwardedEvents: readonly DisplayEvent[];
}

export function createEmbeddedSurfaceService(onChange?: ChangeListener): EmbeddedSurfaceService {
  const attachments = new Map<string, EmbeddedSurfaceAttachmentRecord>();
  const sources = new Map<string, EmbeddedSurfaceSourceSnapshot>();
  const listeners = new Set<(change: EmbeddedSurfaceChange) => void>();
  if (onChange) {
    listeners.add(() => onChange());
  }

  function emitChanges(change: EmbeddedSurfaceChange): void {
    for (const listener of listeners) {
      listener(cloneEmbeddedSurfaceChange(change));
    }
  }

  function getAttachmentComponentIdsForSource(sourceId: string): string[] {
    const componentIds: string[] = [];
    for (const [componentId, attachment] of attachments.entries()) {
      if (attachment.sourceId === sourceId) {
        componentIds.push(componentId);
      }
    }
    return componentIds;
  }

  function resolveAttachment(
    componentId: string,
    fallback?: EmbeddedSurfaceConfig
  ): EmbeddedSurfaceAttachmentRecord {
    const attachment = attachments.get(componentId);
    if (attachment) {
      return attachment;
    }

    const created: EmbeddedSurfaceAttachmentRecord = {
      sourceId: fallback?.sourceId ?? componentId,
      interactive: fallback?.interactive ?? false,
      preserveAspectRatio: fallback?.preserveAspectRatio ?? true,
      mirrorX: fallback?.mirrorX ?? false,
      desiredSourceType: fallback?.desiredSourceType,
      refreshPolicy: fallback?.refreshPolicy,
      acceptsForwardedInput: fallback?.acceptsForwardedInput ?? false,
      fallbackLabel: fallback?.fallbackLabel,
      compositionMode: fallback?.compositionMode ?? "copy",
      forwardedEvents: []
    };
    attachments.set(componentId, created);
    return created;
  }

  function updateAttachment(
    attachment: EmbeddedSurfaceAttachmentRecord,
    config: Partial<EmbeddedSurfaceConfig>
  ): EmbeddedSurfaceAttachmentRecord {
    return {
      ...attachment,
      ...config,
      interactive: config.interactive ?? attachment.interactive,
      preserveAspectRatio: config.preserveAspectRatio ?? attachment.preserveAspectRatio,
      mirrorX: config.mirrorX ?? attachment.mirrorX,
      acceptsForwardedInput: config.acceptsForwardedInput ?? attachment.acceptsForwardedInput,
      compositionMode: config.compositionMode ?? attachment.compositionMode,
      forwardedEvents: attachment.forwardedEvents
    };
  }

  function resolveSource(sourceId: string): EmbeddedSurfaceSourceSnapshot {
    const existing = sources.get(sourceId);
    if (existing) {
      return existing;
    }

    return {
      sourceId,
      available: false,
      handle: undefined,
      sourceWidth: undefined,
      sourceHeight: undefined,
      aspectRatio: undefined,
      latencyMs: undefined,
      refreshState: "idle",
      lastFrameTimestamp: undefined,
      sourceType: undefined,
      surfaceRevision: 0
    };
  }

  function cloneSource(source: EmbeddedSurfaceSourceSnapshot): EmbeddedSurfaceSourceSnapshot {
    return {
      ...source
    };
  }

  function resolveAttachmentSnapshot(
    attachment: EmbeddedSurfaceAttachmentRecord
  ): EmbeddedSurfaceAttachment {
    const source = sources.get(attachment.sourceId);
    return {
      ...attachment,
      available: source?.available ?? false,
      handle: source?.handle,
      sourceWidth: source?.sourceWidth,
      sourceHeight: source?.sourceHeight,
      aspectRatio: source?.aspectRatio,
      latencyMs: source?.latencyMs,
      refreshState: source?.refreshState ?? "idle",
      lastFrameTimestamp: source?.lastFrameTimestamp,
      sourceType: source?.sourceType,
      surfaceRevision: source?.surfaceRevision ?? 0,
      forwardedEvents: [...attachment.forwardedEvents]
    };
  }

  function updateSource(
    source: EmbeddedSurfaceSourceSnapshot,
    update: EmbeddedSurfaceSourceUpdate
  ): EmbeddedSurfaceSourceSnapshot {
    const sourceWidth = hasOwn(update, "sourceWidth")
      ? (update.sourceWidth as number | undefined)
      : source.sourceWidth;
    const sourceHeight = hasOwn(update, "sourceHeight")
      ? (update.sourceHeight as number | undefined)
      : source.sourceHeight;
    const aspectRatio = hasOwn(update, "aspectRatio")
      ? (update.aspectRatio as number | undefined)
      : sourceWidth && sourceHeight
        ? sourceWidth / sourceHeight
        : source.aspectRatio;

    return {
      ...source,
      available: update.available ?? source.available,
      handle: hasOwn(update, "handle") ? update.handle : source.handle,
      sourceWidth,
      sourceHeight,
      aspectRatio,
      latencyMs: update.latencyMs ?? source.latencyMs,
      refreshState: update.refreshState ?? source.refreshState,
      lastFrameTimestamp: update.lastFrameTimestamp ?? source.lastFrameTimestamp,
      sourceType: hasOwn(update, "sourceType")
        ? (update.sourceType as string | undefined)
        : source.sourceType,
      surfaceRevision: source.surfaceRevision + 1
    };
  }

  return {
    attach(componentId, config) {
      attachments.set(componentId, resolveAttachment(componentId, config));
      emitChanges({
        componentIds: [componentId],
        sourceIds: [config.sourceId]
      });
    },
    configure(componentId, config) {
      const attachment = resolveAttachment(componentId);
      const nextAttachment = updateAttachment(attachment, config);
      attachments.set(componentId, nextAttachment);
      emitChanges({
        componentIds: [componentId],
        sourceIds: uniqueStrings([attachment.sourceId, nextAttachment.sourceId])
      });
    },
    release(componentId) {
      const attachment = attachments.get(componentId);
      if (attachments.delete(componentId)) {
        emitChanges({
          componentIds: [componentId],
          sourceIds: attachment ? [attachment.sourceId] : []
        });
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getAttachment(componentId) {
      const attachment = attachments.get(componentId);
      return attachment ? resolveAttachmentSnapshot(attachment) : undefined;
    },
    getSource(sourceId) {
      const source = sources.get(sourceId);
      return source ? cloneSource(source) : undefined;
    },
    isAvailable(componentId) {
      const attachment = attachments.get(componentId);
      return attachment ? (sources.get(attachment.sourceId)?.available ?? false) : false;
    },
    getHandle(componentId) {
      const attachment = attachments.get(componentId);
      return attachment ? sources.get(attachment.sourceId)?.handle : undefined;
    },
    publish(sourceId, update) {
      const source = resolveSource(sourceId);
      sources.set(sourceId, updateSource(source, update));
      emitChanges({
        componentIds: getAttachmentComponentIdsForSource(sourceId),
        sourceIds: [sourceId]
      });
    },
    unpublish(sourceId) {
      if (sources.delete(sourceId)) {
        emitChanges({
          componentIds: getAttachmentComponentIdsForSource(sourceId),
          sourceIds: [sourceId]
        });
      }
    },
    setState(componentId, state) {
      const attachment = attachments.get(componentId);
      const sourceId = attachment?.sourceId ?? componentId;
      const source = resolveSource(sourceId);
      sources.set(sourceId, updateSource(source, state));
      emitChanges({
        componentIds: getAttachmentComponentIdsForSource(sourceId),
        sourceIds: [sourceId]
      });
    },
    forwardEvent(componentId, event) {
      const attachment = resolveAttachment(componentId);
      attachments.set(componentId, {
        ...attachment,
        forwardedEvents: [...attachment.forwardedEvents, cloneDisplayEvent(event)]
      });
      emitChanges({
        componentIds: [componentId],
        sourceIds: [attachment.sourceId]
      });
    }
  };
}

function cloneDisplayEvent(event: DisplayEvent): DisplayEvent {
  return { ...event };
}
