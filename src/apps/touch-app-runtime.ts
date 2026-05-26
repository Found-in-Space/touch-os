import type { DisplayNode } from "../core/component.js";
import type { AppEventOutput, RuntimeOutput } from "../core/actions.js";
import {
  createRuntime,
  type DispatchResult,
  type DisplayRuntime,
  type RuntimeServiceOverrides
} from "../core/runtime.js";
import type { InputEvent } from "../core/events.js";
import type { Rect } from "../core/geometry.js";
import { ZERO_INSETS, copyInsets } from "../core/geometry.js";
import type { SurfaceMetrics, ThemeTokens } from "../services/contracts.js";
import { createThemeService } from "../services/defaults.js";
import {
  createTouchAppInstance,
  type TouchAppModule,
  type TouchAppRuntimeInstance
} from "./define-app.js";
import type { TouchAppEvent, TouchAppSurfaceContext } from "./context.js";

export interface CreateTouchAppRuntimeOptions<TState> {
  app: TouchAppModule<TState>;
  state: TState;
  surface?: Partial<SurfaceMetrics>;
  theme?: Partial<ThemeTokens>;
  services?: RuntimeServiceOverrides;
  /** Also include raw DisplayRuntime outputs from takeOutputs(); defaults to app events only. */
  forwardRuntimeOutputs?: boolean;
  onAppEvent?(event: TouchAppEvent): void;
}

export interface TouchAppDisplayRuntime<TState = unknown> extends DisplayRuntime {
  setAppState(state: TState): void;
  getAppState(): TState;
}

export function createTouchAppRuntime<TState>(
  options: CreateTouchAppRuntimeOptions<TState>
): TouchAppDisplayRuntime<TState> {
  let currentState = options.state;
  const appId = options.app.manifest.id;
  const sanitizedAppId = sanitizeId(appId);
  const instanceId = `${sanitizedAppId}-1`;
  const windowId = `${sanitizedAppId}-surface`;
  const surface = createAppSurfaceContext(options.surface);
  const theme = options.services?.theme ?? createThemeService(options.theme);
  const routedOutputs: RuntimeOutput[] = [];
  const runtimeApp = createTouchAppInstance(options.app, {
    instanceId,
    windowId,
    surface,
    theme,
    actions: {
      emit(event) {
        const scopedEvent: TouchAppEvent = {
          ...event,
          appId: event.appId ?? appId,
          instanceId: event.instanceId ?? instanceId,
          windowId: event.windowId ?? windowId
        };
        options.onAppEvent?.(scopedEvent);
        routedOutputs.push(createAppEventOutput(scopedEvent, appId, instanceId, windowId));
      }
    }
  });
  const runtime = createRuntime({
    root: runtimeApp.render(currentState),
    ...(options.surface ? { surface: options.surface } : {}),
    services: {
      ...options.services,
      theme
    }
  });

  function syncRoot(): void {
    updateAppSurface(runtimeApp, runtime.getServices().surface.getMetrics());
    runtime.setRoot(runtimeApp.render(currentState));
  }

  function drainOutputs(): void {
    const outputs = runtime.takeOutputs();
    if (options.forwardRuntimeOutputs) {
      routedOutputs.push(...outputs);
    }
    for (const output of outputs) {
      runtimeApp.handleOutput(output);
    }
  }

  return {
    setAppState(state: TState) {
      currentState = state;
      syncRoot();
    },
    getAppState() {
      return currentState;
    },
    setRoot(root: DisplayNode<unknown>) {
      runtime.setRoot(root);
    },
    render() {
      syncRoot();
      return runtime.render();
    },
    dispatchInput(event: InputEvent): DispatchResult {
      syncRoot();
      const result = runtime.dispatchInput(event);
      drainOutputs();
      return result;
    },
    resize(metrics: Partial<SurfaceMetrics>) {
      runtime.resize(metrics);
      syncRoot();
    },
    tick(timestamp: number) {
      runtime.tick(timestamp);
      drainOutputs();
    },
    takeOutputs() {
      drainOutputs();
      const outputs = [...routedOutputs];
      routedOutputs.length = 0;
      return outputs;
    },
    getServices() {
      return runtime.getServices();
    },
    getInteraction() {
      return runtime.getInteraction();
    },
    getBounds(componentId: string): Rect | undefined {
      syncRoot();
      return runtime.getBounds(componentId);
    },
    isLayoutDirty() {
      return runtime.isLayoutDirty();
    },
    isRenderDirty() {
      return runtime.isRenderDirty();
    },
    dispose() {
      runtimeApp.close();
      runtime.dispose();
      routedOutputs.length = 0;
    }
  };
}

function createAppSurfaceContext(
  surface: Partial<SurfaceMetrics> | undefined
): TouchAppSurfaceContext {
  return {
    width: surface?.width ?? 320,
    height: surface?.height ?? 240,
    pixelDensity: surface?.pixelDensity ?? 1,
    safeArea: surface?.safeArea ? copyInsets(surface.safeArea) : ZERO_INSETS
  };
}

function updateAppSurface(
  runtimeApp: TouchAppRuntimeInstance<unknown>,
  surface: SurfaceMetrics
): void {
  runtimeApp.context.surface.width = surface.width;
  runtimeApp.context.surface.height = surface.height;
  runtimeApp.context.surface.pixelDensity = surface.pixelDensity;
  runtimeApp.context.surface.safeArea = copyInsets(surface.safeArea);
}

function sanitizeId(value: string): string {
  const sanitized = value.trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return sanitized.length > 0 ? sanitized : "app";
}

function createAppEventOutput(
  event: TouchAppEvent,
  appId: string,
  instanceId: string,
  windowId: string
): AppEventOutput {
  return {
    type: "app-event",
    componentId: windowId,
    appId,
    instanceId,
    windowId,
    event
  };
}
