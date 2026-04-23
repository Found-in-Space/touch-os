import type { SurfaceMetrics } from "../../src/index.js";
import type { CanvasContextLike, CanvasLike } from "../../src/hosts/three.js";

class FakeCanvasContext implements CanvasContextLike {
  fillStyle: string | CanvasGradient | CanvasPattern = "#000000";
  strokeStyle: string | CanvasGradient | CanvasPattern = "#000000";
  lineWidth = 1;
  font = "14px sans-serif";
  globalAlpha = 1;
  textAlign: "left" | "center" | "right" = "left";
  textBaseline: "top" | "middle" | "bottom" | "alphabetic" = "top";
  imageSmoothingEnabled = true;

  save(): void {}

  restore(): void {}

  setTransform(): void {}

  clearRect(): void {}

  beginPath(): void {}

  rect(): void {}

  clip(): void {}

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
    return {
      width: text.length * 8
    };
  }

  drawImage(): void {}
}

export function createFakeCanvas(metrics: SurfaceMetrics): CanvasLike {
  const context = new FakeCanvasContext();

  return {
    width: metrics.width * metrics.pixelDensity,
    height: metrics.height * metrics.pixelDensity,
    getContext(type) {
      return type === "2d" ? context : null;
    }
  };
}
