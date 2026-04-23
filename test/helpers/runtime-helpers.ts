import type { DisplayRuntime, RuntimeOutput } from "../../src/index.js";

export function getTexts(commands: readonly { type: string; text?: string }[]): string[] {
  return commands
    .filter((command) => command.type === "text")
    .map((command) => command.text)
    .filter((text): text is string => typeof text === "string");
}

export function pressAt(
  runtime: DisplayRuntime,
  surfaceX: number,
  surfaceY: number,
  timestamp = 1
) {
  runtime.dispatchInput({
    type: "pointer-down",
    surfaceX,
    surfaceY,
    timestamp
  });

  return runtime.dispatchInput({
    type: "pointer-up",
    surfaceX,
    surfaceY,
    timestamp: timestamp + 1
  });
}

export function clickComponentCenter(runtime: DisplayRuntime, componentId: string, timestamp = 1) {
  const bounds = runtime.getBounds(componentId);
  if (!bounds) {
    throw new Error(`Unable to find bounds for component "${componentId}".`);
  }

  return pressAt(runtime, bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, timestamp);
}

export function applyNavigationOutputs(
  runtime: DisplayRuntime,
  outputs: readonly RuntimeOutput[]
): void {
  for (const output of outputs) {
    if (output.type !== "navigation-request") {
      continue;
    }

    switch (output.intent) {
      case "push":
        if (output.pageId) {
          runtime.getServices().navigation.push(output.containerId, output.pageId);
        }
        break;
      case "replace":
        if (output.pageId) {
          runtime.getServices().navigation.replace(output.containerId, output.pageId);
        }
        break;
      case "back":
        runtime.getServices().navigation.back(output.containerId);
        break;
    }
  }
}

export function findCommandByRole<TCommand extends { role?: string }>(
  commands: readonly TCommand[],
  role: string
): TCommand {
  const command = commands.find((entry) => entry.role === role);
  if (!command) {
    throw new Error(`Unable to find a draw command with role "${role}".`);
  }
  return command;
}
