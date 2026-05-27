import {
  createAppShell,
  createButton,
  createDPad,
  createEmbeddedSurface,
  createHoldButton,
  createRepeatButton,
  createTabletHomePresentation,
  createTextLabel,
  createToggle,
  createTouchAppRegistry,
  createValueReadout,
  createNode,
  createRect,
  defineControlsApp,
  defineTouchApp,
  type AppShellChange,
  type AppShellPresentation,
  type AppShellPresentationAppSurface,
  type AppShellPresentationContext,
  type DisplayComponent,
  type DisplayNode,
  type RuntimeOutput,
  type SurfaceMetrics,
  type ThemeTokens,
  type TouchAppContext
} from "../../../src/index.js";
import {
  createColumn,
  createDockLayout,
  createSection,
  createSurfaceShell
} from "../../../src/index.js";
import {
  REAR_VIEW_SOURCE_ID,
  MIRROR_COMPONENT_ID,
  XR_HUD_MIRROR_COMPONENT_ID,
  WALL_MIRROR_COMPONENT_ID
} from "./mirror.js";
import {
  WALL_PICTURE_COMPONENT_ID,
  WALL_PICTURE_SOURCE_ID
} from "./shader-picture.js";
import { TV_VIDEO_SOURCE_ID } from "./video-source.js";
import type { MovementIntent, RoomDemoState } from "./store.js";

export type RoomPanelVariant = "tv" | "hud" | "arm";

export interface RoomPanelDiagnostics {
  pointerMode: string;
  timing: string;
  activePanel: string;
}

interface ArmPanelAppState {
  room: RoomDemoState;
  diagnostics: RoomPanelDiagnostics;
}

const ARM_APP_IDS = {
  settings: "space.found.living-room.settings",
  rearView: "space.found.living-room.rear-view",
  fractalArt: "space.found.living-room.fractal-art",
  diagnostics: "space.found.living-room.diagnostics"
} as const;

const TV_APP_IDS = {
  status: "space.found.living-room.tv-status",
  video: "space.found.living-room.tv-video"
} as const;

export const TV_VIDEO_APP_ID = TV_APP_IDS.video;

export const TV_PANEL_ACTION_IDS = {
  powerToggle: "tv.power.toggle",
  volumeDown: "media.tv-video.volume-down",
  volumeUp: "media.tv-video.volume-up",
  home: "tv.home"
} as const;

export const TV_PANEL_BUTTON_IDS = {
  home: "tv-device:home",
  volumeUp: "tv-device:volume-up",
  volumeDown: "tv-device:volume-down",
  power: "tv-device:power"
} as const;

export interface RoomPanelOptions {
  tv?: TvPanelOptions;
}

export interface TvPanelOptions {
  screenOn?: boolean;
  volume?: number;
  onShellChange?(change: AppShellChange): void;
}

interface ResolvedTvPanelOptions {
  screenOn: boolean;
  volume: number;
  onShellChange?: (change: AppShellChange) => void;
}

const TV_APP_REGISTRY = createTouchAppRegistry([
  defineTouchApp<RoomDemoState>({
    manifest: {
      id: TV_APP_IDS.status,
      name: "Status",
      version: "1.0.0",
      icon: {
        kind: "symbol",
        value: "TV"
      }
    },
    createApp(ctx) {
      return {
        render(state) {
          return createTvStatusAppRoot(state);
        },
        handleOutput(output) {
          emitRoomAppOutput(ctx, output);
        }
      };
    }
  }),
  defineTouchApp<RoomDemoState>({
    manifest: {
      id: TV_APP_IDS.video,
      name: "Video",
      version: "1.0.0",
      icon: {
        kind: "symbol",
        value: "VD"
      },
      capabilities: ["surfaces"]
    },
    createApp(ctx) {
      return {
        render() {
          return createTvVideoAppRoot();
        },
        handleOutput(output) {
          emitRoomAppOutput(ctx, output);
        }
      };
    }
  })
]);

