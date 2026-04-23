import { type DisplayComponent, type DisplayNode, createNode } from "../core/component.js";
import { layoutFillChildren, measureStackChildren, resolvePadding } from "./shared.js";

export interface OverlayProps {
  children: readonly DisplayNode<unknown, unknown>[];
  padding?: number;
  overlayColor?: string;
}

const OverlayComponent: DisplayComponent<OverlayProps> = {
  kind: "overlay",
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
    return [
      {
        type: "rect",
        componentId: ctx.id,
        role: "overlay-scrim",
        rect: ctx.bounds,
        fill: ctx.props.overlayColor ?? theme.overlayColor,
        radius: theme.radius
      }
    ];
  },
  hitTest() {
    return null;
  }
};

export function createOverlay(id: string, props: OverlayProps): DisplayNode<OverlayProps> {
  return createNode(id, OverlayComponent, props);
}
