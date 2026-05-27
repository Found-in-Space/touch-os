import { createTextLabel } from "../../components/text-label.js";
import { createSurfaceShell } from "../../containers/surface-shell.js";
import {
  type DisplayComponent,
  type DisplayNode,
  createNode
} from "../../core/component.js";
import type { DrawCommand } from "../../core/draw.js";
import {
  ZERO_INSETS,
  createRect,
  rectContainsPoint,
  type Rect
} from "../../core/geometry.js";
import type { TouchAppManifest } from "../../apps/manifest.js";
import type { AppShellAction } from "../app-shell-events.js";
import type {
  AppShellPresentation,
  AppShellPresentationContext
} from "../app-shell-presentations.js";
import type { AppShellSession } from "../app-session.js";
import {
  createLauncherActionId,
  createTaskActionId,
  createTaskCloseActionId
} from "./desktop-window-presentation.js";

export interface TabletHomePresentationOptions {
  homeControl?: "button" | "bar" | "none";
  taskSwitcher?: "cards" | "list" | "none";
  taskCloseControl?: "button" | "none";
  /** Optional home launcher icon geometry overrides for compact surfaces. */
  launcherLayout?: TabletHomeLauncherLayoutOptions;
}

/** Layout controls for the tablet home app launcher. */
export interface TabletHomeLauncherLayoutOptions {
  tileWidth?: number;
  tileHeight?: number;
  gap?: number;
  bodyPadding?: number;
  iconMinSize?: number;
  iconMaxSize?: number;
  iconScale?: number;
  iconTop?: number;
  labelGap?: number;
}

interface TabletScreenProps {
  child: DisplayNode<unknown, unknown>;
  homeControl: "button" | "bar" | "none";
}

interface TabletHomeControlProps {
  variant: "button" | "bar";
}

interface TabletAppIconGridProps {
  children: readonly DisplayNode<unknown, unknown>[];
  layout: TabletHomeLauncherLayout;
}

interface TabletAppIconProps {
  manifest: TouchAppManifest;
  actionId: string;
  layout: TabletHomeLauncherLayout;
}

interface TabletTaskListProps {
  children: readonly DisplayNode<unknown, unknown>[];
  variant: "cards" | "list";
}

interface TabletTaskItemProps {
  session: AppShellSession;
  actionId: string;
  closeActionId?: string;
  variant: "cards" | "list";
}

const HOME_CONTROL_HEIGHT = 34;
interface TabletHomeLauncherLayout {
  tileWidth: number;
  tileHeight: number;
  gap: number;
  bodyPadding: number;
  iconMinSize: number;
  iconMaxSize: number;
  iconScale: number;
  iconTop: number;
  labelGap: number;
}

const DEFAULT_LAUNCHER_LAYOUT: TabletHomeLauncherLayout = {
  tileWidth: 92,
  tileHeight: 104,
  gap: 14,
  bodyPadding: 12,
  iconMinSize: 44,
  iconMaxSize: 54,
  iconScale: 0.58,
  iconTop: 4,
  labelGap: 7
};
const TASK_CARD_HEIGHT = 78;
const TASK_ROW_HEIGHT = 42;
const TASK_GAP = 10;

