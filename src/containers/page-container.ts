import { type DisplayComponent, type DisplayNode, createNode } from "../core/component.js";
import { createRect } from "../core/geometry.js";
import { resolvePadding } from "./shared.js";

export interface PageContainerProps {
  children: readonly DisplayNode<unknown, unknown>[];
  initialPageId?: string;
  padding?: number;
  backgroundColor?: string;
}

const PageContainerComponent: DisplayComponent<PageContainerProps> = {
  kind: "page-container",
  mount(ctx) {
    ctx.services.navigation.registerContainer(
      ctx.id,
      ctx.props.children.map((child) => child.id),
      ctx.props.initialPageId
    );
  },
  update(ctx) {
    ctx.services.navigation.registerContainer(
      ctx.id,
      ctx.props.children.map((child) => child.id),
      ctx.props.initialPageId
    );
  },
  dispose(ctx) {
    ctx.services.navigation.unregisterContainer(ctx.id);
  },
  getChildren(ctx) {
    return ctx.props.children;
  },
  measure(ctx) {
    const theme = ctx.services.theme.getTokens();
    const activeChildId = resolveActiveChildId(ctx.id, ctx.props, ctx.services.navigation);
    let activeChildSize:
      | {
          width: number;
          height: number;
        }
      | undefined;

    for (const child of ctx.getChildren()) {
      const childSize = ctx.measureChild(child.id);
      if (child.id === activeChildId) {
        activeChildSize = childSize;
      }
    }

    if (!activeChildSize) {
      return { width: ctx.constraints.maxWidth, height: 0 };
    }

    const padding = resolvePadding(ctx.props.padding, theme.padding);
    return {
      width: Math.min(ctx.constraints.maxWidth, activeChildSize.width + padding.left + padding.right),
      height: Math.min(ctx.constraints.maxHeight, activeChildSize.height + padding.top + padding.bottom)
    };
  },
  layout(ctx) {
    const theme = ctx.services.theme.getTokens();
    const padding = resolvePadding(ctx.props.padding, theme.padding);
    const activeChildId = resolveActiveChildId(ctx.id, ctx.props, ctx.services.navigation);
    const inner = createRect(
      ctx.bounds.x + padding.left,
      ctx.bounds.y + padding.top,
      Math.max(0, ctx.bounds.width - padding.left - padding.right),
      Math.max(0, ctx.bounds.height - padding.top - padding.bottom)
    );

    for (const child of ctx.getChildren()) {
      ctx.setChildBounds(
        child.id,
        child.id === activeChildId ? inner : createRect(ctx.bounds.x, ctx.bounds.y, 0, 0)
      );
    }

    ctx.setContentBounds(inner);
  },
  render(ctx) {
    const theme = ctx.services.theme.getTokens();
    return ctx.props.backgroundColor
      ? [
          {
            type: "rect",
            componentId: ctx.id,
            role: "page-container-background",
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

export function createPageContainer(
  id: string,
  props: PageContainerProps
): DisplayNode<PageContainerProps> {
  return createNode(id, PageContainerComponent, props);
}

function resolveActiveChildId(
  containerId: string,
  props: PageContainerProps,
  navigation: { getActivePage(id: string): string | undefined }
): string | undefined {
  return navigation.getActivePage(containerId) ?? props.initialPageId ?? props.children[0]?.id;
}
