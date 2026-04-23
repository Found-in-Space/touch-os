export interface PointerSampleLike {
  pointerId: string;
}

export interface CoordinatedPanelResult {
  claimed: boolean;
  blocked: boolean;
}

export interface CoordinatedPanel<TSample extends PointerSampleLike, TFrame> {
  key: string;
  enabled: boolean;
  process(sample: TSample, frame: TFrame): CoordinatedPanelResult;
  clearPointer(pointerId: string): void;
}

export interface PointerRoutingResult {
  ownerKey: string | undefined;
  blocked: boolean;
}

export function routePointerSample<TSample extends PointerSampleLike, TFrame>(
  panels: readonly CoordinatedPanel<TSample, TFrame>[],
  sample: TSample,
  frame: TFrame
): PointerRoutingResult {
  let ownerKey: string | undefined;
  let blocked = false;

  for (const [index, panel] of panels.entries()) {
    if (!panel.enabled) {
      panel.clearPointer(sample.pointerId);
      continue;
    }

    if (ownerKey) {
      panel.clearPointer(sample.pointerId);
      continue;
    }

    const result = panel.process(sample, frame);
    if (!result.claimed && !result.blocked) {
      continue;
    }

    ownerKey = panel.key;
    blocked = result.blocked;
    for (const lowerPanel of panels.slice(index + 1)) {
      lowerPanel.clearPointer(sample.pointerId);
    }
    break;
  }

  return {
    ownerKey,
    blocked
  };
}
