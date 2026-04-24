import { describe, expect, it } from "vitest";
import {
  createColumn,
  createEmbeddedSurface,
  createEmbeddedSurfaceService,
  createRuntime
} from "../src/index.js";
import { findCommandByRole } from "./helpers/runtime-helpers.js";

describe("embedded surface sources", () => {
  it("binds a source published before mount and exposes source metadata on the viewport command", () => {
    const surfaces = createEmbeddedSurfaceService();
    surfaces.publish("plot.main", {
      available: true,
      handle: { kind: "gpu-surface" },
      sourceWidth: 800,
      sourceHeight: 400,
      lastFrameTimestamp: 12,
      refreshState: "updating",
      sourceType: "gpu-surface"
    });

    const runtime = createRuntime({
      root: createEmbeddedSurface("monitor", {
        sourceId: "plot.main",
        compositionMode: "composite"
      }),
      surface: { width: 320, height: 180 },
      services: { surfaces }
    });

    const snapshot = runtime.render();
    const viewport = findCommandByRole(snapshot.commands, "embedded-surface-viewport");
    if (viewport.type !== "surface") {
      throw new Error("Expected the embedded viewport to render as a surface command.");
    }

    expect(viewport.sourceId).toBe("plot.main");
    expect(viewport.surfaceRevision).toBe(1);
    expect(surfaces.getSource("plot.main")).toMatchObject({
      sourceWidth: 800,
      sourceHeight: 400,
      aspectRatio: 2,
      lastFrameTimestamp: 12,
      sourceType: "gpu-surface",
      surfaceRevision: 1
    });
    expect(surfaces.getAttachment("monitor")).toMatchObject({
      sourceId: "plot.main",
      available: true,
      sourceWidth: 800,
      sourceHeight: 400,
      surfaceRevision: 1
    });
  });

  it("reuses one published source across multiple presentations and supports rebinding", () => {
    const surfaces = createEmbeddedSurfaceService();
    const sourceAHandle = { kind: "source-a" };
    const sourceBHandle = { kind: "source-b" };
    surfaces.publish("plot.shared", {
      available: true,
      handle: sourceAHandle,
      sourceWidth: 1024,
      sourceHeight: 512
    });
    surfaces.publish("plot.alt", {
      available: true,
      handle: sourceBHandle,
      sourceWidth: 512,
      sourceHeight: 512
    });

    const runtime = createRuntime({
      root: createColumn("root", {
        children: [
          createEmbeddedSurface("primary", { sourceId: "plot.shared" }),
          createEmbeddedSurface("preview", { sourceId: "plot.shared" })
        ]
      }),
      surface: { width: 360, height: 320 },
      services: { surfaces }
    });

    runtime.render();
    expect(surfaces.getAttachment("primary")?.handle).toBe(sourceAHandle);
    expect(surfaces.getAttachment("preview")?.handle).toBe(sourceAHandle);

    runtime.setRoot(
      createColumn("root", {
        children: [
          createEmbeddedSurface("primary", { sourceId: "plot.alt" }),
          createEmbeddedSurface("preview", { sourceId: "plot.shared" })
        ]
      })
    );

    runtime.render();
    expect(surfaces.getAttachment("primary")).toMatchObject({
      sourceId: "plot.alt",
      handle: sourceBHandle
    });
    expect(surfaces.getAttachment("preview")).toMatchObject({
      sourceId: "plot.shared",
      handle: sourceAHandle
    });
  });

  it("unpublishes shared sources cleanly and increments the published surface revision", () => {
    const surfaces = createEmbeddedSurfaceService();
    surfaces.publish("plot.shared", {
      available: true,
      handle: { kind: "source-a" },
      sourceWidth: 640,
      sourceHeight: 320
    });

    const runtime = createRuntime({
      root: createColumn("root", {
        children: [
          createEmbeddedSurface("primary", {
            sourceId: "plot.shared",
            fallbackLabel: "Primary offline"
          }),
          createEmbeddedSurface("preview", {
            sourceId: "plot.shared",
            fallbackLabel: "Preview offline"
          })
        ]
      }),
      surface: { width: 360, height: 320 },
      services: { surfaces }
    });

    let snapshot = runtime.render();
    expect(
      snapshot.commands.filter(
        (command) => command.type === "surface" && command.role === "embedded-surface-viewport"
      )
    ).toHaveLength(2);

    surfaces.publish("plot.shared", {
      lastFrameTimestamp: 20
    });

    snapshot = runtime.render();
    const revisions = snapshot.commands
      .filter(
        (command): command is Extract<(typeof snapshot.commands)[number], { type: "surface" }> =>
          command.type === "surface"
      )
      .map((command) => command.surfaceRevision);
    expect(revisions).toEqual([2, 2]);

    surfaces.unpublish("plot.shared");

    snapshot = runtime.render();
    expect(
      snapshot.commands.filter(
        (command) => command.type === "surface" && command.role === "embedded-surface-viewport"
      )
    ).toHaveLength(0);
    expect(surfaces.getAttachment("primary")).toMatchObject({
      available: false,
      sourceId: "plot.shared"
    });
    expect(surfaces.getAttachment("preview")).toMatchObject({
      available: false,
      sourceId: "plot.shared"
    });
  });

  it("only invalidates runtimes that reference the changed source", () => {
    const surfaces = createEmbeddedSurfaceService();
    const plotRuntime = createRuntime({
      root: createEmbeddedSurface("plot-panel", {
        sourceId: "plot.main",
        fallbackLabel: "Plot offline"
      }),
      surface: { width: 320, height: 180 },
      services: { surfaces }
    });
    const statusRuntime = createRuntime({
      root: createColumn("status-root", {
        children: []
      }),
      surface: { width: 320, height: 180 },
      services: { surfaces }
    });

    plotRuntime.render();
    statusRuntime.render();
    expect(plotRuntime.isRenderDirty()).toBe(false);
    expect(statusRuntime.isRenderDirty()).toBe(false);

    surfaces.publish("plot.main", {
      available: true,
      handle: { kind: "plot-surface" },
      sourceWidth: 800,
      sourceHeight: 400
    });

    expect(plotRuntime.isRenderDirty()).toBe(true);
    expect(statusRuntime.isRenderDirty()).toBe(false);
  });
});