export function createTabletHomePresentation(
  options: TabletHomePresentationOptions = {}
): AppShellPresentation {
  const homeControl = options.homeControl ?? "bar";
  const taskSwitcher = options.taskSwitcher ?? "cards";
  const taskCloseControl = options.taskCloseControl ?? "none";
  const launcherLayout = resolveLauncherLayout(options.launcherLayout);

  return {
    kind: "tablet-home",
    getInitialMode(ctx) {
      return ctx.activeSessionId ? "app" : "home";
    },
    render(ctx) {
      const child = renderTabletMode(ctx, taskSwitcher, taskCloseControl, launcherLayout);
      return createTabletScreen(`${ctx.shellId}:tablet-screen`, {
        child,
        homeControl
      });
    },
    handleSystemCommand(command, ctx) {
      if (command.command === "home") {
        return { type: "home" };
      }
      if (command.command === "app-switcher" && taskSwitcher !== "none") {
        return { type: "toggle-task-switcher" };
      }
      if (command.command === "back" && ctx.mode === "app") {
        return { type: "home" };
      }
      return undefined;
    },
    resolveAppSurface(_request, ctx) {
      const metrics = ctx.services.surface.getMetrics();
      const controlHeight = homeControl === "none" ? 0 : HOME_CONTROL_HEIGHT;
      return {
        rect: createRect(
          metrics.safeArea.left,
          metrics.safeArea.top,
          Math.max(0, metrics.width - metrics.safeArea.left - metrics.safeArea.right),
          Math.max(0, metrics.height - metrics.safeArea.top - metrics.safeArea.bottom - controlHeight)
        ),
        safeArea: ZERO_INSETS
      };
    }
  };
}

function renderTabletMode(
  ctx: AppShellPresentationContext,
  taskSwitcher: "cards" | "list" | "none",
  taskCloseControl: "button" | "none",
  launcherLayout: TabletHomeLauncherLayout
): DisplayNode<unknown, unknown> {
  if (ctx.mode === "task-switcher" && taskSwitcher !== "none") {
    return createTaskSwitcher(ctx, taskSwitcher, taskCloseControl);
  }

  if (ctx.mode === "app" && ctx.activeSessionId) {
    const active = ctx.sessions.find((session) => session.id === ctx.activeSessionId);
    if (active) {
      return ctx.renderSessionContent(active);
    }
  }

  return createHomeScreen(ctx, launcherLayout);
}

function createHomeScreen(
  ctx: AppShellPresentationContext,
  launcherLayout: TabletHomeLauncherLayout
): DisplayNode<unknown, unknown> {
  const manifests = ctx.registry.list();
  return createSurfaceShell(`${ctx.shellId}:home:shell`, {
    children: manifests.length > 0
      ? [
          createTabletAppIconGrid(`${ctx.shellId}:home:icons`, {
            layout: launcherLayout,
            children: manifests.map((manifest) =>
              createTabletAppIcon(`${ctx.shellId}:home:open:${sanitizeId(manifest.id)}`, {
                manifest,
                actionId: createLauncherActionId(ctx.shellId, manifest.id),
                layout: launcherLayout
              })
            )
          })
        ]
      : [
          createTextLabel(`${ctx.shellId}:home:empty`, {
            text: "No apps",
            tone: "muted"
          })
        ],
    bodyPadding: launcherLayout.bodyPadding,
    bodyGap: launcherLayout.gap,
    scrollbar: "auto",
    pointerOpaque: true
  });
}

function createTaskSwitcher(
  ctx: AppShellPresentationContext,
  taskSwitcher: "cards" | "list",
  taskCloseControl: "button" | "none"
): DisplayNode<unknown, unknown> {
  return createSurfaceShell(`${ctx.shellId}:tasks:shell`, {
    header: createTextLabel(`${ctx.shellId}:tasks:title`, {
      text: "Running"
    }),
    children: ctx.sessions.length > 0
      ? [
          createTabletTaskList(`${ctx.shellId}:tasks:list`, {
            variant: taskSwitcher,
            children: ctx.sessions.map((session) =>
              createTaskSwitcherItem(ctx, session, taskSwitcher, taskCloseControl)
            )
          })
        ]
      : [
          createTextLabel(`${ctx.shellId}:tasks:empty`, {
            text: "No running apps",
            tone: "muted"
          })
        ],
    backgroundColor: ctx.services.theme.getTokens().backgroundColor,
    bodyPadding: taskSwitcher === "cards" ? 12 : 8,
    bodyGap: taskSwitcher === "cards" ? 10 : 6,
    scrollbar: "auto",
    pointerOpaque: true
  });
}