const ARM_APP_REGISTRY = createTouchAppRegistry([
  defineControlsApp<RoomDemoState>({
    id: ARM_APP_IDS.settings,
    name: "Settings",
    icon: {
      kind: "symbol",
      value: "ST"
    },
    preferredSurface: {
      width: 260,
      height: 168,
      minWidth: 220,
      minHeight: 150,
      resizable: false
    },
    controls: ({ button, section, status, toggle }) => [
      toggle("Lamp", "lightOn"),
      status("Mode", (state) => state.xrActive ? "XR" : "Desktop"),
      status("Speed", (state) => formatSpeed(state.moveSpeed)),
      section("Speed", [
        button("Slower", "moveSpeed.adjust", {
          id: "move-speed-slower",
          payload: { delta: -0.2 }
        }),
        button("Faster", "moveSpeed.adjust", {
          id: "move-speed-faster",
          payload: { delta: 0.2 }
        })
      ])
    ]
  }),
  defineTouchApp<ArmPanelAppState>({
    manifest: {
      id: ARM_APP_IDS.rearView,
      name: "Rear View",
      version: "1.0.0",
      icon: {
        kind: "symbol",
        value: "RV"
      },
      capabilities: ["surfaces"],
      preferredWindow: {
        width: 188,
        height: 124,
        minWidth: 160,
        minHeight: 104,
        resizable: false
      }
    },
    createApp(ctx) {
      return {
        render() {
          return createRearViewAppRoot();
        },
        handleOutput(output) {
          emitRoomAppOutput(ctx, output);
        }
      };
    }
  }),
  defineTouchApp<ArmPanelAppState>({
    manifest: {
      id: ARM_APP_IDS.fractalArt,
      name: "Fractal Art",
      version: "1.0.0",
      icon: {
        kind: "symbol",
        value: "FA"
      },
      capabilities: ["surfaces"],
      preferredWindow: {
        width: 188,
        height: 124,
        minWidth: 160,
        minHeight: 104,
        resizable: false
      }
    },
    createApp(ctx) {
      return {
        render() {
          return createFractalArtAppRoot();
        },
        handleOutput(output) {
          emitRoomAppOutput(ctx, output);
        }
      };
    }
  }),
  defineTouchApp<ArmPanelAppState>({
    manifest: {
      id: ARM_APP_IDS.diagnostics,
      name: "Diagnostics",
      version: "1.0.0",
      icon: {
        kind: "symbol",
        value: "DX"
      },
      preferredWindow: {
        width: 172,
        height: 132,
        minWidth: 150,
        minHeight: 112,
        resizable: false
      }
    },
    createApp(ctx) {
      return {
        render(state) {
          return createDiagnosticsAppRoot(state);
        },
        handleOutput(output) {
          emitRoomAppOutput(ctx, output);
        }
      };
    }
  })
]);

export function createRoomPanelRoot(
  variant: RoomPanelVariant,
  state: RoomDemoState,
  diagnostics: RoomPanelDiagnostics = createDefaultRoomPanelDiagnostics(),
  options: RoomPanelOptions = {}
): DisplayNode<unknown> {
  switch (variant) {
    case "tv":
      return createTvPanelRoot(state, options.tv);
    case "arm":
      return createArmTabletRoot(state, diagnostics);
    case "hud":
    default:
      return createDockLayout("hud-root", {
        padding: 0,
        topLeft: {
          maxWidth: 340,
          child: createSection("hud-overview", {
            title: "Touch OS Living Room",
            backgroundColor: "#0f1b2d",
            children: [
              createTextLabel("hud-help-line-1", {
                text: "WASD moves. Shift-drag or RMB looks.",
                tone: "muted"
              }),
              createTextLabel("hud-help-line-2", {
                text: "Hold the HUD controls to drive motion.",
                tone: "muted"
              }),
              createTextLabel("hud-help-line-3", {
                text: "The XR button is the only DOM overlay.",
                tone: "muted"
              }),
              createToggle("hud-light-toggle", {
                label: "Main Light",
                value: state.lightOn,
                field: "lightOn"
              }),
              createValueReadout("hud-mode-readout", {
                label: "Mode",
                value: state.xrActive ? "XR" : "Desktop"
              })
            ]
          })
        },
        bottomCenter: {
          maxWidth: 320,
          child: createEmbeddedSurface(MIRROR_COMPONENT_ID, {
            sourceId: REAR_VIEW_SOURCE_ID,
            interactive: false,
            acceptsForwardedInput: false,
            fallbackLabel: "Mirror offline",
            preserveAspectRatio: true,
            mirrorX: true,
            title: "Rear View"
          })
        },
        topRight: {
          maxWidth: 260,
          child: createSection("hud-status", {
            title: "Status",
            backgroundColor: "#0f1b2d",
            children: [
              createValueReadout("hud-light-readout", {
                label: "Lamp",
                value: state.lightOn ? "On" : "Off"
              }),
              createValueReadout("hud-speed-readout", {
                label: "Speed",
                value: formatSpeed(state.moveSpeed)
              }),
              createValueReadout("hud-intent-readout", {
                label: "Intent",
                value: getMovementSummary(state)
              })
            ]
          })
        },
        bottomLeft: {
          maxWidth: 240,
          child: createSection("hud-move", {
            title: "Move",
            backgroundColor: "#0f1b2d",
            children: [
              createDPad("hud-move-dpad", {
                up: createMovementBinding("forward", "Fwd"),
                down: createMovementBinding("back", "Back"),
                left: createMovementBinding("strafeLeft", "Left"),
                right: createMovementBinding("strafeRight", "Right")
              })
            ]
          })
        },
        bottomRight: {
          maxWidth: 220,
          child: createSection("hud-turn", {
            title: "Turn + Speed",
            backgroundColor: "#0f1b2d",
            children: [
              createHoldButton("hud-turn-left", {
                label: "Turn Left",
                actionId: "movement.set",
                startPayload: { intent: "turnLeft", active: true },
                stopPayload: { intent: "turnLeft", active: false }
              }),
              createHoldButton("hud-turn-right", {
                label: "Turn Right",
                actionId: "movement.set",
                startPayload: { intent: "turnRight", active: true },
                stopPayload: { intent: "turnRight", active: false }
              }),
              createRepeatButton("hud-speed-down", {
                label: "Slower",
                actionId: "moveSpeed.adjust",
                payload: { delta: -0.2 }
              }),
              createRepeatButton("hud-speed-up", {
                label: "Faster",
                actionId: "moveSpeed.adjust",
                payload: { delta: 0.2 }
              })
            ]
          })
        }
      });
  }
}

