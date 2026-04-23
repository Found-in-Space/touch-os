export type PointerType =
  | "mouse"
  | "touch"
  | "stylus"
  | "controller"
  | "ray"
  | "gaze"
  | "unknown";

export interface ModifierState {
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

interface EventBase {
  timestamp: number;
  pointerId?: string;
  pointerType?: PointerType;
  pressure?: number;
  modifiers?: ModifierState;
}

export interface PointerEventBase extends EventBase {
  surfaceX: number;
  surfaceY: number;
  localX: number;
  localY: number;
  componentId: string;
  targetId: string;
}

export interface PointerEnterEvent extends PointerEventBase {
  type: "pointer-enter";
}

export interface PointerMoveEvent extends PointerEventBase {
  type: "pointer-move";
}

export interface PointerLeaveEvent extends PointerEventBase {
  type: "pointer-leave";
}

export interface PointerDownEvent extends PointerEventBase {
  type: "pointer-down";
}

export interface PointerUpEvent extends PointerEventBase {
  type: "pointer-up";
}

export interface PressEvent extends PointerEventBase {
  type: "press";
}

export interface LongPressEvent extends PointerEventBase {
  type: "long-press";
}

export interface DragStartEvent extends PointerEventBase {
  type: "drag-start";
  deltaX: number;
  deltaY: number;
}

export interface DragMoveEvent extends PointerEventBase {
  type: "drag-move";
  deltaX: number;
  deltaY: number;
}

export interface DragEndEvent extends PointerEventBase {
  type: "drag-end";
  deltaX: number;
  deltaY: number;
}

export interface CancelEvent extends PointerEventBase {
  type: "cancel";
}

export interface ScrollEvent extends PointerEventBase {
  type: "scroll";
  deltaX: number;
  deltaY: number;
}

export interface FocusEvent extends EventBase {
  type: "focus";
  componentId: string;
  targetId: string;
}

export interface BlurEvent extends EventBase {
  type: "blur";
  componentId: string;
  targetId: string;
}

export interface TickEvent extends EventBase {
  type: "tick";
}

export type DisplayEvent =
  | PointerEnterEvent
  | PointerMoveEvent
  | PointerLeaveEvent
  | PointerDownEvent
  | PointerUpEvent
  | PressEvent
  | LongPressEvent
  | DragStartEvent
  | DragMoveEvent
  | DragEndEvent
  | CancelEvent
  | ScrollEvent
  | FocusEvent
  | BlurEvent
  | TickEvent;

export interface InputPointerEvent extends EventBase {
  type: "pointer-move" | "pointer-down" | "pointer-up" | "cancel";
  surfaceX: number;
  surfaceY: number;
}

export interface InputScrollEvent extends EventBase {
  type: "scroll";
  surfaceX: number;
  surfaceY: number;
  deltaX: number;
  deltaY: number;
}

export interface InputFocusEvent extends EventBase {
  type: "focus";
  componentId: string;
}

export interface InputBlurEvent extends EventBase {
  type: "blur";
  componentId?: string;
}

export type InputEvent =
  | InputPointerEvent
  | InputScrollEvent
  | InputFocusEvent
  | InputBlurEvent;

export const DEFAULT_MODIFIERS: ModifierState = {
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false
};
