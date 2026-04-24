import type { FocusService } from "../services/contracts.js";

interface FocusableContextLike {
  id: string;
  interaction: {
    focusedComponentId: string | undefined;
  };
  services: {
    focus: FocusService;
  };
}

interface FocusableDisposeContextLike {
  id: string;
  services: {
    focus: FocusService;
  };
}

export function syncFocusableRegistration(
  ctx: FocusableContextLike,
  isFocusable: boolean,
  defaultTargetId?: string
): void {
  if (isFocusable) {
    ctx.services.focus.registerFocusable(
      ctx.id,
      defaultTargetId === undefined ? undefined : { defaultTargetId }
    );
    return;
  }

  ctx.services.focus.unregisterFocusable(ctx.id);
  if (ctx.interaction.focusedComponentId === ctx.id) {
    ctx.services.focus.clearFocus();
  }
}

export function clearFocusableRegistration(ctx: FocusableDisposeContextLike): void {
  ctx.services.focus.unregisterFocusable(ctx.id);
}