function createTvPanelRoot(
  state: RoomDemoState,
  options: TvPanelOptions | undefined
): DisplayNode<unknown> {
  const tvOptions = resolveTvPanelOptions(options);
  return createAppShell("tv-os", {
    registry: TV_APP_REGISTRY,
    presentation: createTvDevicePresentation(tvOptions),
    appHostMode: "same-runtime",
    homeKey: true,
    ...(tvOptions.onShellChange ? { onShellChange: tvOptions.onShellChange } : {}),
    appStates: {
      [TV_APP_IDS.status]: state,
      [TV_APP_IDS.video]: state
    }
  });
}

function createTvStatusAppRoot(state: RoomDemoState): DisplayNode<unknown> {
  return createColumn("tv-root", {
    padding: 12,
    gap: 8,
    backgroundColor: "#08111d",
    children: [
      createToggle("tv-light-toggle", {
        label: "Lamp",
        value: state.lightOn,
        field: "lightOn"
      }),
      createValueReadout("tv-mode-readout", {
        label: "Mode",
        value: state.xrActive ? "XR" : "Desktop"
      }),
      createValueReadout("tv-speed-readout", {
        label: "Speed",
        value: formatSpeed(state.moveSpeed)
      }),
      createValueReadout("tv-motion-readout", {
        label: "Move",
        value: getMovementSummary(state)
      })
    ]
  });
}

function createTvVideoAppRoot(): DisplayNode<unknown> {
  return createTvVideoSurface("tv-video-surface");
}

interface TvVideoSurfaceProps {}

const TvVideoSurfaceComponent: DisplayComponent<TvVideoSurfaceProps> = {
  kind: "tv-video-surface",
  mount(ctx) {
    ctx.services.surfaces.attach(ctx.id, createTvVideoSurfaceConfig());
  },
  update(ctx) {
    ctx.services.surfaces.configure(ctx.id, createTvVideoSurfaceConfig());
  },
  measure(ctx) {
    return {
      width: ctx.constraints.maxWidth,
      height: ctx.constraints.maxHeight
    };
  },
  render(ctx) {
    const attachment = ctx.services.surfaces.getAttachment(ctx.id);
    if (attachment?.available) {
      return [
        {
          type: "surface" as const,
          componentId: ctx.id,
          role: "embedded-surface-viewport",
          rect: ctx.bounds,
          handle: attachment.handle,
          sourceId: attachment.sourceId,
          surfaceRevision: attachment.surfaceRevision,
          compositionMode: "composite" as const,
          mirrorX: attachment.mirrorX
        }
      ];
    }

    return [
      {
        type: "rect" as const,
        componentId: ctx.id,
        role: "tv-video-unavailable",
        rect: ctx.bounds,
        fill: "#000000",
        strokeWidth: 0,
        radius: 0
      }
    ];
  },
  dispose(ctx) {
    ctx.services.surfaces.release(ctx.id);
  }
};

