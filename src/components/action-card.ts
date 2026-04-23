import {
  type DisplayComponent,
  type DisplayNode,
  createNode,
  isDisplayEvent
} from "../core/component.js";
import type { DrawCommand } from "../core/draw.js";
import { createRect, rectContainsPoint, type Rect } from "../core/geometry.js";

export interface ActionCardProps {
  title: string;
  lines?: readonly string[];
  emptyStateText?: string;
  primaryActionId?: string;
  primaryActionLabel?: string;
  dismissible?: boolean;
  dismissActionId?: string;
}

interface ActionCardState {
  hoveredTargetId: string | undefined;
  pressedTargetId: string | undefined;
}

const ActionCardComponent: DisplayComponent<ActionCardProps, ActionCardState> = {
  kind: "action-card",
  mount() {
    return {
      hoveredTargetId: undefined,
      pressedTargetId: undefined
    };
  },
  measure(ctx) {
    const theme = ctx.services.theme.getTokens();
    const lines = (ctx.props.lines?.length ?? 0) > 0 ? ctx.props.lines ?? [] : [ctx.props.emptyStateText ?? "No details available"];
    const contentHeight = lines.length * theme.typography.lineHeight;
    const actionHeight = ctx.props.primaryActionLabel ? theme.controlHeight + theme.spacing : 0;
    return {
      width: ctx.constraints.maxWidth,
      height:
        theme.padding * 2 +
        theme.typography.lineHeight +
        theme.spacing +
        contentHeight +
        actionHeight
    };
  },
  render(ctx) {
    const theme = ctx.services.theme.getTokens();
    const textLeft = ctx.bounds.x + theme.padding;
    const titleRect = createRect(
      textLeft,
      ctx.bounds.y + theme.padding,
      Math.max(0, ctx.bounds.width - theme.padding * 2 - (ctx.props.dismissible ? 28 : 0)),
      theme.typography.lineHeight
    );
    const lines = (ctx.props.lines?.length ?? 0) > 0 ? ctx.props.lines ?? [] : [ctx.props.emptyStateText ?? "No details available"];
    const commands: DrawCommand[] = [
      {
        type: "rect" as const,
        componentId: ctx.id,
        role: "action-card-frame",
        rect: ctx.bounds,
        fill: theme.surfaceColor,
        stroke:
          ctx.interaction.focusedComponentId === ctx.id ? theme.focusColor : theme.borderColor,
        strokeWidth: 1,
        radius: theme.radius
      },
      {
        type: "text" as const,
        componentId: ctx.id,
        role: "action-card-title",
        text: ctx.props.title,
        rect: titleRect,
        color: theme.accentColor,
        align: "left" as const,
        verticalAlign: "top" as const,
        fontSize: theme.typography.fontSize,
        fontWeight: 700
      }
    ];

    let nextY = titleRect.y + titleRect.height + theme.spacing;
    for (const line of lines) {
      commands.push({
        type: "text" as const,
        componentId: ctx.id,
        role: "action-card-line",
        text: line,
        rect: createRect(textLeft, nextY, ctx.bounds.width - theme.padding * 2, theme.typography.lineHeight),
        color:
          (ctx.props.lines?.length ?? 0) > 0 ? theme.textColor : theme.mutedTextColor,
        align: "left" as const,
        verticalAlign: "top" as const,
        fontSize: theme.typography.fontSize,
        fontWeight: theme.typography.fontWeight
      });
      nextY += theme.typography.lineHeight;
    }

    const actionRect = getPrimaryActionRect(ctx.bounds, ctx.props.primaryActionLabel, theme.controlHeight, theme.padding);
    if (actionRect && ctx.props.primaryActionLabel) {
      commands.push({
        type: "rect" as const,
        componentId: ctx.id,
        role: "action-card-primary",
        rect: actionRect,
        fill:
          ctx.state.pressedTargetId === `${ctx.id}:primary`
            ? theme.accentColor
            : ctx.state.hoveredTargetId === `${ctx.id}:primary`
              ? theme.backgroundColor
              : theme.backgroundColor,
        stroke: theme.borderColor,
        strokeWidth: 1,
        radius: theme.radius
      });
      commands.push({
        type: "text" as const,
        componentId: ctx.id,
        role: "action-card-primary-label",
        text: ctx.props.primaryActionLabel,
        rect: actionRect,
        color: theme.textColor,
        align: "center" as const,
        verticalAlign: "middle" as const,
        fontSize: theme.typography.fontSize,
        fontWeight: 700
      });
    }

    const dismissRect = getDismissRect(ctx.bounds, ctx.props.dismissible, theme.padding);
    if (dismissRect) {
      commands.push({
        type: "circle" as const,
        componentId: ctx.id,
        role: "action-card-dismiss",
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
        role: "action-card-dismiss-label",
        text: "x",
        rect: dismissRect,
        color: theme.textColor,
        align: "center" as const,
        verticalAlign: "middle" as const,
        fontSize: theme.typography.fontSize,
        fontWeight: 700
      });
    }

    return commands;
  },
  hitTest(ctx) {
    if (!rectContainsPoint(ctx.bounds, ctx.point)) {
      return null;
    }

    const theme = ctx.services.theme.getTokens();
    const dismissRect = getDismissRect(ctx.bounds, ctx.props.dismissible, theme.padding);
    if (dismissRect && rectContainsPoint(dismissRect, ctx.point)) {
      return { targetId: `${ctx.id}:dismiss`, role: "dismiss" };
    }

    const actionRect = getPrimaryActionRect(ctx.bounds, ctx.props.primaryActionLabel, theme.controlHeight, theme.padding);
    if (actionRect && rectContainsPoint(actionRect, ctx.point)) {
      return { targetId: `${ctx.id}:primary`, role: "primary-action" };
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
        break;
      case "pointer-up":
      case "cancel":
        ctx.state.pressedTargetId = undefined;
        break;
      case "press":
        if (ctx.event.targetId === `${ctx.id}:primary`) {
          ctx.emit({
            type: "action",
            actionId: ctx.props.primaryActionId ?? `${ctx.id}.primary`,
            componentId: ctx.id
          });
        }
        if (ctx.event.targetId === `${ctx.id}:dismiss`) {
          ctx.emit({
            type: "action",
            actionId: ctx.props.dismissActionId ?? `${ctx.id}.dismiss`,
            componentId: ctx.id
          });
        }
        ctx.state.pressedTargetId = undefined;
        break;
    }
  }
};

export function createActionCard(
  id: string,
  props: ActionCardProps
): DisplayNode<ActionCardProps, ActionCardState> {
  return createNode(id, ActionCardComponent, props);
}

function getPrimaryActionRect(
  bounds: Rect,
  label: string | undefined,
  controlHeight: number,
  padding: number
): Rect | undefined {
  if (!label) {
    return undefined;
  }

  return createRect(
    bounds.x + padding,
    bounds.y + bounds.height - padding - controlHeight,
    Math.max(0, bounds.width - padding * 2),
    controlHeight
  );
}

function getDismissRect(
  bounds: Rect,
  dismissible: boolean | undefined,
  padding: number
): Rect | undefined {
  if (!dismissible) {
    return undefined;
  }

  return createRect(bounds.x + bounds.width - padding - 18, bounds.y + padding, 18, 18);
}
