import {
  type DisplayComponent,
  type DisplayNode,
  createNode,
  isDisplayEvent
} from "../core/component.js";
import type { DrawCommand } from "../core/draw.js";
import { clamp, createRect, rectContainsPoint } from "../core/geometry.js";

export interface CustomGraphProps {
  points: readonly number[];
  highlightedIndex?: number;
  actionId?: string;
  height?: number;
}

interface CustomGraphState {
  hoveredIndex: number | undefined;
}

const CustomGraphComponent: DisplayComponent<CustomGraphProps, CustomGraphState> = {
  kind: "custom-graph",
  mount() {
    return {
      hoveredIndex: undefined
    };
  },
  measure(ctx) {
    return {
      width: ctx.constraints.maxWidth,
      height: ctx.props.height ?? 180
    };
  },
  render(ctx) {
    const theme = ctx.services.theme.getTokens();
    const plotRect = getPlotRect(ctx.bounds, theme.padding);
    const commands: DrawCommand[] = [
      {
        type: "rect" as const,
        componentId: ctx.id,
        role: "graph-frame",
        rect: ctx.bounds,
        fill: theme.surfaceColor,
        stroke: theme.borderColor,
        strokeWidth: 1,
        radius: theme.radius
      },
      {
        type: "line" as const,
        componentId: ctx.id,
        role: "graph-axis-x",
        x1: plotRect.x,
        y1: plotRect.y + plotRect.height,
        x2: plotRect.x + plotRect.width,
        y2: plotRect.y + plotRect.height,
        stroke: theme.borderColor,
        strokeWidth: 1
      },
      {
        type: "line" as const,
        componentId: ctx.id,
        role: "graph-axis-y",
        x1: plotRect.x,
        y1: plotRect.y,
        x2: plotRect.x,
        y2: plotRect.y + plotRect.height,
        stroke: theme.borderColor,
        strokeWidth: 1
      }
    ];

    const points = toPlotPoints(ctx.props.points, plotRect);
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1];
      const next = points[index];
      if (!previous || !next) {
        continue;
      }
      commands.push({
        type: "line" as const,
        componentId: ctx.id,
        role: "graph-line",
        x1: previous.x,
        y1: previous.y,
        x2: next.x,
        y2: next.y,
        stroke: theme.accentColor,
        strokeWidth: 2
      });
    }

    const highlightIndex = ctx.state.hoveredIndex ?? ctx.props.highlightedIndex;
    if (highlightIndex !== undefined) {
      const point = points[highlightIndex];
      if (point) {
        commands.push({
          type: "circle" as const,
          componentId: ctx.id,
          role: "graph-highlight",
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
          role: "graph-highlight-label",
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
  }
};

export function createCustomGraph(
  id: string,
  props: CustomGraphProps
): DisplayNode<CustomGraphProps, CustomGraphState> {
  return createNode(id, CustomGraphComponent, props);
}

function getPlotRect(bounds: { x: number; y: number; width: number; height: number }, padding: number) {
  return createRect(
    bounds.x + padding,
    bounds.y + padding,
    Math.max(0, bounds.width - padding * 2),
    Math.max(0, bounds.height - padding * 2)
  );
}

function toPlotPoints(points: readonly number[], plotRect: { x: number; y: number; width: number; height: number }) {
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
