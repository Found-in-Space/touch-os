import { type DisplayComponent, type DisplayNode, createNode } from "../core/component.js";
import { resolvePadding, measureVerticalChildren, layoutVerticalChildren } from "./shared.js";

export interface ColumnProps {
  children: readonly DisplayNode<unknown, unknown>[];
  gap?: number;
  padding?: number;
  backgroundColor?: string;
}

const ColumnComponent: DisplayComponent<ColumnProps> = {
  kind: "column",
  getChildren(ctx) {
    return ctx.props.children;
  },
  measure(ctx) {
    const theme = ctx.services.theme.getTokens();
    return measureVerticalChildren(
      {
        getChildren: () => ctx.getChildren(),
        measureChild: (childId) => ctx.measureChild(childId)
      },
      resolvePadding(ctx.props.padding, theme.padding),
      ctx.props.gap ?? theme.spacing
    );
  },
  layout(ctx) {
    const theme = ctx.services.theme.getTokens();
    const contentBounds = layoutVerticalChildren(
      {
        getChildren: () => ctx.getChildren(),
        getMeasuredSize: (childId) => ctx.getMeasuredSize(childId),
        setChildBounds: (childId, rect) => ctx.setChildBounds(childId, rect)
      },
      ctx.bounds,
      resolvePadding(ctx.props.padding, theme.padding),
      ctx.props.gap ?? theme.spacing
    );
    ctx.setContentBounds(contentBounds);
  },
  render(ctx) {
    const theme = ctx.services.theme.getTokens();
    return ctx.props.backgroundColor
      ? [
          {
            type: "rect",
            componentId: ctx.id,
            role: "column-background",
            rect: ctx.bounds,
            fill: ctx.props.backgroundColor,
            stroke: theme.borderColor,
            strokeWidth: 1,
            radius: theme.radius
          }
        ]
      : [];
  },
  hitTest() {
    return null;
  }
};

export function createColumn(id: string, props: ColumnProps): DisplayNode<ColumnProps> {
  return createNode(id, ColumnComponent, props);
}
