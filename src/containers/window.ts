import {
  type DisplayComponent,
  type DisplayNode,
  createNode
} from "../core/component.js";
import {
  createRect,
  rectContainsPoint,
  type Rect
} from "../core/geometry.js";
import type { DrawCommand } from "../core/draw.js";
import type { WindowMode } from "../core/actions.js";
import type { ThemeTokens } from "../services/contracts.js";

export type WindowRect = Rect;

export type WindowDragHandle = "none" | "top" | "bottom";

export type WindowHandleVisibility = "always" | "hover" | "focus" | "dragging";

export type WindowControl = "close" | "minimize" | "maximize";

export interface WindowProps {
  child: DisplayNode<unknown, unknown>;
  rect: WindowRect;
  title?: string;
  zIndex?: number;
  mode?: WindowMode;
  movable?: boolean;
  dragHandle?: WindowDragHandle;
  handleVisibility?: WindowHandleVisibility;
  controls?: readonly WindowControl[];
  persistenceKey?: string;
  backgroundColor?: string;
  borderColor?: string;
}

interface WindowInteractionState {
  hovered: boolean;
  dragging: boolean;
  pressedControl: WindowControl | undefined;
}

const CONTROL_TARGET_PREFIX = "control:";

const WindowComponent: DisplayComponent<WindowProps, WindowInteractionState> = {
  kind: "window",
  mount() {
    return {
      hovered: false,
      dragging: false,
      pressedControl: undefined
    };
  },
  getChildren(ctx) {
    return [ctx.props.child];
  },
  measure(ctx) {
    const chromeHeight = resolveWindowChromeHeight(ctx.services.theme.getTokens());
    const contentHeight =
      resolveWindowChromeEdge(ctx.props) === undefined
        ? ctx.constraints.maxHeight
        : Math.max(0, ctx.constraints.maxHeight - Math.min(chromeHeight, ctx.constraints.maxHeight));
    ctx.measureChild(ctx.props.child.id, {
      minWidth: 0,
      minHeight: 0,
      maxWidth: ctx.constraints.maxWidth,
      maxHeight: contentHeight
    });
    return {
      width: ctx.constraints.maxWidth,
      height: ctx.constraints.maxHeight
    };
  },
  layout(ctx) {
    const chromeHeight = resolveWindowChromeHeight(ctx.services.theme.getTokens());
    const contentRect = resolveWindowContentRect(
      ctx.bounds,
      chromeHeight,
      resolveWindowChromeEdge(ctx.props)
    );
    ctx.setChildBounds(ctx.props.child.id, contentRect);
    ctx.setContentBounds(contentRect);
    ctx.setClipRect(ctx.bounds);
  },
  render(ctx) {
    const theme = ctx.services.theme.getTokens();
    const chromeHeight = resolveWindowChromeHeight(theme);
    const chromeEdge = resolveWindowChromeEdge(ctx.props);
    const chromeRect = resolveWindowChromeRect(ctx.bounds, chromeHeight, chromeEdge);
    const focused = ctx.interaction.focusedComponentId === ctx.id;
    const showHandle = shouldShowDragHandle(ctx.props, ctx.state, focused);
    const commands: DrawCommand[] = [
      {
        type: "rect" as const,
        componentId: ctx.id,
        role: "window-frame",
        rect: ctx.bounds,
        fill: ctx.props.backgroundColor ?? theme.backgroundColor,
        stroke: focused ? theme.focusColor : (ctx.props.borderColor ?? theme.borderColor),
        strokeWidth: focused ? 2 : 1,
        radius: theme.radius
      }
    ];

    if (chromeRect) {
      commands.push({
        type: "rect" as const,
        componentId: ctx.id,
        role: "window-chrome",
        rect: chromeRect,
        fill: theme.surfaceColor,
        stroke: ctx.props.borderColor ?? theme.borderColor,
        strokeWidth: 1,
        radius: theme.radius
      });
    }

    if (chromeRect && showHandle) {
      commands.push({
        type: "rect" as const,
        componentId: ctx.id,
        role: "window-drag-handle",
        rect: createHandleBarRect(chromeRect),
        fill: focused || ctx.state.dragging ? theme.accentColor : theme.borderColor,
        radius: Math.max(2, theme.radius / 2)
      });
    }

    if (chromeRect && ctx.props.title) {
      commands.push({
        type: "text" as const,
        componentId: ctx.id,
        role: "window-title",
        rect: createTitleRect(chromeRect, ctx.props.controls?.length ?? 0),
        text: ctx.props.title,
        color: theme.textColor,
        align: "left" as const,
        verticalAlign: "middle" as const,
        fontSize: theme.typography.fontSize,
        fontWeight: theme.typography.fontWeight
      });
    }

    if (chromeRect) {
      for (const control of ctx.props.controls ?? []) {
        const rect = resolveControlRect(chromeRect, ctx.props.controls ?? [], control);
        commands.push({
          type: "rect" as const,
          componentId: ctx.id,
          role: `window-control-${control}`,
          rect,
          fill:
            ctx.state.pressedControl === control
              ? theme.accentColor
              : theme.backgroundColor,
          stroke: theme.borderColor,
          strokeWidth: 1,
          radius: Math.max(2, theme.radius / 2)
        });
        commands.push({
          type: "text" as const,
          componentId: ctx.id,
          role: `window-control-${control}-label`,
          rect,
          text: getControlLabel(control),
          color:
            ctx.state.pressedControl === control
              ? theme.accentTextColor
              : theme.textColor,
          align: "center" as const,
          verticalAlign: "middle" as const,
          fontSize: Math.max(10, theme.typography.fontSize - 2),
          fontWeight: theme.typography.fontWeight
        });
      }
    }

    return commands;
  },
  hitTest(ctx) {
    if (!rectContainsPoint(ctx.bounds, ctx.point)) {
      return null;
    }

    const chromeHeight = resolveWindowChromeHeight(ctx.services.theme.getTokens());
    const chromeRect = resolveWindowChromeRect(
      ctx.bounds,
      chromeHeight,
      resolveWindowChromeEdge(ctx.props)
    );
    if (chromeRect) {
      for (const control of ctx.props.controls ?? []) {
        if (rectContainsPoint(resolveControlRect(chromeRect, ctx.props.controls ?? [], control), ctx.point)) {
          return {
            targetId: createWindowControlTargetId(ctx.id, control),
            role: `window-control-${control}`
          };
        }
      }

      if (
        (ctx.props.movable ?? true) &&
        (ctx.props.dragHandle ?? "top") !== "none" &&
        rectContainsPoint(chromeRect, ctx.point)
      ) {
        return {
          targetId: createWindowDragHandleTargetId(ctx.id),
          role: "window-drag-handle"
        };
      }
    }

    return {
      targetId: `${ctx.id}:frame`,
      role: "window-frame"
    };
  },
  handleEvent(ctx) {
    switch (ctx.event.type) {
      case "pointer-enter":
        ctx.state.hovered = true;
        ctx.invalidateRender();
        break;
      case "pointer-leave":
        ctx.state.hovered = false;
        if (!ctx.state.dragging) {
          ctx.invalidateRender();
        }
        break;
      case "pointer-down": {
        const control = resolveWindowControlFromTargetId(ctx.id, ctx.event.targetId);
        ctx.state.pressedControl = control;
        if (ctx.event.targetId === createWindowDragHandleTargetId(ctx.id)) {
          ctx.state.dragging = true;
        }
        ctx.invalidateRender();
        break;
      }
      case "drag-start":
      case "drag-move":
        if (ctx.event.targetId === createWindowDragHandleTargetId(ctx.id)) {
          ctx.state.dragging = true;
          ctx.invalidateRender();
        }
        break;
      case "pointer-up":
      case "drag-end":
      case "cancel":
        ctx.state.dragging = false;
        ctx.state.pressedControl = undefined;
        ctx.invalidateRender();
        break;
    }
  }
};

