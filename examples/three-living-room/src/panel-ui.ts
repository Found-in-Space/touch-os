import {
  createEmbeddedSurface,
  createTextLabel,
  createToggle,
  createValueReadout,
  type DisplayNode,
  type SurfaceMetrics,
  type ThemeTokens
} from "../../../src/index.js";
import { createColumn, createSection } from "../../../src/index.js";
import { MIRROR_COMPONENT_ID } from "./mirror.js";
import type { RoomDemoState } from "./store.js";

export type RoomPanelVariant = "tv" | "hud" | "arm";

export function createRoomPanelRoot(
  variant: RoomPanelVariant,
  state: RoomDemoState
): DisplayNode<unknown> {
  switch (variant) {
    case "tv":
      return createColumn("tv-root", {
        padding: 12,
        gap: 10,
        backgroundColor: "#08111d",
        children: [
          createTextLabel("tv-title", {
            text: "Living Room TV"
          }),
          createTextLabel("tv-subtitle", {
            text: "Touch the wall panel to control the lamp in the room.",
            tone: "muted"
          }),
          createSection("tv-light-section", {
            title: "Room State",
            backgroundColor: "#0f1b2d",
            children: [
              createValueReadout("tv-light-readout", {
                label: "Lamp",
                value: state.lightOn ? "On" : "Off"
              }),
              createToggle("tv-light-toggle", {
                label: "Main Light",
                value: state.lightOn,
                field: "lightOn"
              })
            ]
          })
        ]
      });
    case "arm":
      return createColumn("arm-root", {
        padding: 10,
        gap: 10,
        backgroundColor: "#101826",
        children: [
          createTextLabel("arm-title", {
            text: "Arm Controls"
          }),
          createTextLabel("arm-subtitle", {
            text: "XR wrist panel for quick room lighting control.",
            tone: "muted"
          }),
          createToggle("arm-light-toggle", {
            label: "Lamp",
            value: state.lightOn,
            field: "lightOn"
          }),
          createValueReadout("arm-light-readout", {
            label: "State",
            value: state.lightOn ? "On" : "Off"
          })
        ]
      });
    case "hud":
    default:
      return createColumn("hud-root", {
        padding: 10,
        gap: 8,
        backgroundColor: "#0d1726",
        children: [
          createTextLabel("hud-title", {
            text: "HUD Controls"
          }),
          createToggle("hud-light-toggle", {
            label: "Lamp",
            value: state.lightOn,
            field: "lightOn"
          }),
          createValueReadout("hud-light-readout", {
            label: "State",
            value: state.lightOn ? "On" : "Off"
          })
        ]
      });
  }
}

export function createMirrorRoot(): DisplayNode<unknown> {
  return createEmbeddedSurface(MIRROR_COMPONENT_ID, {
    sourceId: "camera.rear",
    title: "Rear View",
    interactive: false,
    acceptsForwardedInput: false,
    fallbackLabel: "Mirror offline"
  });
}

export function getRoomPanelSurface(
  variant: RoomPanelVariant | "mirror"
): Partial<SurfaceMetrics> {
  switch (variant) {
    case "tv":
      return { width: 480, height: 300 };
    case "arm":
      return { width: 320, height: 220 };
    case "mirror":
      return { width: 320, height: 200 };
    case "hud":
    default:
      return { width: 260, height: 160 };
  }
}

export function getRoomPanelTheme(
  variant: RoomPanelVariant | "mirror"
): Partial<ThemeTokens> {
  switch (variant) {
    case "tv":
      return {
        backgroundColor: "#06101c",
        surfaceColor: "#102138",
        borderColor: "#28456c",
        accentColor: "#f59e0b",
        focusColor: "#34d399",
        controlHeight: 50,
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
        controlHeight: 56,
        spacing: 10,
        padding: 14,
        radius: 12,
        typography: {
          fontSize: 16,
          lineHeight: 20,
          fontWeight: 600,
          fontFamily: "Avenir Next, ui-sans-serif"
        }
      };
    case "mirror":
      return {
        backgroundColor: "#08111d",
        surfaceColor: "#0f1b2d",
        borderColor: "#3b4a63",
        accentColor: "#60a5fa",
        controlHeight: 40,
        radius: 10
      };
    case "hud":
    default:
      return {
        backgroundColor: "#08111d",
        surfaceColor: "#132238",
        borderColor: "#27405e",
        accentColor: "#38bdf8",
        focusColor: "#22c55e",
        controlHeight: 40,
        spacing: 8,
        padding: 12,
        radius: 10,
        typography: {
          fontSize: 15,
          lineHeight: 18,
          fontWeight: 600,
          fontFamily: "Avenir Next, ui-sans-serif"
        }
      };
  }
}
