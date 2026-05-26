import type {
  DisplayComponent,
  DisplayNode
} from "../core/component.js";
import { createNode } from "../core/component.js";
import type { DrawCommand } from "../core/draw.js";
import { createRect } from "../core/geometry.js";
import { createButton } from "../components/button.js";
import { createSlider } from "../components/slider.js";
import { createToggle } from "../components/toggle.js";
import { createSection } from "../containers/section.js";
import { createSurfaceShell } from "../containers/surface-shell.js";
import type { RuntimeOutput } from "../core/actions.js";
import type { TouchIconDescriptor } from "./manifest.js";
import { defineTouchApp, type TouchAppModule } from "./define-app.js";
import type { TouchAppContext, TouchAppEvent } from "./context.js";

export type SurfaceSizeClass = "compact" | "regular" | "wide";

export interface ControlsAppOptions<TState> {
  id: string;
  name: string;
  version?: string;
  icon?: TouchIconDescriptor;

  preferredSurface?: {
    width?: number;
    height?: number;
    minWidth?: number;
    minHeight?: number;
    resizable?: boolean;
  };

  controls(
    api: ControlsAppBuilder<TState>
  ): readonly ControlsAppItem<TState>[];

  onAction?(event: ControlsAppActionEvent<TState>): void;
  onChange?(event: ControlsAppChangeEvent<TState>): void;
}

export interface ControlsAppBuilder<TState> {
  toggle(
    label: string,
    field: keyof TState & string,
    options?: {
      id?: string;
      disabled?: boolean;
    }
  ): ControlsAppItem<TState>;

  status(
    label: string,
    read: (state: TState) => string,
    options?: {
      id?: string;
      tone?: "normal" | "muted" | "accent" | "warning" | "danger";
    }
  ): ControlsAppItem<TState>;

  button(
    label: string,
    actionId: string,
    options?: {
      id?: string;
      payload?: Record<string, unknown>;
      disabled?: boolean;
    }
  ): ControlsAppItem<TState>;

  slider(
    label: string,
    field: keyof TState & string,
    options: {
      min: number;
      max: number;
      step?: number;
      id?: string;
      valueText?: (state: TState) => string;
      disabled?: boolean;
    }
  ): ControlsAppItem<TState>;

  section(
    title: string,
    children: readonly ControlsAppItem<TState>[],
    options?: {
      id?: string;
    }
  ): ControlsAppItem<TState>;
}

export type ControlsAppItem<TState> =
  | ControlsAppToggleItem<TState>
  | ControlsAppStatusItem<TState>
  | ControlsAppButtonItem<TState>
  | ControlsAppSliderItem<TState>
  | ControlsAppSectionItem<TState>;

export interface ControlsAppToggleItem<TState> {
  kind: "toggle";
  id: string;
  label: string;
  field: keyof TState & string;
  disabled?: boolean;
}

export interface ControlsAppStatusItem<TState> {
  kind: "status";
  id: string;
  label: string;
  read(state: TState): string;
  tone: "normal" | "muted" | "accent" | "warning" | "danger";
}

export interface ControlsAppButtonItem<TState> {
  kind: "button";
  id: string;
  label: string;
  actionId: string;
  payload?: Record<string, unknown>;
  disabled?: boolean;
}

export interface ControlsAppSliderItem<TState> {
  kind: "slider";
  id: string;
  label: string;
  field: keyof TState & string;
  min: number;
  max: number;
  step?: number;
  valueText?: (state: TState) => string;
  disabled?: boolean;
}

export interface ControlsAppSectionItem<TState> {
  kind: "section";
  id: string;
  title: string;
  children: readonly ControlsAppItem<TState>[];
}

export interface ControlsAppActionEvent<TState> extends TouchAppEvent {
  type: "app-action";
  appId: string;
  instanceId: string;
  windowId: string;
  name: string;
  payload?: Record<string, unknown>;
  state: TState;
}

