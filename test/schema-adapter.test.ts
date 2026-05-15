import { describe, expect, it } from "vitest";
import { createRuntime, createTextLabel } from "../src/index.js";
import {
  createSchemaAdapter,
  type SchemaCustomItem,
  type SchemaDocument,
  type SchemaKindRegistration
} from "../src/adapters/schema.js";
import {
  findCommandByRole,
  findRectCommandsByRole,
  getTexts,
  pressAt
} from "./helpers/runtime-helpers.js";

interface CustomStatusItem extends SchemaCustomItem {
  kind: "custom-status";
  text: string;
}

const customStatusRegistration: SchemaKindRegistration<CustomStatusItem> = {
  kind: "custom-status",
  validate(item) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new Error("Custom status item must be an object.");
    }

    const record = item as Record<string, unknown>;
    if (typeof record.id !== "string" || record.id.length === 0) {
      throw new Error("Custom status item id must be a non-empty string.");
    }
    if (typeof record.text !== "string" || record.text.length === 0) {
      throw new Error("Custom status item text must be a non-empty string.");
    }

    return {
      kind: "custom-status",
      id: record.id,
      text: record.text
    };
  },
  createNode(item, context) {
    return createTextLabel(item.id, {
      text: context.readText({ itemId: item.id, slot: "text" }, item.text)
    });
  }
};

