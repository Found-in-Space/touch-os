import type { InputEvent } from "../core/events.js";
import type { Rect } from "../core/geometry.js";

export interface HostFrame {
  /** Monotonic frame time in milliseconds. Equal timestamps are allowed. */
  timestamp: number;
  viewport: Rect;
  events?: readonly InputEvent[];
}

export interface HostAdapter<TFrame = HostFrame> {
  attach(): void;
  update(frame: TFrame): void;
  detach(): void;
  /** Permanently release owned resources. Detachment remains reversible. */
  dispose?(): void;
}
