import { describe, expect, it } from "vitest";
import { createRuntime } from "../src/index.js";
import { createSchemaAdapter } from "../src/adapters/schema.js";
import { getTexts } from "./helpers/runtime-helpers.js";

describe("schema adapter", () => {
  it("renders schema-driven pages and supports controller updates", () => {
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
});
