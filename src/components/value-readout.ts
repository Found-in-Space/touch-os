import { type DisplayComponent, type DisplayNode, createNode } from "../core/component.js";
import { createRect } from "../core/geometry.js";

export interface ValueReadoutProps {
  label: string;
  value: string | number;
}

const ValueReadoutComponent: DisplayComponent<ValueReadoutProps> = {
  kind: "value-readout",
  measure(ctx) {
    const theme = ctx.services.theme.getTokens();
    return {
      width: ctx.constraints.maxWidth,
      height: theme.controlHeight
    };
  },
  render(ctx) {
    const theme = ctx.services.theme.getTokens();
    const labelRect = createRect(ctx.bounds.x + theme.padding, ctx.bounds.y, ctx.bounds.width / 2, ctx.bounds.height);
    const valueRect = createRect(ctx.bounds.x, ctx.bounds.y, ctx.bounds.width - theme.padding, ctx.bounds.height);

    return [
      {
        type: "rect",
        componentId: ctx.id,
        role: "value-readout-row",
        rect: ctx.bounds,
        fill: theme.surfaceColor,
        stroke: theme.borderColor,
        strokeWidth: 1,
        radius: theme.radius
      },
      {
        type: "text",
        componentId: ctx.id,
        role: "value-readout-label",
        text: ctx.props.label,
        rect: labelRect,
        color: theme.mutedTextColor,
        align: "left",
        verticalAlign: "middle",
        fontSize: theme.typography.fontSize,
        fontWeight: theme.typography.fontWeight
      },
      {
        type: "text",
        componentId: ctx.id,
        role: "value-readout-value",
        text: String(ctx.props.value),
        rect: valueRect,
        color: theme.textColor,
        align: "right",
        verticalAlign: "middle",
        fontSize: theme.typography.fontSize,
        fontWeight: theme.typography.fontWeight
      }
    ];
  },
  hitTest() {
    return null;
  }
};

export function createValueReadout(
  id: string,
  props: ValueReadoutProps
): DisplayNode<ValueReadoutProps> {
  return createNode(id, ValueReadoutComponent, props);
}
