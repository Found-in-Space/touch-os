import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "test/e2e/**"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      reporter: ["text", "json", "json-summary", "html"],
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 90,
        lines: 90,
        "src/core/runtime.ts": {
          lines: 95,
          branches: 90
        },
        "src/core/geometry.ts": {
          lines: 95,
          branches: 90
        },
        "src/app-shell/app-output-routing.ts": {
          lines: 95,
          branches: 90
        },
        "src/coordination/panel-coordinator.ts": {
          lines: 95,
          branches: 90
        },
        "src/hosts/continuous-pointer-tracker.ts": {
          lines: 95,
          branches: 90
        },
        "src/hosts/three-host-pointer-lifecycle.ts": {
          lines: 95,
          branches: 90
        },
        "src/hosts/three-panel-interactor.ts": {
          lines: 95,
          branches: 90
        },
        "src/hosts/three-panel-driver.ts": {
          lines: 95,
          branches: 90
        },
        "src/hosts/three-panel-session.ts": {
          lines: 95,
          branches: 90
        }
      }
    }
  }
});
