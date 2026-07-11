import { describe, expect, it, vi } from "vitest";
import {
  createAppShell,
  createButton,
  createEmbeddedSurfaceService,
  createNode,
  createRuntime,
  createTextLabel,
  createThemeService,
  createTouchAppRegistry,
  createWindowManager,
  defineControlsApp,
  defineTouchApp,
  type AppEventOutput,
  type DisplayComponent,
  type DisplayRuntime,
  type RuntimeOutput,
  type TouchRuntimeSurfaceHandle,
  type TouchWindowState,
  type WindowManagerAppHostMode
} from "../src/index.js";
import {
  createWindowManagerAppWindow,
  ensureHostedAppWindow,
  publishHostedAppWindow,
  unpublishHostedAppWindow
} from "../src/app-shell/app-hosting.js";
import { clickComponentCenter, pressAt } from "./helpers/runtime-helpers.js";

const HOST_MODES: readonly WindowManagerAppHostMode[] = ["same-runtime", "child-runtime"];

describe("app output routing", () => {
  it("exposes the same default app-event contract in both host modes", () => {
    const outputs = HOST_MODES.map((hostMode) => {
      const registry = createTouchAppRegistry([createActionApp("space.test.parity")]);
      const runtime = createManagedAppRuntime(registry, hostMode, [
        createManagedWindow("parity-window", "space.test.parity", "parity-1", 1)
      ]);
      pressAppComponent(runtime, hostMode, {
        appId: "space.test.parity",
        instanceId: "parity-1",
        windowId: "parity-window",
        componentId: "action-button"
      });
      return getAppEvents(runtime.takeOutputs());
    });

    expect(outputs[1]).toEqual(outputs[0]);
  });

  for (const hostMode of HOST_MODES) {
    it(`emits one app event and no raw action by default in ${hostMode} mode`, () => {
      const registry = createTouchAppRegistry([createActionApp("space.test.action")]);
      const runtime = createManagedAppRuntime(registry, hostMode, [
        createManagedWindow("action-window", "space.test.action", "action-1", 1)
      ]);

      pressAppComponent(runtime, hostMode, {
        appId: "space.test.action",
        instanceId: "action-1",
        windowId: "action-window",
        componentId: "action-button"
      });
      const outputs = runtime.takeOutputs();

      expect(outputs.filter((output) => output.type === "action")).toEqual([]);
      expect(getAppEvents(outputs)).toEqual([
        expect.objectContaining({
          appId: "space.test.action",
          instanceId: "action-1",
          windowId: "action-window",
          event: expect.objectContaining({
            type: "app-action",
            name: "action.run"
          })
        })
      ]);
    });

    it(`routes one field change and one action event in ${hostMode} mode`, () => {
      const app = defineControlsApp<{ enabled: boolean }>({
        id: "space.test.controls",
        name: "Controls",
        controls: ({ toggle, button }) => [
          toggle("Enabled", "enabled", { id: "enabled-toggle" }),
          button("Run", "controls.run", { id: "run-button" })
        ]
      });
      const registry = createTouchAppRegistry([app]);
      const runtime = createManagedAppRuntime(
        registry,
        hostMode,
        [createManagedWindow("controls-window", app.manifest.id, "controls-1", 1)],
        {
          appStates: { [app.manifest.id]: { enabled: false } }
        }
      );

      pressAppComponent(runtime, hostMode, {
        appId: app.manifest.id,
        instanceId: "controls-1",
        windowId: "controls-window",
        componentId: "enabled-toggle"
      });
      const changeOutputs = runtime.takeOutputs();
      pressAppComponent(runtime, hostMode, {
        appId: app.manifest.id,
        instanceId: "controls-1",
        windowId: "controls-window",
        componentId: "run-button"
      });
      const actionOutputs = runtime.takeOutputs();

      expect(getAppEvents(changeOutputs)).toHaveLength(1);
      expect(getAppEvents(changeOutputs)[0]?.event).toMatchObject({
        type: "app-change",
        name: "enabled.change",
        payload: { field: "enabled", value: true }
      });
      expect(changeOutputs.some((output) => output.type === "change-request")).toBe(false);
      expect(getAppEvents(actionOutputs)).toHaveLength(1);
      expect(getAppEvents(actionOutputs)[0]?.event).toMatchObject({
        type: "app-action",
        name: "controls.run"
      });
      expect(actionOutputs.some((output) => output.type === "action")).toBe(false);
    });

    it(`forwards raw outputs with stable scoped ids only when requested in ${hostMode} mode`, () => {
      const registry = createTouchAppRegistry([createActionApp("space.test.forward")]);
      const runtime = createManagedAppRuntime(
        registry,
        hostMode,
        [createManagedWindow("forward-window", "space.test.forward", "forward-1", 1)],
        { forwardAppOutputs: true }
      );

      pressAppComponent(runtime, hostMode, {
        appId: "space.test.forward",
        instanceId: "forward-1",
        windowId: "forward-window",
        componentId: "action-button"
      });
      const outputs = runtime.takeOutputs();

      expect(getAppEvents(outputs)).toHaveLength(1);
      expect(outputs.filter((output) => output.type === "action")).toEqual([
        {
          type: "action",
          actionId: "action.run",
          componentId: "space.test.forward:forward-1:forward-window:action-button"
        }
      ]);
    });
  }

  it("keeps output scopes independent across multiple instances", () => {
    const app = createActionApp("space.test.multiple");
    const registry = createTouchAppRegistry([app]);
    const runtime = createManagedAppRuntime(
      registry,
      "same-runtime",
      [
        createManagedWindow("first-window", app.manifest.id, "instance-1", 1, 10),
        createManagedWindow("second-window", app.manifest.id, "instance-2", 2, 240)
      ],
      { forwardAppOutputs: true }
    );

    pressAppComponent(runtime, "same-runtime", {
      appId: app.manifest.id,
      instanceId: "instance-1",
      windowId: "first-window",
      componentId: "action-button"
    });
    pressAppComponent(runtime, "same-runtime", {
      appId: app.manifest.id,
      instanceId: "instance-2",
      windowId: "second-window",
      componentId: "action-button"
    });
    const outputs = runtime.takeOutputs();

    expect(outputs.filter((output) => output.type === "action")).toEqual([
      expect.objectContaining({
        componentId: "space.test.multiple:instance-1:first-window:action-button"
      }),
      expect.objectContaining({
        componentId: "space.test.multiple:instance-2:second-window:action-button"
      })
    ]);
    expect(getAppEvents(outputs).map((output) => output.instanceId)).toEqual([
      "instance-1",
      "instance-2"
    ]);
  });

  for (const hostMode of HOST_MODES) {
    it(`preserves one scoped app event through a nested shell in ${hostMode} mode`, () => {
      const innerRegistry = createTouchAppRegistry([createActionApp("space.test.inner")]);
      const outerApp = defineTouchApp({
        manifest: {
          id: "space.test.outer",
          name: "Outer",
          version: "1.0.0"
        },
        createApp() {
          const root = createAppShell("nested-shell", {
            registry: innerRegistry,
            initialSessions: [
              createManagedWindow("inner-window", "space.test.inner", "inner-1", 1)
            ]
          });
          return {
            render() {
              return root;
            }
          };
        }
      });
      const registry = createTouchAppRegistry([outerApp]);
      const runtime = createManagedAppRuntime(registry, hostMode, [
        createManagedWindow("outer-window", outerApp.manifest.id, "outer-1", 1)
      ]);

      const localInnerComponentId = "space.test.inner:inner-1:inner-window:action-button";
      const innerComponentId = hostMode === "same-runtime"
        ? `space.test.outer:outer-1:outer-window:${localInnerComponentId}`
        : localInnerComponentId;
      if (hostMode === "same-runtime") {
        clickComponentCenter(runtime, innerComponentId);
      } else {
        pressChildRuntimeComponent(
          runtime,
          "space.test.outer:outer-1:outer-window:surface-source",
          innerComponentId
        );
      }
      const outputs = runtime.takeOutputs();

      expect(outputs.filter((output) => output.type === "action")).toEqual([]);
      expect(getAppEvents(outputs)).toEqual([
        expect.objectContaining({
          componentId: "space.test.outer:outer-1:outer-window:nested-shell",
          appId: "space.test.inner",
          instanceId: "inner-1",
          windowId: "space.test.outer:outer-1:outer-window:inner-window",
          event: expect.objectContaining({
            type: "app-action",
            appId: "space.test.inner",
            instanceId: "inner-1",
            windowId: "inner-window"
          })
        })
      ]);
    });
  }

  it.each(HOST_MODES)(
    "namespaces nested %s children across same-runtime outer instances",
    (innerHostMode) => {
    const innerRegistry = createTouchAppRegistry([createActionApp("space.test.reused-inner")]);
    const outerApp = defineTouchApp({
      manifest: { id: "space.test.reused-outer", name: "Outer", version: "1.0.0" },
      createApp() {
        const root = createAppShell("nested-shell", {
          registry: innerRegistry,
          appHostMode: innerHostMode,
          initialSessions: [
            createManagedWindow("inner-window", "space.test.reused-inner", "inner-1", 1)
          ]
        });
        return { render: () => root };
      }
    });
    const runtime = createManagedAppRuntime(
      createTouchAppRegistry([outerApp]),
      "same-runtime",
      [
        createManagedWindow("outer-one", outerApp.manifest.id, "outer-1", 1, 10),
        createManagedWindow("outer-two", outerApp.manifest.id, "outer-2", 2, 250)
      ]
    );
    const innerSuffix = "space.test.reused-inner:inner-1:inner-window:action-button";

    expect(() => runtime.render()).not.toThrow();
    for (const outer of [
      { instanceId: "outer-1", windowId: "outer-one" },
      { instanceId: "outer-2", windowId: "outer-two" }
    ]) {
      const outerPrefix = `space.test.reused-outer:${outer.instanceId}:${outer.windowId}:`;
      if (innerHostMode === "same-runtime") {
        clickComponentCenter(runtime, `${outerPrefix}${innerSuffix}`);
      } else {
        pressChildRuntimeComponent(
          runtime,
          `${outerPrefix}space.test.reused-inner:inner-1:inner-window:surface-source`,
          "action-button"
        );
      }
    }

    expect(getAppEvents(runtime.takeOutputs()).map((output) => output.componentId)).toEqual([
      "space.test.reused-outer:outer-1:outer-one:nested-shell",
      "space.test.reused-outer:outer-2:outer-two:nested-shell"
    ]);
    }
  );

  it("preserves the most-specific namespace through three same-runtime shell levels", () => {
    const leafRegistry = createTouchAppRegistry([createActionApp("space.test.leaf")]);
    const middleApp = defineTouchApp({
      manifest: { id: "space.test.middle", name: "Middle", version: "1.0.0" },
      createApp() {
        const root = createAppShell("leaf-shell", {
          registry: leafRegistry,
          initialSessions: [createManagedWindow("leaf-window", "space.test.leaf", "leaf-1", 1)]
        });
        return { render: () => root };
      }
    });
    const levelOneApp = defineTouchApp({
      manifest: { id: "space.test.level-one", name: "Level One", version: "1.0.0" },
      createApp() {
        const root = createAppShell("middle-shell", {
          registry: createTouchAppRegistry([middleApp]),
          initialSessions: [
            {
              ...createManagedWindow("middle-one", middleApp.manifest.id, "middle-1", 1, 0),
              rect: { x: 0, y: 0, width: 100, height: 180 }
            },
            {
              ...createManagedWindow("middle-two", middleApp.manifest.id, "middle-2", 2, 105),
              rect: { x: 105, y: 0, width: 100, height: 180 }
            }
          ]
        });
        return { render: () => root };
      }
    });
    const runtime = createManagedAppRuntime(
      createTouchAppRegistry([levelOneApp]),
      "same-runtime",
      [createManagedWindow("level-one-window", levelOneApp.manifest.id, "level-one-1", 1)]
    );
    const levelOnePrefix = "space.test.level-one:level-one-1:level-one-window:";
    const leafSuffix = "space.test.leaf:leaf-1:leaf-window:action-button";

    expect(() => runtime.render()).not.toThrow();
    for (const middle of [
      { instanceId: "middle-1", windowId: "middle-one" },
      { instanceId: "middle-2", windowId: "middle-two" }
    ]) {
      clickComponentCenter(
        runtime,
        `${levelOnePrefix}space.test.middle:${middle.instanceId}:${middle.windowId}:${leafSuffix}`
      );
    }

    expect(getAppEvents(runtime.takeOutputs()).map((output) => output.componentId)).toEqual([
      `${levelOnePrefix}space.test.middle:middle-1:middle-one:leaf-shell`,
      `${levelOnePrefix}space.test.middle:middle-2:middle-two:leaf-shell`
    ]);
  });

  for (const hostMode of HOST_MODES) {
    it(`scopes explicitly forwarded raw output through a nested shell in ${hostMode} mode`, () => {
      const innerRegistry = createTouchAppRegistry([createActionApp("space.test.inner-forward")]);
      const outerApp = defineTouchApp({
        manifest: {
          id: "space.test.outer-forward",
          name: "Outer Forward",
          version: "1.0.0"
        },
        createApp() {
          const root = createAppShell("nested-forward-shell", {
            registry: innerRegistry,
            forwardAppOutputs: true,
            initialSessions: [
              createManagedWindow(
                "inner-forward-window",
                "space.test.inner-forward",
                "inner-forward-1",
                1
              )
            ]
          });
          return {
            render() {
              return root;
            }
          };
        }
      });
      const runtime = createManagedAppRuntime(
        createTouchAppRegistry([outerApp]),
        hostMode,
        [
          createManagedWindow(
            "outer-forward-window",
            outerApp.manifest.id,
            "outer-forward-1",
            1
          )
        ],
        { forwardAppOutputs: true }
      );
      const localInnerComponentId =
        "space.test.inner-forward:inner-forward-1:inner-forward-window:action-button";
      const innerComponentId = hostMode === "same-runtime"
        ? `space.test.outer-forward:outer-forward-1:outer-forward-window:${localInnerComponentId}`
        : localInnerComponentId;

      if (hostMode === "same-runtime") {
        clickComponentCenter(runtime, innerComponentId);
      } else {
        pressChildRuntimeComponent(
          runtime,
          "space.test.outer-forward:outer-forward-1:outer-forward-window:surface-source",
          innerComponentId
        );
      }
      const outputs = runtime.takeOutputs();

      expect(outputs.filter((output) => output.type === "action")).toEqual([
        {
          type: "action",
          actionId: "action.run",
          componentId: hostMode === "same-runtime"
            ? innerComponentId
            : "space.test.outer-forward:outer-forward-1:outer-forward-window:" +
              innerComponentId
        }
      ]);
      expect(getAppEvents(outputs)).toHaveLength(1);
    });
  }
});

