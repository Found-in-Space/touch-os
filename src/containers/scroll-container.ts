import { type DisplayComponent, type DisplayNode, createNode } from "../core/component.js";
import { createRect } from "../core/geometry.js";
import { layoutVerticalChildren, measureVerticalChildren, resolvePadding } from "./shared.js";

export interface ScrollContainerProps {
  children: readonly DisplayNode<unknown, unknown>[];
  gap?: number;
  padding?: number;
  backgroundColor?: string;
}

const ScrollContainerComponent: DisplayComponent<ScrollContainerProps> = {
  kind: "scroll-container",
  mount(ctx) {
    ctx.services.scroll.register(ctx.id);
  },
  update(ctx) {
    ctx.services.scroll.register(ctx.id);
  },
  dispose(ctx) {
    ctx.services.scroll.unregister(ctx.id);
  },
  getChildren(ctx) {
    return ctx.props.children;
  },
  measure(ctx) {
    const theme = ctx.services.theme.getTokens();
    const size = measureVerticalChildren(
      {
        getChildren: () => ctx.getChildren(),
        measureChild: (childId) => ctx.measureChild(childId)
      },
      resolvePadding(ctx.props.padding, theme.padding),
      ctx.props.gap ?? theme.spacing
    );
    return {
      width: Math.min(size.width, ctx.constraints.maxWidth),
      height: Math.min(size.height, ctx.constraints.maxHeight)
    };
  },
  layout(ctx) {
    const theme = ctx.services.theme.getTokens();
    const padding = resolvePadding(ctx.props.padding, theme.padding);
    const scrollState = ctx.services.scroll.getState(ctx.id);
    const contentBounds = layoutVerticalChildren(
      {
        getChildren: () => ctx.getChildren(),
        getMeasuredSize: (childId) => ctx.getMeasuredSize(childId),
        setChildBounds: (childId, rect) => ctx.setChildBounds(childId, rect)
      },
      ctx.bounds,
      padding,
      ctx.props.gap ?? theme.spacing,
      scrollState.offsetY
    );
    const viewport = createRect(
      ctx.bounds.x + padding.left,
      ctx.bounds.y + padding.top,
      Math.max(0, ctx.bounds.width - padding.left - padding.right),
      Math.max(0, ctx.bounds.height - padding.top - padding.bottom)
    );
    ctx.setContentBounds(contentBounds);
    ctx.setClipRect(viewport);
    ctx.services.scroll.setMetrics(
      ctx.id,
      { width: viewport.width, height: viewport.height },
      { width: viewport.width, height: contentBounds.height }
    );
  },
  render(ctx) {
    const theme = ctx.services.theme.getTokens();
    return ctx.props.backgroundColor
      ? [
          {
            type: "rect",
            componentId: ctx.id,
            role: "scroll-container-background",
            rect: ctx.bounds,
            fill: ctx.props.backgroundColor,
            stroke: theme.borderColor,
            strokeWidth: 1,
            radius: theme.radius
          }
        ]
      : [];
  },
  hitTest(ctx) {
    return ctx.bounds.width > 0 && ctx.bounds.height > 0 ? { targetId: `${ctx.id}:viewport` } : null;
  },
  handleEvent(ctx) {
    if (ctx.event.type !== "scroll") {
      return;
    }
    ctx.services.scroll.scrollBy(ctx.id, 0, ctx.event.deltaY);
  }
};

export function createScrollContainer(
  id: string,
  props: ScrollContainerProps
): DisplayNode<ScrollContainerProps> {
  return createNode(id, ScrollContainerComponent, props);
}
