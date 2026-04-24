import { type DisplayComponent, type DisplayNode, createNode } from "../core/component.js";
import { clamp, createRect, rectContainsPoint } from "../core/geometry.js";
import type { ThemeTokens } from "../services/contracts.js";
import { clearFocusableRegistration, syncFocusableRegistration } from "./focusable.js";
import {
  normalizeSliderValue,
  normalizeSliderProps,
  resolveSliderValueText,
  type SliderProps
} from "./slider-contract.js";

export type { SliderProps, SliderValueLabel } from "./slider-contract.js";

interface SliderState {
  dragging: boolean;
  hovered: boolean;
  lastEmittedValue: number | undefined;
}

const SliderComponent: DisplayComponent<SliderProps, SliderState> = {
  kind: "slider",
  mount(ctx) {
    syncFocusableRegistration(
      ctx,
      !(normalizeSliderProps(ctx.props, `Slider "${ctx.id}"`).disabled ?? false),
      `${ctx.id}:thumb`
    );
    return {
      dragging: false,
      hovered: false,
      lastEmittedValue: undefined
    };
  },
  update(ctx) {
    const props = normalizeSliderProps(ctx.props, `Slider "${ctx.id}"`);
    syncFocusableRegistration(ctx, !(props.disabled ?? false), `${ctx.id}:thumb`);
    if (!props.disabled) {
      return;
    }

    ctx.state.dragging = false;
    ctx.state.hovered = false;
    ctx.state.lastEmittedValue = undefined;
  },
  measure(ctx) {
    const theme = ctx.services.theme.getTokens();
    return {
      width: ctx.constraints.maxWidth,
      height: theme.typography.lineHeight + theme.spacing + theme.controlHeight
    };
  },
  render(ctx) {
    const props = normalizeSliderProps(ctx.props, `Slider "${ctx.id}"`);
    const theme = ctx.services.theme.getTokens();
    const displayValue = resolveSliderValueText(props);
    const textLayout = getTextLayout(ctx.bounds, displayValue, theme, ctx.estimateTextWidth);
    const track = getTrackRect(ctx.bounds, theme);
    const thumb = getThumbRect(track, props);
    const ratio = normalizeValue(props.value, props.min, props.max);
    const fillWidth = Math.max(0, track.width * ratio);
    const accentFill = props.disabled
      ? theme.borderColor
      : ctx.state.dragging || ctx.state.hovered
        ? theme.accentColor
        : theme.borderColor;
    const trackStroke = props.disabled ? theme.borderColor : theme.borderColor;
    const textColor = props.disabled ? theme.mutedTextColor : theme.textColor;

    return [
      {
        type: "text",
        componentId: ctx.id,
        role: "slider-label",
        text: props.label,
        rect: textLayout.labelRect,
        color: textColor,
        align: "left",
        verticalAlign: "top",
        fontSize: theme.typography.fontSize,
        fontWeight: theme.typography.fontWeight
      },
      {
        type: "text",
        componentId: ctx.id,
        role: "slider-value",
        text: displayValue,
        rect: textLayout.valueRect,
        color: textColor,
        align: "right",
        verticalAlign: "top",
        fontSize: theme.typography.fontSize,
        fontWeight: 700
      },
      {
        type: "rect",
        componentId: ctx.id,
        role: "slider-track",
        rect: track,
        fill: props.disabled ? theme.surfaceColor : theme.backgroundColor,
        stroke: trackStroke,
        strokeWidth: 1,
        radius: track.height / 2
      },
      {
        type: "rect",
        componentId: ctx.id,
        role: "slider-fill",
        rect: createRect(track.x, track.y, fillWidth, track.height),
        fill: props.disabled ? theme.borderColor : theme.accentColor,
        radius: track.height / 2
      },
      {
        type: "circle",
        componentId: ctx.id,
        role: "slider-thumb",
        cx: thumb.x + thumb.width / 2,
        cy: thumb.y + thumb.height / 2,
        radius: thumb.width / 2,
        fill: accentFill,
        stroke:
          props.disabled
            ? theme.borderColor
            : ctx.interaction.focusedComponentId === ctx.id
              ? theme.focusColor
              : theme.accentTextColor,
        strokeWidth: 1
      }
    ];
  },
  hitTest(ctx) {
    const props = normalizeSliderProps(ctx.props, `Slider "${ctx.id}"`);
    if (props.disabled) {
      return null;
    }

    if (!rectContainsPoint(ctx.bounds, ctx.point)) {
      return null;
    }

    const track = getTrackRect(ctx.bounds, ctx.services.theme.getTokens());
    const thumb = getThumbRect(track, props);
    return rectContainsPoint(thumb, ctx.point)
      ? { targetId: `${ctx.id}:thumb`, role: "slider-thumb" }
      : { targetId: `${ctx.id}:track`, role: "slider-track" };
  },
  handleEvent(ctx) {
    const props = normalizeSliderProps(ctx.props, `Slider "${ctx.id}"`);
    switch (ctx.event.type) {
      case "pointer-enter":
      case "pointer-move":
        ctx.state.hovered = true;
        break;
      case "pointer-leave":
        ctx.state.hovered = false;
        break;
      case "pointer-down":
        ctx.state.dragging = true;
        ctx.state.lastEmittedValue = props.value;
        if (ctx.event.targetId === `${ctx.id}:track`) {
          emitSliderValue(ctx, props, ctx.event.localX);
        }
        break;
      case "pointer-up":
      case "drag-end":
      case "cancel":
        ctx.state.dragging = false;
        ctx.state.lastEmittedValue = undefined;
        break;
      case "drag-move":
        emitSliderValue(ctx, props, ctx.event.localX);
        break;
    }
  },
  dispose(ctx) {
    clearFocusableRegistration(ctx);
  }
};

