import { describe, expect, it } from "vitest";
import {
  createEmbeddedSurface,
  createRuntime,
  type DisplayEvent,
  type EmbeddedSurfaceAttachment,
  type EmbeddedSurfaceConfig,
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
        acceptsForwardedInput: true
      }),
      surface: { width: 320, height: 180 },
      services: { surfaces }
    });

    expect(surfaces.attachCalls).toContainEqual({
      componentId: "monitor",
      config: {
        sourceId: "camera.rear",
        interactive: true,
        acceptsForwardedInput: true
      }
    });

    const snapshot = runtime.render();
    expect(
      snapshot.commands.some(
        (command) => command.type === "surface" && command.role === "embedded-surface-viewport"
      )
    ).toBe(true);

    runtime.setRoot(
      createEmbeddedSurface("monitor", {
        sourceId: "camera.front",
        title: "Front Camera",
        interactive: false,
        acceptsForwardedInput: false
      })
    );
    runtime.render();

    expect(surfaces.configureCalls).toContainEqual({
      componentId: "monitor",
      config: {
        sourceId: "camera.front",
        interactive: false,
        acceptsForwardedInput: false
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
    expect(forwardedBeforeDismiss.every((event) => event.targetId === "monitor:viewport")).toBe(true);

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
});

function createMockEmbeddedSurfaceService(options?: {
  available?: boolean;
  handle?: unknown;
}): MockEmbeddedSurfaceService {
  const attachments = new Map<string, EmbeddedSurfaceAttachment>();
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
      desiredSourceType: fallback?.desiredSourceType,
      refreshPolicy: fallback?.refreshPolicy,
      acceptsForwardedInput: fallback?.acceptsForwardedInput ?? false,
      fallbackLabel: fallback?.fallbackLabel,
      available,
      handle,
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
    }
  };
}

function cloneDisplayEvent(event: DisplayEvent): DisplayEvent {
  return { ...event };
}
