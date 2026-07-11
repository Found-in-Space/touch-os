import * as THREE from "three";
import {
  createNode,
  createRuntime,
  type DisplayComponent,
  type RenderSnapshot
} from "../../../src/core/index.js";
import { createScrollContainer } from "../../../src/containers/index.js";
import { createScenePanelHost } from "../../../src/hosts/three.js";
import { drawRenderSnapshotToCanvasContext } from "../../../src/rendering/canvas-snapshot-renderer.js";

interface RenderFixtureResult {
  revision: number;
  dataUrl: string;
  logicalWidth: number;
  logicalHeight: number;
  backingWidth: number;
  backingHeight: number;
  buttonPixel: readonly number[];
  clippedInsidePixel: readonly number[];
  clippedOutsidePixel: readonly number[];
  bitmapLetterboxPixel: readonly number[];
  bitmapContentPixel: readonly number[];
  bitmapCoverLeftPixel: readonly number[];
  bitmapCoverRightPixel: readonly number[];
  bitmapStretchLeftPixel: readonly number[];
  bitmapStretchRightPixel: readonly number[];
  copiedSurfacePixel: readonly number[];
  nestedScrollFirstPixel: readonly number[];
  nestedScrollSecondPixel: readonly number[];
  nestedClipOutsidePixel: readonly number[];
  animatedSurfacePixel: readonly number[];
  animatedRevision: number;
  textInkPixels: number;
  transparentEdgePixel: readonly number[];
  logicalResize: LogicalResizeResult;
}

interface LogicalResizeResult {
  canvasReused: boolean;
  initialBackingWidth: number;
  initialBackingHeight: number;
  resizedBackingWidth: number;
  resizedBackingHeight: number;
  logicalWidth: number;
  logicalHeight: number;
  pixelDensity: number;
}

interface RenderFixtureApi {
  readonly readyRevision: number;
  render(pixelDensity: 1 | 2): RenderFixtureResult;
}

declare global {
  interface Window {
    __TOUCH_OS_RENDER_FIXTURE__?: RenderFixtureApi;
  }
}

const ScrollBlockComponent: DisplayComponent<{ fill: string }> = {
  kind: "browser-scroll-block",
  measure(ctx) {
    return { width: ctx.constraints.maxWidth, height: 32 };
  },
  render(ctx) {
    return [{
      type: "rect",
      componentId: ctx.id,
      rect: ctx.bounds,
      fill: ctx.props.fill
    }];
  }
};

const logicalWidth = 320;
const logicalHeight = 300;
const canvas = document.querySelector<HTMLCanvasElement>("#render-fixture");
if (!canvas) {
  throw new Error("Rendering fixture canvas is missing.");
}

let revision = 0;
let animatedRevision = 0;
const stableAnimatedRevision = 3;
const logicalResize = verifyLogicalResizeWithStableBackingSize();

