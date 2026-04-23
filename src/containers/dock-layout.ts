import type { Insets } from "../core/geometry.js";
import { createRect, type LayoutConstraints, type Rect } from "../core/geometry.js";
import { type DisplayComponent, type DisplayNode, createNode } from "../core/component.js";
import { resolvePadding } from "./shared.js";

export interface DockSlotSpec {
  child: DisplayNode<unknown, unknown>;
  maxWidth?: number;
  maxHeight?: number;
}

export interface DockLayoutProps {
  padding?: number | Partial<Insets>;
  topLeft?: DockSlotSpec;
  topCenter?: DockSlotSpec;
  topRight?: DockSlotSpec;
  bottomLeft?: DockSlotSpec;
  bottomCenter?: DockSlotSpec;
  bottomRight?: DockSlotSpec;
}

type DockSlotName =
  | "topLeft"
  | "topCenter"
  | "topRight"
  | "bottomLeft"
  | "bottomCenter"
  | "bottomRight";

interface DockEntry {
  slot: DockSlotName;
  child: DisplayNode<unknown, unknown>;
  maxWidth?: number;
  maxHeight?: number;
}

const DockLayoutComponent: DisplayComponent<DockLayoutProps> = {
  kind: "dock-layout",
  getChildren(ctx) {
    return getDockEntries(ctx.props).map((entry) => entry.child);
  },
  measure(ctx) {
    const padding = resolvePadding(ctx.props.padding, 0);
    const availableWidth = Math.max(0, ctx.constraints.maxWidth - padding.left - padding.right);
    const availableHeight = Math.max(0, ctx.constraints.maxHeight - padding.top - padding.bottom);
    for (const entry of getDockEntries(ctx.props)) {
      ctx.measureChild(
        entry.child.id,
        createSlotConstraints(availableWidth, availableHeight, entry)
      );
    }

    return {
      width: ctx.constraints.maxWidth,
      height: ctx.constraints.maxHeight
    };
  },
  layout(ctx) {
    const padding = resolvePadding(ctx.props.padding, 0);
    const innerBounds = createRect(
      ctx.bounds.x + padding.left,
      ctx.bounds.y + padding.top,
      Math.max(0, ctx.bounds.width - padding.left - padding.right),
      Math.max(0, ctx.bounds.height - padding.top - padding.bottom)
    );

    for (const entry of getDockEntries(ctx.props)) {
      const measured = ctx.getMeasuredSize(entry.child.id);
      const childWidth = Math.min(measured.width, innerBounds.width);
      const childHeight = Math.min(measured.height, innerBounds.height);
      const { x, y } = resolveDockPosition(innerBounds, childWidth, childHeight, entry.slot);
      ctx.setChildBounds(entry.child.id, createRect(x, y, childWidth, childHeight));
    }

    ctx.setContentBounds(innerBounds);
  },
  render() {
    return [];
  },
  hitTest() {
    return null;
  }
};

export function createDockLayout(
  id: string,
  props: DockLayoutProps
): DisplayNode<DockLayoutProps> {
  return createNode(id, DockLayoutComponent, props);
}

function getDockEntries(props: DockLayoutProps): readonly DockEntry[] {
  const entries: DockEntry[] = [];
  if (props.topLeft) {
    entries.push({ slot: "topLeft", ...props.topLeft });
  }
  if (props.topCenter) {
    entries.push({ slot: "topCenter", ...props.topCenter });
  }
  if (props.topRight) {
    entries.push({ slot: "topRight", ...props.topRight });
  }
  if (props.bottomLeft) {
    entries.push({ slot: "bottomLeft", ...props.bottomLeft });
  }
  if (props.bottomCenter) {
    entries.push({ slot: "bottomCenter", ...props.bottomCenter });
  }
  if (props.bottomRight) {
    entries.push({ slot: "bottomRight", ...props.bottomRight });
  }
  return entries;
}

function createSlotConstraints(
  availableWidth: number,
  availableHeight: number,
  entry: DockEntry
): LayoutConstraints {
  return {
    minWidth: 0,
    minHeight: 0,
    maxWidth:
      entry.maxWidth === undefined
        ? availableWidth
        : Math.min(availableWidth, entry.maxWidth),
    maxHeight:
      entry.maxHeight === undefined
        ? availableHeight
        : Math.min(availableHeight, entry.maxHeight)
  };
}

function resolveDockPosition(
  bounds: Rect,
  width: number,
  height: number,
  slot: DockSlotName
): { x: number; y: number } {
  switch (slot) {
    case "topLeft":
      return { x: bounds.x, y: bounds.y };
    case "topCenter":
      return {
        x: bounds.x + (bounds.width - width) / 2,
        y: bounds.y
      };
    case "topRight":
      return {
        x: bounds.x + bounds.width - width,
        y: bounds.y
      };
    case "bottomLeft":
      return {
        x: bounds.x,
        y: bounds.y + bounds.height - height
      };
    case "bottomCenter":
      return {
        x: bounds.x + (bounds.width - width) / 2,
        y: bounds.y + bounds.height - height
      };
    case "bottomRight":
      return {
        x: bounds.x + bounds.width - width,
        y: bounds.y + bounds.height - height
      };
  }
}
