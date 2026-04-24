import { describe, expect, it } from "vitest";
import { createRuntime, createTextLabel } from "../src/index.js";
import {
  createSchemaAdapter,
  type SchemaCustomItem,
  type SchemaDocument,
  type SchemaKindRegistration
} from "../src/adapters/schema.js";
import { findCommandByRole, getTexts, pressAt } from "./helpers/runtime-helpers.js";

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
      text: context.readText(item.id, item.text)
    });
  }
};

describe("schema adapter", () => {
  it("renders schema-driven built-ins and preserves controller updates", () => {
    const adapter = createSchemaAdapter("schema-shell", {
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
              step: 5
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
    expect(texts).toContain("Brightness: 35");

    adapter.controller.setText("status-text", "Online");
    adapter.controller.setField("brightness", 60);

    texts = getTexts(runtime.render().commands);
    expect(texts).toContain("Online");
    expect(texts).toContain("Brightness: 60");

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

    adapter.controller.setText("custom-status-item", "Custom Updated");
    expect(getTexts(runtime.render().commands)).toContain("Custom Updated");
  });

  it("rejects unknown kinds", () => {
    expect(() =>
      createSchemaAdapter("schema-shell", {
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
        version: 2 as never,
        pages: []
      })
    ).toThrow(/version must be 1/);
  });

  it("keeps the last valid schema after a failed setSchema update", () => {
    const adapter = createSchemaAdapter("schema-shell", {
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
          pages: []
        },
        {
          registrations: [collidingRegistration]
        }
      )
    ).toThrow(/already registered/);
  });
});