function createTvVideoSurface(id: string): DisplayNode<TvVideoSurfaceProps> {
  return createNode(id, TvVideoSurfaceComponent, {});
}

function createTvVideoSurfaceConfig() {
  return {
    sourceId: TV_VIDEO_SOURCE_ID,
    interactive: false,
    acceptsForwardedInput: false,
    preserveAspectRatio: false,
    compositionMode: "composite" as const,
    desiredSourceType: "three-texture",
    fallbackLabel: "Video unavailable"
  };
}

function resolveTvPanelOptions(options: TvPanelOptions | undefined): ResolvedTvPanelOptions {
  return {
    screenOn: options?.screenOn ?? true,
    volume: options?.volume ?? 0.75,
    ...(options?.onShellChange ? { onShellChange: options.onShellChange } : {})
  };
}

function createTvDevicePresentation(options: ResolvedTvPanelOptions): AppShellPresentation {
  return {
    kind: "tablet-home",
    getInitialMode(ctx) {
      return ctx.activeSessionId ? "app" : "home";
    },
    render(ctx) {
      const screen = options.screenOn
        ? renderTvScreen(ctx)
        : createTvBlankScreen("tv-screen-off");
      return createTvDeviceFrame(`${ctx.shellId}:tablet-screen`, {
        screen,
        buttons: createTvHardwareButtons(options),
        onHome() {
          ctx.emitShellAction({ type: "home" });
        }
      });
    },
    handleSystemCommand(command, ctx) {
      if (command.command === "home") {
        return { type: "home" };
      }
      if (command.command === "back" && ctx.mode === "app") {
        return { type: "home" };
      }
      return undefined;
    },
    resolveAppSurface(_request, ctx) {
      return resolveTvScreenAppSurface(ctx);
    }
  };
}

function renderTvScreen(ctx: AppShellPresentationContext): DisplayNode<unknown, unknown> {
  if (ctx.mode === "app" && ctx.activeSessionId) {
    const active = ctx.sessions.find((session) => session.id === ctx.activeSessionId);
    if (active) {
      return ctx.renderSessionContent(active);
    }
  }

  return createTvHomeScreen(`${ctx.shellId}:home`, {
    entries: ctx.registry.list().map((manifest) => ({
      appId: manifest.id,
      label: manifest.name
    })),
    onOpenApp(appId) {
      ctx.emitShellAction({ type: "open-app", appId });
    }
  });
}

function resolveTvScreenAppSurface(
  ctx: AppShellPresentationContext
): AppShellPresentationAppSurface {
  const metrics = ctx.services.surface.getMetrics();
  const layout = resolveTvDeviceLayout(metrics.width, metrics.height);
  return {
    rect: createRect(
      0,
      (metrics.height - layout.screenHeight) / 2,
      layout.screenWidth,
      layout.screenHeight
    ),
    safeArea: { top: 0, right: 0, bottom: 0, left: 0 }
  };
}

function createTvHardwareButtons(
  options: ResolvedTvPanelOptions
): readonly DisplayNode<unknown>[] {
  const screenControlsDisabled = !options.screenOn;
  return [
    createButton(TV_PANEL_BUTTON_IDS.home, {
      label: "HOME",
      actionId: TV_PANEL_ACTION_IDS.home,
      disabled: screenControlsDisabled
    }),
    createButton(TV_PANEL_BUTTON_IDS.volumeUp, {
      label: "VOL+",
      actionId: TV_PANEL_ACTION_IDS.volumeUp,
      disabled: screenControlsDisabled || options.volume >= 1
    }),
    createButton(TV_PANEL_BUTTON_IDS.volumeDown, {
      label: "VOL-",
      actionId: TV_PANEL_ACTION_IDS.volumeDown,
      disabled: screenControlsDisabled || options.volume <= 0
    }),
    createButton(TV_PANEL_BUTTON_IDS.power, {
      label: "PWR",
      actionId: TV_PANEL_ACTION_IDS.powerToggle
    })
  ];
}

interface TvDeviceFrameProps {
  screen: DisplayNode<unknown, unknown>;
  buttons: readonly DisplayNode<unknown, unknown>[];
  onHome(): void;
}

interface TvHomeScreenEntry {
  appId: string;
  label: string;
}

interface TvHomeScreenProps {
  entries: readonly TvHomeScreenEntry[];
  onOpenApp(appId: string): void;
}

