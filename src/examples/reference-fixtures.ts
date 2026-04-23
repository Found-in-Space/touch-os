import { createButton, createSlider, createTextLabel, createToggle, createValueReadout } from "../components/index.js";
import { createColumn, createPageContainer, createRow, createScrollContainer, createSection } from "../containers/index.js";
import type { DisplayNode } from "../core/component.js";

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
  return createPageContainer("settings-pages", {
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
              createButton("settings-back", {
                label: "Back",
                actionId: "nav.back"
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
          createTextLabel("audio-page-title", {
            text: "Audio"
          }),
          createValueReadout("audio-alerts-readout", {
            label: "Alerts",
            value: values.alertsEnabled ? "Enabled" : "Disabled"
          })
        ]
      })
    ]
  });
}
