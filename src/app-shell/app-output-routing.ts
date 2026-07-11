import type { RuntimeOutput } from "../core/actions.js";

export type AppOutputHostMode = "same-runtime" | "child-runtime";
export type AppOutputScope = "record" | "inherited";

export interface AppOutputRoutingDecision {
  /** Consume the output from the containing runtime's raw output path. */
  consume: boolean;
  /** Emit a newly scoped copy through the shell, using this scope source. */
  emitScope: AppOutputScope | undefined;
}

/** Resolves the one-default-app-event policy consistently for both app host modes. */
export function resolveAppOutputRouting(
  mode: AppOutputHostMode,
  output: RuntimeOutput,
  forwardRawOutputs: boolean,
  hasInheritedScope = false
): AppOutputRoutingDecision {
  if (output.type === "app-event") {
    return {
      consume: mode === "same-runtime",
      emitScope: "record"
    };
  }

  if (mode === "child-runtime") {
    return {
      consume: false,
      emitScope: forwardRawOutputs ? "record" : undefined
    };
  }

  if (!forwardRawOutputs) {
    return { consume: true, emitScope: undefined };
  }

  return hasInheritedScope
    ? { consume: true, emitScope: "inherited" }
    : { consume: false, emitScope: undefined };
}