describe("schema adapter", () => {
  it("renders schema-driven built-ins and preserves controller updates", () => {
    const adapter = createSchemaAdapter("schema-shell", {
      version: 1,
      initialPageId: "main",
      pages: [
        {
          id: "main",
          title: "Main",
          items: [
            {
              kind: "text",
              id: "status-text",
              text: "Offline"
            },
            {
              kind: "slider",
              id: "brightness-slider",
              label: "Brightness",
              field: "brightness",
              value: 35,
              min: 0,
              max: 100,
              step: 5,
              valueText: "Warm",
              valueTextField: "brightnessLabel",
              valueLabels: [{ value: 35, text: "Mapped Warm" }]
            }
          ]
        }
      ]
    });

    const runtime = createRuntime({
      root: adapter.root,
      surface: { width: 320, height: 180 }
    });

    let texts = getTexts(runtime.render().commands);
    expect(texts).toContain("Main");
    expect(texts).toContain("Offline");
    expect(texts).toContain("Brightness");
    expect(texts).toContain("Warm");

    adapter.controller.setText({ itemId: "status-text", slot: "text" }, "Online");
    adapter.controller.setField("brightness", 60);
    adapter.controller.setField("brightnessLabel", "Bright");

    texts = getTexts(runtime.render().commands);
    expect(texts).toContain("Online");
    expect(texts).toContain("Brightness");
    expect(texts).toContain("Bright");

    adapter.controller.setSchema({
      version: 1,
      initialPageId: "secondary",
      pages: [
        {
          id: "secondary",
          title: "Secondary",
          items: [
            {
              kind: "button",
              id: "sync-button",
              label: "Sync",
              actionId: "sync.run"
            }
          ]
        }
      ]
    });

    texts = getTexts(runtime.render().commands);
    expect(texts).toContain("Secondary");
    expect(texts).toContain("Sync");
  });

  it("supports schema choice groups in single-select and multi-select modes", () => {
    const adapter = createSchemaAdapter("schema-shell", {
      version: 1,
      pages: [
        {
          id: "main",
          items: [
            {
              kind: "choice-group",
              id: "mode-group",
              label: "Mode",
              field: "mode",
              selectionMode: "single",
              value: "standard",
              orientation: "horizontal",
              options: [
                { value: "standard", label: "Standard" },
                { value: "cinema", label: "Cinema" }
              ]
            },
            {
              kind: "choice-group",
              id: "channel-group",
              label: "Channels",
              field: "channels",
              selectionMode: "multiple",
              values: ["alpha"],
              orientation: "horizontal",
              columns: 2,
              options: [
                { value: "alpha", label: "Alpha" },
                { value: "beta", label: "Beta" },
                { value: "gamma", label: "Gamma" },
                { value: "delta", label: "Delta" }
              ]
            }
          ]
        }
      ]
    });

    const runtime = createRuntime({
      root: adapter.root,
      surface: { width: 320, height: 260 }
    });

    let snapshot = runtime.render();
    let texts = getTexts(snapshot.commands);
    expect(texts).toContain("Mode");
    expect(texts).toContain("Channels");

    const modeOptionRows = findRectCommandsByRole(
      snapshot.commands,
      "choice-option-row",
      "mode-group"
    );
    const modeResult = pressAt(
      runtime,
      modeOptionRows[1]!.rect.x + modeOptionRows[1]!.rect.width / 2,
      modeOptionRows[1]!.rect.y + modeOptionRows[1]!.rect.height / 2
    );
    expect(modeResult.outputs).toContainEqual({
      type: "change-request",
      componentId: "mode-group",
      field: "mode",
      value: "cinema"
    });

    adapter.controller.setField("mode", "cinema");
    snapshot = runtime.render();

    const channelOptionRows = findRectCommandsByRole(
      snapshot.commands,
      "choice-option-row",
      "channel-group"
    );
    const channelResult = pressAt(
      runtime,
      channelOptionRows[1]!.rect.x + channelOptionRows[1]!.rect.width / 2,
      channelOptionRows[1]!.rect.y + channelOptionRows[1]!.rect.height / 2,
      10
    );
    expect(channelResult.outputs).toContainEqual({
      type: "change-request",
      componentId: "channel-group",
      field: "channels",
      value: ["alpha", "beta"]
    });
  });

  it("updates schema text through explicit item slots", () => {
    const adapter = createSchemaAdapter("schema-shell", {
      version: 1,
      pages: [
        {
          id: "main",
          items: [
            {
              kind: "readout",
              id: "status-readout",
              label: "Status",
              value: "Offline"
            },
            {
              kind: "choice-group",
              id: "mode-group",
              field: "mode",
              selectionMode: "single",
              value: "standard",
              options: [
                { value: "standard", label: "Standard" },
                { value: "cinema", label: "Cinema" }
              ]
            }
          ]
        }
      ]
    });

    const runtime = createRuntime({
      root: adapter.root,
      surface: { width: 320, height: 220 }
    });

    adapter.controller.setText({ itemId: "status-readout", slot: "label" }, "State");
    adapter.controller.setText({ itemId: "status-readout", slot: "value" }, "Online");
    adapter.controller.setText({ itemId: "mode-group", slot: "option:cinema:label" }, "Theater");

    const texts = getTexts(runtime.render().commands);
    expect(texts).toContain("State");
    expect(texts).toContain("Online");
    expect(texts).toContain("Theater");
    expect(texts).not.toContain("Status");
    expect(texts).not.toContain("Offline");
    expect(texts).not.toContain("Cinema");
  });

  it("renders action-card items, emits shell actions, and supports replaceItem updates", () => {
    const adapter = createSchemaAdapter("schema-shell", {
      version: 1,
      initialPageId: "main",
      pages: [
        {
          id: "main",
          items: [
            {
              kind: "action-card",
              id: "status-card",
              title: "Status Summary",
              lines: ["System ready", "No pending tasks"],
              primaryActionId: "status.review",
              primaryActionLabel: "Review",
              dismissible: true,
              dismissActionId: "status.dismiss"
            }
          ]
        }
      ]
    });

    const runtime = createRuntime({
      root: adapter.root,
      surface: { width: 320, height: 180 }
    });

    let snapshot = runtime.render();
    let texts = getTexts(snapshot.commands);
    expect(texts).toContain("Status Summary");
    expect(texts).toContain("System ready");

    const primaryCommand = findCommandByRole(snapshot.commands, "action-card-primary");
    if (primaryCommand.type !== "rect") {
      throw new Error("Expected the primary action command to be a rect.");
    }

    const primaryResult = pressAt(
      runtime,
      primaryCommand.rect.x + primaryCommand.rect.width / 2,
      primaryCommand.rect.y + primaryCommand.rect.height / 2
    );
    expect(primaryResult.outputs).toContainEqual({
      type: "action",
      actionId: "status.review",
      componentId: "status-card"
    });

    snapshot = runtime.render();
    const dismissCommand = findCommandByRole(snapshot.commands, "action-card-dismiss");
    if (dismissCommand.type !== "circle") {
      throw new Error("Expected the dismiss command to be a circle.");
    }

    const dismissResult = pressAt(runtime, dismissCommand.cx, dismissCommand.cy, 10);
    expect(dismissResult.outputs).toContainEqual({
      type: "action",
      actionId: "status.dismiss",
      componentId: "status-card"
    });

    adapter.controller.replaceItem("status-card", {
      kind: "action-card",
      id: "status-card",
      title: "Status Summary",
      emptyStateText: "No details available"
    });

    snapshot = runtime.render();
    texts = getTexts(snapshot.commands);
    expect(texts).toContain("No details available");
    expect(snapshot.commands.some((command) => command.role === "action-card-primary")).toBe(false);
    expect(snapshot.commands.some((command) => command.role === "action-card-dismiss")).toBe(false);
  });

  it("supports custom registered kinds through ordinary display nodes", () => {
    const schema: SchemaDocument<CustomStatusItem> = {
      version: 1,
      pages: [
        {
          id: "main",
          items: [
            {
              kind: "custom-status",
              id: "custom-status-item",
              text: "Custom Ready"
            }
          ]
        }
      ]
    };

    const adapter = createSchemaAdapter("schema-shell", schema, {
      registrations: [customStatusRegistration]
    });

    const runtime = createRuntime({
      root: adapter.root,
      surface: { width: 320, height: 120 }
    });

    expect(getTexts(runtime.render().commands)).toContain("Custom Ready");

    adapter.controller.setText(
      { itemId: "custom-status-item", slot: "text" },
      "Custom Updated"
    );
    expect(getTexts(runtime.render().commands)).toContain("Custom Updated");
  });

  it("rejects invalid schema text targets", () => {
    const adapter = createSchemaAdapter("schema-shell", {
      version: 1,
      pages: []
    });

    expect(() =>
      adapter.controller.setText({ itemId: "", slot: "text" }, "Missing Item")
    ).toThrow(/itemId must not be empty/);

    expect(() =>
      adapter.controller.setText({ itemId: "status", slot: "" }, "Missing Slot")
    ).toThrow(/slot must not be empty/);

    expect(() =>
      adapter.controller.setText({ itemId: "status" } as never, "Missing Slot")
    ).toThrow(/slot is required/);
  });

  it("rejects unknown kinds", () => {
    expect(() =>
      createSchemaAdapter("schema-shell", {
        version: 1,
        pages: [
          {
            id: "main",
            items: [
              {
                kind: "mystery-kind",
                id: "mystery-item"
              } as unknown as SchemaDocument["pages"][number]["items"][number]
            ]
          }
        ]
      })
    ).toThrow(/unknown kind "mystery-kind"/);
  });

  it("rejects duplicate page ids", () => {
    expect(() =>
      createSchemaAdapter("schema-shell", {
        version: 1,
        pages: [
          {
            id: "main",
            items: []
          },
          {
            id: "main",
            items: []
          }
        ]
      })
    ).toThrow(/duplicate page id "main"/);
  });

  it("rejects duplicate item ids", () => {
    expect(() =>
      createSchemaAdapter("schema-shell", {
        version: 1,
        pages: [
          {
            id: "main",
            items: [
              {
                kind: "text",
                id: "shared-item",
                text: "Primary"
              },
              {
                kind: "button",
                id: "shared-item",
                label: "Secondary",
                actionId: "secondary.run"
              }
            ]
          }
        ]
      })
    ).toThrow(/duplicate item id "shared-item"/);
  });

  it("rejects invalid initialPageId values", () => {
    expect(() =>
      createSchemaAdapter("schema-shell", {
        version: 1,
        initialPageId: "missing-page",
        pages: [
          {
            id: "main",
            items: []
          }
        ]
      })
    ).toThrow(/initialPageId "missing-page" does not match any declared page/);
  });

  it("rejects invalid action-card schema items", () => {
    expect(() =>
      createSchemaAdapter("schema-shell", {
        version: 1,
        pages: [
          {
            id: "main",
            items: [
              {
                kind: "action-card",
                id: "invalid-card",
                title: "Broken",
                primaryActionLabel: "Review"
              } as unknown as SchemaDocument["pages"][number]["items"][number]
            ]
          }
        ]
      })
    ).toThrow(/requires non-empty lines or emptyStateText|requires both primaryActionId and primaryActionLabel/);
  });

  it("rejects unsupported schema versions", () => {
    expect(() =>
      createSchemaAdapter("schema-shell", {
        pages: []
      } as never)
    ).toThrow(/version is required and must be 1/);

    expect(() =>
      createSchemaAdapter("schema-shell", {
        version: 2 as never,
        pages: []
      })
    ).toThrow(/version is required and must be 1/);
  });

  it("keeps the last valid schema after a failed setSchema update", () => {
    const adapter = createSchemaAdapter("schema-shell", {
      version: 1,
      pages: [
        {
          id: "main",
          items: [
            {
              kind: "text",
              id: "status-text",
              text: "Online"
            }
          ]
        }
      ]
    });

    const runtime = createRuntime({
      root: adapter.root,
      surface: { width: 320, height: 120 }
    });

    expect(getTexts(runtime.render().commands)).toContain("Online");

    expect(() =>
      adapter.controller.setSchema({
        version: 1,
        pages: [
          {
            id: "secondary",
            items: [
              {
                kind: "unknown-kind",
                id: "broken-item"
              } as unknown as SchemaDocument["pages"][number]["items"][number]
            ]
          }
        ]
      })
    ).toThrow(/unknown kind "unknown-kind"/);

    expect(getTexts(runtime.render().commands)).toContain("Online");

    adapter.controller.replaceItem("status-text", {
      kind: "text",
      id: "status-text",
      text: "Recovered"
    });

    expect(getTexts(runtime.render().commands)).toContain("Recovered");
  });

  it("keeps the last valid schema after a failed replaceItem update", () => {
    const adapter = createSchemaAdapter("schema-shell", {
      version: 1,
      pages: [
        {
          id: "main",
          items: [
            {
              kind: "text",
              id: "status-text",
              text: "Nominal"
            }
          ]
        }
      ]
    });

    const runtime = createRuntime({
      root: adapter.root,
      surface: { width: 320, height: 120 }
    });

    expect(getTexts(runtime.render().commands)).toContain("Nominal");

    expect(() =>
      adapter.controller.replaceItem("status-text", {
        kind: "action-card",
        id: "status-text",
        title: "Broken"
      } as unknown as SchemaDocument["pages"][number]["items"][number])
    ).toThrow(/requires non-empty lines or emptyStateText/);

    expect(getTexts(runtime.render().commands)).toContain("Nominal");

    adapter.controller.replaceItem("status-text", {
      kind: "text",
      id: "status-text",
      text: "Recovered"
    });

    expect(getTexts(runtime.render().commands)).toContain("Recovered");
  });

  it("rejects duplicate custom registrations and built-in kind collisions", () => {
    expect(() =>
      createSchemaAdapter(
        "schema-shell",
        {
          version: 1,
          pages: []
        },
        {
          registrations: [customStatusRegistration, customStatusRegistration]
        }
      )
    ).toThrow(/already registered/);

    const collidingRegistration: SchemaKindRegistration<SchemaCustomItem> = {
      kind: "button",
      validate(item) {
        if (typeof item !== "object" || item === null || Array.isArray(item)) {
          throw new Error("Colliding item must be an object.");
        }
        return {
          kind: "button",
          id: "collision"
        };
      },
      createNode() {
        return createTextLabel("collision", {
          text: "Collision"
        });
      }
    };

    expect(() =>
      createSchemaAdapter(
        "schema-shell",
        {
          version: 1,
          pages: []
        },
        {
          registrations: [collidingRegistration]
        }
      )
    ).toThrow(/already registered/);
  });
});
