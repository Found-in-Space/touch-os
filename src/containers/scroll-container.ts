import { type DisplayComponent, type DisplayNode, createNode } from "../core/component.js";
import type { DrawCommand } from "../core/draw.js";
import { createRect, type Insets, type LayoutConstraints } from "../core/geometry.js";
import { layoutVerticalChildren, measureVerticalChildren, resolvePadding } from "./shared.js";

export interface ScrollContainerProps {
  children: readonly DisplayNode<unknown, unknown>[];
  gap?: number;
  padding?: number | Partial<Insets>;
  backgroundColor?: string;
  scrollbar?: "auto" | "hidden";
}

interface ScrollContainerState {
  dragging: boolean;
  dragStartOffsetX: number;
  dragStartOffsetY: number;
}

const ScrollContainerComponent: DisplayComponent<ScrollContainerProps, ScrollContainerState> = {
  kind: "scroll-container",
  mount(ctx) {
    ctx.services.scroll.register(ctx.id);
    return {
      dragging: false,
      dragStartOffsetX: 0,
      dragStartOffsetY: 0
    };
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
    const padding = resolvePadding(ctx.props.padding, theme.padding);
    const childConstraints = createContentConstraints(
      Math.max(0, ctx.constraints.maxWidth - padding.left - padding.right)
    );
    const size = measureVerticalChildren(
      {
        getChildren: () => ctx.getChildren(),
        measureChild: (childId) => ctx.measureChild(childId, childConstraints)
      },
      padding,
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
    const viewport = createRect(
      ctx.bounds.x + padding.left,
      ctx.bounds.y + padding.top,
      Math.max(0, ctx.bounds.width - padding.left - padding.right),
      Math.max(0, ctx.bounds.height - padding.top - padding.bottom)
    );
    const contentHeight = getMeasuredContentHeight(
      ctx.getChildren(),
      (childId) => ctx.getMeasuredSize(childId).height,
      ctx.props.gap ?? theme.spacing
    );
    ctx.services.scroll.setMetrics(
      ctx.id,
      { width: viewport.width, height: viewport.height },
      { width: viewport.width, height: contentHeight }
    );
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
    ctx.setContentBounds(contentBounds);
    ctx.setClipRect(viewport);
  },
  render(ctx) {
    const theme = ctx.services.theme.getTokens();
    const commands: DrawCommand[] = ctx.props.backgroundColor
      ? [
          {
            type: "rect" as const,
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
    const scrollState = ctx.services.scroll.getState(ctx.id);
    if (
      ctx.props.scrollbar !== "hidden" &&
      scrollState.maxOffsetY > 0 &&
      scrollState.viewport.width > 0 &&
      scrollState.viewport.height > 0
    ) {
      const padding = resolvePadding(ctx.props.padding, theme.padding);
      const viewport = createRect(
        ctx.bounds.x + padding.left,
        ctx.bounds.y + padding.top,
        Math.max(0, ctx.bounds.width - padding.left - padding.right),
        Math.max(0, ctx.bounds.height - padding.top - padding.bottom)
      );
      const thickness = Math.min(4, Math.max(2, viewport.width * 0.03));
      const thumbHeight = Math.max(
        16,
        Math.min(viewport.height, (viewport.height / scrollState.content.height) * viewport.height)
      );
      const scrollRange = Math.max(1, scrollState.maxOffsetY);
      const thumbTravel = Math.max(0, viewport.height - thumbHeight);
      const thumbY = viewport.y + (scrollState.offsetY / scrollRange) * thumbTravel;
      commands.push(
        {
          type: "rect",
          componentId: ctx.id,
          role: "scroll-container-scrollbar-track",
          rect: createRect(viewport.x + viewport.width - thickness, viewport.y, thickness, viewport.height),
          fill: theme.overlayColor,
          radius: thickness / 2
        },
        {
          type: "rect",
          componentId: ctx.id,
          role: "scroll-container-scrollbar-thumb",
          rect: createRect(viewport.x + viewport.width - thickness, thumbY, thickness, thumbHeight),
          fill: theme.accentColor,
          radius: thickness / 2
        }
      );
    }
    return commands;
  },
  hitTest(ctx) {
    return ctx.bounds.width > 0 && ctx.bounds.height > 0 ? { targetId: `${ctx.id}:viewport` } : null;
  },
  handleEvent(ctx) {
    switch (ctx.event.type) {
      case "scroll":
        ctx.services.scroll.scrollBy(ctx.id, 0, ctx.event.deltaY);
        break;
      case "drag-start": {
        const scrollState = ctx.services.scroll.getState(ctx.id);
        ctx.state.dragging = true;
        ctx.state.dragStartOffsetX = scrollState.offsetX;
        ctx.state.dragStartOffsetY = scrollState.offsetY;
        break;
      }
      case "drag-move":
        if (!ctx.state.dragging) {
          return;
        }
        ctx.services.scroll.setOffset(
          ctx.id,
          ctx.state.dragStartOffsetX - ctx.event.deltaX,
          ctx.state.dragStartOffsetY - ctx.event.deltaY
        );
        break;
      case "drag-end":
      case "cancel":
      case "pointer-leave":
        ctx.state.dragging = false;
        break;
    }
  }
};

export function createScrollContainer(
  id: string,
  props: ScrollContainerProps
): DisplayNode<ScrollContainerProps, ScrollContainerState> {
  return createNode(id, ScrollContainerComponent, props);
}

function getMeasuredContentHeight(
  children: readonly { id: string }[],
  getHeight: (childId: string) => number,
  gap: number
): number {
  let height = 0;
  let first = true;

  for (const child of children) {
    if (!first) {
      height += gap;
    }
    height += getHeight(child.id);
    first = false;
  }

  return height;
}

function createContentConstraints(maxWidth: number): LayoutConstraints {
  return {
    minWidth: 0,
    minHeight: 0,
    maxWidth,
    maxHeight: Number.POSITIVE_INFINITY
  };
}
