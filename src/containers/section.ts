import { type DisplayComponent, type DisplayNode, createNode } from "../core/component.js";
import { createRect } from "../core/geometry.js";
import {
  layoutVerticalChildren,
  measureVerticalChildren,
  resolvePadding,
  resolvePointerOpaqueHit,
  type PointerOpaqueProps
} from "./shared.js";

export interface SectionProps extends PointerOpaqueProps {
  title: string;
  children: readonly DisplayNode<unknown, unknown>[];
  gap?: number;
  padding?: number;
  backgroundColor?: string;
}

const SectionComponent: DisplayComponent<SectionProps> = {
  kind: "section",
  getChildren(ctx) {
    return ctx.props.children;
  },
  measure(ctx) {
    const theme = ctx.services.theme.getTokens();
    const padding = resolvePadding(ctx.props.padding, theme.padding);
    const childrenSize = measureVerticalChildren(
      {
        getChildren: () => ctx.getChildren(),
        measureChild: (childId) => ctx.measureChild(childId)
      },
      padding,
      ctx.props.gap ?? theme.spacing
    );
    return {
      width: Math.min(childrenSize.width, ctx.constraints.maxWidth),
      height: Math.min(
        childrenSize.height + theme.typography.lineHeight + theme.spacing,
        ctx.constraints.maxHeight
      )
    };
  },
  layout(ctx) {
    const theme = ctx.services.theme.getTokens();
    const padding = resolvePadding(ctx.props.padding, theme.padding);
    const headerHeight = theme.typography.lineHeight + theme.spacing;
    const sectionBodyBounds = createRect(
      ctx.bounds.x,
      ctx.bounds.y + headerHeight,
      ctx.bounds.width,
      Math.max(0, ctx.bounds.height - headerHeight)
    );
    const contentBounds = layoutVerticalChildren(
      {
        getChildren: () => ctx.getChildren(),
        getMeasuredSize: (childId) => ctx.getMeasuredSize(childId),
        setChildBounds: (childId, rect) => ctx.setChildBounds(childId, rect)
      },
      sectionBodyBounds,
      padding,
      ctx.props.gap ?? theme.spacing
    );
    ctx.setContentBounds(
      createRect(
        ctx.bounds.x,
        ctx.bounds.y,
        ctx.bounds.width,
        contentBounds.height + headerHeight
      )
    );
  },
  render(ctx) {
    const theme = ctx.services.theme.getTokens();
    return [
      {
        type: "rect",
        componentId: ctx.id,
        role: "section-background",
        rect: ctx.bounds,
        fill: ctx.props.backgroundColor ?? theme.surfaceColor,
        stroke: theme.borderColor,
        strokeWidth: 1,
        radius: theme.radius
      },
      {
        type: "text",
        componentId: ctx.id,
        role: "section-title",
        text: ctx.props.title,
        rect: createRect(
          ctx.bounds.x + theme.padding,
          ctx.bounds.y,
          ctx.bounds.width - theme.padding * 2,
          theme.typography.lineHeight + theme.spacing
        ),
        color: theme.mutedTextColor,
        align: "left",
        verticalAlign: "middle",
        fontSize: theme.typography.fontSize,
        fontWeight: theme.typography.fontWeight
      }
    ];
  },
  hitTest(ctx) {
    return resolvePointerOpaqueHit(ctx);
  }
};

export function createSection(id: string, props: SectionProps): DisplayNode<SectionProps> {
  return createNode(id, SectionComponent, props);
}
