import type { RuntimeOutput } from "../core/actions.js";
import type { Insets, Size } from "../core/geometry.js";
import type {
  EmbeddedSurfaceSourceUpdate,
  ThemeService
} from "../services/contracts.js";

export interface TouchAppSurfaceContext extends Size {
  pixelDensity: number;
  safeArea: Insets;
}

export interface TouchAppEvent {
  type: string;
  appId?: string;
  instanceId?: string;
  windowId?: string;
  name?: string;
  payload?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface TouchAppActions {
  emit(event: TouchAppEvent): void;
}

export interface OpenAppOptions {
  instanceId?: string;
  windowId?: string;
  rect?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  activate?: boolean;
  payload?: Record<string, unknown>;
}

export interface TouchAppWindowApi {
  setTitle(title: string): void;
  requestClose(): void;
  requestResize(size: Size): void;
  openApp(appId: string, options?: OpenAppOptions): void;
}

export interface TouchAppStorage {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T): void;
  delete(key: string): void;
}

export interface TouchAppSurfaceSource extends EmbeddedSurfaceSourceUpdate {}

export interface TouchAppSurfaceApi {
  publish(sourceId: string, source: TouchAppSurfaceSource): void;
  unpublish(sourceId: string): void;
}

export interface TouchAppContext {
  appId: string;
  instanceId: string;
  windowId: string;
  surface: TouchAppSurfaceContext;
  theme: ThemeService;
  actions: TouchAppActions;
  windows: TouchAppWindowApi;
  storage?: TouchAppStorage;
  surfaces?: TouchAppSurfaceApi;
}

export interface TouchAppContextOptions {
  appId: string;
  instanceId: string;
  windowId: string;
  surface: TouchAppSurfaceContext;
  theme: ThemeService;
  actions?: TouchAppActions;
  windows?: Partial<TouchAppWindowApi>;
  storage?: TouchAppStorage;
  surfaces?: TouchAppSurfaceApi;
}

export function createTouchAppContext(options: TouchAppContextOptions): TouchAppContext {
  const context: TouchAppContext = {
    appId: options.appId,
    instanceId: options.instanceId,
    windowId: options.windowId,
    surface: copySurface(options.surface),
    theme: options.theme,
    actions: options.actions ?? noopActions,
    windows: {
      setTitle: options.windows?.setTitle ?? noop,
      requestClose: options.windows?.requestClose ?? noop,
      requestResize: options.windows?.requestResize ?? noop,
      openApp: options.windows?.openApp ?? noop
    }
  };

  if (options.storage) {
    context.storage = options.storage;
  }
  if (options.surfaces) {
    context.surfaces = options.surfaces;
  }

  return context;
}

function copySurface(surface: TouchAppSurfaceContext): TouchAppSurfaceContext {
  return {
    width: surface.width,
    height: surface.height,
    pixelDensity: surface.pixelDensity,
    safeArea: { ...surface.safeArea }
  };
}

function noop(): void {}

const noopActions: TouchAppActions = {
  emit() {}
};

export function forwardOutputToTouchApp(
  instance: { handleOutput?(output: RuntimeOutput): void },
  output: RuntimeOutput
): void {
  instance.handleOutput?.(output);
}
