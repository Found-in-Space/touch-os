import { describe, expect, it } from "vitest";
import {
  createRuntime,
  createToggle,
  createTouchAppRegistry,
  createWindowManager,
  defineTouchApp,
  type DrawCommand,
  type RenderSnapshot,
  type TouchRuntimeSurfaceHandle
} from "../src/index.js";
import {
  drawCommandToCanvasContext,
  drawRenderSnapshotToCanvasContext,
  type CanvasSurfaceContextLike
} from "../src/rendering/canvas-snapshot-renderer.js";
import { findCommandByRole } from "./helpers/runtime-helpers.js";

describe("canvas snapshot renderer parity", () => {
  it("honors rect radius with roundRect and manual rounded paths", () => {
    const roundRectContext = new RecordingCanvasContext();
    drawCommandToCanvasContext(roundRectContext, rectCommand({ radius: 8 }));
    expect(roundRectContext.operations).toContain("roundRect:10,20,30,40,8");

    const manualContext = new RecordingCanvasContext({ roundRect: false });
    drawCommandToCanvasContext(manualContext, rectCommand({ radius: 8 }));
    expect(manualContext.operations).toContain("arc");
    expect(manualContext.operations).not.toContain("fillRect:10,20,30,40");
  });

  it("applies clipRect consistently for every command type", () => {
    const context = new RecordingCanvasContext();
    drawRenderSnapshotToCanvasContext(context, {
      revision: 1,
      sharedSurfaceRevision: 1,
      commands: [
        rectCommand({ clip: true }),
        textCommand({ clip: true }),
        lineCommand({ clip: true }),
        circleCommand({ clip: true }),
        bitmapCommand({ clip: true }),
        surfaceCommand({ clip: true })
      ]
    }, {
      sourceWidth: 100,
      sourceHeight: 100
    });

    expect(context.operations.filter((operation) => operation === "clip")).toHaveLength(6);
  });

  it("restores bitmap opacity and sampling after draw", () => {
    const context = new RecordingCanvasContext();
    context.globalAlpha = 0.5;
    context.imageSmoothingEnabled = true;

    drawCommandToCanvasContext(context, {
      ...bitmapCommand(),
      opacity: 0.25,
      sampling: "nearest"
    });

    expect(context.globalAlpha).toBe(0.5);
    expect(context.imageSmoothingEnabled).toBe(true);
    expect(context.operations).toContain("drawImage:10,20,30,40");
  });

  it("honors surface mirrorX and recurses through touch-os render snapshots", () => {
    const context = new RecordingCanvasContext();
    const nestedSnapshot: RenderSnapshot = {
      revision: 1,
      sharedSurfaceRevision: 1,
      commands: [rectCommand({ radius: 7 })]
    };

    drawCommandToCanvasContext(context, {
      type: "surface",
      componentId: "surface",
      rect: { x: 10, y: 20, width: 30, height: 40 },
      mirrorX: true,
      handle: {
        kind: "touch-os-render-snapshot",
        width: 30,
        height: 40,
        revision: 1,
        snapshot: nestedSnapshot
      }
    });

    expect(context.operations).toContain("translate:40,20");
    expect(context.operations).toContain("scale:-1,1");
    expect(context.operations).toContain("roundRect:10,20,30,40,7");
  });

  it("shares text alignment and vertical alignment semantics", () => {
    const context = new RecordingCanvasContext();
    drawCommandToCanvasContext(context, {
      ...textCommand(),
      align: "center",
      verticalAlign: "bottom"
    });

    expect(context.textAlign).toBe("center");
    expect(context.textBaseline).toBe("bottom");
    expect(context.operations).toContain("fillText:hello:25,60,30");
  });

  it("keeps toggle track rounded through direct and hosted render paths", () => {
    const directRuntime = createRuntime({
      root: createToggle("lamp", {
        label: "Lamp",
        field: "lightOn",
        value: true
      }),
      surface: { width: 180, height: 80 }
    });
    const directTrack = findCommandByRole<DrawCommand>(directRuntime.render().commands, "toggle-switch");
    if (directTrack.type !== "rect") {
      throw new Error("Expected direct toggle switch to be a rect command.");
    }
    expect(directTrack.radius).toBeGreaterThan(0);

    const registry = createTouchAppRegistry([createToggleApp()]);
    const sameRuntime = createRuntime({
      root: createWindowManager("desktop", {
        registry,
        initialWindows: [windowSeed("toggle-window", "toggle-1")]
      }),
      surface: { width: 420, height: 280 }
    });
    const sameTrack = findCommandByRole<DrawCommand>(sameRuntime.render().commands, "toggle-switch");
    if (sameTrack.type !== "rect") {
      throw new Error("Expected same-runtime toggle switch to be a rect command.");
    }
    expect(sameTrack.radius).toBeGreaterThan(0);

    const childRuntime = createRuntime({
      root: createWindowManager("desktop", {
        registry,
        appHostMode: "child-runtime",
        initialWindows: [windowSeed("toggle-window", "toggle-1")]
      }),
      surface: { width: 420, height: 280 }
    });
    const viewport = findCommandByRole<DrawCommand>(childRuntime.render().commands, "embedded-surface-viewport");
    if (viewport.type !== "surface") {
      throw new Error("Expected child-runtime viewport to be a surface command.");
    }
    const handle = viewport.handle as TouchRuntimeSurfaceHandle;
    const childTrack = findCommandByRole<DrawCommand>(handle.snapshot.commands, "toggle-switch");
    if (childTrack.type !== "rect") {
      throw new Error("Expected child-runtime toggle switch to be a rect command.");
    }
    expect(childTrack.radius).toBeGreaterThan(0);

    const context = new RecordingCanvasContext();
    handle.draw(context, viewport.rect);
    expect(context.operations.some((operation) => operation.startsWith("roundRect:"))).toBe(true);
  });
});

