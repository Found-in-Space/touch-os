import type { DisplayEvent } from "../core/events.js";
import type { BitmapHandle, BitmapMetadata, SurfaceCompositionMode } from "../core/draw.js";
import type { Insets, Rect, Size } from "../core/geometry.js";

export interface LayoutService {
  getBounds(componentId: string): Rect | undefined;
  getContentBounds(componentId: string): Rect | undefined;
}

export interface MutableLayoutService extends LayoutService {
  clear(): void;
  setBounds(componentId: string, rect: Rect): void;
  setContentBounds(componentId: string, rect: Rect): void;
}

export interface NavigationSnapshot {
  activePageId: string | undefined;
  history: readonly string[];
  pageIds: readonly string[];
}

export interface NavigationService {
  registerContainer(
    containerId: string,
    pageIds: readonly string[],
    initialPageId?: string
  ): void;
  unregisterContainer(containerId: string): void;
  getSnapshot(containerId: string): NavigationSnapshot | undefined;
  getActivePage(containerId: string): string | undefined;
  push(containerId: string, pageId: string): void;
  replace(containerId: string, pageId: string): void;
  back(containerId: string): void;
}

export interface ScrollState {
  offsetX: number;
  offsetY: number;
  maxOffsetX: number;
  maxOffsetY: number;
  viewport: Size;
  content: Size;
}

export interface ScrollService {
  register(containerId: string): void;
  unregister(containerId: string): void;
  getState(containerId: string): ScrollState;
  setMetrics(containerId: string, viewport: Size, content: Size): void;
  setOffset(containerId: string, offsetX: number, offsetY: number): void;
  scrollBy(containerId: string, deltaX: number, deltaY: number): void;
}

export interface FocusService {
  requestFocus(componentId: string): void;
  clearFocus(): void;
  getFocusedComponentId(): string | undefined;
}

export interface ThemeTypography {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  fontWeight: number;
}

export interface ThemeTokens {
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
  mutedTextColor: string;
  accentColor: string;
  accentTextColor: string;
  borderColor: string;
  focusColor: string;
  overlayColor: string;
  controlHeight: number;
  spacing: number;
  padding: number;
  radius: number;
  typography: ThemeTypography;
}

export interface ThemeService {
  getTokens(): ThemeTokens;
  update(tokens: Partial<ThemeTokens>): void;
}

export interface TimingService {
  now(): number;
  advanceTo(timestamp: number): void;
  getLongPressDelay(): number;
}

export interface SurfaceMetrics {
  width: number;
  height: number;
  pixelDensity: number;
  orientation: "portrait" | "landscape" | "square";
  safeArea: Insets;
}

export interface SurfaceService {
  getMetrics(): SurfaceMetrics;
  update(metrics: Partial<SurfaceMetrics>): void;
}

export interface BitmapAllocation {
  image: unknown;
  width: number;
  height: number;
  revision?: number;
}

export interface BitmapUpdate {
  image?: unknown;
  width?: number;
  height?: number;
  revision?: number;
}

export interface BitmapService {
  allocate(bitmapId: string, bitmap: BitmapAllocation): BitmapHandle;
  update(bitmapId: string, bitmap: BitmapUpdate): BitmapHandle | undefined;
  getHandle(bitmapId: string): BitmapHandle | undefined;
  getMetadata(bitmapId: string): BitmapMetadata | undefined;
  release(bitmapId: string): void;
}

export interface EmbeddedSurfaceConfig {
  sourceId: string;
  interactive?: boolean;
  preserveAspectRatio?: boolean;
  mirrorX?: boolean;
  desiredSourceType?: string;
  refreshPolicy?: "manual" | "always";
  acceptsForwardedInput?: boolean;
  fallbackLabel?: string;
  compositionMode?: SurfaceCompositionMode;
}

export interface EmbeddedSurfaceAttachment {
  sourceId: string;
  interactive: boolean;
  preserveAspectRatio: boolean;
  mirrorX: boolean;
  desiredSourceType: string | undefined;
  refreshPolicy: "manual" | "always" | undefined;
  acceptsForwardedInput: boolean;
  fallbackLabel: string | undefined;
  available: boolean;
  handle: unknown | undefined;
  compositionMode: SurfaceCompositionMode;
  sourceWidth: number | undefined;
  sourceHeight: number | undefined;
  aspectRatio: number | undefined;
  latencyMs: number | undefined;
  refreshState: "idle" | "updating" | "stale";
  lastFrameTimestamp: number | undefined;
  forwardedEvents: readonly DisplayEvent[];
}

export interface EmbeddedSurfaceStateUpdate {
  available?: boolean;
  handle?: unknown;
  sourceWidth?: number;
  sourceHeight?: number;
  aspectRatio?: number;
  latencyMs?: number;
  refreshState?: "idle" | "updating" | "stale";
  lastFrameTimestamp?: number;
}

export interface EmbeddedSurfaceService {
  attach(componentId: string, config: EmbeddedSurfaceConfig): void;
  configure(componentId: string, config: Partial<EmbeddedSurfaceConfig>): void;
  release(componentId: string): void;
  getAttachment(componentId: string): EmbeddedSurfaceAttachment | undefined;
  isAvailable(componentId: string): boolean;
  getHandle(componentId: string): unknown;
  setState(componentId: string, state: EmbeddedSurfaceStateUpdate): void;
  forwardEvent(componentId: string, event: DisplayEvent): void;
}

export interface RuntimeServices {
  layout: LayoutService;
  navigation: NavigationService;
  scroll: ScrollService;
  focus: FocusService;
  theme: ThemeService;
  timing: TimingService;
  surface: SurfaceService;
  bitmaps: BitmapService;
  surfaces: EmbeddedSurfaceService;
}
