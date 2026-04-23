import { type DisplayComponent, type DisplayNode, createNode } from "../core/component.js";
import { layoutHorizontalChildren, measureHorizontalChildren, resolvePadding } from "./shared.js";

export interface RowProps {
  children: readonly DisplayNode<unknown, unknown>[];
  gap?: number;
  padding?: number;
  backgroundColor?: string;
}

const RowComponent: DisplayComponent<RowProps> = {
  kind: "row",
  getChildren(ctx) {
    return ctx.props.children;
  },
  measure(ctx) {
    const theme = ctx.services.theme.getTokens();
    return measureHorizontalChildren(
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
    const contentBounds = layoutHorizontalChildren(
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
            role: "row-background",
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

export function createRow(id: string, props: RowProps): DisplayNode<RowProps> {
  return createNode(id, RowComponent, props);
}
