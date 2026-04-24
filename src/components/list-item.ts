import { type DisplayComponent, type DisplayNode, createNode, isDisplayEvent } from "../core/component.js";
import { createRect, rectContainsPoint, type Rect } from "../core/geometry.js";
import { clearFocusableRegistration, syncFocusableRegistration } from "./focusable.js";

export interface ListItemProps {
  label: string;
  description?: string;
  actionId?: string;
  leadingText?: string;
  trailingText?: string;
  disabled?: boolean;
}

interface ListItemState {
  hoveredTargetId: string | undefined;
  pressedTargetId: string | undefined;
}

const ListItemComponent: DisplayComponent<ListItemProps, ListItemState> = {
  kind: "list-item",
  mount(ctx) {
    syncFocusableRegistration(ctx, isInteractive(ctx.props), `${ctx.id}:body`);
    return {
      hoveredTargetId: undefined,
      pressedTargetId: undefined
    };
  },
  update(ctx) {
    syncFocusableRegistration(ctx, isInteractive(ctx.props), `${ctx.id}:body`);
  },
  measure(ctx) {
    const theme = ctx.services.theme.getTokens();
    const lineCount = ctx.props.description ? 2 : 1;
    const contentHeight =
      theme.padding * 2 +
      lineCount * theme.typography.lineHeight +
      (lineCount > 1 ? theme.spacing / 2 : 0);
    return {
      width: ctx.constraints.maxWidth,
      height: Math.max(theme.controlHeight, contentHeight)
    };
  },
  render(ctx) {
    const theme = ctx.services.theme.getTokens();
    const disabled = ctx.props.disabled ?? false;
    const interactive = isInteractive(ctx.props);
    const trailingRect = getTrailingRect(ctx);
    const leadingRect = getLeadingRect(ctx);

    const fill = disabled
      ? theme.backgroundColor
      : ctx.state.pressedTargetId
        ? theme.accentColor
        : ctx.state.hoveredTargetId
          ? theme.surfaceColor
          : theme.backgroundColor;
    const stroke =
      ctx.interaction.focusedComponentId === ctx.id ? theme.focusColor : theme.borderColor;

    const mainLeft = leadingRect
      ? leadingRect.x + leadingRect.width + theme.spacing
      : ctx.bounds.x + theme.padding;
    const mainRight = trailingRect ? trailingRect.x - theme.spacing : ctx.bounds.x + ctx.bounds.width - theme.padding;
    const textWidth = Math.max(0, mainRight - mainLeft);
    const hasDescription = ctx.props.description !== undefined && ctx.props.description.length > 0;
    const labelRect = createRect(
      mainLeft,
      hasDescription ? ctx.bounds.y + theme.padding : ctx.bounds.y,
      textWidth,
      hasDescription ? theme.typography.lineHeight : ctx.bounds.height
    );
    const descriptionRect = createRect(
      mainLeft,
      labelRect.y + theme.typography.lineHeight + theme.spacing / 2,
      textWidth,
      theme.typography.lineHeight
    );

    return [
      {
        type: "rect",
        componentId: ctx.id,
        role: "list-item-row",
        rect: ctx.bounds,
        fill,
        stroke,
        strokeWidth: 1,
        radius: theme.radius
      },
      ...(leadingRect && ctx.props.leadingText
        ? [
            {
              type: "text" as const,
              componentId: ctx.id,
              role: "list-item-leading",
              text: ctx.props.leadingText,
              rect: leadingRect,
              color: disabled ? theme.mutedTextColor : theme.mutedTextColor,
              align: "left" as const,
              verticalAlign: "middle" as const,
              fontSize: theme.typography.fontSize,
              fontWeight: theme.typography.fontWeight
            }
          ]
        : []),
      {
        type: "text",
        componentId: ctx.id,
        role: "list-item-label",
        text: ctx.props.label,
        rect: labelRect,
        color: disabled ? theme.mutedTextColor : theme.textColor,
        align: "left",
        verticalAlign: hasDescription ? "top" : "middle",
        fontSize: theme.typography.fontSize,
        fontWeight: theme.typography.fontWeight
      },
      ...(ctx.props.description
        ? [
            {
              type: "text" as const,
              componentId: ctx.id,
              role: "list-item-description",
              text: ctx.props.description,
              rect: descriptionRect,
              color: theme.mutedTextColor,
              align: "left" as const,
              verticalAlign: "top" as const,
              fontSize: theme.typography.fontSize,
              fontWeight: theme.typography.fontWeight
            }
          ]
        : []),
      ...(trailingRect && ctx.props.trailingText
        ? [
            {
              type: "text" as const,
              componentId: ctx.id,
              role: "list-item-trailing",
              text: ctx.props.trailingText,
              rect: trailingRect,
              color: disabled ? theme.mutedTextColor : theme.mutedTextColor,
              align: "right" as const,
              verticalAlign: "middle" as const,
              fontSize: theme.typography.fontSize,
              fontWeight: theme.typography.fontWeight
            }
          ]
        : [])
    ];
  },
  hitTest(ctx) {
    if (!isInteractive(ctx.props) || !rectContainsPoint(ctx.bounds, ctx.point)) {
      return null;
    }

    const trailingRect = getTrailingRect(ctx);
    if (trailingRect && rectContainsPoint(trailingRect, ctx.point)) {
      return { targetId: `${ctx.id}:trailing`, role: "list-item-trailing" };
    }

    return { targetId: `${ctx.id}:body`, role: "list-item-body" };
  },
  handleEvent(ctx) {
    if (!isInteractive(ctx.props) || !isDisplayEvent(ctx.event)) {
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
        ctx.state.pressedTargetId = undefined;
        ctx.emit({
          type: "action",
          actionId: ctx.props.actionId,
          componentId: ctx.id
        });
        break;
    }
  },
  dispose(ctx) {
    clearFocusableRegistration(ctx);
  }
};

export function createListItem(id: string, props: ListItemProps): DisplayNode<ListItemProps, ListItemState> {
  return createNode(id, ListItemComponent, props);
}

function isInteractive(props: ListItemProps): props is ListItemProps & { actionId: string } {
  return Boolean(props.actionId) && !(props.disabled ?? false);
}

function getTrailingRect(
  ctx: Pick<Parameters<NonNullable<typeof ListItemComponent.render>>[0], "bounds" | "props" | "estimateTextWidth" | "services">
): Rect | undefined {
  const trailingText = ctx.props.trailingText;
  if (!trailingText) {
    return undefined;
  }

  const theme = ctx.services.theme.getTokens();
  const width = Math.max(
    24,
    ctx.estimateTextWidth(trailingText, theme.typography.fontSize)
  );
  return createRect(
    ctx.bounds.x + ctx.bounds.width - theme.padding - width,
    ctx.bounds.y,
    width,
    ctx.bounds.height
  );
}

function getLeadingRect(
  ctx: Pick<Parameters<NonNullable<typeof ListItemComponent.render>>[0], "bounds" | "props" | "estimateTextWidth" | "services">
): Rect | undefined {
  const leadingText = ctx.props.leadingText;
  if (!leadingText) {
    return undefined;
  }

  const theme = ctx.services.theme.getTokens();
  const width = Math.max(
    24,
    ctx.estimateTextWidth(leadingText, theme.typography.fontSize)
  );
  return createRect(ctx.bounds.x + theme.padding, ctx.bounds.y, width, ctx.bounds.height);
}
