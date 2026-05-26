import type { TouchAppModule } from "./define-app.js";
import {
  validateTouchAppManifest,
  type TouchAppManifest
} from "./manifest.js";

export interface TouchAppRegistry {
  register<TState = unknown>(app: TouchAppModule<TState>): void;
  get<TState = unknown>(appId: string): TouchAppModule<TState> | undefined;
  list(): readonly TouchAppManifest[];
}

export function createTouchAppRegistry(
  apps: readonly TouchAppModule<unknown>[] = []
): TouchAppRegistry {
  const entries = new Map<string, TouchAppModule<unknown>>();

  const registry: TouchAppRegistry = {
    register(app) {
      validateTouchAppManifest(app.manifest);
      if (entries.has(app.manifest.id)) {
        throw new Error(`Touch app "${app.manifest.id}" is already registered.`);
      }
      entries.set(app.manifest.id, app as unknown as TouchAppModule<unknown>);
    },
    get<TState = unknown>(appId: string) {
      return entries.get(appId) as unknown as TouchAppModule<TState> | undefined;
    },
    list() {
      return [...entries.values()].map((app) => app.manifest);
    }
  };

  for (const app of apps) {
    registry.register(app);
  }

  return registry;
}