describe("child app reconciliation", () => {
  it("skips redundant resize, root replacement, publication, and unpublication", () => {
    const surfaces = createEmbeddedSurfaceService();
    const publish = vi.spyOn(surfaces, "publish");
    const unpublish = vi.spyOn(surfaces, "unpublish");
    const theme = createThemeService();
    const window = createManagedWindow(
      "reconcile-window",
      "space.test.reconcile",
      "reconcile-1",
      1
    );
    const record = createWindowManagerAppWindow({
      window,
      app: undefined,
      hostMode: "child-runtime",
      surface: createSurface(200, 120),
      theme,
      actions: { emit() {} },
      windows: {}
    });
    const stableRoot = createTextLabel("stable-root", { text: "Stable" });
    const hosted = ensureHostedAppWindow(record, {
      root: stableRoot,
      surface: createSurface(200, 120),
      theme,
      surfaces
    });
    const resize = vi.spyOn(hosted.runtime, "resize");
    const setRoot = vi.spyOn(hosted.runtime, "setRoot");

    ensureHostedAppWindow(record, {
      root: stableRoot,
      surface: createSurface(200, 120),
      theme,
      surfaces
    });
    publishHostedAppWindow(record, surfaces);
    publishHostedAppWindow(record, surfaces);
    hosted.runtime.invalidateRender();
    publishHostedAppWindow(record, surfaces);

    expect(resize).not.toHaveBeenCalled();
    expect(setRoot).not.toHaveBeenCalled();
    expect(publish).toHaveBeenCalledTimes(1);

    const nextRoot = createTextLabel("stable-root", { text: "Changed" });
    ensureHostedAppWindow(record, {
      root: nextRoot,
      surface: createSurface(200, 120),
      theme,
      surfaces
    });
    publishHostedAppWindow(record, surfaces);
    expect(setRoot).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledTimes(2);

    const compositeHandle = {};
    const compositeRoot = createNode("composite-root", CompositeProbe, {
      handle: compositeHandle,
      revision: 1
    });
    ensureHostedAppWindow(record, {
      root: compositeRoot,
      surface: createSurface(200, 120),
      theme,
      surfaces
    });
    publishHostedAppWindow(record, surfaces);
    hosted.runtime.invalidateRender();
    publishHostedAppWindow(record, surfaces);
    expect(publish).toHaveBeenCalledTimes(3);

    ensureHostedAppWindow(record, {
      root: createNode("composite-root", CompositeProbe, {
        handle: compositeHandle,
        revision: 2
      }),
      surface: createSurface(200, 120),
      theme,
      surfaces
    });
    publishHostedAppWindow(record, surfaces);
    expect(publish).toHaveBeenCalledTimes(4);

    ensureHostedAppWindow(record, {
      root: nextRoot,
      surface: {
        ...createSurface(200, 120),
        safeArea: { top: 1, right: 0, bottom: 0, left: 0 }
      },
      theme,
      surfaces
    });
    expect(resize).toHaveBeenCalledTimes(1);

    unpublishHostedAppWindow(record, surfaces);
    unpublishHostedAppWindow(record, surfaces);
    expect(unpublish).toHaveBeenCalledTimes(1);
  });
});

