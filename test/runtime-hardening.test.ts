import { describe, expect, it } from "vitest";
import {
  DEFAULT_THEME_TOKENS,
  createBitmapService,
  createHoldButton,
  createMemoryFocusService,
  createMemoryNavigationService,
  createMemoryScrollService,
  createNode,
  createRuntime,
  createSurfaceService,
  createThemeService,
  createTouchAppRuntime,
  defineTouchApp,
  type DisplayComponent,
  type DisplayEvent,
  type DisplayNode,
  type Rect,
  type RuntimeOutput
} from "../src/index.js";

describe("runtime hardening", () => {
  it("observes injected mutable services and distinguishes layout from paint changes", () => {
    const calls = { measure: 0, layout: 0, render: 0 };
    const component: DisplayComponent<Record<string, never>> = {
      kind: "invalidation-probe",
      measure(ctx) {
        calls.measure += 1;
        return {
          width: ctx.constraints.maxWidth,
          height: ctx.services.theme.getTokens().controlHeight
        };
      },
      layout() {
        calls.layout += 1;
      },
      render() {
        calls.render += 1;
        return [];
      }
    };
    const theme = createThemeService();
    const surface = createSurfaceService({ width: 160, height: 100 });
    const navigation = createMemoryNavigationService();
    const scroll = createMemoryScrollService();
    const focus = createMemoryFocusService();
    const bitmaps = createBitmapService();
    navigation.registerContainer("pages", ["one", "two"], "one");
    scroll.register("scroll");

    const runtime = createRuntime({
      root: createNode("probe", component, {}),
      services: { theme, surface, navigation, scroll, focus, bitmaps }
    });
    runtime.render();
    expect(calls).toEqual({ measure: 1, layout: 1, render: 1 });

    theme.update({ textColor: "#ffffff" });
    expect(runtime.isLayoutDirty()).toBe(false);
    expect(runtime.isRenderDirty()).toBe(true);
    runtime.render();
    expect(calls).toEqual({ measure: 1, layout: 1, render: 2 });

    theme.update({ controlHeight: 44 });
    expect(runtime.isLayoutDirty()).toBe(true);
    runtime.render();
    expect(calls).toEqual({ measure: 2, layout: 2, render: 3 });

    navigation.push("pages", "two");
    expect(runtime.isLayoutDirty()).toBe(true);
    runtime.render();

    scroll.setMetrics("scroll", { width: 10, height: 10 }, { width: 10, height: 20 });
    expect(runtime.isLayoutDirty()).toBe(true);
    runtime.render();

    focus.requestFocus("probe");
    expect(runtime.isLayoutDirty()).toBe(false);
    expect(runtime.isRenderDirty()).toBe(true);
    runtime.render();

    bitmaps.allocate("plot", { image: {}, width: 4, height: 4 });
    expect(runtime.isLayoutDirty()).toBe(false);
    expect(runtime.isRenderDirty()).toBe(true);
    runtime.render();

    surface.update({ safeArea: { top: 1, right: 0, bottom: 0, left: 0 } });
    expect(runtime.isLayoutDirty()).toBe(true);
  });

  it("treats identical service, resize, and root updates as no-ops", () => {
    const calls = { update: 0, measure: 0, layout: 0, render: 0 };
    const component: DisplayComponent<Record<string, never>> = {
      kind: "no-op-probe",
      update() {
        calls.update += 1;
      },
      measure(ctx) {
        calls.measure += 1;
        return { width: ctx.constraints.maxWidth, height: ctx.constraints.maxHeight };
      },
      layout() {
        calls.layout += 1;
      },
      render() {
        calls.render += 1;
        return [];
      }
    };
    const theme = createThemeService();
    const surface = createSurfaceService({
      width: 160,
      height: 100,
      pixelDensity: 2,
      safeArea: { top: 1, right: 2, bottom: 3, left: 4 }
    });
    const root = createNode("probe", component, {});
    const runtime = createRuntime({ root, services: { theme, surface } });
    const first = runtime.render();

    theme.update(theme.getTokens());
    surface.update(surface.getMetrics());
    runtime.resize({
      width: 160,
      height: 100,
      pixelDensity: 2,
      orientation: "landscape",
      safeArea: { top: 1, right: 2, bottom: 3, left: 4 }
    });
    runtime.setRoot(root);

    expect(runtime.isLayoutDirty()).toBe(false);
    expect(runtime.isRenderDirty()).toBe(false);
    expect(runtime.render().revision).toBe(first.revision);
    expect(calls).toEqual({ update: 0, measure: 1, layout: 1, render: 1 });
  });

  it("derives the default surface orientation from its effective dimensions", () => {
    expect(createSurfaceService().getMetrics()).toMatchObject({
      width: 320,
      height: 240,
      orientation: "landscape"
    });
  });

  it("advances bitmap revisions when reallocating an existing id", () => {
    const bitmaps = createBitmapService();
    bitmaps.allocate("plot", { image: { frame: 1 }, width: 8, height: 8 });
    const bitmapComponent: DisplayComponent<Record<string, never>> = {
      kind: "bitmap-reallocation-probe",
      measure() {
        return { width: 8, height: 8 };
      },
      render(ctx) {
        const handle = ctx.services.bitmaps.getHandle("plot");
        return handle
          ? [{ type: "bitmap", componentId: ctx.id, rect: ctx.bounds, handle }]
          : [];
      }
    };
    const runtime = createRuntime({
      root: createNode("plot", bitmapComponent, {}),
      services: { bitmaps },
      surface: { width: 8, height: 8 }
    });
    const first = runtime.render();

    const replacement = bitmaps.allocate("plot", {
      image: { frame: 2 },
      width: 8,
      height: 8
    });
    const second = runtime.render();

    expect(replacement.revision).toBe(1);
    expect(second.sharedSurfaceRevision).toBeGreaterThan(first.sharedSurfaceRevision);
  });

  it("supports explicit invalidation and unsubscribes service sources on disposal", () => {
    const theme = createThemeService();
    const runtime = createRuntime({
      root: createNode("probe", passiveComponent, {}),
      services: { theme }
    });
    runtime.render();

    runtime.invalidateRender();
    expect(runtime.isRenderDirty()).toBe(true);
    expect(runtime.isLayoutDirty()).toBe(false);
    runtime.render();

    runtime.invalidateLayout();
    expect(runtime.isLayoutDirty()).toBe(true);
    runtime.render();

    runtime.dispose();
    expect(runtime.isLayoutDirty()).toBe(false);
    expect(runtime.isRenderDirty()).toBe(false);
    theme.update({ accentColor: "#123456" });
    expect(runtime.isLayoutDirty()).toBe(false);
    expect(runtime.isRenderDirty()).toBe(false);
  });

  it("supports callback-only custom services and uncommon layout and focus paths", () => {
    const child = createNode("child", passiveComponent, {});
    const component: DisplayComponent<{ child: DisplayNode<unknown> }> = {
      kind: "runtime-edge-probe",
      getChildren(ctx) {
        return [ctx.props.child];
      },
      measure(ctx) {
        expect(ctx.estimateTextWidth("default-font-size")).toBeGreaterThan(0);
        return ctx.measureChild(ctx.props.child.id);
      },
      layout(ctx) {
        ctx.setClipRect();
        // Deliberately omit child bounds to exercise the runtime's zero-bounds fallback.
      }
    };
    const theme = {
      getTokens() {
        return {
          ...DEFAULT_THEME_TOKENS,
          typography: { ...DEFAULT_THEME_TOKENS.typography }
        };
      },
      update() {}
    };
    const runtime = createRuntime({
      root: createNode("parent", component, { child }),
      services: { theme },
      surface: { width: 100, height: 60 }
    });

    runtime.render();
    expect(runtime.getBounds("child")).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    expect(runtime.dispatchInput({ type: "focus", componentId: "parent", timestamp: 1 }).handled)
      .toBe(true);
    expect(runtime.dispatchInput({ type: "blur", componentId: "other", timestamp: 2 }).handled)
      .toBe(false);
    expect(runtime.dispatchInput({ type: "blur", timestamp: 3 }).handled).toBe(true);

    runtime.dispose();
    expect(runtime.dispatchInput({
      type: "system-command",
      command: "home",
      timestamp: 4
    }).handled).toBe(false);
  });

  it("lets a single-app runtime use service invalidation without recreating its root", () => {
    const calls = { appRender: 0, update: 0, measure: 0, render: 0 };
    const component: DisplayComponent<{ value: number }> = {
      kind: "single-app-probe",
      update() {
        calls.update += 1;
      },
      measure(ctx) {
        calls.measure += 1;
        return { width: ctx.constraints.maxWidth, height: 20 };
      },
      render() {
        calls.render += 1;
        return [];
      }
    };
    const app = defineTouchApp<number>({
      manifest: { id: "test.single", name: "Single", version: "1.0.0" },
      createApp() {
        return {
          render(state) {
            calls.appRender += 1;
            return createNode("probe", component, { value: state });
          }
        };
      }
    });
    const theme = createThemeService();
    const runtime = createTouchAppRuntime({
      app,
      state: 1,
      surface: { width: 100, height: 60 },
      services: { theme }
    });

    const first = runtime.render();
    expect(runtime.render().revision).toBe(first.revision);
    expect(calls).toEqual({ appRender: 1, update: 0, measure: 1, render: 1 });

    theme.update({ textColor: "#abcdef" });
    runtime.render();
    expect(calls).toEqual({ appRender: 1, update: 0, measure: 1, render: 2 });

    runtime.resize({ width: 100, height: 60 });
    runtime.render();
    expect(calls.appRender).toBe(1);

    runtime.setAppState(2);
    runtime.render();
    expect(calls).toEqual({ appRender: 2, update: 1, measure: 2, render: 3 });
  });

  it("preserves current pointer identity, type, pressure, and modifiers", () => {
    const events: DisplayEvent[] = [];
    const component: DisplayComponent<Record<string, never>> = {
      kind: "metadata-probe",
      measure() {
        return { width: 80, height: 40 };
      },
      hitTest(ctx) {
        return { targetId: `${ctx.id}:face` };
      },
      handleEvent(ctx) {
        if ("pointerId" in ctx.event) {
          events.push(ctx.event);
        }
      }
    };
    const runtime = createRuntime({
      root: createNode("probe", component, {}),
      surface: { width: 100, height: 60 }
    });
    runtime.render();

    runtime.dispatchInput({
      type: "pointer-move",
      pointerId: "ray-left",
      pointerType: "ray",
      pressure: 0.2,
      modifiers: { altKey: false, ctrlKey: false, metaKey: false, shiftKey: true },
      surfaceX: 10,
      surfaceY: 10,
      timestamp: 1
    });
    runtime.dispatchInput({
      type: "pointer-down",
      pointerId: "ray-left",
      pointerType: "controller",
      pressure: 0.3,
      modifiers: { altKey: false, ctrlKey: true, metaKey: false, shiftKey: false },
      surfaceX: 10,
      surfaceY: 10,
      timestamp: 2
    });
    runtime.dispatchInput({
      type: "pointer-move",
      pointerId: "ray-left",
      pointerType: "stylus",
      pressure: 0.7,
      modifiers: { altKey: true, ctrlKey: false, metaKey: false, shiftKey: false },
      surfaceX: 12,
      surfaceY: 10,
      timestamp: 3
    });
    runtime.dispatchInput({
      type: "scroll",
      pointerId: "ray-left",
      pointerType: "touch",
      pressure: 0.8,
      modifiers: { altKey: false, ctrlKey: false, metaKey: true, shiftKey: false },
      surfaceX: 12,
      surfaceY: 10,
      deltaX: 0,
      deltaY: 4,
      timestamp: 4
    });
    runtime.dispatchInput({
      type: "pointer-up",
      pointerId: "ray-left",
      pointerType: "mouse",
      pressure: 0.1,
      modifiers: { altKey: false, ctrlKey: false, metaKey: false, shiftKey: false },
      surfaceX: 12,
      surfaceY: 10,
      timestamp: 5
    });
    runtime.dispatchInput({
      type: "pointer-move",
      pointerId: "ray-left",
      pointerType: "gaze",
      pressure: 0.05,
      surfaceX: 105,
      surfaceY: 65,
      timestamp: 6
    });

    const find = (type: DisplayEvent["type"], timestamp: number) =>
      events.find((event) => event.type === type && event.timestamp === timestamp);
    expect(find("pointer-enter", 1)).toMatchObject({
      pointerId: "ray-left",
      pointerType: "ray",
      pressure: 0.2,
      modifiers: { shiftKey: true }
    });
    expect(find("pointer-down", 2)).toMatchObject({
      pointerId: "ray-left",
      pointerType: "controller",
      pressure: 0.3,
      modifiers: { ctrlKey: true }
    });
    expect(find("pointer-move", 3)).toMatchObject({
      pointerId: "ray-left",
      pointerType: "stylus",
      pressure: 0.7,
      modifiers: { altKey: true }
    });
    expect(find("scroll", 4)).toMatchObject({
      pointerId: "ray-left",
      pointerType: "touch",
      pressure: 0.8,
      modifiers: { metaKey: true }
    });
    expect(find("pointer-up", 5)).toMatchObject({
      pointerId: "ray-left",
      pointerType: "mouse",
      pressure: 0.1
    });
    expect(find("pointer-leave", 6)).toMatchObject({
      pointerId: "ray-left",
      pointerType: "gaze",
      pressure: 0.05
    });

    runtime.dispatchInput({
      type: "pointer-down",
      pointerId: "touch-right",
      pointerType: "touch",
      pressure: 0.4,
      surfaceX: 20,
      surfaceY: 20,
      timestamp: 7
    });
    runtime.dispatchInput({
      type: "pointer-move",
      pointerId: "touch-right",
      pointerType: "controller",
      pressure: 0.9,
      modifiers: { altKey: false, ctrlKey: true, metaKey: false, shiftKey: false },
      surfaceX: 20,
      surfaceY: 20,
      timestamp: 8
    });
    runtime.dispose();
    expect(find("cancel", 8)).toMatchObject({
      pointerId: "touch-right",
      pointerType: "controller",
      pressure: 0.9,
      modifiers: { ctrlKey: true }
    });
  });

  it("cancels active pointers on disposal and preserves resulting outputs", () => {
    const runtime = createRuntime({
      root: createHoldButton("hold", {
        label: "Hold",
        actionId: "hold.run",
        startPayload: { phase: "start" },
        stopPayload: { phase: "stop" }
      }),
      surface: { width: 120, height: 60 }
    });
    runtime.render();
    runtime.dispatchInput({
      type: "pointer-down",
      pointerId: "touch-1",
      pointerType: "touch",
      pressure: 0.6,
      surfaceX: 20,
      surfaceY: 20,
      timestamp: 10
    });
    expect(runtime.takeOutputs()).toContainEqual({
      type: "action",
      actionId: "hold.run",
      componentId: "hold",
      payload: { phase: "start" }
    });

    runtime.dispose();
    expect(runtime.takeOutputs()).toEqual([
      {
        type: "action",
        actionId: "hold.run",
        componentId: "hold",
        payload: { phase: "stop" }
      }
    ]);
    runtime.dispose();
    expect(runtime.takeOutputs()).toEqual([]);
  });

  it("lets ancestors consume raw outputs while retaining replacement outputs", () => {
    const action: RuntimeOutput = {
      type: "action",
      actionId: "child.run",
      componentId: "child"
    };
    const child: DisplayComponent<Record<string, never>> = {
      kind: "output-child",
      measure() {
        return { width: 60, height: 30 };
      },
      hitTest(ctx) {
        return { targetId: `${ctx.id}:face` };
      },
      handleEvent(ctx) {
        if (ctx.event.type === "press") {
          ctx.emit(action);
        }
      }
    };
    const parent: DisplayComponent<{ child: DisplayNode<unknown> }> = {
      kind: "output-parent",
      getChildren(ctx) {
        return [ctx.props.child];
      },
      measure(ctx) {
        return ctx.measureChild(ctx.props.child.id);
      },
      layout(ctx) {
        ctx.setChildBounds(ctx.props.child.id, ctx.bounds);
      },
      handleEvent(ctx) {
        if (ctx.event.type !== "action") {
          return;
        }
        ctx.consumeOutput();
        ctx.emit({
          type: "app-event",
          componentId: ctx.id,
          appId: "app",
          instanceId: "instance",
          windowId: "window",
          event: { type: "app-action", name: "run" }
        });
      }
    };
    const runtime = createRuntime({
      root: createNode("parent", parent, {
        child: createNode("child", child, {})
      }),
      surface: { width: 100, height: 60 }
    });
    runtime.render();
    runtime.dispatchInput({
      type: "pointer-down",
      surfaceX: 10,
      surfaceY: 10,
      timestamp: 1
    });
    runtime.dispatchInput({
      type: "pointer-up",
      surfaceX: 10,
      surfaceY: 10,
      timestamp: 2
    });

    expect(runtime.takeOutputs()).toEqual([
      {
        type: "app-event",
        componentId: "parent",
        appId: "app",
        instanceId: "instance",
        windowId: "window",
        event: { type: "app-action", name: "run" }
      }
    ]);
  });
});