function createTaskSwitcherItem(
  ctx: AppShellPresentationContext,
  session: AppShellSession,
  taskSwitcher: "cards" | "list",
  taskCloseControl: "button" | "none"
): DisplayNode<unknown, unknown> {
  return createTabletTaskItem(`${ctx.shellId}:tasks:focus:${sanitizeId(session.id)}`, {
    session,
    variant: taskSwitcher,
    actionId: createTaskActionId(ctx.shellId, session.id),
    ...(taskCloseControl === "button"
      ? { closeActionId: createTaskCloseActionId(ctx.shellId, session.id) }
      : {})
  });
}

function createTaskLabel(session: AppShellSession): string {
  return session.focused ? `${session.title} (active)` : session.title;
}

function createTabletScreen(
  id: string,
  props: TabletScreenProps
): DisplayNode<TabletScreenProps> {
  return createNode(id, TabletScreenComponent, props);
}

const TabletScreenComponent: DisplayComponent<TabletScreenProps> = {
  kind: "tablet-screen",
  getChildren(ctx) {
    const children: DisplayNode<unknown, unknown>[] = [ctx.props.child];
    if (ctx.props.homeControl !== "none") {
      children.push(createTabletHomeControl(`${ctx.id}:home-control`, {
        variant: ctx.props.homeControl
      }));
    }
    return children;
  },
  measure(ctx) {
    const controlHeight = ctx.props.homeControl === "none" ? 0 : HOME_CONTROL_HEIGHT;
    ctx.measureChild(ctx.props.child.id, {
      minWidth: 0,
      minHeight: 0,
      maxWidth: ctx.constraints.maxWidth,
      maxHeight: Math.max(0, ctx.constraints.maxHeight - controlHeight)
    });
    if (ctx.props.homeControl !== "none") {
      ctx.measureChild(`${ctx.id}:home-control`, {
        minWidth: 0,
        minHeight: 0,
        maxWidth: ctx.constraints.maxWidth,
        maxHeight: controlHeight
      });
    }
    return {
      width: ctx.constraints.maxWidth,
      height: ctx.constraints.maxHeight
    };
  },
  layout(ctx) {
    const controlHeight = ctx.props.homeControl === "none" ? 0 : HOME_CONTROL_HEIGHT;
    const appBounds = createRect(
      ctx.bounds.x,
      ctx.bounds.y,
      ctx.bounds.width,
      Math.max(0, ctx.bounds.height - controlHeight)
    );
    ctx.setChildBounds(ctx.props.child.id, appBounds);
    if (ctx.props.homeControl !== "none") {
      ctx.setChildBounds(
        `${ctx.id}:home-control`,
        createRect(
          ctx.bounds.x,
          ctx.bounds.y + ctx.bounds.height - controlHeight,
          ctx.bounds.width,
          controlHeight
        )
      );
    }
    ctx.setContentBounds(ctx.bounds);
  },
  render(ctx) {
    return [
      {
        type: "rect",
        componentId: ctx.id,
        role: "tablet-screen-background",
        rect: ctx.bounds,
        fill: ctx.services.theme.getTokens().backgroundColor
      }
    ];
  }
};

function createTabletAppIconGrid(
  id: string,
  props: TabletAppIconGridProps
): DisplayNode<TabletAppIconGridProps> {
  return createNode(id, TabletAppIconGridComponent, props);
}