function createActionApp(appId: string) {
  return defineTouchApp({
    manifest: {
      id: appId,
      name: "Action",
      version: "1.0.0"
    },
    createApp(ctx) {
      const root = createButton("action-button", {
        label: "Run",
        actionId: "action.run"
      });
      return {
        render() {
          return root;
        },
        handleOutput(output) {
          if (output.type === "action") {
            ctx.actions.emit({
              type: "app-action",
              name: output.actionId
            });
          }
        }
      };
    }
  });
}

function createManagedAppRuntime(
  registry: ReturnType<typeof createTouchAppRegistry>,
  hostMode: WindowManagerAppHostMode,
  initialWindows: readonly TouchWindowState[],
  options: {
    appStates?: Readonly<Record<string, unknown>>;
    forwardAppOutputs?: boolean;
  } = {}
): DisplayRuntime {
  const surfaces = createEmbeddedSurfaceService();
  return createRuntime({
    root: createWindowManager("test-shell", {
      registry,
      appHostMode: hostMode,
      initialWindows,
      ...(options.appStates ? { appStates: options.appStates } : {}),
      ...(options.forwardAppOutputs !== undefined
        ? { forwardAppOutputs: options.forwardAppOutputs }
        : {})
    }),
    surface: { width: 500, height: 320 },
    services: { surfaces }
  });
}

