import {
  createActionCard,
  createBitmapPlot,
  createButton,
  createCustomGraph,
  createEmbeddedSurface,
  createSlider,
  createTextLabel,
  createToggle,
  createValueReadout
} from "../components/index.js";
import {
  createColumn,
  createPageContainer,
  createRow,
  createScrollContainer,
  createSection
} from "../containers/index.js";
import { type DisplayComponent, type DisplayNode, createNode } from "../core/component.js";

export interface SettingsFixtureValues {
  showLabels: boolean;
  brightness: number;
  alertsEnabled: boolean;
  activePageId?: string;
}

export function createButtonFixture(): DisplayNode {
  return createButton("fixture-button", {
    label: "Confirm",
    actionId: "fixture.confirm"
  });
}

export function createSliderFixture(value = 50): DisplayNode {
  return createSlider("fixture-slider", {
    label: "Brightness",
    value,
    min: 0,
    max: 100,
    step: 5
  });
}

export function createSettingsPageFixture(values: SettingsFixtureValues): DisplayNode {
  return createNode("settings-shell", SettingsShellComponent, {
    values
  });
}

export function createActionCardFixture(): DisplayNode {
  return createActionCard("fixture-action-card", {
    title: "Selected Item",
    lines: ["Status: Ready", "Last update: 14:30"],
    dismissible: true,
    dismissActionId: "details.dismiss",
    primaryActionLabel: "Open Details",
    primaryActionId: "details.open"
  });
}

export function createCustomGraphFixture(): DisplayNode {
  return createCustomGraph("fixture-custom-graph", {
    points: [12, 18, 16, 24, 28, 21, 30],
    actionId: "graph.select-point"
  });
}

export function createBitmapPlotFixture(): DisplayNode {
  return createBitmapPlot("fixture-bitmap-plot", {
    points: [12, 18, 16, 24, 28, 21, 30],
    actionId: "bitmap-plot.select-point"
  });
}

export function createEmbeddedSurfaceFixture(): DisplayNode {
  return createEmbeddedSurface("fixture-embedded-surface", {
    sourceId: "camera.rear",
    title: "Rear Camera",
    interactive: true,
    acceptsForwardedInput: true,
    dismissible: true,
    dismissActionId: "surface.close"
  });
}

interface SettingsShellProps {
  values: SettingsFixtureValues;
}

const SettingsShellComponent: DisplayComponent<SettingsShellProps> = {
  kind: "settings-shell",
  getChildren(ctx) {
    const values = ctx.props.values;
    return [
      createPageContainer("settings-pages", {
        initialPageId: values.activePageId ?? "settings-page",
        padding: 0,
        children: [
          createColumn("settings-page", {
            children: [
              createRow("settings-header", {
                gap: 8,
                children: [
                  createTextLabel("settings-title", {
                    text: "Settings"
                  }),
                  createButton("settings-open-audio", {
                    label: "Audio",
                    actionId: "nav.open-audio"
                  })
                ]
              }),
              createScrollContainer("settings-scroll", {
                gap: 12,
                children: [
                  createSection("settings-display-section", {
                    title: "Display",
                    children: [
                      createToggle("show-labels-toggle", {
                        label: "Show Labels",
                        value: values.showLabels,
                        field: "showLabels"
                      }),
                      createSlider("brightness-slider", {
                        label: "Brightness",
                        value: values.brightness,
                        min: 0,
                        max: 100,
                        step: 5,
                        field: "brightness"
                      })
                    ]
                  }),
                  createSection("settings-audio-section", {
                    title: "Audio",
                    children: [
                      createToggle("alerts-toggle", {
                        label: "Alerts",
                        value: values.alertsEnabled,
                        field: "alertsEnabled"
                      })
                    ]
                  })
                ]
              })
            ]
          }),
          createColumn("audio-page", {
            gap: 12,
            children: [
              createRow("audio-page-header", {
                gap: 8,
                children: [
                  createTextLabel("audio-page-title", {
                    text: "Audio"
                  }),
                  createButton("audio-page-back", {
                    label: "Back",
                    actionId: "nav.back"
                  })
                ]
              }),
              createValueReadout("audio-alerts-readout", {
                label: "Alerts",
                value: values.alertsEnabled ? "Enabled" : "Disabled"
              })
            ]
          })
        ]
      })
    ];
  },
  measure(ctx) {
    return ctx.measureChild("settings-pages");
  },
  layout(ctx) {
    ctx.setChildBounds("settings-pages", ctx.bounds);
    ctx.setContentBounds(ctx.bounds);
  },
  render() {
    return [];
  },
  hitTest() {
    return null;
  },
  handleEvent(ctx) {
    if (ctx.event.type === "action" && ctx.event.actionId === "nav.open-audio") {
      ctx.emit({
        type: "navigation-request",
        componentId: ctx.id,
        containerId: "settings-pages",
        intent: "push",
        pageId: "audio-page"
      });
    }

    if (ctx.event.type === "action" && ctx.event.actionId === "nav.back") {
      ctx.emit({
        type: "navigation-request",
        componentId: ctx.id,
        containerId: "settings-pages",
        intent: "back"
      });
    }
  }
};
