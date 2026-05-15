import {
  type DisplayComponent,
  type DisplayNode,
  createNode,
  isDisplayEvent
} from "../core/component.js";
import type { DrawCommand } from "../core/draw.js";
import { createRect, rectContainsPoint, type Rect } from "../core/geometry.js";
import type { ThemeTokens } from "../services/contracts.js";
import { clearFocusableRegistration, syncFocusableRegistration } from "./focusable.js";
import {
  getChoiceGroupSelectedValues,
  normalizeChoiceGroupProps,
  type ChoiceGroupProps,
  type ChoiceOption
} from "./choice-group-contract.js";

export type {
  ChoiceGroupOrientation,
  ChoiceGroupProps,
  ChoiceGroupSelectionMode,
  ChoiceOption
} from "./choice-group-contract.js";

interface ChoiceGroupState {
  hoveredTargetId: string | undefined;
  pressedTargetId: string | undefined;
}

interface ChoiceGroupLayout {
  labelRect: Rect | undefined;
  optionRects: readonly Rect[];
}

const INDICATOR_SIZE = 16;

const ChoiceGroupComponent: DisplayComponent<ChoiceGroupProps<string>, ChoiceGroupState> = {
  kind: "choice-group",
  mount(ctx) {
    const props = normalizeChoiceGroupProps(ctx.props, `Choice group "${ctx.id}"`);
    syncFocusableRegistration(
      ctx,
      isChoiceGroupFocusable(props),
      resolveChoiceGroupDefaultTargetId(ctx.id, props)
    );
    return {
      hoveredTargetId: undefined,
      pressedTargetId: undefined
    };
  },
  update(ctx) {
    const props = normalizeChoiceGroupProps(ctx.props, `Choice group "${ctx.id}"`);
    syncFocusableRegistration(
      ctx,
      isChoiceGroupFocusable(props),
      resolveChoiceGroupDefaultTargetId(ctx.id, props)
    );
    if (!props.disabled) {
      return;
    }

    ctx.state.hoveredTargetId = undefined;
    ctx.state.pressedTargetId = undefined;
  },
  measure(ctx) {
    const props = normalizeChoiceGroupProps(ctx.props, `Choice group "${ctx.id}"`);
    const theme = ctx.services.theme.getTokens();
    const labelHeight = props.label ? theme.typography.lineHeight + theme.spacing : 0;
    const rowCount =
      props.orientation === "vertical"
        ? props.options.length
        : Math.ceil(props.options.length / (props.columns ?? props.options.length));

    return {
      width: ctx.constraints.maxWidth,
      height:
        theme.padding * 2 +
        labelHeight +
        rowCount * theme.controlHeight +
        Math.max(0, rowCount - 1) * theme.spacing
    };
  },
  render(ctx) {
    const props = normalizeChoiceGroupProps(ctx.props, `Choice group "${ctx.id}"`);
    const theme = ctx.services.theme.getTokens();
    const layout = getChoiceGroupLayout(ctx.bounds, props, theme);
    const selectedValues = new Set(getChoiceGroupSelectedValues(props));

    const commands: DrawCommand[] = [
      {
        type: "rect" as const,
        componentId: ctx.id,
        role: "choice-group-frame",
        rect: ctx.bounds,
        fill: theme.surfaceColor,
        stroke:
          ctx.interaction.focusedComponentId === ctx.id ? theme.focusColor : theme.borderColor,
        strokeWidth: 1,
        radius: theme.radius
      }
    ];

    if (layout.labelRect && props.label) {
      commands.push({
        type: "text" as const,
        componentId: ctx.id,
        role: "choice-group-label",
        text: props.label,
        rect: layout.labelRect,
        color: props.disabled ? theme.mutedTextColor : theme.textColor,
        align: "left" as const,
        verticalAlign: "top" as const,
        fontSize: theme.typography.fontSize,
        fontWeight: 700
      });
    }

    props.options.forEach((option, index) => {
      const optionRect = layout.optionRects[index];
      if (!optionRect) {
        return;
      }
      const targetId = getChoiceGroupTargetId(ctx.id, option);
      const selected = selectedValues.has(option.value);
      const hovered = ctx.state.hoveredTargetId === targetId;
      const pressed = ctx.state.pressedTargetId === targetId;
      const disabled = props.disabled || option.disabled;
      const rowFill = disabled
        ? theme.borderColor
        : pressed
          ? theme.accentColor
          : hovered
            ? theme.backgroundColor
            : theme.surfaceColor;
      const rowStroke = selected ? theme.accentColor : theme.borderColor;
      const textColor = disabled
        ? theme.mutedTextColor
        : pressed
          ? theme.accentTextColor
          : theme.textColor;
      const indicatorRect = getIndicatorRect(optionRect, theme);
      const labelRect = createRect(
        indicatorRect.x + indicatorRect.width + theme.spacing,
        optionRect.y,
        Math.max(
          0,
          optionRect.width - (indicatorRect.width + theme.spacing + theme.padding * 2)
        ),
        optionRect.height
      );

      commands.push({
        type: "rect" as const,
        componentId: ctx.id,
        role: "choice-option-row",
        rect: optionRect,
        fill: rowFill,
        stroke: rowStroke,
        strokeWidth: 1,
        radius: theme.radius
      });

      if (props.selectionMode === "single") {
        commands.push({
          type: "circle" as const,
          componentId: ctx.id,
          role: "choice-option-indicator",
          cx: indicatorRect.x + indicatorRect.width / 2,
          cy: indicatorRect.y + indicatorRect.height / 2,
          radius: indicatorRect.width / 2,
          fill: disabled ? theme.surfaceColor : theme.backgroundColor,
          stroke: selected ? theme.accentColor : theme.borderColor,
          strokeWidth: 1
        });

        if (selected) {
          commands.push({
            type: "circle" as const,
            componentId: ctx.id,
            role: "choice-option-indicator-mark",
            cx: indicatorRect.x + indicatorRect.width / 2,
            cy: indicatorRect.y + indicatorRect.height / 2,
            radius: indicatorRect.width / 4,
            fill: disabled ? theme.mutedTextColor : theme.accentColor
          });
        }
      } else {
        commands.push({
          type: "rect" as const,
          componentId: ctx.id,
          role: "choice-option-indicator",
          rect: indicatorRect,
          fill: disabled ? theme.surfaceColor : theme.backgroundColor,
          stroke: selected ? theme.accentColor : theme.borderColor,
          strokeWidth: 1,
          radius: 4
        });

        if (selected) {
          commands.push({
            type: "rect" as const,
            componentId: ctx.id,
            role: "choice-option-indicator-mark",
            rect: createRect(
              indicatorRect.x + 4,
              indicatorRect.y + 4,
              Math.max(0, indicatorRect.width - 8),
              Math.max(0, indicatorRect.height - 8)
            ),
            fill: disabled ? theme.mutedTextColor : theme.accentColor,
            radius: 2
          });
        }
      }

      commands.push({
        type: "text" as const,
        componentId: ctx.id,
        role: "choice-option-label",
        text: option.label,
        rect: labelRect,
        color: textColor,
        align: "left" as const,
        verticalAlign: "middle" as const,
        fontSize: theme.typography.fontSize,
        fontWeight: theme.typography.fontWeight
      });
    });

    return commands;
  },
  hitTest(ctx) {
    const props = normalizeChoiceGroupProps(ctx.props, `Choice group "${ctx.id}"`);
    if (props.disabled || !rectContainsPoint(ctx.bounds, ctx.point)) {
      return null;
    }

    const layout = getChoiceGroupLayout(ctx.bounds, props, ctx.services.theme.getTokens());
    for (let index = 0; index < props.options.length; index += 1) {
      const option = props.options[index];
      const optionRect = layout.optionRects[index];
      if (!option || !optionRect || option.disabled || !rectContainsPoint(optionRect, ctx.point)) {
        continue;
      }
      return {
        targetId: getChoiceGroupTargetId(ctx.id, option),
        role: "choice-option-row"
      };
    }

    return null;
  },
  handleEvent(ctx) {
    const event = ctx.event;
    if (!isDisplayEvent(event)) {
      return;
    }

    switch (event.type) {
      case "pointer-enter":
      case "pointer-move":
        ctx.state.hoveredTargetId = event.targetId;
        break;
      case "pointer-leave":
        ctx.state.hoveredTargetId = undefined;
        ctx.state.pressedTargetId = undefined;
        break;
      case "pointer-down":
        ctx.state.pressedTargetId = event.targetId;
        break;
      case "pointer-up":
      case "cancel":
        ctx.state.pressedTargetId = undefined;
        break;
      case "press": {
        const props = normalizeChoiceGroupProps(ctx.props, `Choice group "${ctx.id}"`);
        const option = props.options.find(
          (entry) => getChoiceGroupTargetId(ctx.id, entry) === event.targetId
        );
        ctx.state.pressedTargetId = undefined;
        if (!option || option.disabled || props.disabled) {
          return;
        }

        if (props.selectionMode === "single") {
          if (props.value === option.value) {
            return;
          }

          ctx.emit({
            type: "change-request",
            componentId: ctx.id,
            field: props.field,
            value: option.value
          });
          return;
        }

        const currentValues = new Set(getChoiceGroupSelectedValues(props));
        if (currentValues.has(option.value)) {
          currentValues.delete(option.value);
        } else {
          currentValues.add(option.value);
        }

        ctx.emit({
          type: "change-request",
          componentId: ctx.id,
          field: props.field,
          value: props.options
            .filter((entry) => currentValues.has(entry.value))
            .map((entry) => entry.value)
        });
        break;
      }
    }
  },
  dispose(ctx) {
    clearFocusableRegistration(ctx);
  }
};

