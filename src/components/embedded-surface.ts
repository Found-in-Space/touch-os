import {
  type DisplayComponent,
  type DisplayNode,
  createNode,
  isDisplayEvent
} from "../core/component.js";
import type { DrawCommand } from "../core/draw.js";
import { createRect, rectContainsPoint, type Rect } from "../core/geometry.js";

export interface EmbeddedSurfaceProps {
  sourceId: string;
  title?: string;
  interactive?: boolean;
  preserveAspectRatio?: boolean;
  acceptsForwardedInput?: boolean;
  desiredSourceType?: string;
  refreshPolicy?: "manual" | "always";
  compositionMode?: "copy" | "composite";
  fallbackLabel?: string;
  dismissible?: boolean;
  dismissActionId?: string;
}

interface EmbeddedSurfaceState {
  hoveredTargetId: string | undefined;
  pressedTargetId: string | undefined;
}

const EmbeddedSurfaceComponent: DisplayComponent<EmbeddedSurfaceProps, EmbeddedSurfaceState> = {
  kind: "embedded-surface",
  mount(ctx) {
    ctx.services.surfaces.attach(ctx.id, createEmbeddedSurfaceConfig(ctx.props));

    return {
      hoveredTargetId: undefined,
      pressedTargetId: undefined
    };
  },
  update(ctx) {
    ctx.services.surfaces.configure(ctx.id, createEmbeddedSurfaceConfig(ctx.props));
  },
  measure(ctx) {
    return {
      width: ctx.constraints.maxWidth,
      height: 160
    };
  },
  render(ctx) {
    const theme = ctx.services.theme.getTokens();
    const attachment = ctx.services.surfaces.getAttachment(ctx.id);
    const viewportRect = getViewportRect(
      ctx.bounds,
      theme.padding,
      Boolean(ctx.props.title),
      attachment?.preserveAspectRatio ?? ctx.props.preserveAspectRatio ?? true,
      attachment?.aspectRatio
    );
    const commands: DrawCommand[] = [
      {
        type: "rect" as const,
        componentId: ctx.id,
        role: "embedded-surface-frame",
        rect: ctx.bounds,
        fill: theme.surfaceColor,
        stroke:
          ctx.interaction.focusedComponentId === ctx.id ? theme.focusColor : theme.borderColor,
        strokeWidth: 1,
        radius: theme.radius
      }
    ];

    if (ctx.props.title) {
      commands.push({
        type: "text" as const,
        componentId: ctx.id,
        role: "embedded-surface-title",
        text: ctx.props.title,
        rect: createRect(
          ctx.bounds.x + theme.padding,
          ctx.bounds.y + 4,
          ctx.bounds.width - theme.padding * 2,
          theme.typography.lineHeight
        ),
        color: theme.textColor,
        align: "left" as const,
        verticalAlign: "middle" as const,
        fontSize: theme.typography.fontSize,
        fontWeight: 700
      });
    }

    if (ctx.props.dismissible) {
      const dismissRect = getDismissRect(ctx.bounds, theme.padding);
      commands.push({
        type: "circle" as const,
        componentId: ctx.id,
        role: "embedded-surface-dismiss",
        cx: dismissRect.x + dismissRect.width / 2,
        cy: dismissRect.y + dismissRect.height / 2,
        radius: dismissRect.width / 2,
        fill:
          ctx.state.pressedTargetId === `${ctx.id}:dismiss`
            ? theme.accentColor
            : ctx.state.hoveredTargetId === `${ctx.id}:dismiss`
              ? theme.backgroundColor
              : theme.borderColor,
        stroke: theme.textColor,
        strokeWidth: 1
      });
      commands.push({
        type: "text" as const,
        componentId: ctx.id,
        role: "embedded-surface-dismiss-label",
        text: "x",
        rect: dismissRect,
        color: theme.textColor,
        align: "center" as const,
        verticalAlign: "middle" as const,
        fontSize: theme.typography.fontSize,
        fontWeight: 700
      });
    }

    if (ctx.services.surfaces.isAvailable(ctx.id)) {
      commands.push({
        type: "surface" as const,
        componentId: ctx.id,
        role: "embedded-surface-viewport",
        rect: viewportRect,
        handle: ctx.services.surfaces.getHandle(ctx.id),
        compositionMode: ctx.props.compositionMode ?? "copy"
      });
    } else {
      commands.push({
        type: "rect" as const,
        componentId: ctx.id,
        role: "embedded-surface-placeholder",
        rect: viewportRect,
        fill: theme.backgroundColor,
        stroke: theme.borderColor,
        strokeWidth: 1,
        radius: theme.radius
      });
      commands.push({
        type: "text" as const,
        componentId: ctx.id,
        role: "embedded-surface-placeholder-label",
        text: ctx.props.fallbackLabel ?? "Source Unavailable",
        rect: viewportRect,
        color: theme.mutedTextColor,
        align: "center" as const,
        verticalAlign: "middle" as const,
        fontSize: theme.typography.fontSize,
        fontWeight: theme.typography.fontWeight
      });
    }

    return commands;
  },
  hitTest(ctx) {
    if (!rectContainsPoint(ctx.bounds, ctx.point)) {
      return null;
    }

    const theme = ctx.services.theme.getTokens();
    const dismissRect = ctx.props.dismissible ? getDismissRect(ctx.bounds, theme.padding) : undefined;
    if (dismissRect && rectContainsPoint(dismissRect, ctx.point)) {
      return { targetId: `${ctx.id}:dismiss`, role: "dismiss" };
    }

    if (!(ctx.props.interactive ?? false)) {
      return null;
    }

    const attachment = ctx.services.surfaces.getAttachment(ctx.id);
    const viewportRect = getViewportRect(
      ctx.bounds,
      theme.padding,
      Boolean(ctx.props.title),
      attachment?.preserveAspectRatio ?? ctx.props.preserveAspectRatio ?? true,
      attachment?.aspectRatio
    );
    if (rectContainsPoint(viewportRect, ctx.point)) {
      return { targetId: `${ctx.id}:viewport`, role: "viewport" };
    }

    return null;
  },
  handleEvent(ctx) {
    if (!isDisplayEvent(ctx.event)) {
      return;
    }

    switch (ctx.event.type) {
      case "pointer-enter":
      case "pointer-move":
        ctx.state.hoveredTargetId = ctx.event.targetId;
        break;
      case "pointer-leave":
        ctx.state.hoveredTargetId = undefined;
        ctx.state.pressedTargetId = undefined;
        break;
      case "pointer-down":
        ctx.state.pressedTargetId = ctx.event.targetId;
        if (
          ctx.event.targetId === `${ctx.id}:viewport` &&
          ctx.props.interactive &&
          ctx.props.acceptsForwardedInput
        ) {
          ctx.services.surfaces.forwardEvent(ctx.id, ctx.event);
        }
        break;
      case "pointer-up":
      case "cancel":
        ctx.state.pressedTargetId = undefined;
        break;
      case "press":
        if (ctx.event.targetId === `${ctx.id}:dismiss`) {
          ctx.emit({
            type: "action",
            actionId: ctx.props.dismissActionId ?? `${ctx.id}.dismiss`,
            componentId: ctx.id
          });
        }
        if (
          ctx.event.targetId === `${ctx.id}:viewport` &&
          ctx.props.interactive &&
          ctx.props.acceptsForwardedInput
        ) {
          ctx.services.surfaces.forwardEvent(ctx.id, ctx.event);
        }
        ctx.state.pressedTargetId = undefined;
        break;
      case "drag-start":
      case "drag-move":
      case "drag-end":
      case "scroll":
        if (
          ctx.event.targetId === `${ctx.id}:viewport` &&
          ctx.props.interactive &&
          ctx.props.acceptsForwardedInput
        ) {
          ctx.services.surfaces.forwardEvent(ctx.id, ctx.event);
        }
        break;
    }
  },
  dispose(ctx) {
    ctx.services.surfaces.release(ctx.id);
  }
};