export interface ControlsAppChangeEvent<TState> extends TouchAppEvent {
  type: "app-change";
  appId: string;
  instanceId: string;
  windowId: string;
  name: string;
  payload: {
    field: keyof TState & string;
    value: unknown;
  };
  state: TState;
}

interface ControlsStatusProps {
  label: string;
  value: string;
  tone: "normal" | "muted" | "accent" | "warning" | "danger";
}

interface ControlsLayoutProps {
  children: readonly DisplayNode<unknown, unknown>[];
  columns: 1 | 2;
  gap: number;
}

export function defineControlsApp<TState>(
  options: ControlsAppOptions<TState>
): TouchAppModule<TState> {
  return defineTouchApp<TState>({
    manifest: {
      id: options.id,
      name: options.name,
      version: options.version ?? "1.0.0",
      ...(options.icon ? { icon: options.icon } : {}),
      preferredWindow: {
        width: options.preferredSurface?.width ?? 320,
        height: options.preferredSurface?.height ?? 220,
        minWidth: options.preferredSurface?.minWidth ?? 240,
        minHeight: options.preferredSurface?.minHeight ?? 160,
        resizable: options.preferredSurface?.resizable ?? true
      }
    },
    createApp(ctx) {
      const items = options.controls(createControlsAppBuilder<TState>());
      let latestState: TState | undefined;

      return {
        render(state) {
          latestState = state;
          return renderControlsApp(ctx, state, items);
        },
        handleOutput(output) {
          if (latestState === undefined) {
            return;
          }
          handleControlsAppOutput(ctx, options, latestState, output);
        }
      };
    }
  });
}

function createControlsAppBuilder<TState>(): ControlsAppBuilder<TState> {
  return {
    toggle(label, field, options) {
      return {
        kind: "toggle",
        id: options?.id ?? sanitizeId(`${field}-toggle`),
        label,
        field,
        ...(options?.disabled !== undefined ? { disabled: options.disabled } : {})
      };
    },
    status(label, read, options) {
      return {
        kind: "status",
        id: options?.id ?? sanitizeId(`${label}-status`),
        label,
        read,
        tone: options?.tone ?? "normal"
      };
    },
    button(label, actionId, options) {
      return {
        kind: "button",
        id: options?.id ?? sanitizeId(`${actionId}-button`),
        label,
        actionId,
        ...(options?.payload ? { payload: options.payload } : {}),
        ...(options?.disabled !== undefined ? { disabled: options.disabled } : {})
      };
    },
    slider(label, field, options) {
      return {
        kind: "slider",
        id: options.id ?? sanitizeId(`${field}-slider`),
        label,
        field,
        min: options.min,
        max: options.max,
        ...(options.step !== undefined ? { step: options.step } : {}),
        ...(options.valueText ? { valueText: options.valueText } : {}),
        ...(options.disabled !== undefined ? { disabled: options.disabled } : {})
      };
    },
    section(title, children, options) {
      return {
        kind: "section",
        id: options?.id ?? sanitizeId(`${title}-section`),
        title,
        children
      };
    }
  };
}

function renderControlsApp<TState>(
  ctx: TouchAppContext,
  state: TState,
  items: readonly ControlsAppItem<TState>[]
): DisplayNode<unknown, unknown> {
  const sizeClass = getSurfaceSizeClass(ctx.surface.width);
  const safeArea = ctx.surface.safeArea;
  const bodyPadding = sizeClass === "compact" ? 8 : 10;
  const renderedItems = items.map((item) => renderControlsAppItem(state, item));
  const columns = sizeClass === "wide" && !items.some((item) => item.kind === "section") ? 2 : 1;
  return createSurfaceShell("controls-root", {
    children: [
      createControlsLayout("controls-layout", {
        children: renderedItems,
        columns,
        gap: sizeClass === "wide" ? 10 : 8
      })
    ],
    padding: safeArea,
    bodyPadding,
    bodyGap: sizeClass === "wide" ? 10 : 8,
    scrollbar: "auto",
    pointerOpaque: true
  });
}

