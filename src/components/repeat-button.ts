import { type DisplayComponent, type DisplayNode, createNode } from "../core/component.js";
import { rectContainsPoint } from "../core/geometry.js";

export interface RepeatButtonProps {
  label: string;
  actionId: string;
  payload?: Record<string, unknown>;
  repeatDelayMs?: number;
  repeatIntervalMs?: number;
  disabled?: boolean;
}

interface RepeatButtonState {
  hovered: boolean;
  pressed: boolean;
  active: boolean;
  nextRepeatTimestamp: number | undefined;
}

const RepeatButtonComponent: DisplayComponent<RepeatButtonProps, RepeatButtonState> = {
  kind: "repeat-button",
  mount() {
    return {
      hovered: false,
      pressed: false,
      active: false,
      nextRepeatTimestamp: undefined
    };
  },
  update(ctx) {
    if (!ctx.props.disabled) {
      return;
    }

    deactivateRepeat(ctx);
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
      : ctx.state.active || ctx.state.pressed
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
        role: "repeat-button-face",
        rect: ctx.bounds,
        fill,
        stroke,
        strokeWidth: 1,
        radius: theme.radius
      },
      {
        type: "text",
        componentId: ctx.id,
        role: "repeat-button-label",
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

    return { targetId: `${ctx.id}:face`, role: "repeat-button-face" };
  },
  handleEvent(ctx) {
    if (ctx.event.type === "tick") {
      if (!ctx.state.active || ctx.props.disabled) {
        return;
      }

      const interval = Math.max(1, ctx.props.repeatIntervalMs ?? 90);
      while (
        ctx.state.nextRepeatTimestamp !== undefined &&
        ctx.event.timestamp >= ctx.state.nextRepeatTimestamp
      ) {
        emitRepeatAction(ctx);
        ctx.state.nextRepeatTimestamp += interval;
      }
      return;
    }

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
      case "pointer-down": {
        if (ctx.state.active) {
          return;
        }

        ctx.state.active = true;
        ctx.state.pressed = true;
        emitRepeatAction(ctx);
        ctx.state.nextRepeatTimestamp = ctx.event.timestamp + (ctx.props.repeatDelayMs ?? 300);
        break;
      }
      case "pointer-up":
      case "cancel":
        deactivateRepeat(ctx);
        break;
    }
  },
  dispose(ctx) {
    deactivateRepeat(ctx);
  }
};

export function createRepeatButton(
  id: string,
  props: RepeatButtonProps
): DisplayNode<RepeatButtonProps, RepeatButtonState> {
  return createNode(id, RepeatButtonComponent, props);
}

function emitRepeatAction(
  ctx: Parameters<NonNullable<typeof RepeatButtonComponent.handleEvent>>[0]
): void {
  ctx.emit({
    type: "action",
    actionId: ctx.props.actionId,
    componentId: ctx.id,
    ...(ctx.props.payload === undefined ? {} : { payload: ctx.props.payload })
  });
}

function deactivateRepeat(
  ctx:
    | Parameters<NonNullable<typeof RepeatButtonComponent.update>>[0]
    | Parameters<NonNullable<typeof RepeatButtonComponent.handleEvent>>[0]
    | Parameters<NonNullable<typeof RepeatButtonComponent.dispose>>[0]
): void {
  ctx.state.active = false;
  ctx.state.pressed = false;
  ctx.state.nextRepeatTimestamp = undefined;
}
