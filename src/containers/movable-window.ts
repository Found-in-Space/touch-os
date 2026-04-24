import {
  createNode,
  isDisplayEvent,
  type DisplayComponent,
  type DisplayNode
} from "../core/component.js";
import { clamp, createRect, rectContainsPoint, type Rect } from "../core/geometry.js";

export interface MovableWindowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MovableWindowProps {
  child: DisplayNode<unknown, unknown>;
  initialRect: MovableWindowRect;
  movable?: boolean;
  handleHeight?: number;
  handleLabel?: string;
  frameColor?: string;
  handleColor?: string;
  constraintPadding?: number;
}

interface DragState {
  pointerId: string;
  startX: number;
  startY: number;
  originRect: MovableWindowRect;
}

interface MovableWindowState {
  rect: MovableWindowRect;
  drag: DragState | undefined;
}

const DEFAULT_HANDLE_HEIGHT = 26;

const MovableWindowComponent: DisplayComponent<MovableWindowProps, MovableWindowState> = {
  kind: "movable-window",
  mount(ctx) {
    return {
      rect: { ...ctx.props.initialRect },
      drag: undefined
    };
  },
  update(ctx) {
    if (ctx.state.drag) {
      return;
    }

    const next = ctx.props.initialRect;
    if (
      next.x !== ctx.state.rect.x ||
      next.y !== ctx.state.rect.y ||
      next.width !== ctx.state.rect.width ||
      next.height !== ctx.state.rect.height
    ) {
      ctx.state.rect = { ...next };
      ctx.invalidateLayout();
    }
  },
  getChildren(ctx) {
    return [ctx.props.child];
  },
  measure(ctx) {
    const handleHeight = resolveHandleHeight(ctx.props.handleHeight);
    const childSize = ctx.measureChild(ctx.props.child.id, {
      minWidth: 0,
      minHeight: 0,
      maxWidth: ctx.props.initialRect.width,
      maxHeight: Math.max(0, ctx.props.initialRect.height - handleHeight)
    });
    const width = Math.max(ctx.props.initialRect.width, childSize.width);
    const height = Math.max(ctx.props.initialRect.height, childSize.height + handleHeight);
    if (width !== ctx.props.initialRect.width || height !== ctx.props.initialRect.height) {
      ctx.state.rect = { ...ctx.state.rect, width, height };
    }
    return {
      width: ctx.constraints.maxWidth,
      height: ctx.constraints.maxHeight
    };
  },
  layout(ctx) {
    const rect = clampRectToBounds(
      ctx.state.rect,
      ctx.bounds,
      ctx.props.constraintPadding ?? 0
    );
    if (!isSameRect(rect, ctx.state.rect)) {
      ctx.state.rect = rect;
    }

    const handleHeight = resolveHandleHeight(ctx.props.handleHeight);
    const content = createRect(
      rect.x,
      rect.y + handleHeight,
      rect.width,
      Math.max(0, rect.height - handleHeight)
    );
    ctx.setChildBounds(ctx.props.child.id, content);
    ctx.setContentBounds(rect);
  },
  render(ctx) {
    const theme = ctx.services.theme.getTokens();
    const rect = ctx.state.rect;
    const handleHeight = resolveHandleHeight(ctx.props.handleHeight);
    return [
      {
        type: "rect",
        componentId: ctx.id,
        role: "window-frame",
        rect,
        fill: ctx.props.frameColor ?? theme.surfaceColor,
        stroke: theme.borderColor,
        strokeWidth: 1,
        radius: theme.radius
      },
      {
        type: "rect",
        componentId: ctx.id,
        role: "window-drag-handle",
        rect: createRect(rect.x, rect.y, rect.width, handleHeight),
        fill: ctx.props.handleColor ?? theme.backgroundColor,
        radius: theme.radius
      },
      {
        type: "text",
        componentId: ctx.id,
        role: "window-drag-label",
        text: ctx.props.handleLabel ?? "Move",
        rect: createRect(rect.x + theme.padding, rect.y, rect.width - theme.padding * 2, handleHeight),
        color: theme.mutedTextColor,
        verticalAlign: "middle",
        fontSize: theme.typography.fontSize,
        fontWeight: theme.typography.fontWeight
      }
    ];
  },
  hitTest(ctx) {
    const rect = ctx.state.rect;
    if (!rectContainsPoint(rect, ctx.localPoint)) {
      return null;
    }

    const handleHeight = resolveHandleHeight(ctx.props.handleHeight);
    const dragRect = createRect(rect.x, rect.y, rect.width, handleHeight);
    if (rectContainsPoint(dragRect, ctx.localPoint)) {
      return {
        targetId: `${ctx.id}:drag-handle`,
        role: "drag-handle"
      };
    }

    return {
      targetId: `${ctx.id}:surface`,
      role: "surface"
    };
  },
  handleEvent(ctx) {
    if (!isDisplayEvent(ctx.event)) {
      return;
    }

    if (ctx.props.movable === false) {
      return;
    }

    const handleTarget = `${ctx.id}:drag-handle`;
    switch (ctx.event.type) {
      case "pointer-down":
        if (!ctx.event.pointerId) {
          return;
        }
        if (ctx.event.targetId !== handleTarget) {
          return;
        }
        ctx.state.drag = {
          pointerId: ctx.event.pointerId,
          startX: ctx.event.surfaceX,
          startY: ctx.event.surfaceY,
          originRect: { ...ctx.state.rect }
        };
        break;
      case "drag-move": {
        const drag = ctx.state.drag;
        if (!drag || drag.pointerId !== ctx.event.pointerId) {
          return;
        }

        const deltaX = ctx.event.surfaceX - drag.startX;
        const deltaY = ctx.event.surfaceY - drag.startY;
        const nextRect = clampRectToBounds(
          {
            ...drag.originRect,
            x: drag.originRect.x + deltaX,
            y: drag.originRect.y + deltaY
          },
          ctx.bounds,
          ctx.props.constraintPadding ?? 0
        );
        if (!isSameRect(nextRect, ctx.state.rect)) {
          ctx.state.rect = nextRect;
          ctx.invalidateLayout();
          ctx.invalidateRender();
        }
        break;
      }
      case "pointer-up":
      case "cancel":
      case "drag-end":
        if (ctx.state.drag?.pointerId === ctx.event.pointerId) {
          ctx.state.drag = undefined;
        }
        break;
    }
  }
};

export function createMovableWindow(id: string, props: MovableWindowProps): DisplayNode<MovableWindowProps> {
  return createNode(id, MovableWindowComponent, props);
}

function resolveHandleHeight(value: number | undefined): number {
  return Math.max(16, value ?? DEFAULT_HANDLE_HEIGHT);
}

function clampRectToBounds(rect: MovableWindowRect, bounds: Rect, padding: number): MovableWindowRect {
  const width = Math.max(24, Math.min(rect.width, Math.max(24, bounds.width - padding * 2)));
  const height = Math.max(24, Math.min(rect.height, Math.max(24, bounds.height - padding * 2)));
  const minX = bounds.x + padding;
  const minY = bounds.y + padding;
  const maxX = bounds.x + bounds.width - padding - width;
  const maxY = bounds.y + bounds.height - padding - height;

  return {
    x: clamp(rect.x, minX, maxX),
    y: clamp(rect.y, minY, maxY),
    width,
    height
  };
}

function isSameRect(a: MovableWindowRect, b: MovableWindowRect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}
