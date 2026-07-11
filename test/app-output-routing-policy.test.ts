import { describe, expect, it } from "vitest";
import type { RuntimeOutput } from "../src/core/index.js";
import { resolveAppOutputRouting } from "../src/app-shell/app-output-routing.js";

const rawOutput: RuntimeOutput = {
  type: "action",
  componentId: "button",
  actionId: "run"
};
const appOutput: RuntimeOutput = {
  type: "app-event",
  componentId: "app",
  appId: "app",
  instanceId: "instance",
  windowId: "window",
  event: { type: "app-action" }
};

describe("app output routing policy", () => {
  it.each([
    ["same-runtime", rawOutput, false, false, { consume: true, emitScope: undefined }],
    ["same-runtime", rawOutput, true, false, { consume: false, emitScope: undefined }],
    ["same-runtime", rawOutput, true, true, { consume: true, emitScope: "inherited" }],
    ["same-runtime", appOutput, false, false, { consume: true, emitScope: "record" }],
    ["same-runtime", appOutput, true, true, { consume: true, emitScope: "record" }],
    ["child-runtime", rawOutput, false, false, { consume: false, emitScope: undefined }],
    ["child-runtime", rawOutput, true, false, { consume: false, emitScope: "record" }],
    ["child-runtime", appOutput, false, false, { consume: false, emitScope: "record" }],
    ["child-runtime", appOutput, true, false, { consume: false, emitScope: "record" }]
  ] as const)(
    "routes %s %s output with forwarding=%s and inherited scope=%s",
    (mode, output, forward, inherited, expected) => {
      expect(resolveAppOutputRouting(mode, output, forward, inherited)).toEqual(expected);
    }
  );
});
