import { createNode, type DisplayComponent, type DisplayNode, isDisplayEvent } from "../core/component.js";
import { rectContainsPoint } from "../core/geometry.js";
import { createContinuousValueBehavior, type ContinuousValueBehavior } from "../interaction/behaviors.js";
import { normalizeSliderProps, normalizeSliderValue, resolveSliderValueText, type SliderProps } from "./slider-contract.js";
import { clearFocusableRegistration, syncFocusableRegistration } from "./focusable.js";

/** A polar value mapping over the same editing behavior as a slider. */
export type DialProps = SliderProps;
const Dial: DisplayComponent<DialProps, ContinuousValueBehavior> = {
  kind: "dial", gesture: "continuous",
  mount(ctx) {
    syncFocusableRegistration(ctx, !ctx.props.disabled, `${ctx.id}:dial`);
    return createContinuousValueBehavior();
  },
  update(ctx) { syncFocusableRegistration(ctx, !ctx.props.disabled, `${ctx.id}:dial`); if (ctx.props.disabled) ctx.state.cancel(); },
  measure(ctx) { return { width: ctx.constraints.maxWidth, height: 112 }; },
  hitTest(ctx) { return !ctx.props.disabled && rectContainsPoint(ctx.bounds, ctx.point) ? { targetId: `${ctx.id}:dial` } : null; },
  render(ctx) {
    const props = normalizeSliderProps(ctx.props, `Dial "${ctx.id}"`);
    const theme = ctx.services.theme.getTokens();
    const x = ctx.bounds.x + ctx.bounds.width / 2, y = ctx.bounds.y + 56;
    const angle = (-0.75 + 1.5 * (props.value - props.min) / (props.max - props.min)) * Math.PI;
    return [
      { type: "text", componentId: ctx.id, role: "dial-value", text: `${props.label} ${resolveSliderValueText(props)}`,
        rect: { ...ctx.bounds, height: 24 }, color: theme.textColor, fontSize: theme.typography.fontSize },
      { type: "circle", componentId: ctx.id, role: "dial-face", cx: x, cy: y, radius: ctx.state.dragging ? 29 : 26,
        fill: theme.backgroundColor, stroke: theme.accentColor, strokeWidth: ctx.state.hovered ? 3 : 1 },
      { type: "line", componentId: ctx.id, role: "dial-indicator", x1: x, y1: y,
        x2: x + Math.sin(angle) * 22, y2: y - Math.cos(angle) * 22, stroke: theme.accentColor, strokeWidth: 3 }
    ];
  },
  handleEvent(ctx) {
    if (!isDisplayEvent(ctx.event)) return;
    const props = normalizeSliderProps(ctx.props, `Dial "${ctx.id}"`);
    ctx.state.handle(ctx.event, { value: props.value, disabled: props.disabled,
      map(x, y) {
        const angle = Math.atan2(x - ctx.bounds.width / 2, 56 - y);
        const ratio = Math.max(0, Math.min(1, (angle / Math.PI + 0.75) / 1.5));
        return normalizeSliderValue(props.min + ratio * (props.max - props.min), props.min, props.max, props.step);
      },
      change(value, phase) { ctx.emit({ type: "change-request", componentId: ctx.id, field: props.field, value, phase }); }
    });
  },
  dispose(ctx) { ctx.state.cancel(); clearFocusableRegistration(ctx); }
};
export function createDial(id: string, props: DialProps): DisplayNode<DialProps, ContinuousValueBehavior> {
  normalizeSliderProps(props, `Dial "${id}"`);
  return createNode(id, Dial, props);
}