describe("nested clip hardening", () => {
  it("preserves partial intersections for rendering and hit testing", () => {
    const runtime = createRuntime({
      root: createClipTree(
        { x: 0, y: 0, width: 30, height: 30 },
        { x: 10, y: 10, width: 30, height: 30 }
      ),
      surface: { width: 60, height: 60 }
    });

    const snapshot = runtime.render();
    expect(snapshot.commands).toHaveLength(1);
    expect(snapshot.commands[0]?.clipRect).toEqual({ x: 10, y: 10, width: 20, height: 20 });
    expect(runtime.dispatchInput({
      type: "pointer-down",
      surfaceX: 15,
      surfaceY: 15,
      timestamp: 1
    }).handled).toBe(true);
    expect(runtime.dispatchInput({
      type: "pointer-down",
      pointerId: "outside",
      surfaceX: 35,
      surfaceY: 15,
      timestamp: 2
    }).handled).toBe(false);
  });

  it.each([
    ["edge-touching", { x: 30, y: 0, width: 10, height: 10 }],
    ["fully disjoint", { x: 40, y: 40, width: 10, height: 10 }]
  ])("keeps %s nested intersections empty", (_label, innerClip: Rect) => {
    const runtime = createRuntime({
      root: createClipTree({ x: 0, y: 0, width: 30, height: 30 }, innerClip),
      surface: { width: 60, height: 60 }
    });

    expect(runtime.render().commands).toEqual([]);
    expect(runtime.dispatchInput({
      type: "pointer-down",
      surfaceX: innerClip.x + 1,
      surfaceY: innerClip.y + 1,
      timestamp: 1
    }).handled).toBe(false);
  });
});

