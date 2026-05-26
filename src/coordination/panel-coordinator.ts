export type PointerRoutingPhase = "move" | "down" | "up" | "cancel" | "scroll";

export type PointerRoutingEventType =
  | "pointer-move"
  | "pointer-down"
  | "pointer-up"
  | "cancel"
  | "scroll";

export interface PointerSampleLike {
  pointerId: string;
  phase?: PointerRoutingPhase;
  type?: string;
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
  claimed: boolean;
  blocked: boolean;
}

export interface PanelCoordinatorOptions<TSample extends PointerSampleLike, TFrame> {
  panels: readonly CoordinatedPanel<TSample, TFrame>[];
  getPhase?(sample: TSample): PointerRoutingPhase | undefined;
}

export interface PanelCoordinator<TSample extends PointerSampleLike, TFrame> {
  route(sample: TSample, frame: TFrame): PointerRoutingResult;
  getOwner(pointerId: string): string | undefined;
  clearPointer(pointerId: string): void;
  clearAllPointers(): void;
}

export function createPanelCoordinator<TSample extends PointerSampleLike, TFrame>(
  options: PanelCoordinatorOptions<TSample, TFrame>
): PanelCoordinator<TSample, TFrame> {
  const owners = new Map<string, string>();

  function getPhase(sample: TSample): PointerRoutingPhase | undefined {
    return options.getPhase?.(sample) ?? resolvePointerRoutingPhase(sample);
  }

  function clearPointer(pointerId: string): void {
    owners.delete(pointerId);
    for (const panel of options.panels) {
      panel.clearPointer(pointerId);
    }
  }

  return {
    route(sample, frame) {
      const phase = getPhase(sample);
      const release = isPointerReleasePhase(phase);
      const ownerKey = owners.get(sample.pointerId);
      if (ownerKey) {
        const ownerIndex = options.panels.findIndex((panel) => panel.key === ownerKey);
        const owner = ownerIndex >= 0 ? options.panels[ownerIndex] : undefined;
        if (owner?.enabled) {
          clearPanelsExcept(options.panels, sample.pointerId, owner.key);
          const result = owner.process(sample, frame);
          if (release) {
            owners.delete(sample.pointerId);
          }
          return {
            ownerKey: owner.key,
            claimed: true,
            blocked: result.blocked
          };
        }

        owners.delete(sample.pointerId);
      }

      return routePointerSampleWithOwners(options.panels, sample, frame, owners, release);
    },
    getOwner(pointerId) {
      return owners.get(pointerId);
    },
    clearPointer,
    clearAllPointers() {
      for (const pointerId of [...owners.keys()]) {
        clearPointer(pointerId);
      }
    }
  };
}

export function routePointerSample<TSample extends PointerSampleLike, TFrame>(
  panels: readonly CoordinatedPanel<TSample, TFrame>[],
  sample: TSample,
  frame: TFrame
): PointerRoutingResult {
  return routePointerSampleWithOwners(
    panels,
    sample,
    frame,
    new Map<string, string>(),
    isPointerReleasePhase(resolvePointerRoutingPhase(sample))
  );
}

function routePointerSampleWithOwners<TSample extends PointerSampleLike, TFrame>(
  panels: readonly CoordinatedPanel<TSample, TFrame>[],
  sample: TSample,
  frame: TFrame,
  owners: Map<string, string>,
  release: boolean
): PointerRoutingResult {
  for (const [index, panel] of panels.entries()) {
    if (!panel.enabled) {
      panel.clearPointer(sample.pointerId);
      continue;
    }

    const result = panel.process(sample, frame);
    if (!result.claimed && !result.blocked) {
      continue;
    }

    if (result.claimed && !release) {
      owners.set(sample.pointerId, panel.key);
    } else {
      owners.delete(sample.pointerId);
    }

    clearLowerPriorityPanels(panels, index, sample.pointerId);
    return {
      ownerKey: panel.key,
      claimed: result.claimed,
      blocked: result.blocked
    };
  }

  owners.delete(sample.pointerId);
  return {
    ownerKey: undefined,
    claimed: false,
    blocked: false
  };
}

function clearLowerPriorityPanels<TSample extends PointerSampleLike, TFrame>(
  panels: readonly CoordinatedPanel<TSample, TFrame>[],
  ownerIndex: number,
  pointerId: string
): void {
  for (let index = ownerIndex + 1; index < panels.length; index += 1) {
    panels[index]?.clearPointer(pointerId);
  }
}

function clearPanelsExcept<TSample extends PointerSampleLike, TFrame>(
  panels: readonly CoordinatedPanel<TSample, TFrame>[],
  pointerId: string,
  ownerKey: string
): void {
  for (const panel of panels) {
    if (panel.key !== ownerKey) {
      panel.clearPointer(pointerId);
    }
  }
}

function resolvePointerRoutingPhase(sample: PointerSampleLike): PointerRoutingPhase | undefined {
  if (sample.phase) {
    return sample.phase;
  }

  switch (sample.type) {
    case "pointer-move":
      return "move";
    case "pointer-down":
      return "down";
    case "pointer-up":
      return "up";
    case "cancel":
      return "cancel";
    case "scroll":
      return "scroll";
    default:
      return undefined;
  }
}

function isPointerReleasePhase(phase: PointerRoutingPhase | undefined): boolean {
  return phase === "up" || phase === "cancel";
}
