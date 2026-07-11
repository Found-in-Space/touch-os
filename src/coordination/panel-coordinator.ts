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
  /** The panel selected to process this routing step. */
  panelKey: string | undefined;
  /** The panel retaining press ownership after this routing step. */
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
  const owners = new Map<string, CoordinatedPanel<TSample, TFrame>>();

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
      const owner = owners.get(sample.pointerId);
      if (owner) {
        const ownerIndex = options.panels.indexOf(owner);
        if (ownerIndex >= 0 && owner.enabled) {
          clearPanelsExcept(options.panels, sample.pointerId, owner.key);
          const result = owner.process(sample, frame);
          if (release) {
            owners.delete(sample.pointerId);
          }
          return {
            panelKey: owner.key,
            ownerKey: release ? undefined : owner.key,
            claimed: result.claimed,
            blocked: result.blocked
          };
        }

        owners.delete(sample.pointerId);
        if (ownerIndex < 0) {
          owner.clearPointer(sample.pointerId);
        }
      }

      return routePointerSampleWithOwners(options.panels, sample, frame, owners, phase);
    },
    getOwner(pointerId) {
      const owner = owners.get(pointerId);
      if (!owner) {
        return undefined;
      }
      if (owner.enabled && options.panels.includes(owner)) {
        return owner.key;
      }
      owners.delete(pointerId);
      owner.clearPointer(pointerId);
      return undefined;
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
    new Map<string, CoordinatedPanel<TSample, TFrame>>(),
    resolvePointerRoutingPhase(sample)
  );
}

function routePointerSampleWithOwners<TSample extends PointerSampleLike, TFrame>(
  panels: readonly CoordinatedPanel<TSample, TFrame>[],
  sample: TSample,
  frame: TFrame,
  owners: Map<string, CoordinatedPanel<TSample, TFrame>>,
  phase: PointerRoutingPhase | undefined
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

    if (result.claimed && phase === "down") {
      owners.set(sample.pointerId, panel);
    } else if (isPointerReleasePhase(phase)) {
      owners.delete(sample.pointerId);
    }

    clearLowerPriorityPanels(panels, index, sample.pointerId);
    return {
      panelKey: panel.key,
      ownerKey: owners.get(sample.pointerId)?.key,
      claimed: result.claimed,
      blocked: result.blocked
    };
  }

  if (isPointerReleasePhase(phase)) {
    owners.delete(sample.pointerId);
  }
  return {
    panelKey: undefined,
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