function renderControlsAppItem<TState>(
  state: TState,
  item: ControlsAppItem<TState>
): DisplayNode<unknown, unknown> {
  switch (item.kind) {
    case "toggle":
      return createToggle(item.id, {
        label: item.label,
        field: item.field,
        value: Boolean(readStateField(state, item.field)),
        ...(item.disabled !== undefined ? { disabled: item.disabled } : {})
      });
    case "status":
      return createControlsStatus(item.id, {
        label: item.label,
        value: item.read(state),
        tone: item.tone
      });
    case "button":
      return createButton(item.id, {
        label: item.label,
        actionId: item.actionId,
        ...(item.payload ? { payload: item.payload } : {}),
        ...(item.disabled !== undefined ? { disabled: item.disabled } : {})
      });
    case "slider":
      return createSlider(item.id, {
        label: item.label,
        field: item.field,
        value: Number(readStateField(state, item.field) ?? item.min),
        min: item.min,
        max: item.max,
        ...(item.step !== undefined ? { step: item.step } : {}),
        ...(item.valueText ? { valueText: item.valueText(state) } : {}),
        ...(item.disabled !== undefined ? { disabled: item.disabled } : {})
      });
    case "section":
      return createSection(item.id, {
        title: item.title,
        children: item.children.map((child) => renderControlsAppItem(state, child))
      });
  }
}

function handleControlsAppOutput<TState>(
  ctx: TouchAppContext,
  options: ControlsAppOptions<TState>,
  state: TState,
  output: RuntimeOutput
): void {
  if (output.type === "change-request") {
    const event: ControlsAppChangeEvent<TState> = {
      type: "app-change",
      appId: ctx.appId,
      instanceId: ctx.instanceId,
      windowId: ctx.windowId,
      name: `${output.field}.change`,
      payload: {
        field: output.field as keyof TState & string,
        value: output.value
      },
      state
    };
    ctx.actions.emit(event);
    options.onChange?.(event);
    return;
  }

  if (output.type === "action") {
    const event: ControlsAppActionEvent<TState> = {
      type: "app-action",
      appId: ctx.appId,
      instanceId: ctx.instanceId,
      windowId: ctx.windowId,
      name: output.actionId,
      ...(output.payload ? { payload: output.payload } : {}),
      state
    };
    ctx.actions.emit(event);
    options.onAction?.(event);
  }
}

function createControlsStatus(
  id: string,
  props: ControlsStatusProps
): DisplayNode<ControlsStatusProps> {
  return createNode(id, ControlsStatusComponent, props);
}

const ControlsStatusComponent: DisplayComponent<ControlsStatusProps> = {
  kind: "controls-status",
  measure(ctx) {
    const theme = ctx.services.theme.getTokens();
    return {
      width: ctx.constraints.maxWidth,
      height: theme.controlHeight
    };
  },
  render(ctx) {
    const theme = ctx.services.theme.getTokens();
    const labelRect = createRect(
      ctx.bounds.x + theme.padding,
      ctx.bounds.y,
      Math.max(0, ctx.bounds.width * 0.45 - theme.padding),
      ctx.bounds.height
    );
    const valueRect = createRect(
      ctx.bounds.x + ctx.bounds.width * 0.45,
      ctx.bounds.y,
      Math.max(0, ctx.bounds.width * 0.55 - theme.padding),
      ctx.bounds.height
    );
    const commands: DrawCommand[] = [
      {
        type: "rect",
        componentId: ctx.id,
        role: "controls-status-row",
        rect: ctx.bounds,
        fill: theme.surfaceColor,
        stroke: theme.borderColor,
        strokeWidth: 1,
        radius: theme.radius
      },
      {
        type: "text",
        componentId: ctx.id,
        role: "controls-status-label",
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
        role: "controls-status-value",
        text: ctx.props.value,
        rect: valueRect,
        color: resolveStatusColor(ctx.props.tone, theme),
        align: "right",
        verticalAlign: "middle",
        fontSize: theme.typography.fontSize,
        fontWeight: 700
      }
    ];
    return commands;
  },
  hitTest() {
    return null;
  }
};

