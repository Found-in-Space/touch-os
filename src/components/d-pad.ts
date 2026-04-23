import { type DisplayComponent, type DisplayNode, createNode } from "../core/component.js";
import type { DrawCommand } from "../core/draw.js";
import { createRect, rectContainsPoint, type Rect } from "../core/geometry.js";

export interface DPadDirectionBinding {
  actionId: string;
  label?: string;
  startPayload?: Record<string, unknown>;
  stopPayload?: Record<string, unknown>;
  disabled?: boolean;
}

export interface DPadProps {
  up?: DPadDirectionBinding;
  down?: DPadDirectionBinding;
  left?: DPadDirectionBinding;
  right?: DPadDirectionBinding;
  disabled?: boolean;
}

interface DPadState {
  hoveredTargetId: string | undefined;
  activeDirection: DPadDirection | undefined;
}

type DPadDirection = "up" | "down" | "left" | "right";

const DIRECTION_ORDER: readonly DPadDirection[] = ["up", "left", "right", "down"];

const DPadComponent: DisplayComponent<DPadProps, DPadState> = {
  kind: "d-pad",
  mount() {
    return {
      hoveredTargetId: undefined,
      activeDirection: undefined
    };
  },
  update(ctx) {
    if (!ctx.state.activeDirection) {
      return;
    }

    const binding = getDirectionBinding(ctx.props, ctx.state.activeDirection);
    if (ctx.props.disabled || !binding || binding.disabled) {
      stopDirection(ctx);
    }
  },
  measure(ctx) {
    const theme = ctx.services.theme.getTokens();
    const size = theme.controlHeight * 3;
    return {
      width: Math.min(ctx.constraints.maxWidth, size),
      height: Math.min(ctx.constraints.maxHeight, size)
    };
  },
  render(ctx) {
    const theme = ctx.services.theme.getTokens();
    const commands: DrawCommand[] = [
      {
        type: "rect" as const,
        componentId: ctx.id,
        role: "d-pad-frame",
        rect: ctx.bounds,
        fill: theme.backgroundColor,
        stroke:
          ctx.interaction.focusedComponentId === ctx.id ? theme.focusColor : theme.borderColor,
        strokeWidth: 1,
        radius: theme.radius
      },
      {
        type: "rect" as const,
        componentId: ctx.id,
        role: "d-pad-center",
        rect: getCenterRect(ctx.bounds),
        fill: theme.surfaceColor,
        stroke: theme.borderColor,
        strokeWidth: 1,
        radius: Math.max(6, theme.radius - 2)
      }
    ];

    for (const direction of DIRECTION_ORDER) {
      const binding = getDirectionBinding(ctx.props, direction);
      if (!binding) {
        continue;
      }

      const targetId = getDirectionTargetId(ctx.id, direction);
      const active = ctx.state.activeDirection === direction;
      const hovered = ctx.state.hoveredTargetId === targetId;
      commands.push({
        type: "rect" as const,
        componentId: ctx.id,
        role: `d-pad-${direction}`,
        rect: getDirectionRect(ctx.bounds, direction),
        fill: binding.disabled
          ? theme.borderColor
          : active
            ? theme.accentColor
            : hovered
              ? theme.surfaceColor
              : theme.backgroundColor,
        stroke: theme.borderColor,
        strokeWidth: 1,
        radius: Math.max(6, theme.radius - 2)
      });
      commands.push({
        type: "text" as const,
        componentId: ctx.id,
        role: `d-pad-${direction}-label`,
        text: binding.label ?? getDefaultDirectionLabel(direction),
        rect: getDirectionRect(ctx.bounds, direction),
        color: binding.disabled ? theme.mutedTextColor : theme.textColor,
        align: "center" as const,
        verticalAlign: "middle" as const,
        fontSize: theme.typography.fontSize,
        fontWeight: theme.typography.fontWeight
      });
    }

    return commands;
  },
  hitTest(ctx) {
    if (!rectContainsPoint(ctx.bounds, ctx.point) || ctx.props.disabled) {
      return null;
    }

    for (const direction of DIRECTION_ORDER) {
      const binding = getDirectionBinding(ctx.props, direction);
      if (!binding || binding.disabled) {
        continue;
      }

      const rect = getDirectionRect(ctx.bounds, direction);
      if (rectContainsPoint(rect, ctx.point)) {
        return {
          targetId: getDirectionTargetId(ctx.id, direction),
          role: `d-pad-${direction}`
        };
      }
    }

    return null;
  },
  handleEvent(ctx) {
    if (ctx.props.disabled) {
      return;
    }

    switch (ctx.event.type) {
      case "pointer-enter":
      case "pointer-move":
        ctx.state.hoveredTargetId = ctx.event.targetId;
        break;
      case "pointer-leave":
        ctx.state.hoveredTargetId = undefined;
        break;
      case "pointer-down": {
        if (ctx.state.activeDirection) {
          return;
        }

        const direction = getDirectionFromTargetId(ctx.id, ctx.event.targetId);
        if (!direction) {
          return;
        }

        const binding = getDirectionBinding(ctx.props, direction);
        if (!binding || binding.disabled) {
          return;
        }

        ctx.state.activeDirection = direction;
        ctx.emit({
          type: "action",
          actionId: binding.actionId,
          componentId: ctx.id,
          ...(binding.startPayload === undefined ? {} : { payload: binding.startPayload })
        });
        break;
      }
      case "pointer-up":
      case "cancel":
        stopDirection(ctx);
        break;
    }
  },
  dispose(ctx) {
    stopDirection(ctx);
  }
};