function rectCommand(options: { radius?: number; clip?: boolean } = {}): Extract<DrawCommand, { type: "rect" }> {
  return {
    type: "rect",
    componentId: "rect",
    rect: { x: 10, y: 20, width: 30, height: 40 },
    fill: "#fff",
    stroke: "#000",
    strokeWidth: 1,
    ...(options.radius !== undefined ? { radius: options.radius } : {}),
    ...(options.clip ? { clipRect: { x: 0, y: 0, width: 20, height: 20 } } : {})
  };
}

function textCommand(options: { clip?: boolean } = {}): Extract<DrawCommand, { type: "text" }> {
  return {
    type: "text",
    componentId: "text",
    text: "hello",
    rect: { x: 10, y: 20, width: 30, height: 40 },
    color: "#fff",
    ...(options.clip ? { clipRect: { x: 0, y: 0, width: 20, height: 20 } } : {})
  };
}

function lineCommand(options: { clip?: boolean } = {}): Extract<DrawCommand, { type: "line" }> {
  return {
    type: "line",
    componentId: "line",
    x1: 0,
    y1: 0,
    x2: 10,
    y2: 10,
    stroke: "#fff",
    ...(options.clip ? { clipRect: { x: 0, y: 0, width: 20, height: 20 } } : {})
  };
}

function circleCommand(options: { clip?: boolean } = {}): Extract<DrawCommand, { type: "circle" }> {
  return {
    type: "circle",
    componentId: "circle",
    cx: 10,
    cy: 10,
    radius: 5,
    fill: "#fff",
    ...(options.clip ? { clipRect: { x: 0, y: 0, width: 20, height: 20 } } : {})
  };
}

function bitmapCommand(options: { clip?: boolean } = {}): Extract<DrawCommand, { type: "bitmap" }> {
  return {
    type: "bitmap",
    componentId: "bitmap",
    rect: { x: 10, y: 20, width: 30, height: 40 },
    handle: {
      kind: "bitmap",
      image: {},
      width: 60,
      height: 80,
      revision: 1
    },
    ...(options.clip ? { clipRect: { x: 0, y: 0, width: 20, height: 20 } } : {})
  };
}

function surfaceCommand(options: { clip?: boolean } = {}): Extract<DrawCommand, { type: "surface" }> {
  return {
    type: "surface",
    componentId: "surface",
    rect: { x: 10, y: 20, width: 30, height: 40 },
    handle: {
      draw(context: CanvasSurfaceContextLike) {
        context.fillRect?.(0, 0, 1, 1);
      }
    },
    ...(options.clip ? { clipRect: { x: 0, y: 0, width: 20, height: 20 } } : {})
  };
}

function createToggleApp() {
  return defineTouchApp({
    manifest: {
      id: "space.test.toggle",
      name: "Toggle",
      version: "1.0.0"
    },
    createApp() {
      return {
        render() {
          return createToggle("toggle", {
            label: "Lamp",
            field: "lightOn",
            value: true
          });
        }
      };
    }
  });
}

function windowSeed(id: string, instanceId: string) {
  return {
    id,
    appId: "space.test.toggle",
    instanceId,
    title: id,
    rect: { x: 20, y: 20, width: 180, height: 130 },
    zIndex: 1,
    mode: "normal" as const,
    focused: false,
    movable: true,
    resizable: true
  };
}

class RecordingCanvasContext implements CanvasSurfaceContextLike {
  operations: string[] = [];
  fillStyle?: unknown;
  strokeStyle?: unknown;
  lineWidth?: number;
  font?: string;
  textAlign?: string;
  textBaseline?: string;
  globalAlpha?: number = 1;
  imageSmoothingEnabled?: boolean = true;
  roundRect?: (x: number, y: number, width: number, height: number, radii: number) => void;

  constructor(options: { roundRect?: boolean } = {}) {
    if (options.roundRect ?? true) {
      this.roundRect = (x, y, width, height, radii) => {
        this.operations.push(`roundRect:${x},${y},${width},${height},${radii}`);
      };
    }
  }

  save(): void {
    this.operations.push("save");
  }

  restore(): void {
    this.operations.push("restore");
  }

  translate(x: number, y: number): void {
    this.operations.push(`translate:${x},${y}`);
  }

  scale(x: number, y: number): void {
    this.operations.push(`scale:${x},${y}`);
  }

  beginPath(): void {
    this.operations.push("beginPath");
  }

  closePath(): void {
    this.operations.push("closePath");
  }

  rect(x: number, y: number, width: number, height: number): void {
    this.operations.push(`rect:${x},${y},${width},${height}`);
  }

  clip(): void {
    this.operations.push("clip");
  }

  fill(): void {
    this.operations.push("fill");
  }

  stroke(): void {
    this.operations.push("stroke");
  }

  fillRect(x: number, y: number, width: number, height: number): void {
    this.operations.push(`fillRect:${x},${y},${width},${height}`);
  }

  strokeRect(x: number, y: number, width: number, height: number): void {
    this.operations.push(`strokeRect:${x},${y},${width},${height}`);
  }

  arc(): void {
    this.operations.push("arc");
  }

  moveTo(): void {
    this.operations.push("moveTo");
  }

  lineTo(): void {
    this.operations.push("lineTo");
  }

  fillText(text: string, x: number, y: number, maxWidth?: number): void {
    this.operations.push(`fillText:${text}:${x},${y},${maxWidth ?? ""}`);
  }

  drawImage(_image: unknown, x: number, y: number, width: number, height: number): void {
    this.operations.push(`drawImage:${x},${y},${width},${height}`);
  }
}
