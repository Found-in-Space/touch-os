import {
  createDPad,
  createEmbeddedSurface,
  createHoldButton,
  createRepeatButton,
  createTextLabel,
  createToggle,
  createValueReadout,
  type DisplayNode,
  type SurfaceMetrics,
  type ThemeTokens
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
import type { MovementIntent, RoomDemoState } from "./store.js";

export type RoomPanelVariant = "tv" | "hud" | "arm";

export function createRoomPanelRoot(
  variant: RoomPanelVariant,
  state: RoomDemoState
): DisplayNode<unknown> {
  switch (variant) {
    case "tv":
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
    case "arm":
      return createSurfaceShell("arm-root", {
        padding: 10,
        gap: 10,
        bodyGap: 10,
        bodyPadding: 0,
        pointerOpaque: true,
        backgroundColor: "#101826",
        header: createTextLabel("arm-title", {
          text: "Wrist Panel"
        }),
        children: [
          createToggle("arm-light-toggle", {
            label: "Lamp",
            value: state.lightOn,
            field: "lightOn"
          }),
          createValueReadout("arm-light-readout", {
            label: "State",
            value: state.lightOn ? "On" : "Off"
          }),
          createValueReadout("arm-speed-readout", {
            label: "Speed",
            value: formatSpeed(state.moveSpeed)
          }),
          createValueReadout("arm-motion-readout", {
            label: "Move",
            value: getMovementSummary(state)
          })
        ]
      });
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

export function getRoomPanelSurface(
  variant: RoomPanelVariant
): Partial<SurfaceMetrics> {
  switch (variant) {
    case "tv":
      return { width: 440, height: 280 };
    case "arm":
      return { width: 300, height: 220 };
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
        accentColor: "#fb7185",
        focusColor: "#22c55e",
        controlHeight: 52,
        spacing: 10,
        padding: 12,
        radius: 12,
        typography: {
          fontSize: 15,
          lineHeight: 18,
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