export function createDPad(id: string, props: DPadProps): DisplayNode<DPadProps, DPadState> {
  return createNode(id, DPadComponent, props);
}

function stopDirection(
  ctx:
    | Parameters<NonNullable<typeof DPadComponent.update>>[0]
    | Parameters<NonNullable<typeof DPadComponent.handleEvent>>[0]
    | Parameters<NonNullable<typeof DPadComponent.dispose>>[0]
): void {
  if (!ctx.state.activeDirection) {
    return;
  }

  const binding = getDirectionBinding(ctx.props, ctx.state.activeDirection);
  ctx.state.activeDirection = undefined;
  if (!binding) {
    return;
  }

  ctx.emit({
    type: "action",
    actionId: binding.actionId,
    componentId: ctx.id,
    ...(binding.stopPayload === undefined ? {} : { payload: binding.stopPayload })
  });
}

function getDirectionBinding(
  props: DPadProps,
  direction: DPadDirection
): DPadDirectionBinding | undefined {
  switch (direction) {
    case "up":
      return props.up;
    case "down":
      return props.down;
    case "left":
      return props.left;
    case "right":
      return props.right;
  }
}

function getDirectionRect(bounds: Rect, direction: DPadDirection): Rect {
  const cellWidth = bounds.width / 3;
  const cellHeight = bounds.height / 3;
  switch (direction) {
    case "up":
      return createRect(bounds.x + cellWidth, bounds.y, cellWidth, cellHeight);
    case "down":
      return createRect(bounds.x + cellWidth, bounds.y + cellHeight * 2, cellWidth, cellHeight);
    case "left":
      return createRect(bounds.x, bounds.y + cellHeight, cellWidth, cellHeight);
    case "right":
      return createRect(bounds.x + cellWidth * 2, bounds.y + cellHeight, cellWidth, cellHeight);
  }
}

function getCenterRect(bounds: Rect): Rect {
  return createRect(
    bounds.x + bounds.width / 3,
    bounds.y + bounds.height / 3,
    bounds.width / 3,
    bounds.height / 3
  );
}

function getDirectionTargetId(id: string, direction: DPadDirection): string {
  return `${id}:${direction}`;
}

function getDirectionFromTargetId(
  id: string,
  targetId: string
): DPadDirection | undefined {
  return DIRECTION_ORDER.find((direction) => targetId === getDirectionTargetId(id, direction));
}

function getDefaultDirectionLabel(direction: DPadDirection): string {
  switch (direction) {
    case "up":
      return "Up";
    case "down":
      return "Down";
    case "left":
      return "Left";
    case "right":
      return "Right";
  }
}