const TabletAppIconGridComponent: DisplayComponent<TabletAppIconGridProps> = {
  kind: "tablet-app-icon-grid",
  getChildren(ctx) {
    return ctx.props.children;
  },
  measure(ctx) {
    const layout = ctx.props.layout;
    const columns = getGridColumns(ctx.constraints.maxWidth, layout.tileWidth, layout.gap);
    for (const child of ctx.getChildren()) {
      ctx.measureChild(child.id, {
        minWidth: 0,
        minHeight: 0,
        maxWidth: layout.tileWidth,
        maxHeight: layout.tileHeight
      });
    }
    const rows = Math.ceil(ctx.props.children.length / columns);
    return {
      width: ctx.constraints.maxWidth,
      height: rows <= 0 ? 0 : rows * layout.tileHeight + (rows - 1) * layout.gap
    };
  },
  layout(ctx) {
    const layout = ctx.props.layout;
    const columns = getGridColumns(ctx.bounds.width, layout.tileWidth, layout.gap);
    const totalWidth = columns * layout.tileWidth + (columns - 1) * layout.gap;
    const startX = ctx.bounds.x + Math.max(0, (ctx.bounds.width - totalWidth) / 2);
    ctx.getChildren().forEach((child, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      ctx.setChildBounds(child.id, createRect(
        startX + column * (layout.tileWidth + layout.gap),
        ctx.bounds.y + row * (layout.tileHeight + layout.gap),
        layout.tileWidth,
        layout.tileHeight
      ));
    });
    ctx.setContentBounds(ctx.bounds);
  },
  render() {
    return [];
  }
};

function createTabletAppIcon(
  id: string,
  props: TabletAppIconProps
): DisplayNode<TabletAppIconProps> {
  return createNode(id, TabletAppIconComponent, props);
}

const TabletAppIconComponent: DisplayComponent<TabletAppIconProps> = {
  kind: "tablet-app-icon",
  measure(ctx) {
    const layout = ctx.props.layout;
    return {
      width: layout.tileWidth,
      height: layout.tileHeight
    };
  },
  render(ctx) {
    const theme = ctx.services.theme.getTokens();
    const layout = ctx.props.layout;
    const pressed = ctx.interaction.pressedTargetId === `${ctx.id}:icon`;
    const iconSize = Math.min(
      layout.iconMaxSize,
      Math.max(layout.iconMinSize, ctx.bounds.width * layout.iconScale)
    );
    const iconRect = createRect(
      ctx.bounds.x + (ctx.bounds.width - iconSize) / 2,
      ctx.bounds.y + layout.iconTop,
      iconSize,
      iconSize
    );
    const labelRect = createRect(
      ctx.bounds.x,
      iconRect.y + iconRect.height + layout.labelGap,
      ctx.bounds.width,
      Math.max(0, ctx.bounds.y + ctx.bounds.height - iconRect.y - iconRect.height - layout.labelGap)
    );
    return [
      {
        type: "rect",
        componentId: ctx.id,
        role: "tablet-app-icon-tile",
        rect: ctx.bounds,
        fill: pressed ? theme.surfaceColor : theme.backgroundColor,
        radius: theme.radius
      },
      {
        type: "rect",
        componentId: ctx.id,
        role: "tablet-app-icon",
        rect: iconRect,
        fill: theme.surfaceColor,
        stroke: theme.borderColor,
        strokeWidth: 1,
        radius: Math.max(10, theme.radius)
      },
      {
        type: "text",
        componentId: ctx.id,
        role: "tablet-app-icon-symbol",
        text: resolveIconText(ctx.props.manifest),
        rect: iconRect,
        color: theme.textColor,
        align: "center",
        verticalAlign: "middle",
        fontSize: 22,
        fontWeight: 700
      },
      {
        type: "text",
        componentId: ctx.id,
        role: "tablet-app-icon-label",
        text: ctx.props.manifest.name || ctx.props.manifest.id,
        rect: labelRect,
        color: theme.textColor,
        align: "center",
        verticalAlign: "top",
        fontSize: Math.max(11, theme.typography.fontSize - 1),
        fontWeight: theme.typography.fontWeight
      }
    ];
  },
  hitTest(ctx) {
    return rectContainsPoint(ctx.bounds, ctx.point)
      ? { targetId: `${ctx.id}:icon`, role: "tablet-app-icon" }
      : null;
  },
  handleEvent(ctx) {
    if (ctx.event.type !== "press") {
      return;
    }
    ctx.emit({
      type: "action",
      componentId: ctx.id,
      actionId: ctx.props.actionId
    });
  }
};

