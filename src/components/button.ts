import { createActivationBehavior, type ActivationBehavior } from "../interaction/behaviors.js";
import { type DisplayComponent, type DisplayNode, createNode } from "../core/component.js";
import { rectContainsPoint } from "../core/geometry.js";
import { clearFocusableRegistration, syncFocusableRegistration } from "./focusable.js";

export interface ButtonProps {
  label: string;
  actionId: string;
  payload?: Record<string, unknown>;
  disabled?: boolean;
}

interface ButtonState { interaction: ActivationBehavior }

const ButtonComponent: DisplayComponent<ButtonProps, ButtonState> = {
  kind: "button",
  gesture: "activate",
  mount(ctx) {
    syncFocusableRegistration(ctx, !(ctx.props.disabled ?? false), `${ctx.id}:face`);
    return { interaction: createActivationBehavior() };
  },
  update(ctx) {
    if (ctx.props.disabled) ctx.state.interaction.cancel();
    syncFocusableRegistration(ctx, !(ctx.props.disabled ?? false), `${ctx.id}:face`);
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
    const fill = disabled
      ? theme.borderColor
      : ctx.state.interaction.pressed
        ? theme.accentColor
        : ctx.state.interaction.hovered
          ? theme.surfaceColor
          : theme.backgroundColor;
    const stroke =
      ctx.interaction.focusedComponentId === ctx.id ? theme.focusColor : theme.borderColor;

    return [
      {
        type: "rect",
        componentId: ctx.id,
        role: "button-face",
        rect: ctx.bounds,
        fill,
        stroke,
        strokeWidth: 1,
        radius: theme.radius
      },
      {
        type: "text",
        componentId: ctx.id,
        role: "button-label",
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
    if ((ctx.props.disabled ?? false) || !rectContainsPoint(ctx.bounds, ctx.point)) {
      return null;
    }
    return { targetId: `${ctx.id}:face`, role: "button-face" };
  },
  handleEvent(ctx) {
    if (!("timestamp" in ctx.event)) return;
    if (ctx.state.interaction.handle(ctx.event, ctx.props.disabled)) {
      ctx.emit({ type: "action", actionId: ctx.props.actionId, componentId: ctx.id,
        ...(ctx.props.payload ? { payload: ctx.props.payload } : {}) });
    }
  },
  dispose(ctx) {
    clearFocusableRegistration(ctx);
  }
};

export function createButton(id: string, props: ButtonProps): DisplayNode<ButtonProps, ButtonState> {
  return createNode(id, ButtonComponent, props);
}