export function createWindow(
  id: string,
  props: WindowProps
): DisplayNode<WindowProps, WindowInteractionState> {
  return createNode(id, WindowComponent, props);
}

export function resolveWindowChromeHeight(theme: Pick<ThemeTokens, "controlHeight">): number {
  return Math.max(24, Math.round(theme.controlHeight * 0.75));
}

export function createWindowDragHandleTargetId(windowId: string): string {
  return `${windowId}:drag-handle`;
}

export function createWindowControlTargetId(
  windowId: string,
  control: WindowControl
): string {
  return `${windowId}:${CONTROL_TARGET_PREFIX}${control}`;
}

export function resolveWindowControlFromTargetId(
  windowId: string,
  targetId: string
): WindowControl | undefined {
  const prefix = `${windowId}:${CONTROL_TARGET_PREFIX}`;
  if (!targetId.startsWith(prefix)) {
    return undefined;
  }

  const control = targetId.slice(prefix.length);
  return isWindowControl(control) ? control : undefined;
}

export function isWindowDragHandleTargetId(windowId: string, targetId: string): boolean {
  return targetId === createWindowDragHandleTargetId(windowId);
}

function resolveWindowChromeEdge(props: WindowProps): Exclude<WindowDragHandle, "none"> | undefined {
  const handle = props.dragHandle ?? "top";
  if (handle === "bottom") {
    return "bottom";
  }

  if (handle === "top" || props.title || (props.controls?.length ?? 0) > 0) {
    return "top";
  }

  return undefined;
}