function createTabletTaskList(
  id: string,
  props: TabletTaskListProps
): DisplayNode<TabletTaskListProps> {
  return createNode(id, TabletTaskListComponent, props);
}

const TabletTaskListComponent: DisplayComponent<TabletTaskListProps> = {
  kind: "tablet-task-list",
  getChildren(ctx) {
    return ctx.props.children;
  },
  measure(ctx) {
    const childHeight = getTaskItemHeight(ctx.props.variant);
    for (const child of ctx.getChildren()) {
      ctx.measureChild(child.id, {
        minWidth: 0,
        minHeight: 0,
        maxWidth: ctx.constraints.maxWidth,
        maxHeight: childHeight
      });
    }
    const count = ctx.props.children.length;
    return {
      width: ctx.constraints.maxWidth,
      height: count <= 0 ? 0 : count * childHeight + (count - 1) * TASK_GAP
    };
  },
  layout(ctx) {
    const childHeight = getTaskItemHeight(ctx.props.variant);
    ctx.getChildren().forEach((child, index) => {
      ctx.setChildBounds(child.id, createRect(
        ctx.bounds.x,
        ctx.bounds.y + index * (childHeight + TASK_GAP),
        ctx.bounds.width,
        childHeight
      ));
    });
    ctx.setContentBounds(ctx.bounds);
  },
  render() {
    return [];
  }
};

function createTabletTaskItem(
  id: string,
  props: TabletTaskItemProps
): DisplayNode<TabletTaskItemProps> {
  return createNode(id, TabletTaskItemComponent, props);
}

const TabletTaskItemComponent: DisplayComponent<TabletTaskItemProps> = {
  kind: "tablet-task-item",
  measure(ctx) {
    return {
      width: ctx.constraints.maxWidth,
      height: getTaskItemHeight(ctx.props.variant)
    };
  },
  render(ctx) {
    const theme = ctx.services.theme.getTokens();
    const pressed = ctx.interaction.pressedTargetId === `${ctx.id}:task`;
    const closePressed = ctx.interaction.pressedTargetId === `${ctx.id}:close`;
    const closeRect = ctx.props.closeActionId ? getTaskCloseRect(ctx.bounds) : undefined;
    const titleRect = createRect(
      ctx.bounds.x + theme.padding,
      ctx.bounds.y,
      Math.max(0, ctx.bounds.width - theme.padding * 2 - (closeRect ? closeRect.width + 8 : 0)),
      ctx.bounds.height
    );
    const role = ctx.props.variant === "cards" ? "tablet-task-card" : "tablet-task-row";
    const commands: DrawCommand[] = [
      {
        type: "rect",
        componentId: ctx.id,
        role,
        rect: ctx.bounds,
        fill: pressed ? theme.backgroundColor : theme.surfaceColor,
        stroke: ctx.props.session.focused ? theme.accentColor : theme.borderColor,
        strokeWidth: ctx.props.session.focused ? 2 : 1,
        radius: ctx.props.variant === "cards" ? theme.radius : Math.min(6, theme.radius)
      },
      {
        type: "text",
        componentId: ctx.id,
        role: "tablet-task-title",
        text: createTaskLabel(ctx.props.session),
        rect: titleRect,
        color: theme.textColor,
        align: "left",
        verticalAlign: "middle",
        fontSize: theme.typography.fontSize,
        fontWeight: ctx.props.session.focused ? 700 : theme.typography.fontWeight
      }
    ];
    if (closeRect) {
      commands.push(
        {
          type: "rect",
          componentId: ctx.id,
          role: "tablet-task-close",
          rect: closeRect,
          fill: closePressed ? theme.backgroundColor : theme.surfaceColor,
          stroke: theme.borderColor,
          strokeWidth: 1,
          radius: closeRect.height / 2
        },
        {
          type: "text",
          componentId: ctx.id,
          role: "tablet-task-close-label",
          text: "x",
          rect: closeRect,
          color: theme.textColor,
          align: "center",
          verticalAlign: "middle",
          fontSize: Math.max(10, theme.typography.fontSize - 1),
          fontWeight: 700
        }
      );
    }
    return commands;
  },
  hitTest(ctx) {
    if (!rectContainsPoint(ctx.bounds, ctx.point)) {
      return null;
    }
    const closeRect = ctx.props.closeActionId ? getTaskCloseRect(ctx.bounds) : undefined;
    if (closeRect && rectContainsPoint(closeRect, ctx.point)) {
      return { targetId: `${ctx.id}:close`, role: "tablet-task-close" };
    }
    return { targetId: `${ctx.id}:task`, role: "tablet-task" };
  },
  handleEvent(ctx) {
    if (ctx.event.type !== "press") {
      return;
    }
    const actionId = ctx.event.targetId === `${ctx.id}:close` && ctx.props.closeActionId
      ? ctx.props.closeActionId
      : ctx.props.actionId;
    ctx.emit({
      type: "action",
      componentId: ctx.id,
      actionId
    });
  }
};

