import { type DisplayComponent, type DisplayNode, createNode } from "../core/component.js";
import { clamp, createRect, rectContainsPoint } from "../core/geometry.js";

export interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  field?: string;
}

interface SliderState {
  dragging: boolean;
  hovered: boolean;
}

const SliderComponent: DisplayComponent<SliderProps, SliderState> = {
  kind: "slider",
  mount() {
    return {
      dragging: false,
      hovered: false
    };
  },
  measure(ctx) {
    const theme = ctx.services.theme.getTokens();
    return {
      width: ctx.constraints.maxWidth,
      height: theme.controlHeight + theme.typography.lineHeight + theme.spacing
    };
  },
  render(ctx) {
    const theme = ctx.services.theme.getTokens();
    const track = getTrackRect(ctx.bounds, theme.controlHeight, theme.padding);
    const thumb = getThumbRect(track, ctx.props);
    const accentFill = ctx.state.dragging || ctx.state.hovered ? theme.accentColor : theme.borderColor;

    return [
      {
        type: "text",
        componentId: ctx.id,
        role: "slider-label",
        text: `${ctx.props.label}: ${ctx.props.value}`,
        rect: createRect(ctx.bounds.x, ctx.bounds.y, ctx.bounds.width, theme.typography.lineHeight),
        color: theme.textColor,
        align: "left",
        verticalAlign: "top",
        fontSize: theme.typography.fontSize,
        fontWeight: theme.typography.fontWeight
      },
      {
        type: "rect",
        componentId: ctx.id,
        role: "slider-track",
        rect: track,
        fill: theme.backgroundColor,
        stroke: theme.borderColor,
        strokeWidth: 1,
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
          ctx.interaction.focusedComponentId === ctx.id ? theme.focusColor : theme.accentTextColor,
        strokeWidth: 1
      }
    ];
  },
  hitTest(ctx) {
    if (!rectContainsPoint(ctx.bounds, ctx.point)) {
      return null;
    }

    const track = getTrackRect(
      ctx.bounds,
      ctx.services.theme.getTokens().controlHeight,
      ctx.services.theme.getTokens().padding
    );
    const thumb = getThumbRect(track, ctx.props);
    return rectContainsPoint(thumb, ctx.point)
      ? { targetId: `${ctx.id}:thumb`, role: "slider-thumb" }
      : { targetId: `${ctx.id}:track`, role: "slider-track" };
  },
  handleEvent(ctx) {
    switch (ctx.event.type) {
      case "pointer-enter":
        ctx.state.hovered = true;
        break;
      case "pointer-leave":
        ctx.state.hovered = false;
        if (!ctx.state.dragging) {
          break;
        }
        ctx.state.dragging = false;
        break;
      case "pointer-down":
        ctx.state.dragging = true;
        break;
      case "pointer-up":
      case "drag-end":
      case "cancel":
        ctx.state.dragging = false;
        break;
      case "drag-move":
      case "press":
        ctx.emit({
          type: "change-request",
          componentId: ctx.id,
          field: ctx.props.field ?? "value",
          value: valueFromLocalX(ctx.event.localX, ctx.bounds.width, ctx.props)
        });
        break;
    }
  }
};

export function createSlider(id: string, props: SliderProps): DisplayNode<SliderProps, SliderState> {
  return createNode(id, SliderComponent, props);
}

function getTrackRect(bounds: { x: number; y: number; width: number; height: number }, controlHeight: number, padding: number) {
  const top = bounds.y + bounds.height - controlHeight / 2;
  return createRect(bounds.x + padding, top, Math.max(0, bounds.width - padding * 2), 6);
}

function getThumbRect(track: { x: number; y: number; width: number; height: number }, props: SliderProps) {
  const ratio = normalizeValue(props.value, props.min, props.max);
  const centerX = track.x + track.width * ratio;
  return createRect(centerX - 8, track.y - 5, 16, 16);
}

function normalizeValue(value: number, min: number, max: number): number {
  if (max <= min) {
    return 0;
  }
  return clamp((value - min) / (max - min), 0, 1);
}

function valueFromLocalX(localX: number, width: number, props: SliderProps): number {
  const padding = 12;
  const clamped = clamp(localX - padding, 0, Math.max(0, width - padding * 2));
  const ratio = width <= padding * 2 ? 0 : clamped / (width - padding * 2);
  const raw = props.min + ratio * (props.max - props.min);
  const step = props.step ?? 1;
  const snapped = Math.round((raw - props.min) / step) * step + props.min;
  return clamp(snapped, props.min, props.max);
}