interface TvBlankScreenProps {}

const TV_SCREEN_ASPECT_RATIO = 16 / 9;
const TV_DEVICE_SCREEN_GAP = 12;
const TV_DEVICE_BUTTON_WIDTH = 52;
const TV_DEVICE_BUTTON_HEIGHT = 48;
const TV_DEVICE_BUTTON_GAP = 8;
const TV_HOME_PADDING = 36;
const TV_HOME_GAP = 16;
const TV_HOME_TILE_HEIGHT = 64;

const TvHomeScreenComponent: DisplayComponent<TvHomeScreenProps> = {
  kind: "tv-home-screen",
  getChildren(ctx) {
    return ctx.props.entries.map((entry) =>
      createButton(`${ctx.id}:open:${sanitizeId(entry.appId)}`, {
        label: entry.label,
        actionId: createTvHomeOpenActionId(ctx.id, entry.appId)
      })
    );
  },
  measure(ctx) {
    for (const child of ctx.getChildren()) {
      ctx.measureChild(child.id, {
        minWidth: 0,
        minHeight: 0,
        maxWidth: Math.max(0, ctx.constraints.maxWidth - TV_HOME_PADDING * 2),
        maxHeight: TV_HOME_TILE_HEIGHT
      });
    }
    return {
      width: ctx.constraints.maxWidth,
      height: ctx.constraints.maxHeight
    };
  },
  layout(ctx) {
    const children = ctx.getChildren();
    const columns = Math.max(1, Math.min(2, children.length));
    const innerWidth = Math.max(0, ctx.bounds.width - TV_HOME_PADDING * 2);
    const tileWidth = columns > 1
      ? (innerWidth - TV_HOME_GAP * (columns - 1)) / columns
      : innerWidth;
    const totalRows = Math.ceil(children.length / columns);
    const gridHeight =
      totalRows * TV_HOME_TILE_HEIGHT + Math.max(0, totalRows - 1) * TV_HOME_GAP;
    const startY = ctx.bounds.y + (ctx.bounds.height - gridHeight) / 2;

    children.forEach((child, index) => {
      const row = Math.floor(index / columns);
      const column = index % columns;
      ctx.setChildBounds(
        child.id,
        createRect(
          ctx.bounds.x + TV_HOME_PADDING + column * (tileWidth + TV_HOME_GAP),
          startY + row * (TV_HOME_TILE_HEIGHT + TV_HOME_GAP),
          tileWidth,
          TV_HOME_TILE_HEIGHT
        )
      );
    });
    ctx.setContentBounds(ctx.bounds);
  },
  render(ctx) {
    return [
      {
        type: "rect" as const,
        componentId: ctx.id,
        role: "tv-home-screen",
        rect: ctx.bounds,
        fill: "#020617",
        strokeWidth: 0,
        radius: 0
      }
    ];
  },
  handleEvent(ctx) {
    if (ctx.event.type !== "action") {
      return;
    }

    const appId = parseTvHomeOpenActionId(ctx.id, ctx.event.actionId);
    if (appId) {
      ctx.props.onOpenApp(appId);
    }
  }
};

const TvDeviceFrameComponent: DisplayComponent<TvDeviceFrameProps> = {
  kind: "tv-device-frame",
  getChildren(ctx) {
    return [ctx.props.screen, ...ctx.props.buttons];
  },
  measure(ctx) {
    const layout = resolveTvDeviceLayout(ctx.constraints.maxWidth, ctx.constraints.maxHeight);
    ctx.measureChild(ctx.props.screen.id, {
      minWidth: 0,
      minHeight: 0,
      maxWidth: layout.screenWidth,
      maxHeight: layout.screenHeight
    });
    for (const button of ctx.props.buttons) {
      ctx.measureChild(button.id, {
        minWidth: 0,
        minHeight: 0,
        maxWidth: layout.buttonWidth,
        maxHeight: layout.buttonHeight
      });
    }
    return {
      width: ctx.constraints.maxWidth,
      height: ctx.constraints.maxHeight
    };
  },
  layout(ctx) {
    const layout = resolveTvDeviceLayout(ctx.bounds.width, ctx.bounds.height);
    const screenRect = createRect(
      ctx.bounds.x,
      ctx.bounds.y + (ctx.bounds.height - layout.screenHeight) / 2,
      layout.screenWidth,
      layout.screenHeight
    );
    ctx.setChildBounds(ctx.props.screen.id, screenRect);

    const buttonCount = ctx.props.buttons.length;
    const buttonGroupHeight =
      buttonCount * layout.buttonHeight + Math.max(0, buttonCount - 1) * TV_DEVICE_BUTTON_GAP;
    const buttonX = ctx.bounds.x + ctx.bounds.width - layout.buttonWidth;
    let nextButtonY = screenRect.y + screenRect.height - buttonGroupHeight;
    for (const button of ctx.props.buttons) {
      ctx.setChildBounds(
        button.id,
        createRect(buttonX, nextButtonY, layout.buttonWidth, layout.buttonHeight)
      );
      nextButtonY += layout.buttonHeight + TV_DEVICE_BUTTON_GAP;
    }

    ctx.setContentBounds(ctx.bounds);
  },
  render(ctx) {
    return [
      {
        type: "rect" as const,
        componentId: ctx.id,
        role: "tv-device-body",
        rect: ctx.bounds,
        fill: "#05070b",
        stroke: "#151a22",
        strokeWidth: 1,
        radius: 8
      }
    ];
  },
  handleEvent(ctx) {
    if (
      ctx.event.type === "action" &&
      ctx.event.componentId === TV_PANEL_BUTTON_IDS.home
    ) {
      ctx.props.onHome();
    }
  }
};

