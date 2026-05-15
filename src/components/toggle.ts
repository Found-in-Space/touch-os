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
    const switchRect = createRect(
      ctx.bounds.x + ctx.bounds.width - 44,
      ctx.bounds.y + (ctx.bounds.height - 24) / 2,
      36,
      24
    );
    const knobX = ctx.props.value ? switchRect.x + switchRect.width - 10 : switchRect.x + 10;

    return [
      {
        type: "rect",
        componentId: ctx.id,
        role: "toggle-row",
        rect: ctx.bounds,
        fill: theme.surfaceColor,
        stroke: theme.borderColor,
        strokeWidth: 1,
        radius: theme.radius
      },
      {
        type: "text",
        componentId: ctx.id,
        role: "toggle-label",
        text: ctx.props.label,
        rect: createRect(ctx.bounds.x + theme.padding, ctx.bounds.y, ctx.bounds.width - 56, ctx.bounds.height),
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
        stroke:
          ctx.interaction.focusedComponentId === ctx.id ? theme.focusColor : theme.borderColor,
        strokeWidth: 1,
        radius: switchRect.height / 2
      },
      {
        type: "circle",
        componentId: ctx.id,
        role: "toggle-knob",
        cx: knobX,
        cy: switchRect.y + switchRect.height / 2,
        radius: 8,
        fill: theme.accentTextColor
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