function createTabletHomeControl(
  id: string,
  props: TabletHomeControlProps
): DisplayNode<TabletHomeControlProps> {
  return createNode(id, TabletHomeControlComponent, props);
}

const TabletHomeControlComponent: DisplayComponent<TabletHomeControlProps> = {
  kind: "tablet-home-control",
  measure(ctx) {
    return {
      width: ctx.constraints.maxWidth,
      height: HOME_CONTROL_HEIGHT
    };
  },
  render(ctx) {
    const theme = ctx.services.theme.getTokens();
    const commands: DrawCommand[] = [
      {
        type: "rect",
        componentId: ctx.id,
        role: "tablet-home-control-hit-area",
        rect: ctx.bounds,
        fill: theme.backgroundColor
      }
    ];
    if (ctx.props.variant === "button") {
      const pressed = ctx.interaction.pressedTargetId === `${ctx.id}:home`;
      const size = Math.min(28, Math.max(22, ctx.bounds.height - 8));
      const rect = createRect(
        ctx.bounds.x + (ctx.bounds.width - size) / 2,
        ctx.bounds.y + (ctx.bounds.height - size) / 2,
        size,
        size
      );
      commands.push({
        type: "rect",
        componentId: ctx.id,
        role: "tablet-home-button",
        rect,
        fill: pressed ? theme.accentColor : theme.surfaceColor,
        stroke: pressed ? theme.accentTextColor : theme.borderColor,
        strokeWidth: 1,
        radius: size / 2
      });
      commands.push(...createTabletHomeButtonIconCommands(
        ctx.id,
        rect,
        pressed ? theme.accentTextColor : theme.textColor
      ));
    } else {
      const barWidth = Math.min(96, Math.max(42, ctx.bounds.width * 0.22));
      const rect = createRect(
        ctx.bounds.x + (ctx.bounds.width - barWidth) / 2,
        ctx.bounds.y + (ctx.bounds.height - 5) / 2,
        barWidth,
        5
      );
      commands.push({
        type: "rect",
        componentId: ctx.id,
        role: "tablet-home-bar",
        rect,
        fill: theme.mutedTextColor,
        radius: rect.height / 2
      });
    }
    return commands;
  },
  hitTest(ctx) {
    return rectContainsPoint(ctx.bounds, ctx.point)
      ? { targetId: `${ctx.id}:home`, role: "tablet-home-control" }
      : null;
  },
  handleEvent(ctx) {
    if (ctx.event.type !== "press") {
      return;
    }

    ctx.emit({
      type: "system-command",
      command: "home",
      timestamp: ctx.event.timestamp,
      source: "touch"
    });
  }
};