function resolveWindowChromeRect(
  bounds: Rect,
  chromeHeight: number,
  edge: Exclude<WindowDragHandle, "none"> | undefined
): Rect | undefined {
  if (!edge) {
    return undefined;
  }

  const height = Math.min(chromeHeight, bounds.height);
  return edge === "bottom"
    ? createRect(bounds.x, bounds.y + bounds.height - height, bounds.width, height)
    : createRect(bounds.x, bounds.y, bounds.width, height);
}

function resolveWindowContentRect(
  bounds: Rect,
  chromeHeight: number,
  edge: Exclude<WindowDragHandle, "none"> | undefined
): Rect {
  if (!edge) {
    return bounds;
  }

  const height = Math.min(chromeHeight, bounds.height);
  const contentHeight = Math.max(0, bounds.height - height);
  return edge === "bottom"
    ? createRect(bounds.x, bounds.y, bounds.width, contentHeight)
    : createRect(bounds.x, bounds.y + height, bounds.width, contentHeight);
}

function shouldShowDragHandle(
  props: WindowProps,
  state: WindowInteractionState,
  focused: boolean
): boolean {
  if ((props.movable ?? true) === false || (props.dragHandle ?? "top") === "none") {
    return false;
  }

  switch (props.handleVisibility ?? "always") {
    case "hover":
      return state.hovered || state.dragging;
    case "focus":
      return focused || state.dragging;
    case "dragging":
      return state.dragging;
    case "always":
    default:
      return true;
  }
}

function createHandleBarRect(chromeRect: Rect): Rect {
  const width = Math.min(56, Math.max(24, chromeRect.width * 0.22));
  const height = Math.min(5, Math.max(3, chromeRect.height * 0.18));
  return createRect(
    chromeRect.x + (chromeRect.width - width) / 2,
    chromeRect.y + (chromeRect.height - height) / 2,
    width,
    height
  );
}

function createTitleRect(chromeRect: Rect, controlCount: number): Rect {
  const rightInset = controlCount > 0 ? controlCount * (getControlButtonSize(chromeRect) + 4) + 8 : 8;
  return createRect(
    chromeRect.x + 10,
    chromeRect.y,
    Math.max(0, chromeRect.width - 18 - rightInset),
    chromeRect.height
  );
}

function resolveControlRect(
  chromeRect: Rect,
  controls: readonly WindowControl[],
  control: WindowControl
): Rect {
  const index = controls.indexOf(control);
  const size = getControlButtonSize(chromeRect);
  const gap = 4;
  const x = chromeRect.x + chromeRect.width - 8 - size - Math.max(0, index) * (size + gap);
  return createRect(
    x,
    chromeRect.y + (chromeRect.height - size) / 2,
    size,
    size
  );
}

function getControlButtonSize(chromeRect: Rect): number {
  return Math.max(14, Math.min(22, chromeRect.height - 8));
}

function getControlLabel(control: WindowControl): string {
  switch (control) {
    case "close":
      return "x";
    case "minimize":
      return "-";
    case "maximize":
      return "+";
  }
}

function isWindowControl(value: string): value is WindowControl {
  return value === "close" || value === "minimize" || value === "maximize";
}
