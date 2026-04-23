import {
  type DisplayComponent,
  type DisplayNode,
  createNode,
  isDisplayEvent
} from "../core/component.js";
import type { BitmapFitMode, BitmapSampling, DrawCommand } from "../core/draw.js";
import { clamp, createRect, rectContainsPoint, type Rect } from "../core/geometry.js";

export interface BitmapPlotProps {
  points: readonly number[];
  highlightedIndex?: number;
  actionId?: string;
  height?: number;
  fit?: BitmapFitMode;
  opacity?: number;
  sampling?: BitmapSampling;
}

interface BitmapPlotState {
  hoveredIndex: number | undefined;
  bitmapSignature: string | undefined;
}

const BitmapPlotComponent: DisplayComponent<BitmapPlotProps, BitmapPlotState> = {
  kind: "bitmap-plot",
  mount() {
    return {
      hoveredIndex: undefined,
      bitmapSignature: undefined
    };
  },
  measure(ctx) {
    return {
      width: ctx.constraints.maxWidth,
      height: ctx.props.height ?? 180
    };
  },
  layout(ctx) {
    ctx.setContentBounds(ctx.bounds);

    const plotRect = getPlotRect(ctx.bounds, ctx.services.theme.getTokens().padding);
    const signature = `${Math.round(plotRect.width)}x${Math.round(plotRect.height)}:${ctx.props.points.join(",")}`;
    if (ctx.state.bitmapSignature === signature) {
      return;
    }

    const image = createPlotImage(
      Math.max(1, Math.round(plotRect.width)),
      Math.max(1, Math.round(plotRect.height)),
      ctx.props.points
    );
    const bitmapId = getBitmapId(ctx.id);
    const existing = ctx.services.bitmaps.getHandle(bitmapId);
    if (existing) {
      ctx.services.bitmaps.update(bitmapId, {
        image,
        width: Math.max(1, Math.round(plotRect.width)),
        height: Math.max(1, Math.round(plotRect.height))
      });
    } else {
      ctx.services.bitmaps.allocate(bitmapId, {
        image,
        width: Math.max(1, Math.round(plotRect.width)),
        height: Math.max(1, Math.round(plotRect.height))
      });
    }
    ctx.state.bitmapSignature = signature;
  },
  render(ctx) {
    const theme = ctx.services.theme.getTokens();
    const plotRect = getPlotRect(ctx.bounds, theme.padding);
    const handle = ctx.services.bitmaps.getHandle(getBitmapId(ctx.id));
    const commands: DrawCommand[] = [
      {
        type: "rect" as const,
        componentId: ctx.id,
        role: "bitmap-plot-frame",
        rect: ctx.bounds,
        fill: theme.surfaceColor,
        stroke: theme.borderColor,
        strokeWidth: 1,
        radius: theme.radius
      }
    ];

    if (handle) {
      commands.push({
        type: "bitmap" as const,
        componentId: ctx.id,
        role: "bitmap-plot-body",
        rect: plotRect,
        handle,
        fit: ctx.props.fit ?? "stretch",
        opacity: ctx.props.opacity ?? 1,
        sampling: ctx.props.sampling ?? "linear"
      });
    } else {
      commands.push({
        type: "rect" as const,
        componentId: ctx.id,
        role: "bitmap-plot-placeholder",
        rect: plotRect,
        fill: theme.backgroundColor,
        stroke: theme.borderColor,
        strokeWidth: 1,
        radius: theme.radius
      });
    }

    commands.push({
      type: "line" as const,
      componentId: ctx.id,
      role: "bitmap-plot-axis-x",
      x1: plotRect.x,
      y1: plotRect.y + plotRect.height,
      x2: plotRect.x + plotRect.width,
      y2: plotRect.y + plotRect.height,
      stroke: theme.borderColor,
      strokeWidth: 1
    });
    commands.push({
      type: "line" as const,
      componentId: ctx.id,
      role: "bitmap-plot-axis-y",
      x1: plotRect.x,
      y1: plotRect.y,
      x2: plotRect.x,
      y2: plotRect.y + plotRect.height,
      stroke: theme.borderColor,
      strokeWidth: 1
    });

    const points = toPlotPoints(ctx.props.points, plotRect);
    const highlightIndex = ctx.state.hoveredIndex ?? ctx.props.highlightedIndex;
    if (highlightIndex !== undefined) {
      const point = points[highlightIndex];
      if (point) {
        commands.push({
          type: "circle" as const,
          componentId: ctx.id,
          role: "bitmap-plot-highlight",
          cx: point.x,
          cy: point.y,
          radius: 5,
          fill: theme.focusColor,
          stroke: theme.textColor,
          strokeWidth: 1
        });
        commands.push({
          type: "text" as const,
          componentId: ctx.id,
          role: "bitmap-plot-highlight-label",
          text: `${ctx.props.points[highlightIndex] ?? ""}`,
          rect: createRect(point.x + 8, point.y - 12, 48, theme.typography.lineHeight),
          color: theme.textColor,
          align: "left" as const,
          verticalAlign: "middle" as const,
          fontSize: theme.typography.fontSize,
          fontWeight: theme.typography.fontWeight
        });
      }
    }

    return commands;
  },
  hitTest(ctx) {
    if (!rectContainsPoint(ctx.bounds, ctx.point)) {
      return null;
    }
    return { targetId: `${ctx.id}:plot`, role: "plot" };
  },
  handleEvent(ctx) {
    if (!isDisplayEvent(ctx.event)) {
      return;
    }

    switch (ctx.event.type) {
      case "pointer-move":
      case "pointer-enter":
        ctx.state.hoveredIndex = getHoveredIndex(ctx.event.localX, ctx.bounds.width, ctx.props.points.length);
        break;
      case "pointer-leave":
        ctx.state.hoveredIndex = undefined;
        break;
      case "press":
        if (ctx.state.hoveredIndex !== undefined) {
          ctx.emit({
            type: "action",
            actionId: ctx.props.actionId ?? `${ctx.id}.select-point`,
            componentId: ctx.id,
            payload: {
              index: ctx.state.hoveredIndex
            }
          });
        }
        break;
    }
  },
  dispose(ctx) {
    ctx.services.bitmaps.release(getBitmapId(ctx.id));
  }
};

