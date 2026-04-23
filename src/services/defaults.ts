import type { DisplayEvent } from "../core/events.js";
import {
  copyInsets,
  copyRect,
  copySize,
  createInsets,
  createSize,
  type Rect
} from "../core/geometry.js";
import type {
  EmbeddedSurfaceAttachment,
  EmbeddedSurfaceConfig,
  EmbeddedSurfaceService,
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

interface MemoryNavigationEntry {
  activePageId: string | undefined;
  history: string[];
  pageIds: string[];
}

function emit(listener?: ChangeListener): void {
  listener?.();
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
      entry.viewport = copySize(viewport);
      entry.content = copySize(content);
      clampState(entry);
      emit(onChange);
    },
    setOffset(containerId, offsetX, offsetY) {
      const entry = getEntry(containerId);
      entry.offsetX = offsetX;
      entry.offsetY = offsetY;
      clampState(entry);
      emit(onChange);
    },
    scrollBy(containerId, deltaX, deltaY) {
      const entry = getEntry(containerId);
      entry.offsetX += deltaX;
      entry.offsetY += deltaY;
      clampState(entry);
      emit(onChange);
    }
  };
}

export function createMemoryFocusService(onChange?: ChangeListener): FocusService {
  let focusedComponentId: string | undefined;

  return {
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

export function createEmbeddedSurfaceService(onChange?: ChangeListener): EmbeddedSurfaceService {
  const attachments = new Map<string, EmbeddedSurfaceAttachment>();

  function resolveAttachment(
    componentId: string,
    fallback?: EmbeddedSurfaceConfig
  ): EmbeddedSurfaceAttachment {
    const attachment = attachments.get(componentId);
    if (attachment) {
      return attachment;
    }

    const created: EmbeddedSurfaceAttachment = {
      sourceId: fallback?.sourceId ?? componentId,
      interactive: fallback?.interactive ?? false,
      preserveAspectRatio: fallback?.preserveAspectRatio ?? true,
      desiredSourceType: fallback?.desiredSourceType,
      refreshPolicy: fallback?.refreshPolicy,
      acceptsForwardedInput: fallback?.acceptsForwardedInput ?? false,
      fallbackLabel: fallback?.fallbackLabel,
      available: false,
      handle: undefined,
      forwardedEvents: []
    };
    attachments.set(componentId, created);
    return created;
  }

  function updateAttachment(
    attachment: EmbeddedSurfaceAttachment,
    config: Partial<EmbeddedSurfaceConfig>
  ): EmbeddedSurfaceAttachment {
    return {
      ...attachment,
      ...config,
      interactive: config.interactive ?? attachment.interactive,
      preserveAspectRatio: config.preserveAspectRatio ?? attachment.preserveAspectRatio,
      acceptsForwardedInput: config.acceptsForwardedInput ?? attachment.acceptsForwardedInput,
      forwardedEvents: attachment.forwardedEvents
    };
  }

  return {
    attach(componentId, config) {
      attachments.set(componentId, resolveAttachment(componentId, config));
      emit(onChange);
    },
    configure(componentId, config) {
      const attachment = resolveAttachment(componentId);
      attachments.set(componentId, updateAttachment(attachment, config));
      emit(onChange);
    },
    release(componentId) {
      if (attachments.delete(componentId)) {
        emit(onChange);
      }
    },
    getAttachment(componentId) {
      const attachment = attachments.get(componentId);
      return attachment
        ? {
            ...attachment,
            forwardedEvents: [...attachment.forwardedEvents]
          }
        : undefined;
    },
    isAvailable(componentId) {
      return attachments.get(componentId)?.available ?? false;
    },
    getHandle(componentId) {
      return attachments.get(componentId)?.handle;
    },
    forwardEvent(componentId, event) {
      const attachment = resolveAttachment(componentId);
      attachments.set(componentId, {
        ...attachment,
        forwardedEvents: [...attachment.forwardedEvents, cloneDisplayEvent(event)]
      });
      emit(onChange);
    }
  };
}

function cloneDisplayEvent(event: DisplayEvent): DisplayEvent {
  return { ...event };
}
