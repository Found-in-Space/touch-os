import type { InputEvent } from "../core/events.js";
import type { Rect } from "../core/geometry.js";

export interface HostFrame {
  viewport: Rect;
  events?: readonly InputEvent[];
}

export interface HostAdapter<TFrame = HostFrame> {
  attach(): void;
  update(frame: TFrame): void;
  detach(): void;
}
