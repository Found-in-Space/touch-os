import { createNode, type DisplayComponent, type DisplayNode } from "../core/component.js";
import { createRect, rectContainsPoint } from "../core/geometry.js";

export interface DragHandleProps {
  label?: string;
  height?: number;
  backgroundColor?: string;
}

const DragHandleComponent: DisplayComponent<DragHandleProps> = {
  kind: "drag-handle",
  measure(ctx) {
    const theme = ctx.services.theme.getTokens();
    return {
      width: ctx.constraints.maxWidth,
      height: ctx.props.height ?? Math.max(18, Math.round(theme.controlHeight * 0.55))
    };
  },
  render(ctx) {
    const theme = ctx.services.theme.getTokens();
    return [
      {
        type: "rect",
        componentId: ctx.id,
        role: "drag-handle-bg",
        rect: ctx.bounds,
        fill: ctx.props.backgroundColor ?? theme.backgroundColor,
        stroke: theme.borderColor,
        strokeWidth: 1,
        radius: theme.radius
      },
      {
        type: "text",
        componentId: ctx.id,
        role: "drag-handle-label",
        text: ctx.props.label ?? "Move",
        rect: createRect(
          ctx.bounds.x + theme.padding,
          ctx.bounds.y,
          ctx.bounds.width - theme.padding * 2,
          ctx.bounds.height
        ),
        color: theme.mutedTextColor,
        verticalAlign: "middle",
        fontSize: Math.max(12, theme.typography.fontSize - 1),
        fontWeight: theme.typography.fontWeight
      }
    ];
  },
  hitTest(ctx) {
    if (!rectContainsPoint(ctx.bounds, ctx.localPoint)) {
      return null;
    }

    return {
      targetId: `${ctx.id}:drag-handle`,
      role: "drag-handle"
    };
  }
};

export function createDragHandle(id: string, props: DragHandleProps = {}): DisplayNode<DragHandleProps> {
  return createNode(id, DragHandleComponent, props);
}