const TvBlankScreenComponent: DisplayComponent<TvBlankScreenProps> = {
  kind: "tv-blank-screen",
  measure(ctx) {
    return {
      width: ctx.constraints.maxWidth,
      height: ctx.constraints.maxHeight
    };
  },
  render(ctx) {
    return [
      {
        type: "rect" as const,
        componentId: ctx.id,
        role: "tv-screen-blank",
        rect: ctx.bounds,
        fill: "#000000",
        strokeWidth: 0,
        radius: 0
      }
    ];
  }
};

function createTvDeviceFrame(
  id: string,
  props: TvDeviceFrameProps
): DisplayNode<TvDeviceFrameProps> {
  return createNode(id, TvDeviceFrameComponent, props);
}

function createTvHomeScreen(
  id: string,
  props: TvHomeScreenProps
): DisplayNode<TvHomeScreenProps> {
  return createNode(id, TvHomeScreenComponent, props);
}

function createTvBlankScreen(id: string): DisplayNode<TvBlankScreenProps> {
  return createNode(id, TvBlankScreenComponent, {});
}

function createTvHomeOpenActionId(homeId: string, appId: string): string {
  return `${homeId}.open:${appId}`;
}

function parseTvHomeOpenActionId(homeId: string, actionId: string): string | undefined {
  const prefix = `${homeId}.open:`;
  return actionId.startsWith(prefix) ? actionId.slice(prefix.length) : undefined;
}

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
}

function resolveTvDeviceLayout(
  width: number,
  height: number
): {
  screenWidth: number;
  screenHeight: number;
  buttonWidth: number;
  buttonHeight: number;
} {
  const buttonWidth = Math.min(TV_DEVICE_BUTTON_WIDTH, Math.max(0, width));
  const availableScreenWidth = Math.max(0, width - TV_DEVICE_SCREEN_GAP - buttonWidth);
  let screenWidth = availableScreenWidth;
  let screenHeight = screenWidth / TV_SCREEN_ASPECT_RATIO;
  if (screenHeight > height) {
    screenHeight = Math.max(0, height);
    screenWidth = screenHeight * TV_SCREEN_ASPECT_RATIO;
  }

  const buttonHeight = Math.max(
    0,
    Math.min(
      TV_DEVICE_BUTTON_HEIGHT,
      (screenHeight - TV_DEVICE_BUTTON_GAP * 3) / 4
    )
  );

  return {
    screenWidth,
    screenHeight,
    buttonWidth,
    buttonHeight
  };
}

export function createXrHudRoot(): DisplayNode<unknown> {
  return createEmbeddedSurface(XR_HUD_MIRROR_COMPONENT_ID, {
    sourceId: REAR_VIEW_SOURCE_ID,
    interactive: false,
    acceptsForwardedInput: false,
    fallbackLabel: "Mirror offline",
    preserveAspectRatio: true,
    mirrorX: true
  });
}

export function createDefaultRoomPanelDiagnostics(): RoomPanelDiagnostics {
  return {
    pointerMode: "XR ray/contact",
    timing: "Waiting",
    activePanel: "Arm tablet"
  };
}