function createTabletHomeButtonIconCommands(
  componentId: string,
  rect: Rect,
  color: string
): DrawCommand[] {
  const centerX = rect.x + rect.width / 2;
  const roofY = rect.y + rect.height * 0.32;
  const shoulderY = rect.y + rect.height * 0.49;
  const left = rect.x + rect.width * 0.28;
  const right = rect.x + rect.width * 0.72;
  const bodyWidth = rect.width * 0.34;
  const bodyHeight = rect.height * 0.22;
  const bodyRect = createRect(
    centerX - bodyWidth / 2,
    shoulderY,
    bodyWidth,
    bodyHeight
  );
  const strokeWidth = Math.max(1.5, rect.width * 0.07);
  const line = (x1: number, y1: number, x2: number, y2: number): DrawCommand => ({
    type: "line" as const,
    componentId,
    role: "tablet-home-button-symbol",
    x1,
    y1,
    x2,
    y2,
    stroke: color,
    strokeWidth
  });

  return [
    line(left, shoulderY, centerX, roofY),
    line(centerX, roofY, right, shoulderY),
    {
      type: "rect",
      componentId,
      role: "tablet-home-button-symbol",
      rect: bodyRect,
      stroke: color,
      strokeWidth,
      radius: Math.max(1, rect.width * 0.05)
    }
  ];
}

function sanitizeId(value: string): string {
  const sanitized = value.trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return sanitized.length > 0 ? sanitized : "app";
}

function getGridColumns(width: number, tileWidth: number, gap: number): number {
  return Math.max(1, Math.floor((Math.max(0, width) + gap) / (tileWidth + gap)));
}

function resolveLauncherLayout(
  options: TabletHomeLauncherLayoutOptions | undefined
): TabletHomeLauncherLayout {
  return {
    tileWidth: resolvePositive(options?.tileWidth, DEFAULT_LAUNCHER_LAYOUT.tileWidth),
    tileHeight: resolvePositive(options?.tileHeight, DEFAULT_LAUNCHER_LAYOUT.tileHeight),
    gap: resolveNonNegative(options?.gap, DEFAULT_LAUNCHER_LAYOUT.gap),
    bodyPadding: resolveNonNegative(options?.bodyPadding, DEFAULT_LAUNCHER_LAYOUT.bodyPadding),
    iconMinSize: resolvePositive(options?.iconMinSize, DEFAULT_LAUNCHER_LAYOUT.iconMinSize),
    iconMaxSize: resolvePositive(options?.iconMaxSize, DEFAULT_LAUNCHER_LAYOUT.iconMaxSize),
    iconScale: resolvePositive(options?.iconScale, DEFAULT_LAUNCHER_LAYOUT.iconScale),
    iconTop: resolveNonNegative(options?.iconTop, DEFAULT_LAUNCHER_LAYOUT.iconTop),
    labelGap: resolveNonNegative(options?.labelGap, DEFAULT_LAUNCHER_LAYOUT.labelGap)
  };
}

function resolvePositive(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
}

function resolveNonNegative(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function getTaskItemHeight(variant: "cards" | "list"): number {
  return variant === "cards" ? TASK_CARD_HEIGHT : TASK_ROW_HEIGHT;
}

function getTaskCloseRect(bounds: { x: number; y: number; width: number; height: number }) {
  const size = Math.min(26, Math.max(20, bounds.height - 18));
  return createRect(
    bounds.x + bounds.width - size - 12,
    bounds.y + (bounds.height - size) / 2,
    size,
    size
  );
}

function resolveIconText(manifest: TouchAppManifest): string {
  if (manifest.icon) {
    return manifest.icon.kind === "image"
      ? manifest.icon.label ?? manifest.name.slice(0, 2).toUpperCase()
      : manifest.icon.value;
  }
  return (manifest.name || manifest.id).slice(0, 2).toUpperCase();
}