const passiveComponent: DisplayComponent<Record<string, never>> = {
  kind: "passive",
  measure(ctx) {
    return { width: ctx.constraints.maxWidth, height: ctx.constraints.maxHeight };
  },
  render() {
    return [];
  }
};

interface ClipNodeProps {
  clip: Rect;
  child?: DisplayNode<unknown>;
}

const clipNodeComponent: DisplayComponent<ClipNodeProps> = {
  kind: "clip-node",
  getChildren(ctx) {
    return ctx.props.child ? [ctx.props.child] : [];
  },
  measure(ctx) {
    if (ctx.props.child) {
      ctx.measureChild(ctx.props.child.id);
    }
    return { width: ctx.constraints.maxWidth, height: ctx.constraints.maxHeight };
  },
  layout(ctx) {
    ctx.setClipRect(ctx.props.clip);
    if (ctx.props.child) {
      ctx.setChildBounds(ctx.props.child.id, ctx.bounds);
    }
  },
  render(ctx) {
    if (ctx.props.child) {
      return [];
    }
    return [{
      type: "rect",
      componentId: ctx.id,
      rect: ctx.bounds,
      fill: "#ffffff"
    }];
  },
  hitTest(ctx) {
    return ctx.props.child ? null : { targetId: `${ctx.id}:face` };
  }
};

function createClipTree(outerClip: Rect, innerClip: Rect): DisplayNode<ClipNodeProps> {
  return createNode("outer", clipNodeComponent, {
    clip: outerClip,
    child: createNode("middle", clipNodeComponent, {
      clip: innerClip,
      child: createNode("leaf", clipNodeComponent, { clip: innerClip })
    })
  });
}
