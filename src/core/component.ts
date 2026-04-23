import type { RuntimeOutput } from "./actions.js";
import type { DrawCommand } from "./draw.js";
import type { DisplayEvent } from "./events.js";
import type {
  LayoutConstraints,
  MeasureResult,
  Point,
  Rect,
  Size
} from "./geometry.js";
import type { RuntimeServices } from "../services/contracts.js";

export interface HitTarget {
  targetId: string;
  role?: string;
}

export interface RuntimeInteractionSnapshot {
  hoveredTargetId: string | undefined;
  pressedTargetId: string | undefined;
  focusedComponentId: string | undefined;
}

export type ComponentEvent = DisplayEvent | RuntimeOutput;

export interface DisplayNode<Props = unknown, State = unknown> {
  id: string;
  component: DisplayComponent<Props, State>;
  props: Props;
}

export interface ComponentContextBase<Props, State> {
  id: string;
  props: Props;
  state: State;
  services: RuntimeServices;
  interaction: RuntimeInteractionSnapshot;
  emit(output: RuntimeOutput): void;
  invalidateLayout(): void;
  invalidateRender(): void;
  estimateTextWidth(text: string, fontSize?: number): number;
}

export interface ComponentMountContext<Props, State>
  extends ComponentContextBase<Props, State> {}

export interface ComponentUpdateContext<Props, State>
  extends ComponentContextBase<Props, State> {}

export interface ComponentChildrenContext<Props, State>
  extends ComponentContextBase<Props, State> {}

export interface ComponentMeasureContext<Props, State>
  extends ComponentContextBase<Props, State> {
  constraints: LayoutConstraints;
  measureChild(childId: string, constraints?: LayoutConstraints): Size;
  getChildren(): readonly RuntimeChildDescriptor[];
}

export interface ComponentLayoutContext<Props, State>
  extends ComponentContextBase<Props, State> {
  bounds: Rect;
  getChildren(): readonly RuntimeChildDescriptor[];
  getMeasuredSize(childId: string): Size;
  measureChild(childId: string, constraints?: LayoutConstraints): Size;
  setChildBounds(childId: string, rect: Rect): void;
  setContentBounds(rect: Rect): void;
  setClipRect(rect?: Rect): void;
}

export interface ComponentRenderContext<Props, State>
  extends ComponentContextBase<Props, State> {
  bounds: Rect;
}

export interface ComponentHitTestContext<Props, State>
  extends ComponentContextBase<Props, State> {
  bounds: Rect;
  point: Point;
  localPoint: Point;
}

export interface ComponentEventContext<Props, State>
  extends ComponentContextBase<Props, State> {
  bounds: Rect;
  event: ComponentEvent;
}

export interface ComponentDisposeContext<Props, State>
  extends ComponentContextBase<Props, State> {}

export interface RuntimeChildDescriptor {
  id: string;
}

export interface DisplayComponent<Props, State = undefined> {
  kind: string;
  mount?(ctx: ComponentMountContext<Props, State>): State | void;
  update?(ctx: ComponentUpdateContext<Props, State>): void;
  getChildren?(ctx: ComponentChildrenContext<Props, State>): readonly DisplayNode<unknown, unknown>[];
  measure(ctx: ComponentMeasureContext<Props, State>): MeasureResult;
  layout?(ctx: ComponentLayoutContext<Props, State>): void;
  render?(ctx: ComponentRenderContext<Props, State>): readonly DrawCommand[];
  hitTest?(ctx: ComponentHitTestContext<Props, State>): HitTarget | null;
  handleEvent?(ctx: ComponentEventContext<Props, State>): void;
  dispose?(ctx: ComponentDisposeContext<Props, State>): void;
}

export function createNode<Props, State = unknown>(
  id: string,
  component: DisplayComponent<Props, State>,
  props: Props
): DisplayNode<Props, State> {
  return { id, component, props };
}

export function isDisplayEvent(event: ComponentEvent): event is DisplayEvent {
  switch (event.type) {
    case "pointer-enter":
    case "pointer-move":
    case "pointer-leave":
    case "pointer-down":
    case "pointer-up":
    case "press":
    case "long-press":
    case "drag-start":
    case "drag-move":
    case "drag-end":
    case "cancel":
    case "scroll":
    case "focus":
    case "blur":
    case "tick":
      return true;
    default:
      return false;
  }
}

export function isRuntimeOutputEvent(event: ComponentEvent): event is RuntimeOutput {
  return !isDisplayEvent(event);
}