function createArmTabletRoot(
  state: RoomDemoState,
  diagnostics: RoomPanelDiagnostics
): DisplayNode<unknown> {
  const appState: ArmPanelAppState = {
    room: state,
    diagnostics
  };

  return createAppShell("arm-os", {
    registry: ARM_APP_REGISTRY,
    presentation: createTabletHomePresentation({
      homeControl: "button",
      taskSwitcher: "cards",
      taskCloseControl: "button",
      launcherLayout: {
        tileHeight: 64,
        gap: 4,
        bodyPadding: 4,
        iconMinSize: 34,
        iconMaxSize: 38,
        iconTop: 2,
        labelGap: 3
      }
    }),
    appHostMode: "child-runtime",
    taskSwitcher: true,
    homeKey: true,
    appStates: {
      [ARM_APP_IDS.settings]: state,
      [ARM_APP_IDS.rearView]: appState,
      [ARM_APP_IDS.fractalArt]: appState,
      [ARM_APP_IDS.diagnostics]: appState
    }
  });
}

function createRearViewAppRoot(): DisplayNode<unknown> {
  return createSurfaceShell("rear-view-root", {
    padding: 4,
    gap: 4,
    bodyPadding: 0,
    pointerOpaque: true,
    backgroundColor: "#101826",
    children: [
      createEmbeddedSurface("rear-view-surface", {
        sourceId: REAR_VIEW_SOURCE_ID,
        interactive: false,
        acceptsForwardedInput: false,
        fallbackLabel: "Mirror offline",
        preserveAspectRatio: true,
        mirrorX: true
      })
    ]
  });
}

function createFractalArtAppRoot(): DisplayNode<unknown> {
  return createSurfaceShell("fractal-art-root", {
    padding: 4,
    gap: 4,
    bodyPadding: 0,
    pointerOpaque: true,
    backgroundColor: "#101826",
    children: [
      createEmbeddedSurface("fractal-art-surface", {
        sourceId: WALL_PICTURE_SOURCE_ID,
        interactive: false,
        acceptsForwardedInput: false,
        fallbackLabel: "Fractal art offline",
        preserveAspectRatio: true,
        compositionMode: "composite",
        desiredSourceType: "three-texture"
      })
    ]
  });
}

function createDiagnosticsAppRoot(state: ArmPanelAppState): DisplayNode<unknown> {
  return createSurfaceShell("diagnostics-root", {
    padding: 6,
    gap: 6,
    bodyGap: 6,
    bodyPadding: 0,
    pointerOpaque: true,
    backgroundColor: "#101826",
    children: [
      createValueReadout("diagnostics-pointer-readout", {
        label: "Pointer",
        value: state.diagnostics.pointerMode
      }),
      createValueReadout("diagnostics-timing-readout", {
        label: "Timing",
        value: state.diagnostics.timing
      }),
      createValueReadout("diagnostics-panel-readout", {
        label: "Panel",
        value: state.diagnostics.activePanel
      }),
      createValueReadout("diagnostics-mode-readout", {
        label: "Mode",
        value: state.room.xrActive ? "XR" : "Desktop"
      })
    ]
  });
}

export function getRoomPanelSurface(
  variant: RoomPanelVariant
): Partial<SurfaceMetrics> {
  switch (variant) {
    case "tv":
      return { width: 624, height: 315 };
    case "arm":
      return {
        width: 300,
        height: 220,
        pixelDensity: 1,
        safeArea: { top: 8, right: 8, bottom: 10, left: 8 }
      };
    case "hud":
    default:
      return {
        width: 1280,
        height: 720,
        pixelDensity: 1,
        safeArea: { top: 18, right: 18, bottom: 18, left: 18 }
      };
  }
}

export function getXrHudSurface(): Partial<SurfaceMetrics> {
  return {
    width: 320,
    height: 180,
    pixelDensity: 1
  };
}

