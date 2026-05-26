import { type DisplayComponent, type DisplayNode, createNode } from "../core/component.js";
import { createRect, rectContainsPoint } from "../core/geometry.js";
import { clearFocusableRegistration, syncFocusableRegistration } from "./focusable.js";

export interface ToggleProps {
  label: string;
  value: boolean;
  field: string;
}

const ToggleComponent: DisplayComponent<ToggleProps> = {
  kind: "toggle",
  mount(ctx) {
    syncFocusableRegistration(ctx, true, `${ctx.id}:switch`);
  },
  update(ctx) {
    syncFocusableRegistration(ctx, true, `${ctx.id}:switch`);
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
    const switchHeight = Math.max(20, Math.min(28, Math.round(ctx.bounds.height * 0.62)));
    const switchWidth = Math.max(36, Math.min(48, Math.round(switchHeight * 1.75)));
    const switchRect = createRect(
      ctx.bounds.x + ctx.bounds.width - switchWidth - theme.padding,
      ctx.bounds.y + (ctx.bounds.height - switchHeight) / 2,
      switchWidth,
      switchHeight
    );
    const knobInset = Math.max(3, Math.round(switchHeight * 0.14));
    const knobRadius = Math.max(6, (switchHeight - knobInset * 2) / 2);
    const knobX = ctx.props.value
      ? switchRect.x + switchRect.width - knobInset - knobRadius
      : switchRect.x + knobInset + knobRadius;
    const labelRight = ctx.bounds.x + ctx.bounds.width - switchWidth - theme.padding * 2;
    const focused = ctx.interaction.focusedComponentId === ctx.id;

    return [
      {
        type: "rect",
        componentId: ctx.id,
        role: "toggle-row",
        rect: ctx.bounds,
        ...(focused ? { stroke: theme.focusColor, strokeWidth: 2 } : {}),
        radius: Math.max(4, Math.min(theme.radius, ctx.bounds.height / 4))
      },
      {
        type: "text",
        componentId: ctx.id,
        role: "toggle-label",
        text: ctx.props.label,
        rect: createRect(
          ctx.bounds.x + theme.padding,
          ctx.bounds.y,
          Math.max(0, labelRight - ctx.bounds.x - theme.padding),
          ctx.bounds.height
        ),
        color: theme.textColor,
        align: "left",
        verticalAlign: "middle",
        fontSize: theme.typography.fontSize,
        fontWeight: theme.typography.fontWeight
      },
      {
        type: "rect",
        componentId: ctx.id,
        role: "toggle-switch",
        rect: switchRect,
        fill: ctx.props.value ? theme.accentColor : theme.backgroundColor,
        stroke: ctx.props.value ? theme.accentColor : theme.borderColor,
        strokeWidth: 1,
        radius: switchRect.height / 2
      },
      {
        type: "circle",
        componentId: ctx.id,
        role: "toggle-knob",
        cx: knobX,
        cy: switchRect.y + switchRect.height / 2,
        radius: knobRadius,
        fill: ctx.props.value ? theme.accentTextColor : theme.mutedTextColor
      }
    ];
  },
  hitTest(ctx) {
    if (!rectContainsPoint(ctx.bounds, ctx.point)) {
      return null;
    }
    return {
      targetId: `${ctx.id}:switch`,
      role: "toggle-switch"
    };
  },
  handleEvent(ctx) {
    if (ctx.event.type !== "press") {
      return;
    }

    ctx.emit({
      type: "change-request",
      componentId: ctx.id,
      field: ctx.props.field,
      value: !ctx.props.value
    });
  },
  dispose(ctx) {
    clearFocusableRegistration(ctx);
  }
};

export function createToggle(id: string, props: ToggleProps): DisplayNode<ToggleProps> {
  validateToggleProps(props, `Toggle "${id}"`);
  return createNode(id, ToggleComponent, props);
}

function validateToggleProps(props: ToggleProps, context: string): void {
  if (typeof props.field !== "string") {
    throw new Error(`${context} field is required.`);
  }
  if (props.field.trim().length === 0) {
    throw new Error(`${context} field must not be empty.`);
  }
}