window.__TOUCH_OS_RENDER_FIXTURE__ = {
  get readyRevision() {
    return animatedRevision;
  },
  render(pixelDensity) {
    revision += 1;
    canvas.width = logicalWidth * pixelDensity;
    canvas.height = logicalHeight * pixelDensity;
    canvas.style.width = `${logicalWidth}px`;
    canvas.style.height = `${logicalHeight}px`;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Rendering fixture could not acquire a Canvas 2D context.");
    }

    context.setTransform(pixelDensity, 0, 0, pixelDensity, 0, 0);
    context.clearRect(0, 0, logicalWidth, logicalHeight);
    const bitmapSource = createBitmapSource();
    const scrolledSnapshot = createScrolledSnapshot();
    const snapshot: RenderSnapshot = {
      revision,
      sharedSurfaceRevision: 1,
      commands: [
        {
          type: "rect",
          componentId: "button",
          role: "button-background",
          rect: { x: 16, y: 16, width: 128, height: 44 },
          fill: "#2563eb",
          radius: 8
        },
        {
          type: "text",
          componentId: "button",
          role: "button-label",
          rect: { x: 24, y: 16, width: 112, height: 44 },
          text: "A deliberately long control label",
          color: "#ffffff",
          align: "center",
          verticalAlign: "middle",
          fontFamily: "ui-monospace, monospace",
          fontSize: 14,
          fontWeight: 600,
          overflow: "ellipsis"
        },
        {
          type: "rect",
          componentId: "clipped",
          role: "nested-clipped-content",
          rect: { x: 0, y: 76, width: 150, height: 48 },
          fill: "#dc2626",
          clipRect: { x: 24, y: 84, width: 90, height: 28 }
        },
        {
          type: "bitmap",
          componentId: "bitmap-contain",
          rect: { x: 16, y: 144, width: 64, height: 60 },
          handle: {
            kind: "bitmap",
            image: bitmapSource,
            width: bitmapSource.width,
            height: bitmapSource.height,
            revision: 1
          },
          fit: "contain"
        },
        {
          type: "bitmap",
          componentId: "bitmap-cover",
          rect: { x: 92, y: 144, width: 64, height: 60 },
          handle: {
            kind: "bitmap",
            image: bitmapSource,
            width: bitmapSource.width,
            height: bitmapSource.height,
            revision: 1
          },
          fit: "cover"
        },
        {
          type: "bitmap",
          componentId: "bitmap-stretch",
          rect: { x: 168, y: 144, width: 64, height: 60 },
          handle: {
            kind: "bitmap",
            image: bitmapSource,
            width: bitmapSource.width,
            height: bitmapSource.height,
            revision: 1
          },
          fit: "stretch"
        },
        {
          type: "surface",
          componentId: "copied-surface",
          rect: { x: 208, y: 76, width: 88, height: 48 },
          compositionMode: "copy",
          handle: {
            draw(target: CanvasRenderingContext2D, rect: DOMRect) {
              target.fillStyle = "#16a34a";
              target.fillRect(rect.x, rect.y, rect.width, rect.height);
            }
          }
        },
        {
          type: "surface",
          componentId: "stable-animated-surface",
          rect: { x: 244, y: 144, width: 52, height: 60 },
          compositionMode: "copy",
          surfaceRevision: animatedRevision,
          handle: {
            draw(target: CanvasRenderingContext2D, rect: DOMRect) {
              target.fillStyle = animatedRevision >= stableAnimatedRevision ? "#0891b2" : "#e11d48";
              target.fillRect(rect.x, rect.y, rect.width, rect.height);
            }
          }
        },
        {
          type: "surface",
          componentId: "nested-scroll-surface",
          rect: { x: 16, y: 220, width: 280, height: 64 },
          clipRect: { x: 28, y: 224, width: 240, height: 56 },
          compositionMode: "copy",
          handle: {
            kind: "touch-os-render-snapshot",
            width: 140,
            height: 64,
            snapshot: scrolledSnapshot
          }
        }
      ]
    };

    drawRenderSnapshotToCanvasContext(context, snapshot, {
      sourceWidth: logicalWidth,
      sourceHeight: logicalHeight
    });

    return {
      revision,
      dataUrl: canvas.toDataURL("image/png"),
      logicalWidth,
      logicalHeight,
      backingWidth: canvas.width,
      backingHeight: canvas.height,
      buttonPixel: readPixel(context, pixelDensity, 20, 20),
      clippedInsidePixel: readPixel(context, pixelDensity, 30, 90),
      clippedOutsidePixel: readPixel(context, pixelDensity, 8, 90),
      bitmapLetterboxPixel: readPixel(context, pixelDensity, 24, 148),
      bitmapContentPixel: readPixel(context, pixelDensity, 24, 176),
      bitmapCoverLeftPixel: readPixel(context, pixelDensity, 100, 176),
      bitmapCoverRightPixel: readPixel(context, pixelDensity, 148, 176),
      bitmapStretchLeftPixel: readPixel(context, pixelDensity, 176, 176),
      bitmapStretchRightPixel: readPixel(context, pixelDensity, 224, 176),
      copiedSurfacePixel: readPixel(context, pixelDensity, 220, 90),
      nestedScrollFirstPixel: readPixel(context, pixelDensity, 40, 230),
      nestedScrollSecondPixel: readPixel(context, pixelDensity, 40, 270),
      nestedClipOutsidePixel: readPixel(context, pixelDensity, 20, 230),
      animatedSurfacePixel: readPixel(context, pixelDensity, 260, 176),
      animatedRevision,
      textInkPixels: countNonBackgroundPixels(
        context,
        pixelDensity,
        { x: 24, y: 16, width: 112, height: 44 },
        [37, 99, 235, 255]
      ),
      transparentEdgePixel: readPixel(context, pixelDensity, 310, 290),
      logicalResize
    };
  }
};