export function createSlider(id: string, props: SliderProps): DisplayNode<SliderProps, SliderState> {
  normalizeSliderProps(props, `Slider "${id}"`);
  return createNode(id, SliderComponent, props);
}

function getTrackRect(
  bounds: { x: number; y: number; width: number; height: number },
  theme: ThemeTokens
) {
  const top =
    bounds.y + theme.typography.lineHeight + theme.spacing + (theme.controlHeight - 6) / 2;
  return createRect(
    bounds.x + theme.padding,
    top,
    Math.max(0, bounds.width - theme.padding * 2),
    6
  );
}

function getThumbRect(
  track: { x: number; y: number; width: number; height: number },
  props: SliderProps
) {
  const ratio = normalizeValue(props.value, props.min, props.max);
  const centerX = track.x + track.width * ratio;
  return createRect(centerX - 8, track.y - 5, 16, 16);
}

function getTextLayout(
  bounds: { x: number; y: number; width: number; height: number },
  valueText: string,
  theme: ThemeTokens,
  estimateTextWidth: (text: string, fontSize?: number) => number
) {
  const innerX = bounds.x + theme.padding;
  const innerWidth = Math.max(0, bounds.width - theme.padding * 2);
  const valueWidth = Math.min(
    Math.max(48, estimateTextWidth(valueText, theme.typography.fontSize) + theme.padding),
    Math.max(48, innerWidth / 2)
  );

  return {
    labelRect: createRect(
      innerX,
      bounds.y,
      Math.max(0, innerWidth - valueWidth - theme.spacing),
      theme.typography.lineHeight
    ),
    valueRect: createRect(
      innerX + Math.max(0, innerWidth - valueWidth),
      bounds.y,
      valueWidth,
      theme.typography.lineHeight
    )
  };
}

function normalizeValue(value: number, min: number, max: number): number {
  if (max <= min) {
    return 0;
  }
  return clamp((value - min) / (max - min), 0, 1);
}

function valueFromLocalX(
  localX: number,
  trackWidth: number,
  trackStartX: number,
  props: SliderProps
): number {
  const clamped = clamp(localX - trackStartX, 0, Math.max(0, trackWidth));
  const ratio = trackWidth <= 0 ? 0 : clamped / trackWidth;
  const raw = props.min + ratio * (props.max - props.min);
  const step = props.step ?? 1;
  return normalizeSliderValue(raw, props.min, props.max, step);
}

function emitSliderValue(
  ctx: Parameters<NonNullable<DisplayComponent<SliderProps, SliderState>["handleEvent"]>>[0],
  props: SliderProps,
  localX: number
): void {
  const track = getTrackRect(ctx.bounds, ctx.services.theme.getTokens());
  const nextValue = valueFromLocalX(localX, track.width, track.x - ctx.bounds.x, props);
  if (ctx.state.lastEmittedValue === nextValue) {
    return;
  }

  ctx.state.lastEmittedValue = nextValue;
  ctx.emit({
    type: "change-request",
    componentId: ctx.id,
    field: props.field ?? "value",
    value: nextValue
  });
}
