import type { InputEvent } from "../core/events.js";
import type { Rect } from "../core/geometry.js";

export interface HostFrame {
  viewport: Rect;
  events?: readonly InputEvent[];
}

export interface HostAdapter {
  attach(): void;
  update(frame: HostFrame): void;
  detach(): void;
}
