import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  createNode,
  createRuntime,
  createBitmapService,
  type CanvasContextLike,
  type CanvasLike,
  type DisplayComponent,
  type SurfaceMetrics
} from "../src/index.js";
import { createScenePanelHost } from "../src/hosts/three.js";

class RecordingCanvasContext implements CanvasContextLike {
  fillStyle: string | CanvasGradient | CanvasPattern = "#000000";
  strokeStyle: string | CanvasGradient | CanvasPattern = "#000000";
  lineWidth = 1;
  font = "14px sans-serif";
  globalAlpha = 1;
  textAlign: "left" | "center" | "right" = "left";
  textBaseline: "top" | "middle" | "bottom" | "alphabetic" = "top";
  imageSmoothingEnabled = true;
  clipCount = 0;
  drawCalls: Array<{
    image: unknown;
    x: number;
    y: number;
    width: number;
    height: number;
    alpha: number;
    smoothing: boolean | undefined;
  }> = [];

  save(): void {}
  restore(): void {}
  setTransform(): void {}
  clearRect(): void {}
  beginPath(): void {}
  rect(): void {}
  clip(): void {
    this.clipCount += 1;
  }
  roundRect(): void {}
  fillRect(): void {}
  strokeRect(): void {}
  moveTo(): void {}
  lineTo(): void {}
  stroke(): void {}
  arc(): void {}
  fill(): void {}
  fillText(): void {}
  measureText(text: string) {
    return { width: text.length * 8 };
  }
  drawImage(image: unknown, x: number, y: number, width: number, height: number): void {
    this.drawCalls.push({
      image,
      x,
      y,
      width,
      height,
      alpha: this.globalAlpha,
      smoothing: this.imageSmoothingEnabled
    });
  }
}

describe("bitmap contracts", () => {
  it("allocates, updates, exposes metadata, and releases bitmap handles", () => {
    const bitmaps = createBitmapService();
    const initial = bitmaps.allocate("plot", {
      image: { kind: "image-a" },
      width: 64,
      height: 32
    });

    expect(initial.revision).toBe(0);
    expect(bitmaps.getMetadata("plot")).toEqual({
      width: 64,
      height: 32,
      revision: 0
    });

    const updated = bitmaps.update("plot", {
      image: { kind: "image-b" },
      width: 128
    });
    expect(updated?.revision).toBe(1);
    expect(bitmaps.getMetadata("plot")).toEqual({
      width: 128,
      height: 32,
      revision: 1
    });

    bitmaps.release("plot");
    expect(bitmaps.getHandle("plot")).toBeUndefined();
  });

  it("renders bitmap draw commands through the host canvas path", () => {
    const bitmapComponent: DisplayComponent<Record<string, never>> = {
      kind: "bitmap-probe",
      mount(ctx) {
        ctx.services.bitmaps.allocate("probe:bitmap", {
          image: { kind: "bitmap-image" },
          width: 80,
          height: 40
        });
      },
      measure() {
        return { width: 120, height: 120 };
      },
      render(ctx) {
        const handle = ctx.services.bitmaps.getHandle("probe:bitmap");
        if (!handle) {
          return [];
        }

        return [
          {
            type: "bitmap" as const,
            componentId: ctx.id,
            role: "bitmap-contain",
            rect: { x: 10, y: 10, width: 100, height: 100 },
            handle,
            fit: "contain" as const,
            clipRect: { x: 10, y: 10, width: 100, height: 100 }
          },
          {
            type: "bitmap" as const,
            componentId: ctx.id,
            role: "bitmap-cover",
            rect: { x: 10, y: 10, width: 100, height: 100 },
            handle,
            fit: "cover" as const,
            opacity: 0.4,
            sampling: "nearest" as const
          }
        ];
      },
      hitTest() {
        return null;
      },
      dispose(ctx) {
        ctx.services.bitmaps.release("probe:bitmap");
      }
    };

    const runtime = createRuntime({
      root: createNode("probe", bitmapComponent, {}),
      surface: { width: 160, height: 120 }
    });

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1.6, 0.1, 10);
    camera.position.set(0, 0, 1);
    camera.lookAt(0, 0, 0);
    scene.add(camera);

    const context = new RecordingCanvasContext();
    const canvas: CanvasLike = {
      width: 0,
      height: 0,
      getContext(type: "2d") {
        return type === "2d" ? context : null;
      }
    };

    const host = createScenePanelHost({
      runtime,
      surface: { width: 160, height: 120 },
      panelWidth: 1,
      panelHeight: 0.75,
      createCanvas(metrics: SurfaceMetrics) {
        canvas.width = metrics.width * metrics.pixelDensity;
        canvas.height = metrics.height * metrics.pixelDensity;
        return canvas;
      }
    });

    host.attach();
    host.update({ scene, camera });

    expect(context.drawCalls).toHaveLength(2);
    expect(context.drawCalls[0]).toMatchObject({
      width: 100,
      height: 50
    });
    expect(context.drawCalls[1]).toMatchObject({
      width: 200,
      height: 100,
      alpha: 0.4,
      smoothing: false
    });
    expect(context.clipCount).toBeGreaterThan(0);

    host.detach();
  });
});
