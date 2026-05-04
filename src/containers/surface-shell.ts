import { type DisplayComponent, type DisplayNode, createNode } from "../core/component.js";
import type { DrawCommand } from "../core/draw.js";
import {
  createRect,
  type Insets,
  type LayoutConstraints,
  type Size
} from "../core/geometry.js";
import { createScrollContainer } from "./scroll-container.js";
import {
  resolvePadding,
  resolvePointerOpaqueHit,
  type PointerOpaqueProps
} from "./shared.js";

export interface SurfaceShellProps extends PointerOpaqueProps {
  header?: DisplayNode<unknown, unknown>;
  footer?: DisplayNode<unknown, unknown>;
  children: readonly DisplayNode<unknown, unknown>[];
  padding?: number | Partial<Insets>;
  gap?: number;
  bodyPadding?: number | Partial<Insets>;
  bodyGap?: number;
  backgroundColor?: string;
  bodyBackgroundColor?: string;
  scrollId?: string;
  scrollbar?: "auto" | "hidden";
}

const ZERO_SIZE: Size = { width: 0, height: 0 };

const SurfaceShellComponent: DisplayComponent<SurfaceShellProps> = {
  kind: "surface-shell",
  getChildren(ctx) {
    const children: DisplayNode<unknown, unknown>[] = [];
    if (ctx.props.header) {
      children.push(ctx.props.header);
    }
    children.push(createBodyScrollNode(ctx.id, ctx.props));
    if (ctx.props.footer) {
      children.push(ctx.props.footer);
    }
    return children;
  },
  measure(ctx) {
    const theme = ctx.services.theme.getTokens();
    const padding = resolvePadding(ctx.props.padding, 0);
    const gap = ctx.props.gap ?? theme.spacing;
    const innerWidth = Math.max(0, ctx.constraints.maxWidth - padding.left - padding.right);
    const innerHeight = Math.max(0, ctx.constraints.maxHeight - padding.top - padding.bottom);
    const headerSize = ctx.props.header
      ? ctx.measureChild(ctx.props.header.id, createConstraints(innerWidth, innerHeight))
      : ZERO_SIZE;
    const footerSize = ctx.props.footer
      ? ctx.measureChild(ctx.props.footer.id, createConstraints(innerWidth, innerHeight))
      : ZERO_SIZE;
    const bodyHeight = getBodyHeight(innerHeight, headerSize.height, footerSize.height, gap, ctx.props);
    const bodySize = ctx.measureChild(resolveScrollId(ctx.id, ctx.props), createConstraints(innerWidth, bodyHeight));
    const intrinsicWidth = Math.max(headerSize.width, bodySize.width, footerSize.width) + padding.left + padding.right;
    const intrinsicHeight =
      headerSize.height +
      bodySize.height +
      footerSize.height +
      padding.top +
      padding.bottom +
      (ctx.props.header ? gap : 0) +
      (ctx.props.footer ? gap : 0);

    return {
      width: Number.isFinite(ctx.constraints.maxWidth) ? ctx.constraints.maxWidth : intrinsicWidth,
      height: Number.isFinite(ctx.constraints.maxHeight) ? ctx.constraints.maxHeight : intrinsicHeight
    };
  },
  layout(ctx) {
    const theme = ctx.services.theme.getTokens();
    const padding = resolvePadding(ctx.props.padding, 0);
    const gap = ctx.props.gap ?? theme.spacing;
    const inner = createRect(
      ctx.bounds.x + padding.left,
      ctx.bounds.y + padding.top,
      Math.max(0, ctx.bounds.width - padding.left - padding.right),
      Math.max(0, ctx.bounds.height - padding.top - padding.bottom)
    );
    const headerSize = ctx.props.header
      ? ctx.getMeasuredSize(ctx.props.header.id)
      : ZERO_SIZE;
    const footerSize = ctx.props.footer
      ? ctx.getMeasuredSize(ctx.props.footer.id)
      : ZERO_SIZE;
    const headerHeight = ctx.props.header ? Math.min(headerSize.height, inner.height) : 0;
    const footerHeight = ctx.props.footer
      ? Math.min(
          footerSize.height,
          Math.max(0, inner.height - headerHeight - (ctx.props.header ? gap : 0))
        )
      : 0;
    const bodyY = inner.y + headerHeight + (ctx.props.header ? gap : 0);
    const footerY = inner.y + inner.height - footerHeight;
    const bodyBottom = ctx.props.footer ? Math.max(bodyY, footerY - gap) : inner.y + inner.height;
    const bodyHeight = Math.max(0, bodyBottom - bodyY);

    if (ctx.props.header) {
      ctx.setChildBounds(ctx.props.header.id, createRect(inner.x, inner.y, inner.width, headerHeight));
    }
    ctx.setChildBounds(resolveScrollId(ctx.id, ctx.props), createRect(inner.x, bodyY, inner.width, bodyHeight));
    if (ctx.props.footer) {
      ctx.setChildBounds(ctx.props.footer.id, createRect(inner.x, footerY, inner.width, footerHeight));
    }
    ctx.setContentBounds(inner);
  },
  render(ctx) {
    const theme = ctx.services.theme.getTokens();
    const commands: DrawCommand[] = [];
    if (ctx.props.backgroundColor) {
      commands.push({
        type: "rect",
        componentId: ctx.id,
        role: "surface-shell-background",
        rect: ctx.bounds,
        fill: ctx.props.backgroundColor,
        stroke: theme.borderColor,
        strokeWidth: 1,
        radius: theme.radius
      });
    }
    return commands;
  },
  hitTest(ctx) {
    return resolvePointerOpaqueHit(ctx);
  }
};

export function createSurfaceShell(
  id: string,
  props: SurfaceShellProps
): DisplayNode<SurfaceShellProps> {
  return createNode(id, SurfaceShellComponent, props);
}

function createBodyScrollNode(
  shellId: string,
  props: SurfaceShellProps
): DisplayNode<unknown, unknown> {
  return createScrollContainer(resolveScrollId(shellId, props), {
    children: props.children,
    ...(props.bodyGap === undefined ? {} : { gap: props.bodyGap }),
    ...(props.bodyPadding === undefined ? {} : { padding: props.bodyPadding }),
    ...(props.bodyBackgroundColor === undefined ? {} : { backgroundColor: props.bodyBackgroundColor }),
    ...(props.scrollbar === undefined ? {} : { scrollbar: props.scrollbar })
  });
}

function resolveScrollId(shellId: string, props: Pick<SurfaceShellProps, "scrollId">): string {
  return props.scrollId ?? `${shellId}:scroll`;
}

function createConstraints(maxWidth: number, maxHeight: number): LayoutConstraints {
  return {
    minWidth: 0,
    minHeight: 0,
    maxWidth,
    maxHeight
  };
}

function getBodyHeight(
  innerHeight: number,
  headerHeight: number,
  footerHeight: number,
  gap: number,
  props: Pick<SurfaceShellProps, "header" | "footer">
): number {
  const fixedGaps = (props.header ? gap : 0) + (props.footer ? gap : 0);
  return Math.max(0, innerHeight - headerHeight - footerHeight - fixedGaps);
}
