import { type DisplayComponent, type DisplayNode, createNode } from "../core/component.js";
import { rectContainsPoint } from "../core/geometry.js";
import { clearFocusableRegistration, syncFocusableRegistration } from "./focusable.js";

export interface HoldButtonProps {
  label: string;
  actionId: string;
  startPayload?: Record<string, unknown>;
  stopPayload?: Record<string, unknown>;
  disabled?: boolean;
}

interface HoldButtonState {
  hovered: boolean;
  pressed: boolean;
  active: boolean;
}

const HoldButtonComponent: DisplayComponent<HoldButtonProps, HoldButtonState> = {
  kind: "hold-button",
  mount(ctx) {
    syncFocusableRegistration(ctx, !(ctx.props.disabled ?? false), `${ctx.id}:face`);
    return {
      hovered: false,
      pressed: false,
      active: false
    };
  },
  update(ctx) {
    syncFocusableRegistration(ctx, !(ctx.props.disabled ?? false), `${ctx.id}:face`);
    if (!ctx.props.disabled || !ctx.state.active) {
      return;
    }

    stopHold(ctx);
  },
  measure(ctx) {
    const theme = ctx.services.theme.getTokens();
    return {
      width: ctx.constraints.maxWidth,
      height: theme.controlHeight
    };
  },
  render(ctx) {
    const theme = ctx.services.theme.getTokens();
    const disabled = ctx.props.disabled ?? false;
    const active = ctx.state.active;
    const fill = disabled
      ? theme.borderColor
      : active || ctx.state.pressed
        ? theme.accentColor
        : ctx.state.hovered
          ? theme.surfaceColor
          : theme.backgroundColor;
    const stroke =
      ctx.interaction.focusedComponentId === ctx.id ? theme.focusColor : theme.borderColor;

    return [
      {
        type: "rect",
        componentId: ctx.id,
        role: "hold-button-face",
        rect: ctx.bounds,
        fill,
        stroke,
        strokeWidth: 1,
        radius: theme.radius
      },
      {
        type: "text",
        componentId: ctx.id,
        role: "hold-button-label",
        text: ctx.props.label,
        rect: ctx.bounds,
        color: disabled ? theme.mutedTextColor : theme.textColor,
        align: "center",
        verticalAlign: "middle",
        fontSize: theme.typography.fontSize,
        fontWeight: theme.typography.fontWeight
      }
    ];
  },
  hitTest(ctx) {
    if (!rectContainsPoint(ctx.bounds, ctx.point) || ctx.props.disabled) {
      return null;
    }

    return { targetId: `${ctx.id}:face`, role: "hold-button-face" };
  },
  handleEvent(ctx) {
    if (ctx.props.disabled) {
      return;
    }

    switch (ctx.event.type) {
      case "pointer-enter":
        ctx.state.hovered = true;
        break;
      case "pointer-move":
        ctx.state.hovered = ctx.event.targetId === `${ctx.id}:face`;
        break;
      case "pointer-leave":
        ctx.state.hovered = false;
        break;
      case "pointer-down":
        if (!ctx.state.active) {
          ctx.state.active = true;
          ctx.state.pressed = true;
          ctx.emit({
            type: "action",
            actionId: ctx.props.actionId,
            componentId: ctx.id,
            ...(ctx.props.startPayload === undefined ? {} : { payload: ctx.props.startPayload })
          });
        }
        break;
      case "pointer-up":
      case "cancel":
        stopHold(ctx);
        break;
    }
  },
  dispose(ctx) {
    clearFocusableRegistration(ctx);
    if (ctx.state.active) {
      stopHold(ctx);
    }
  }
};

export function createHoldButton(
  id: string,
  props: HoldButtonProps
): DisplayNode<HoldButtonProps, HoldButtonState> {
  return createNode(id, HoldButtonComponent, props);
}

function stopHold(
  ctx:
    | Parameters<NonNullable<typeof HoldButtonComponent.update>>[0]
    | Parameters<NonNullable<typeof HoldButtonComponent.handleEvent>>[0]
    | Parameters<NonNullable<typeof HoldButtonComponent.dispose>>[0]
): void {
  if (!ctx.state.active) {
    ctx.state.pressed = false;
    return;
  }

  ctx.state.active = false;
  ctx.state.pressed = false;
  ctx.emit({
    type: "action",
    actionId: ctx.props.actionId,
    componentId: ctx.id,
    ...(ctx.props.stopPayload === undefined ? {} : { payload: ctx.props.stopPayload })
  });
}
