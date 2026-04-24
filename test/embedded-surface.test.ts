import { describe, expect, it } from "vitest";
import {
  createEmbeddedSurface,
  createRuntime,
  type DisplayEvent,
  type EmbeddedSurfaceAttachment,
  type EmbeddedSurfaceConfig,
  type EmbeddedSurfaceSourceSnapshot,
  type EmbeddedSurfaceService
} from "../src/index.js";
import { findCommandByRole, getTexts, pressAt } from "./helpers/runtime-helpers.js";

interface MockEmbeddedSurfaceService extends EmbeddedSurfaceService {
  readonly attachCalls: ReadonlyArray<{ componentId: string; config: EmbeddedSurfaceConfig }>;
  readonly configureCalls: ReadonlyArray<{ componentId: string; config: Partial<EmbeddedSurfaceConfig> }>;
  readonly releaseCalls: readonly string[];
}

describe("embedded surface", () => {
  it("attaches, reconfigures, renders a surface draw command, and releases host resources", () => {
    const surfaces = createMockEmbeddedSurfaceService({
      available: true,
      handle: { kind: "mock-surface" }
    });

    const runtime = createRuntime({
      root: createEmbeddedSurface("monitor", {
        sourceId: "camera.rear",
        title: "Rear Camera",
        interactive: true,
        acceptsForwardedInput: true,
        mirrorX: true
      }),
      surface: { width: 320, height: 180 },
      services: { surfaces }
    });

    expect(surfaces.attachCalls).toContainEqual({
      componentId: "monitor",
      config: {
        sourceId: "camera.rear",
        interactive: true,
        acceptsForwardedInput: true,
        mirrorX: true
      }
    });

    const snapshot = runtime.render();
    expect(
      snapshot.commands.some(
        (command) =>
          command.type === "surface" &&
          command.role === "embedded-surface-viewport" &&
          command.mirrorX === true &&
          command.sourceId === "camera.rear" &&
          command.surfaceRevision === 0
      )
    ).toBe(true);

    runtime.setRoot(
      createEmbeddedSurface("monitor", {
        sourceId: "camera.front",
        title: "Front Camera",
        interactive: false,
        acceptsForwardedInput: false,
        mirrorX: false
      })
    );
    runtime.render();

    expect(surfaces.configureCalls).toContainEqual({
      componentId: "monitor",
      config: {
        sourceId: "camera.front",
        interactive: false,
        acceptsForwardedInput: false,
        mirrorX: false
      }
    });

    runtime.dispose();
    expect(surfaces.releaseCalls).toContain("monitor");
  });

  it("renders fallback content when the embedded source is unavailable", () => {
    const surfaces = createMockEmbeddedSurfaceService({
      available: false
    });

    const runtime = createRuntime({
      root: createEmbeddedSurface("monitor", {
        sourceId: "camera.rear",
        fallbackLabel: "Camera Offline"
      }),
      surface: { width: 320, height: 180 },
      services: { surfaces }
    });

    const texts = getTexts(runtime.render().commands);
    expect(texts).toContain("Camera Offline");
  });

  it("forwards viewport input while keeping shell controls local to the component", () => {
    const surfaces = createMockEmbeddedSurfaceService({
      available: true,
      handle: { kind: "mock-surface" }
    });

    const runtime = createRuntime({
      root: createEmbeddedSurface("monitor", {
        sourceId: "camera.rear",
        interactive: true,
        acceptsForwardedInput: true,
        dismissible: true,
        dismissActionId: "surface.close"
      }),
      surface: { width: 320, height: 180 },
      services: { surfaces }
    });

    const snapshot = runtime.render();
    const viewport = findCommandByRole(snapshot.commands, "embedded-surface-viewport");
    if (viewport.type !== "surface") {
      throw new Error("Expected the embedded viewport to render as a surface command.");
    }

    pressAt(
      runtime,
      viewport.rect.x + viewport.rect.width / 2,
      viewport.rect.y + viewport.rect.height / 2
    );

    const forwardedBeforeDismiss = surfaces.getAttachment("monitor")?.forwardedEvents ?? [];
    expect(forwardedBeforeDismiss.map((event) => event.type)).toEqual(["pointer-down", "press"]);
    expect(
      forwardedBeforeDismiss.every(
        (event) => "targetId" in event && event.targetId === "monitor:viewport"
      )
    ).toBe(true);

    const dismiss = findCommandByRole(snapshot.commands, "embedded-surface-dismiss");
    if (dismiss.type !== "circle") {
      throw new Error("Expected the dismiss affordance to render as a circle.");
    }

    const result = pressAt(runtime, dismiss.cx, dismiss.cy, 10);
    expect(result.outputs).toContainEqual({
      type: "action",
      actionId: "surface.close",
      componentId: "monitor"
    });

    const forwardedAfterDismiss = surfaces.getAttachment("monitor")?.forwardedEvents ?? [];
    expect(forwardedAfterDismiss).toHaveLength(forwardedBeforeDismiss.length);
  });

  it("supports explicit composition mode and host-reported surface metadata", () => {
    const surfaces = createMockEmbeddedSurfaceService();

    const runtime = createRuntime({
      root: createEmbeddedSurface("monitor", {
        sourceId: "camera.rear",
        compositionMode: "composite"
      }),
      surface: { width: 320, height: 180 },
      services: { surfaces }
    });

    surfaces.publish("camera.rear", {
      available: true,
      handle: { kind: "mock-surface" },
      sourceWidth: 640,
      sourceHeight: 480,
      latencyMs: 12,
      refreshState: "updating",
      lastFrameTimestamp: 24
    });

    const snapshot = runtime.render();
    const viewport = findCommandByRole(snapshot.commands, "embedded-surface-viewport");
    if (viewport.type !== "surface") {
      throw new Error("Expected the embedded viewport to render as a surface command.");
    }

    expect(viewport.compositionMode).toBe("composite");
    expect(viewport.mirrorX).toBe(false);
    expect(viewport.sourceId).toBe("camera.rear");
    expect(viewport.surfaceRevision).toBe(1);
    expect(surfaces.getAttachment("monitor")).toMatchObject({
      sourceWidth: 640,
      sourceHeight: 480,
      aspectRatio: 640 / 480,
      latencyMs: 12,
      refreshState: "updating",
      lastFrameTimestamp: 24
    });
  });

  it("centers preserved-aspect viewports using contain-style letterboxing", () => {
    const surfaces = createMockEmbeddedSurfaceService({
      available: true,
      handle: { kind: "mock-surface" }
    });

    const runtime = createRuntime({
      root: createEmbeddedSurface("mirror", {
        sourceId: "camera.rear",
        preserveAspectRatio: true
      }),
      surface: { width: 320, height: 180 },
      services: { surfaces }
    });

    surfaces.publish("camera.rear", {
      available: true,
      handle: { kind: "mock-surface" },
      sourceWidth: 640,
      sourceHeight: 360
    });

    const snapshot = runtime.render();
    const viewport = findCommandByRole(snapshot.commands, "embedded-surface-viewport");
    if (viewport.type !== "surface") {
      throw new Error("Expected the embedded viewport to render as a surface command.");
    }

    expect(viewport.rect.width).toBeCloseTo(277.3333333333, 5);
    expect(viewport.rect.height).toBeCloseTo(156, 5);
    expect(viewport.rect.x).toBeCloseTo(21.3333333333, 5);
    expect(viewport.rect.y).toBeCloseTo(12, 5);
  });

  it("marks a surface viewport as horizontally mirrored when requested", () => {
    const surfaces = createMockEmbeddedSurfaceService({
      available: true,
      handle: { kind: "mock-surface" }
    });

    const runtime = createRuntime({
      root: createEmbeddedSurface("mirror", {
        sourceId: "camera.rear",
        mirrorX: true
      }),
      surface: { width: 320, height: 180 },
      services: { surfaces }
    });

    const snapshot = runtime.render();
    const viewport = findCommandByRole(snapshot.commands, "embedded-surface-viewport");
    if (viewport.type !== "surface") {
      throw new Error("Expected the embedded viewport to render as a surface command.");
    }

    expect(viewport.mirrorX).toBe(true);
    expect(surfaces.getAttachment("mirror")?.mirrorX).toBe(true);
  });

  it("does not claim or forward input for a non-interactive mirror", () => {
    const surfaces = createMockEmbeddedSurfaceService({
      available: true,
      handle: { kind: "mock-surface" }
    });

    const runtime = createRuntime({
      root: createEmbeddedSurface("mirror", {
        sourceId: "camera.rear",
        interactive: false,
        acceptsForwardedInput: false
      }),
      surface: { width: 320, height: 180 },
      services: { surfaces }
    });

    runtime.render();
    const result = pressAt(runtime, 160, 90);

    expect(result.handled).toBe(false);
    expect(result.outputs).toHaveLength(0);
    expect(runtime.getInteraction().focusedComponentId).toBeUndefined();
    expect(surfaces.getAttachment("mirror")?.forwardedEvents).toHaveLength(0);
  });
});