export function createEmbeddedSurface(
  id: string,
  props: EmbeddedSurfaceProps
): DisplayNode<EmbeddedSurfaceProps, EmbeddedSurfaceState> {
  return createNode(id, EmbeddedSurfaceComponent, props);
}

function getViewportRect(
  bounds: Rect,
  padding: number,
  hasTitle: boolean,
  preserveAspectRatio: boolean,
  aspectRatio: number | undefined
): Rect {
  const headerHeight = hasTitle ? 20 : 0;
  const availableRect = createRect(
    bounds.x + padding,
    bounds.y + padding + headerHeight,
    Math.max(0, bounds.width - padding * 2),
    Math.max(0, bounds.height - padding * 2 - headerHeight)
  );
  if (!preserveAspectRatio || !aspectRatio || aspectRatio <= 0) {
    return availableRect;
  }

  const availableAspectRatio =
    availableRect.height > 0 ? availableRect.width / availableRect.height : aspectRatio;
  if (availableAspectRatio >= aspectRatio) {
    const width = availableRect.height * aspectRatio;
    return createRect(
      availableRect.x + (availableRect.width - width) / 2,
      availableRect.y,
      width,
      availableRect.height
    );
  }

  const height = availableRect.width / aspectRatio;
  return createRect(
    availableRect.x,
    availableRect.y + (availableRect.height - height) / 2,
    availableRect.width,
    height
  );
}

function getDismissRect(bounds: Rect, padding: number): Rect {
  return createRect(bounds.x + bounds.width - padding - 18, bounds.y + 6, 18, 18);
}

function createEmbeddedSurfaceConfig(props: EmbeddedSurfaceProps) {
  return {
    sourceId: props.sourceId,
    ...(props.interactive === undefined ? {} : { interactive: props.interactive }),
    ...(props.preserveAspectRatio === undefined
      ? {}
      : { preserveAspectRatio: props.preserveAspectRatio }),
    ...(props.acceptsForwardedInput === undefined
      ? {}
      : { acceptsForwardedInput: props.acceptsForwardedInput }),
    ...(props.desiredSourceType === undefined
      ? {}
      : { desiredSourceType: props.desiredSourceType }),
    ...(props.refreshPolicy === undefined ? {} : { refreshPolicy: props.refreshPolicy }),
    ...(props.compositionMode === undefined ? {} : { compositionMode: props.compositionMode }),
    ...(props.fallbackLabel === undefined ? {} : { fallbackLabel: props.fallbackLabel })
  };
}