requestAnimationFrame(advanceAnimatedSurface);

function advanceAnimatedSurface(): void {
  animatedRevision += 1;
  if (animatedRevision < stableAnimatedRevision) {
    requestAnimationFrame(advanceAnimatedSurface);
  }
}

function createBitmapSource(): HTMLCanvasElement {
  const source = document.createElement("canvas");
  source.width = 80;
  source.height = 40;
  const context = source.getContext("2d");
  if (!context) {
    throw new Error("Rendering fixture could not create its bitmap source.");
  }
  context.fillStyle = "#f59e0b";
  context.fillRect(0, 0, 40, 40);
  context.fillStyle = "#7c3aed";
  context.fillRect(40, 0, 40, 40);
  return source;
}

function readPixel(
  context: CanvasRenderingContext2D,
  pixelDensity: number,
  logicalX: number,
  logicalY: number
): readonly number[] {
  return [...context.getImageData(
    Math.floor(logicalX * pixelDensity),
    Math.floor(logicalY * pixelDensity),
    1,
    1
  ).data];
}

function countNonBackgroundPixels(
  context: CanvasRenderingContext2D,
  pixelDensity: number,
  rect: { x: number; y: number; width: number; height: number },
  background: readonly [number, number, number, number]
): number {
  const image = context.getImageData(
    Math.floor(rect.x * pixelDensity),
    Math.floor(rect.y * pixelDensity),
    Math.floor(rect.width * pixelDensity),
    Math.floor(rect.height * pixelDensity)
  );
  let count = 0;
  for (let index = 0; index < image.data.length; index += 4) {
    if (
      image.data[index] !== background[0] ||
      image.data[index + 1] !== background[1] ||
      image.data[index + 2] !== background[2] ||
      image.data[index + 3] !== background[3]
    ) {
      count += 1;
    }
  }
  return count;
}

function createScrolledSnapshot(): RenderSnapshot {
  const runtime = createRuntime({
    root: createScrollContainer("browser-scroll", {
      gap: 0,
      padding: 0,
      scrollbar: "hidden",
      children: [
        createNode("browser-scroll-red", ScrollBlockComponent, { fill: "#dc2626" }),
        createNode("browser-scroll-green", ScrollBlockComponent, { fill: "#16a34a" }),
        createNode("browser-scroll-blue", ScrollBlockComponent, { fill: "#2563eb" })
      ]
    }),
    surface: { width: 140, height: 64 }
  });
  runtime.render();
  runtime.dispatchInput({
    type: "scroll",
    surfaceX: 20,
    surfaceY: 20,
    deltaX: 0,
    deltaY: 32,
    timestamp: 1
  });
  const snapshot = runtime.render();
  runtime.dispose();
  return snapshot;
}

function verifyLogicalResizeWithStableBackingSize(): LogicalResizeResult {
  const runtime = createRuntime({
    root: createNode("logical-resize", ScrollBlockComponent, { fill: "#0f172a" }),
    surface: { width: 160, height: 100, pixelDensity: 2 }
  });
  const scene = new THREE.Scene();
  const host = createScenePanelHost({ runtime });
  host.attach();
  host.update({ timestamp: 1, scene });
  const initialCanvas = host.canvas;
  const initialBackingWidth = initialCanvas.width;
  const initialBackingHeight = initialCanvas.height;
  host.update({
    timestamp: 2,
    scene,
    surfaceMetrics: { width: 320, height: 200, pixelDensity: 1 }
  });
  const metrics = host.getSurfaceMetrics();
  const result = {
    canvasReused: host.canvas === initialCanvas,
    initialBackingWidth,
    initialBackingHeight,
    resizedBackingWidth: host.canvas.width,
    resizedBackingHeight: host.canvas.height,
    logicalWidth: metrics.width,
    logicalHeight: metrics.height,
    pixelDensity: metrics.pixelDensity
  };
  host.dispose();
  runtime.dispose();
  return result;
}
