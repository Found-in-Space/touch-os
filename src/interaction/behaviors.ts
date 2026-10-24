import type { DisplayEvent } from "../core/events.js";

export interface ActivationBehavior {
  hovered: boolean;
  pressed: boolean;
  handle(event: DisplayEvent, disabled?: boolean): boolean;
  cancel(): void;
}
/** Host-independent activation state; returns true only for a completed press. */
export function createActivationBehavior(): ActivationBehavior {
  const hovered = new Set<string>();
  let owner: string | undefined;
  const behavior: ActivationBehavior = {
    get hovered() { return hovered.size > 0; },
    get pressed() { return owner !== undefined; },
    handle(event, disabled = false) {
      const id = event.pointerId ?? "default";
      if (disabled) { behavior.cancel(); return false; }
      switch (event.type) {
        case "pointer-enter": case "pointer-move": hovered.add(id); break;
        case "pointer-leave": hovered.delete(id); break;
        case "pointer-down": owner ??= id; break;
        case "pointer-up": case "cancel": if (owner === id) owner = undefined; break;
        case "press": return owner === undefined || owner === id;
      }
      return false;
    },
    cancel() { owner = undefined; hovered.clear(); }
  };
  return behavior;
}
export type ValueEditPhase = "begin" | "update" | "commit" | "cancel";
export interface ContinuousValueBehavior {
  readonly dragging: boolean;
  readonly hovered: boolean;
  handle(event: DisplayEvent, options: {
    disabled?: boolean;
    value: number;
    map(x: number, y: number): number;
    change(value: number, phase: ValueEditPhase): void;
  }): void;
  cancel(): void;
}
/** Shared single-editor lifecycle. Mappings implement sliders, dials and other continuous widgets. */
export function createContinuousValueBehavior(): ContinuousValueBehavior {
  let owner: string | undefined;
  let value = 0;
  const hover = new Set<string>();
  let change: ((value: number, phase: ValueEditPhase) => void) | undefined;
  function cancel() {
    const editing = owner !== undefined;
    owner = undefined; hover.clear();
    if (editing) change?.(value, "cancel");
    change = undefined;
  }
  return {
    get dragging() { return owner !== undefined; },
    get hovered() { return hover.size > 0; },
    handle(event, options) {
      const id = event.pointerId ?? "default";
      if (options.disabled) { cancel(); return; }
      if (event.type === "pointer-enter" || event.type === "pointer-move") hover.add(id);
      if (event.type === "pointer-leave") hover.delete(id);
      if (event.type === "pointer-down" && owner === undefined) {
        owner = id; value = options.value; change = options.change;
        options.change(value, "begin");
        const next = options.map(event.localX, event.localY);
        if (next !== value) { value = next; options.change(value, "update"); }
      } else if (owner === id) {
        if (event.type === "drag-move" || event.type === "pointer-move" || event.type === "pointer-up") {
          const next = options.map(event.localX, event.localY);
          if (next !== value) { value = next; options.change(value, "update"); }
        }
        if (event.type === "pointer-up" || event.type === "cancel") {
          owner = undefined;
          options.change(value, event.type === "cancel" ? "cancel" : "commit");
          change = undefined;
        }
      }
    },
    cancel
  };
}

export interface DragBehavior {
  readonly dragging: boolean;
  handle(event: DisplayEvent, callbacks: {
    begin(): void;
    update(deltaX: number, deltaY: number): void;
    end?(cancelled: boolean): void;
  }): void;
}
/** Reusable local drag/scroll lifecycle after runtime gesture arbitration. */
export function createDragBehavior(): DragBehavior {
  let owner: string | undefined;
  return {
    get dragging() { return owner !== undefined; },
    handle(event, callbacks) {
      const id = event.pointerId ?? "default";
      if (event.type === "drag-start" && owner === undefined) { owner = id; callbacks.begin(); }
      if (owner !== id) return;
      if (event.type === "drag-move") callbacks.update(event.deltaX, event.deltaY);
      if (event.type === "drag-end" || event.type === "cancel") {
        owner = undefined; callbacks.end?.(event.type === "cancel");
      }
    }
  };
}