export function createChoiceGroup<TValue extends string>(
  id: string,
  props: ChoiceGroupProps<TValue>
): DisplayNode<ChoiceGroupProps<TValue>, ChoiceGroupState> {
  normalizeChoiceGroupProps(props, `Choice group "${id}"`);
  return createNode(
    id,
    ChoiceGroupComponent as unknown as DisplayComponent<ChoiceGroupProps<TValue>, ChoiceGroupState>,
    props
  );
}

function getChoiceGroupLayout<TValue extends string>(
  bounds: Rect,
  props: ChoiceGroupProps<TValue>,
  theme: ThemeTokens
): ChoiceGroupLayout {
  const innerX = bounds.x + theme.padding;
  const innerWidth = Math.max(0, bounds.width - theme.padding * 2);
  let nextY = bounds.y + theme.padding;
  let labelRect: Rect | undefined;

  if (props.label) {
    labelRect = createRect(innerX, nextY, innerWidth, theme.typography.lineHeight);
    nextY += theme.typography.lineHeight + theme.spacing;
  }

  const columnCount =
    props.orientation === "vertical" ? 1 : props.columns ?? props.options.length;
  const optionWidth =
    columnCount === 1
      ? innerWidth
      : Math.max(0, (innerWidth - (columnCount - 1) * theme.spacing) / columnCount);
  const optionRects = props.options.map((_, index) => {
    const rowIndex = props.orientation === "vertical" ? index : Math.floor(index / columnCount);
    const columnIndex = props.orientation === "vertical" ? 0 : index % columnCount;
    return createRect(
      innerX + columnIndex * (optionWidth + theme.spacing),
      nextY + rowIndex * (theme.controlHeight + theme.spacing),
      props.orientation === "vertical" ? innerWidth : optionWidth,
      theme.controlHeight
    );
  });

  return {
    labelRect,
    optionRects
  };
}

function getIndicatorRect(optionRect: Rect, theme: ThemeTokens): Rect {
  return createRect(
    optionRect.x + theme.padding,
    optionRect.y + (optionRect.height - INDICATOR_SIZE) / 2,
    INDICATOR_SIZE,
    INDICATOR_SIZE
  );
}

function getChoiceGroupTargetId<TValue extends string>(
  componentId: string,
  option: ChoiceOption<TValue>
): string {
  return `${componentId}:option:${option.value}`;
}

function isChoiceGroupFocusable<TValue extends string>(
  props: ChoiceGroupProps<TValue>
): boolean {
  if (props.disabled) {
    return false;
  }

  return props.options.some((option) => !option.disabled);
}

function resolveChoiceGroupDefaultTargetId<TValue extends string>(
  componentId: string,
  props: ChoiceGroupProps<TValue>
): string | undefined {
  const selectedValues = new Set(getChoiceGroupSelectedValues(props));
  const defaultOption =
    props.options.find((option) => !option.disabled && selectedValues.has(option.value)) ??
    props.options.find((option) => !option.disabled);

  return defaultOption ? getChoiceGroupTargetId(componentId, defaultOption) : undefined;
}