function pressAppComponent(
  runtime: DisplayRuntime,
  hostMode: WindowManagerAppHostMode,
  target: {
    appId: string;
    instanceId: string;
    windowId: string;
    componentId: string;
  }
): void {
  const prefix = `${target.appId}:${target.instanceId}:${target.windowId}:`;
  if (hostMode === "same-runtime") {
    clickComponentCenter(runtime, `${prefix}${target.componentId}`);
    return;
  }
  pressChildRuntimeComponent(runtime, `${prefix}surface-source`, target.componentId);
}

function pressChildRuntimeComponent(
  runtime: DisplayRuntime,
  sourceId: string,
  componentId: string
): void {
  const snapshot = runtime.render();
  const viewport = snapshot.commands.find(
    (command) => command.type === "surface" && command.sourceId === sourceId
  );
  if (!viewport || viewport.type !== "surface") {
    throw new Error(`Unable to find hosted surface "${sourceId}".`);
  }
  const handle = viewport.handle as TouchRuntimeSurfaceHandle;
  const command = handle.snapshot.commands.find(
    (candidate) => candidate.componentId === componentId && candidate.type === "rect"
  );
  if (!command || command.type !== "rect") {
    throw new Error(`Unable to find hosted component "${componentId}".`);
  }
  const sourceX = command.rect.x + command.rect.width / 2;
  const sourceY = command.rect.y + command.rect.height / 2;
  pressAt(
    runtime,
    viewport.rect.x + sourceX / handle.width * viewport.rect.width,
    viewport.rect.y + sourceY / handle.height * viewport.rect.height
  );
}