export function getRoomPanelTheme(
  variant: RoomPanelVariant
): Partial<ThemeTokens> {
  switch (variant) {
    case "tv":
      return {
        backgroundColor: "#06101c",
        surfaceColor: "#102138",
        borderColor: "#28456c",
        accentColor: "#f59e0b",
        focusColor: "#34d399",
        controlHeight: 48,
        spacing: 10,
        padding: 14,
        radius: 10,
        typography: {
          fontSize: 16,
          lineHeight: 20,
          fontWeight: 600,
          fontFamily: "Avenir Next, ui-sans-serif"
        }
      };
    case "arm":
      return {
        backgroundColor: "#0a1220",
        surfaceColor: "#162133",
        borderColor: "#35506e",
        accentColor: "#60a5fa",
        focusColor: "#22c55e",
        controlHeight: 38,
        spacing: 6,
        padding: 8,
        radius: 8,
        typography: {
          fontSize: 13,
          lineHeight: 16,
          fontWeight: 600,
          fontFamily: "Avenir Next, ui-sans-serif"
        }
      };
    case "hud":
    default:
      return {
        backgroundColor: "#08111d",
        surfaceColor: "#132238",
        borderColor: "#27405e",
        accentColor: "#38bdf8",
        focusColor: "#22c55e",
        controlHeight: 42,
        spacing: 8,
        padding: 12,
        radius: 10,
        typography: {
          fontSize: 14,
          lineHeight: 18,
          fontWeight: 600,
          fontFamily: "Avenir Next, ui-sans-serif"
        }
      };
  }
}

export function getXrHudTheme(): Partial<ThemeTokens> {
  return {
    backgroundColor: "#08111d",
    surfaceColor: "#132238",
    borderColor: "#27405e",
    accentColor: "#38bdf8",
    focusColor: "#22c55e",
    controlHeight: 42,
    spacing: 8,
    padding: 10,
    radius: 10,
    typography: {
      fontSize: 14,
      lineHeight: 18,
      fontWeight: 600,
      fontFamily: "Avenir Next, ui-sans-serif"
    }
  };
}

export function createWallMirrorRoot(): DisplayNode<unknown> {
  return createEmbeddedSurface(WALL_MIRROR_COMPONENT_ID, {
    sourceId: REAR_VIEW_SOURCE_ID,
    interactive: false,
    acceptsForwardedInput: false,
    fallbackLabel: "Wall mirror offline",
    preserveAspectRatio: true,
    mirrorX: true
  });
}

export function createWallPictureRoot(): DisplayNode<unknown> {
  return createEmbeddedSurface(WALL_PICTURE_COMPONENT_ID, {
    sourceId: WALL_PICTURE_SOURCE_ID,
    interactive: false,
    acceptsForwardedInput: false,
    fallbackLabel: "Picture offline",
    preserveAspectRatio: true,
    compositionMode: "composite"
  });
}

export function getWallMirrorSurface(): Partial<SurfaceMetrics> {
  return { width: 640, height: 360 };
}

export function getWallMirrorTheme(): Partial<ThemeTokens> {
  return {
    backgroundColor: "#08111d",
    surfaceColor: "#0f1b2d",
    borderColor: "#3b4a63",
    accentColor: "#60a5fa",
    controlHeight: 40,
    radius: 10
  };
}

export function getWallPictureSurface(): Partial<SurfaceMetrics> {
  return { width: 640, height: 400 };
}

export function getWallPictureTheme(): Partial<ThemeTokens> {
  return {
    backgroundColor: "#0b0806",
    surfaceColor: "#17110d",
    borderColor: "#7b5f44",
    accentColor: "#d97706",
    controlHeight: 40,
    padding: 12,
    radius: 14
  };
}

function createMovementBinding(
  intent: MovementIntent,
  label: string
) {
  return {
    label,
    actionId: "movement.set",
    startPayload: { intent, active: true },
    stopPayload: { intent, active: false }
  };
}

function emitRoomAppOutput(ctx: TouchAppContext, output: RuntimeOutput): void {
  switch (output.type) {
    case "action":
      ctx.actions.emit({
        type: "app-action",
        name: output.actionId,
        ...(output.payload ? { payload: output.payload } : {})
      });
      return;
    case "change-request":
      if (output.field === "lightOn" && typeof output.value === "boolean") {
        ctx.actions.emit({
          type: "app-action",
          name: "light.set",
          payload: { value: output.value }
        });
      }
      return;
    default:
      return;
  }
}

function formatSpeed(moveSpeed: number): string {
  return `${moveSpeed.toFixed(1)} m/s`;
}

function getMovementSummary(state: RoomDemoState): string {
  const active: string[] = [];
  if (state.movement.forward) {
    active.push("Fwd");
  }
  if (state.movement.back) {
    active.push("Back");
  }
  if (state.movement.strafeLeft) {
    active.push("Left");
  }
  if (state.movement.strafeRight) {
    active.push("Right");
  }
  if (state.movement.turnLeft) {
    active.push("Turn L");
  }
  if (state.movement.turnRight) {
    active.push("Turn R");
  }
  return active.length > 0 ? active.join(", ") : "Idle";
}
