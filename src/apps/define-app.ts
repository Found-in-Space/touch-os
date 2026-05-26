import type { RuntimeOutput } from "../core/actions.js";
import type { DisplayNode } from "../core/component.js";
import {
  createTouchAppContext,
  forwardOutputToTouchApp,
  type TouchAppActions,
  type TouchAppContext,
  type TouchAppStorage,
  type TouchAppSurfaceApi,
  type TouchAppSurfaceContext,
  type TouchAppWindowApi
} from "./context.js";
import {
  validateTouchAppManifest,
  type TouchAppManifest
} from "./manifest.js";

export interface TouchAppInstance<TState = unknown> {
  render(state: TState): DisplayNode<unknown, unknown>;
  onLaunch?(): void;
  onActivate?(): void;
  onDeactivate?(): void;
  onSuspend?(): void;
  onResume?(): void;
  onClose?(): void;
  handleOutput?(output: RuntimeOutput): void;
}

export interface TouchAppModule<TState = unknown> {
  manifest: TouchAppManifest;
  createApp(context: TouchAppContext): TouchAppInstance<TState>;
}

export interface CreateTouchAppInstanceOptions {
  instanceId: string;
  windowId: string;
  surface: TouchAppSurfaceContext;
  theme: TouchAppContext["theme"];
  actions?: TouchAppActions;
  windows?: Partial<TouchAppWindowApi>;
  storage?: TouchAppStorage;
  surfaces?: TouchAppSurfaceApi;
  launch?: boolean;
}

export interface TouchAppRuntimeInstance<TState = unknown> {
  appId: string;
  instanceId: string;
  windowId: string;
  manifest: TouchAppManifest;
  context: TouchAppContext;
  instance: TouchAppInstance<TState>;
  render(state: TState): DisplayNode<unknown, unknown>;
  handleOutput(output: RuntimeOutput): void;
  activate(): void;
  deactivate(): void;
  suspend(): void;
  resume(): void;
  close(): void;
}

export function defineTouchApp<TState = unknown>(
  module: TouchAppModule<TState>
): TouchAppModule<TState> {
  validateTouchAppManifest(module.manifest);
  return module;
}

export function createTouchAppInstance<TState = unknown>(
  app: TouchAppModule<TState>,
  options: CreateTouchAppInstanceOptions
): TouchAppRuntimeInstance<TState> {
  const context = createTouchAppContext({
    appId: app.manifest.id,
    instanceId: options.instanceId,
    windowId: options.windowId,
    surface: options.surface,
    theme: options.theme,
    ...(options.actions ? { actions: options.actions } : {}),
    ...(options.windows ? { windows: options.windows } : {}),
    ...(options.storage ? { storage: options.storage } : {}),
    ...(options.surfaces ? { surfaces: options.surfaces } : {})
  });
  const instance = app.createApp(context);
  if (options.launch ?? true) {
    instance.onLaunch?.();
  }

  return {
    appId: app.manifest.id,
    instanceId: options.instanceId,
    windowId: options.windowId,
    manifest: app.manifest,
    context,
    instance,
    render(state) {
      return instance.render(state);
    },
    handleOutput(output) {
      forwardOutputToTouchApp(instance, output);
    },
    activate() {
      instance.onActivate?.();
    },
    deactivate() {
      instance.onDeactivate?.();
    },
    suspend() {
      instance.onSuspend?.();
    },
    resume() {
      instance.onResume?.();
    },
    close() {
      instance.onClose?.();
    }
  };
}