function createControlsLayout(
  id: string,
  props: ControlsLayoutProps
): DisplayNode<ControlsLayoutProps> {
  return createNode(id, ControlsLayoutComponent, props);
}

const ControlsLayoutComponent: DisplayComponent<ControlsLayoutProps> = {
  kind: "controls-layout",
  getChildren(ctx) {
    return ctx.props.children;
  },
  measure(ctx) {
    const columns = resolveColumns(ctx.props.columns, ctx.constraints.maxWidth);
    const columnWidth = getColumnWidth(ctx.constraints.maxWidth, columns, ctx.props.gap);
    const rowHeights: number[] = [];
    ctx.getChildren().forEach((child, index) => {
      const size = ctx.measureChild(child.id, {
        minWidth: 0,
        minHeight: 0,
        maxWidth: columnWidth,
        maxHeight: ctx.constraints.maxHeight
      });
      const row = Math.floor(index / columns);
      rowHeights[row] = Math.max(rowHeights[row] ?? 0, size.height);
    });
    const height = rowHeights.reduce((sum, rowHeight, index) =>
      sum + rowHeight + (index > 0 ? ctx.props.gap : 0), 0);
    return {
      width: ctx.constraints.maxWidth,
      height
    };
  },
  layout(ctx) {
    const columns = resolveColumns(ctx.props.columns, ctx.bounds.width);
    const columnWidth = getColumnWidth(ctx.bounds.width, columns, ctx.props.gap);
    const rowHeights: number[] = [];
    ctx.getChildren().forEach((child, index) => {
      const size = ctx.getMeasuredSize(child.id);
      const row = Math.floor(index / columns);
      rowHeights[row] = Math.max(rowHeights[row] ?? 0, size.height);
    });

    let y = ctx.bounds.y;
    ctx.getChildren().forEach((child, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      if (column === 0 && row > 0) {
        y += (rowHeights[row - 1] ?? 0) + ctx.props.gap;
      }
      ctx.setChildBounds(child.id, createRect(
        ctx.bounds.x + column * (columnWidth + ctx.props.gap),
        y,
        columnWidth,
        rowHeights[row] ?? 0
      ));
    });
    const contentHeight = rowHeights.reduce((sum, rowHeight, index) =>
      sum + rowHeight + (index > 0 ? ctx.props.gap : 0), 0);
    ctx.setContentBounds(createRect(ctx.bounds.x, ctx.bounds.y, ctx.bounds.width, contentHeight));
  },
  render() {
    return [];
  }
};

function getSurfaceSizeClass(width: number): SurfaceSizeClass {
  if (width < 420) {
    return "compact";
  }
  if (width < 720) {
    return "regular";
  }
  return "wide";
}

function resolveColumns(columns: 1 | 2, width: number): 1 | 2 {
  return columns === 2 && width >= 640 ? 2 : 1;
}

function getColumnWidth(width: number, columns: 1 | 2, gap: number): number {
  return columns === 1 ? width : Math.max(0, (width - gap) / 2);
}

function resolveStatusColor(
  tone: ControlsStatusProps["tone"],
  theme: ReturnType<TouchAppContext["theme"]["getTokens"]>
): string {
  switch (tone) {
    case "muted":
      return theme.mutedTextColor;
    case "accent":
      return theme.accentColor;
    case "warning":
      return "#f59e0b";
    case "danger":
      return "#ef4444";
    case "normal":
    default:
      return theme.textColor;
  }
}

function readStateField<TState>(state: TState, field: keyof TState & string): unknown {
  return (state as Record<string, unknown>)[field];
}

function sanitizeId(value: string): string {
  const sanitized = value.trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return sanitized.length > 0 ? sanitized : "control";
}
