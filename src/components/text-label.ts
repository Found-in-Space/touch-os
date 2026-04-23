import { type DisplayComponent, type DisplayNode, createNode } from "../core/component.js";
import { createRect } from "../core/geometry.js";

export interface TextLabelProps {
  text: string;
  tone?: "default" | "muted";
  align?: "left" | "center" | "right";
}

const TextLabelComponent: DisplayComponent<TextLabelProps> = {
  kind: "text-label",
  measure(ctx) {
    const theme = ctx.services.theme.getTokens();
    const width = Math.min(
      ctx.constraints.maxWidth,
      ctx.estimateTextWidth(ctx.props.text, theme.typography.fontSize) + theme.padding * 2
    );
    return {
      width,
      height: theme.typography.lineHeight
    };
  },
  render(ctx) {
    const theme = ctx.services.theme.getTokens();
    return [
      {
        type: "text",
        componentId: ctx.id,
        role: "text-label",
        text: ctx.props.text,
        rect: createRect(ctx.bounds.x, ctx.bounds.y, ctx.bounds.width, ctx.bounds.height),
        color: ctx.props.tone === "muted" ? theme.mutedTextColor : theme.textColor,
        align: ctx.props.align ?? "left",
        verticalAlign: "middle",
        fontSize: theme.typography.fontSize,
        fontWeight: theme.typography.fontWeight
      }
    ];
  },
  hitTest() {
    return null;
  }
};

export function createTextLabel(id: string, props: TextLabelProps): DisplayNode<TextLabelProps> {
  return createNode(id, TextLabelComponent, props);
}
