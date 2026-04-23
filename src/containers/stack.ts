import { type DisplayComponent, type DisplayNode, createNode } from "../core/component.js";
import { layoutFillChildren, measureStackChildren, resolvePadding } from "./shared.js";

export interface StackProps {
  children: readonly DisplayNode<unknown, unknown>[];
  padding?: number;
  backgroundColor?: string;
}

const StackComponent: DisplayComponent<StackProps> = {
  kind: "stack",
  getChildren(ctx) {
    return ctx.props.children;
  },
  measure(ctx) {
    const theme = ctx.services.theme.getTokens();
    return measureStackChildren(
      {
        getChildren: () => ctx.getChildren(),
        measureChild: (childId) => ctx.measureChild(childId)
      },
      resolvePadding(ctx.props.padding, theme.padding)
    );
  },
  layout(ctx) {
    const theme = ctx.services.theme.getTokens();
    const contentBounds = layoutFillChildren(
      {
        getChildren: () => ctx.getChildren(),
        getMeasuredSize: (childId) => ctx.getMeasuredSize(childId),
        setChildBounds: (childId, rect) => ctx.setChildBounds(childId, rect)
      },
      ctx.bounds,
      resolvePadding(ctx.props.padding, theme.padding)
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
            role: "stack-background",
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

export function createStack(id: string, props: StackProps): DisplayNode<StackProps> {
  return createNode(id, StackComponent, props);
}