function getAppEvents(outputs: readonly RuntimeOutput[]): AppEventOutput[] {
  return outputs.filter((output): output is AppEventOutput => output.type === "app-event");
}

function createManagedWindow(
  id: string,
  appId: string,
  instanceId: string,
  zIndex: number,
  x = 10
): TouchWindowState {
  return {
    id,
    appId,
    instanceId,
    title: appId,
    rect: { x, y: 10, width: 220, height: 240 },
    zIndex,
    mode: "normal",
    focused: zIndex === 1,
    movable: true,
    resizable: true
  };
}

function createSurface(width: number, height: number) {
  return {
    width,
    height,
    pixelDensity: 1,
    safeArea: { top: 0, right: 0, bottom: 0, left: 0 }
  };
}

const CompositeProbe: DisplayComponent<{ handle: unknown; revision: number }> = {
  kind: "app-hosting-composite-probe",
  measure(ctx) {
    return { width: ctx.constraints.maxWidth, height: ctx.constraints.maxHeight };
  },
  layout(ctx) {
    ctx.setContentBounds(ctx.bounds);
  },
  render(ctx) {
    return [{
      type: "surface",
      componentId: ctx.id,
      rect: ctx.bounds,
      handle: ctx.props.handle,
      surfaceRevision: ctx.props.revision,
      compositionMode: "composite"
    }];
  }
};