export function createBitmapPlot(
  id: string,
  props: BitmapPlotProps
): DisplayNode<BitmapPlotProps, BitmapPlotState> {
  return createNode(id, BitmapPlotComponent, props);
}

function getBitmapId(componentId: string): string {
  return `${componentId}:bitmap`;
}

function getPlotRect(bounds: Rect, padding: number): Rect {
  return createRect(
    bounds.x + padding,
    bounds.y + padding,
    Math.max(0, bounds.width - padding * 2),
    Math.max(0, bounds.height - padding * 2)
  );
}

function toPlotPoints(points: readonly number[], plotRect: Rect) {
  if (points.length === 0) {
    return [];
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  return points.map((value, index) => {
    const x =
      points.length <= 1
        ? plotRect.x + plotRect.width / 2
        : plotRect.x + (plotRect.width * index) / (points.length - 1);
    const normalized = clamp((value - min) / range, 0, 1);
    const y = plotRect.y + plotRect.height - plotRect.height * normalized;
    return { x, y };
  });
}

function getHoveredIndex(localX: number, width: number, pointCount: number): number | undefined {
  if (pointCount <= 0 || width <= 0) {
    return undefined;
  }

  const ratio = clamp(localX / width, 0, 1);
  return Math.min(pointCount - 1, Math.round(ratio * Math.max(0, pointCount - 1)));
}

function createPlotImage(width: number, height: number, points: readonly number[]): unknown {
  const canvas = createRasterCanvas(width, height);
  const context = canvas?.getContext("2d");
  if (context) {
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#0f172a";
    context.fillRect(0, 0, width, height);
    context.fillStyle = "#1e293b";
    for (let index = 0; index < 4; index += 1) {
      const y = (height * index) / 4;
      context.fillRect(0, y, width, 1);
    }
    context.fillStyle = "#38bdf8";
    const normalized = normalizePoints(points);
    const step = normalized.length <= 1 ? width : width / normalized.length;
    normalized.forEach((value, index) => {
      const columnWidth = Math.max(1, Math.ceil(step));
      const columnHeight = Math.max(2, Math.round(value * height));
      const x = Math.round(index * step);
      context.fillRect(x, height - columnHeight, columnWidth, columnHeight);
    });
    return canvas;
  }

  return {
    kind: "bitmap-plot-image",
    width,
    height,
    points: [...points]
  };
}

function normalizePoints(points: readonly number[]): readonly number[] {
  if (points.length === 0) {
    return [];
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  return points.map((value) => clamp((value - min) / range, 0, 1));
}

function createRasterCanvas(width: number, height: number) {
  const scope = globalThis as {
    OffscreenCanvas?: new (width: number, height: number) => OffscreenCanvas;
    document?: { createElement(tag: "canvas"): HTMLCanvasElement };
  };

  if (typeof scope.OffscreenCanvas === "function") {
    return new scope.OffscreenCanvas(width, height);
  }

  if (scope.document?.createElement) {
    const canvas = scope.document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  return undefined;
}