function createMockEmbeddedSurfaceService(options?: {
  available?: boolean;
  handle?: unknown;
}): MockEmbeddedSurfaceService {
  const attachments = new Map<string, EmbeddedSurfaceAttachment>();
  const sources = new Map<string, EmbeddedSurfaceSourceSnapshot>();
  const attachCalls: Array<{ componentId: string; config: EmbeddedSurfaceConfig }> = [];
  const configureCalls: Array<{ componentId: string; config: Partial<EmbeddedSurfaceConfig> }> = [];
  const releaseCalls: string[] = [];
  const available = options?.available ?? false;
  const handle = options?.handle;

  function resolveAttachment(
    componentId: string,
    fallback?: Partial<EmbeddedSurfaceConfig>
  ): EmbeddedSurfaceAttachment {
    const existing = attachments.get(componentId);
    if (existing) {
      return existing;
    }

    const created: EmbeddedSurfaceAttachment = {
      sourceId: fallback?.sourceId ?? componentId,
      interactive: fallback?.interactive ?? false,
      preserveAspectRatio: fallback?.preserveAspectRatio ?? true,
      mirrorX: fallback?.mirrorX ?? false,
      desiredSourceType: fallback?.desiredSourceType,
      refreshPolicy: fallback?.refreshPolicy,
      acceptsForwardedInput: fallback?.acceptsForwardedInput ?? false,
      fallbackLabel: fallback?.fallbackLabel,
      available,
      handle,
      compositionMode: fallback?.compositionMode ?? "copy",
      sourceWidth: undefined,
      sourceHeight: undefined,
      aspectRatio: undefined,
      latencyMs: undefined,
      refreshState: "idle",
      lastFrameTimestamp: undefined,
      sourceType: undefined,
      surfaceRevision: 0,
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
      available,
      handle,
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

  function getAttachmentSnapshot(componentId: string): EmbeddedSurfaceAttachment | undefined {
    const attachment = attachments.get(componentId);
    if (!attachment) {
      return undefined;
    }

    const source = sources.get(attachment.sourceId);
    return {
      ...attachment,
      available: source?.available ?? attachment.available,
      handle: source?.handle ?? attachment.handle,
      sourceWidth: source?.sourceWidth ?? attachment.sourceWidth,
      sourceHeight: source?.sourceHeight ?? attachment.sourceHeight,
      aspectRatio: source?.aspectRatio ?? attachment.aspectRatio,
      latencyMs: source?.latencyMs ?? attachment.latencyMs,
      refreshState: source?.refreshState ?? attachment.refreshState,
      lastFrameTimestamp: source?.lastFrameTimestamp ?? attachment.lastFrameTimestamp,
      sourceType: source?.sourceType ?? attachment.sourceType,
      surfaceRevision: source?.surfaceRevision ?? attachment.surfaceRevision,
      forwardedEvents: [...attachment.forwardedEvents]
    };
  }

  function publishSource(sourceId: string, state: Parameters<EmbeddedSurfaceService["publish"]>[1]): void {
    const source = resolveSource(sourceId);
    const sourceWidth = state.sourceWidth === undefined ? source.sourceWidth : state.sourceWidth;
    const sourceHeight = state.sourceHeight === undefined ? source.sourceHeight : state.sourceHeight;
    sources.set(sourceId, {
      ...source,
      available: state.available ?? source.available,
      handle: state.handle ?? source.handle,
      sourceWidth,
      sourceHeight,
      aspectRatio:
        state.aspectRatio ??
        (sourceWidth && sourceHeight ? sourceWidth / sourceHeight : source.aspectRatio),
      latencyMs: state.latencyMs ?? source.latencyMs,
      refreshState: state.refreshState ?? source.refreshState,
      lastFrameTimestamp: state.lastFrameTimestamp ?? source.lastFrameTimestamp,
      sourceType: state.sourceType ?? source.sourceType,
      surfaceRevision: source.surfaceRevision + 1
    });
  }

  return {
    attachCalls,
    configureCalls,
    releaseCalls,
    attach(componentId, config) {
      attachCalls.push({
        componentId,
        config: { ...config }
      });
      attachments.set(componentId, resolveAttachment(componentId, config));
    },
    configure(componentId, config) {
      configureCalls.push({
        componentId,
        config: { ...config }
      });
      const attachment = resolveAttachment(componentId);
      attachments.set(componentId, updateAttachment(attachment, config));
    },
    release(componentId) {
      releaseCalls.push(componentId);
      attachments.delete(componentId);
    },
    subscribe() {
      return () => {};
    },
    getAttachment(componentId) {
      return getAttachmentSnapshot(componentId);
    },
    getSource(sourceId) {
      const source = sources.get(sourceId);
      return source ? { ...source } : undefined;
    },
    isAvailable(componentId) {
      return getAttachmentSnapshot(componentId)?.available ?? false;
    },
    getHandle(componentId) {
      return getAttachmentSnapshot(componentId)?.handle;
    },
    publish(sourceId, state) {
      publishSource(sourceId, state);
    },
    unpublish(sourceId) {
      sources.delete(sourceId);
    },
    setState(componentId, state) {
      const attachment = attachments.get(componentId);
      publishSource(attachment?.sourceId ?? componentId, state);
    },
    forwardEvent(componentId, event) {
      const attachment = resolveAttachment(componentId);
      attachments.set(componentId, {
        ...attachment,
        forwardedEvents: [...attachment.forwardedEvents, cloneDisplayEvent(event)]
      });
    }
  };
}

function cloneDisplayEvent(event: DisplayEvent): DisplayEvent {
  return { ...event };
}
