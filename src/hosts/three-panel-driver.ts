import type { RenderSnapshot } from "../core/draw.js";
import type { DisplayRuntime } from "../core/runtime.js";
import { createContinuousPointerTracker } from "./continuous-pointer-tracker.js";
import { createPanelInteractorInternal } from "./three-panel-interactor.js";
import type {
  PointerClaimPolicy,
  PointerPresentationState,
  PointerPresenter,
  ThreeCompositeSurfacePlacement,
  ThreePanelDriver,
  ThreePanelHost,
  ThreePanelHostFrame,
  ThreePanelHit,
  ThreePointerSample,
  ThreePointerSource,
  ThreeTextureCompositePresenter,
  ThreeTextureCompositePresenterOptions,
  ThreeTextureSurfaceHandle
} from "./three.js";

export interface ThreePanelHostInternal extends ThreePanelHost {
  updateForDriver(frame: ThreePanelHostFrame): void;
}

export interface ThreePanelDriverCompositeServices {
  resolvePlacements(host: ThreePanelHost): readonly ThreeCompositeSurfacePlacement[];
  isTextureHandle(handle: unknown): handle is ThreeTextureSurfaceHandle;
  createPresenter(
    host: ThreePanelHost,
    options: ThreeTextureCompositePresenterOptions
  ): ThreeTextureCompositePresenter;
}

export interface CreatePanelDriverOptions {
  host: ThreePanelHostInternal;
  runtime: DisplayRuntime;
  pointerClaimPolicy: PointerClaimPolicy | undefined;
  pointerSources: readonly ThreePointerSource[] | undefined;
  pointerPresenter: PointerPresenter | readonly PointerPresenter[] | undefined;
  ownsPointerPresenter: boolean;
  compositeServices: ThreePanelDriverCompositeServices;
}

/** Complete attachment, pointer-source, presenter, and disposal lifecycle for a Three panel. */
export function createPanelDriver(options: CreatePanelDriverOptions): ThreePanelDriver {
  const { host, runtime } = options;
  const interactor = createPanelInteractorInternal({
    runtime,
    mesh: host.mesh,
    getSurfaceMetrics: () => host.getSurfaceMetrics(),
    ...(options.pointerClaimPolicy === undefined
      ? {}
      : { pointerClaimPolicy: options.pointerClaimPolicy })
  });
  const sources = options.pointerSources ?? [];
  const presenters = Array.isArray(options.pointerPresenter)
    ? [...options.pointerPresenter]
    : options.pointerPresenter
      ? [options.pointerPresenter]
      : [];
  const compositePresenters = new Map<string, ThreeTextureCompositePresenter>();
  const sourcePointers = createContinuousPointerTracker(sources, copyPointerSample);
  let latestHit: ThreePanelHit | null = null;
  let latestCompositeRenderRevision = -1;
  let latestCompositeHostVisible = false;
  let latestFrameTimestamp = 0;
  let attached = false;
  let disposed = false;

  const driver: ThreePanelDriver = {
    host,
    interactor,
    attach() {
      assertNotDisposed("attach");
      if (attached) {
        return;
      }
      host.attach();
      attached = true;
    },
    update(frame) {
      assertNotDisposed("update");
      if (!attached) {
        throw new Error("Cannot update a detached Three panel driver. Call attach() first.");
      }
      if (sources.length > 0 && (frame.events?.length ?? 0) > 0) {
        throw new Error(
          "Panel drivers accept either frame.events or pointerSources in a given frame, not both."
        );
      }

      host.updateForDriver(frame);
      latestFrameTimestamp = frame.timestamp;
      latestHit = host.getHit();

      if (host.mesh.visible) {
        for (const source of sources) {
          reconcilePointerSource(source, source.sample(frame), frame);
        }
      } else {
        cancelSourcePointers(undefined, frame.timestamp, frame);
        clearInteractorPointers(undefined, frame.timestamp);
      }

      runtime.tick(frame.timestamp);
      syncCompositePresentersAfterRender(host.render());
    },
    detach() {
      if (disposed || !attached) {
        return;
      }
      cancelSourcePointers(undefined, latestFrameTimestamp);
      clearInteractorPointers(undefined, latestFrameTimestamp);
      host.clearPointer(undefined, latestFrameTimestamp);
      for (const source of sources) {
        source.clear?.();
      }
      host.detach();
      latestHit = null;
      attached = false;
    },
    dispose() {
      if (disposed) {
        return;
      }
      driver.detach();
      cancelSourcePointers(undefined, latestFrameTimestamp);
      clearInteractorPointers(undefined, latestFrameTimestamp);
      host.clearPointer(undefined, latestFrameTimestamp);
      if (options.ownsPointerPresenter) {
        for (const presenter of presenters) {
          presenter.dispose();
        }
      }
      for (const source of sources) {
        source.clear?.();
      }
      for (const presenter of compositePresenters.values()) {
        presenter.dispose();
      }
      compositePresenters.clear();
      host.dispose();
      disposed = true;
    },
    render() {
      assertNotDisposed("render");
      const snapshot = host.render();
      syncCompositePresentersAfterRender(snapshot);
      return snapshot;
    },
    processPointer(sample, frame) {
      assertNotDisposed("process input through");
      if (!attached) {
        throw new Error("Cannot process input through a detached Three panel driver.");
      }
      latestFrameTimestamp = Math.max(latestFrameTimestamp, frame.timestamp, sample.timestamp);
      const result = interactor.process(sample, frame);
      latestHit = result.hit;
      notifyPointerPresenter(sample.pointerId);
      return result;
    },
    getHit() {
      return latestHit ? { ...latestHit } : null;
    },
    getCompositeSurfaces() {
      return host.getCompositeSurfaces();
    },
    getPointerState(pointerId) {
      return interactor.getPointerState(pointerId);
    },
    clearPointer(pointerId, timestamp = latestFrameTimestamp) {
      cancelSourcePointers(pointerId, timestamp);
      clearInteractorPointers(pointerId, timestamp);
      host.clearPointer(pointerId, timestamp);
      if (pointerId === undefined || latestHit?.pointerId === pointerId) {
        latestHit = null;
      }
    }
  };

  return driver;

  function assertNotDisposed(operation: string): void {
    if (disposed) {
      throw new Error(`Cannot ${operation} a disposed Three panel driver.`);
    }
  }

  function reconcilePointerSource(
    source: ThreePointerSource,
    samples: readonly ThreePointerSample[],
    frame: ThreePanelHostFrame
  ): void {
    sourcePointers.reconcile(
      source,
      samples,
      (sample) => processPointerSample(sample, frame),
      (sample) => processSyntheticCancel(sample, frame.timestamp, frame)
    );
  }

  function processPointerSample(sample: ThreePointerSample, frame: ThreePanelHostFrame): void {
    const result = interactor.process(sample, frame);
    latestHit = result.hit;
    notifyPointerPresenter(sample.pointerId);
  }

  function processSyntheticCancel(
    sample: ThreePointerSample,
    timestamp: number,
    frame?: ThreePanelHostFrame
  ): void {
    const cancelSample: ThreePointerSample = {
      ...copyPointerSample(sample),
      phase: "cancel",
      timestamp
    };
    if (frame) {
      processPointerSample(cancelSample, frame);
    } else {
      interactor.clear(cancelSample.pointerId, timestamp);
      notifyPointerPresenter(cancelSample.pointerId);
      if (latestHit?.pointerId === cancelSample.pointerId) {
        latestHit = null;
      }
    }
  }

  function cancelSourcePointers(
    pointerId: string | undefined,
    timestamp: number,
    frame?: ThreePanelHostFrame
  ): void {
    sourcePointers.cancel(pointerId, (sample) => {
      processSyntheticCancel(sample, timestamp, frame);
    });
  }

  function notifyPointerPresenter(pointerId?: string): void {
    if (pointerId === undefined) {
      return;
    }
    const state = interactor.getPointerState(pointerId) ?? createInactivePointerState(pointerId);
    for (const presenter of presenters) {
      presenter.update(state);
    }
  }

  function clearInteractorPointers(pointerId: string | undefined, timestamp: number): void {
    const pointerIds = pointerId === undefined ? interactor.getPointerIds() : [pointerId];
    interactor.clear(pointerId, timestamp);
    for (const id of pointerIds) {
      notifyPointerPresenter(id);
    }
  }

  function syncCompositePresentersAfterRender(snapshot: RenderSnapshot): void {
    const visibleChanged = host.mesh.visible !== latestCompositeHostVisible;
    latestCompositeHostVisible = host.mesh.visible;
    if (snapshot.revision === latestCompositeRenderRevision && !visibleChanged) {
      return;
    }
    latestCompositeRenderRevision = snapshot.revision;
    syncCompositePresenters();
  }

  function syncCompositePresenters(): void {
    const activeKeys = new Set<string>();
    for (const placement of options.compositeServices.resolvePlacements(host)) {
      if (!options.compositeServices.isTextureHandle(placement.command.handle)) {
        continue;
      }
      const key = `${placement.componentId}\n${placement.sourceId ?? ""}`;
      activeKeys.add(key);
      let presenter = compositePresenters.get(key);
      if (!presenter) {
        presenter = options.compositeServices.createPresenter(host, {
          componentId: placement.componentId,
          ...(placement.sourceId === undefined ? {} : { sourceId: placement.sourceId })
        });
        compositePresenters.set(key, presenter);
      }
      presenter.update(host);
    }

    for (const [key, presenter] of compositePresenters) {
      if (!activeKeys.has(key)) {
        presenter.dispose();
        compositePresenters.delete(key);
      }
    }
  }
}

function copyPointerSample(sample: ThreePointerSample): ThreePointerSample {
  return {
    ...sample,
    ...(sample.modifiers ? { modifiers: { ...sample.modifiers } } : {}),
    ...(sample.origin ? { origin: { ...sample.origin } } : {}),
    ...(sample.direction ? { direction: { ...sample.direction } } : {}),
    ...(sample.contactPoint ? { contactPoint: { ...sample.contactPoint } } : {}),
    ...(sample.contactNormal ? { contactNormal: { ...sample.contactNormal } } : {})
  };
}

function createInactivePointerState(pointerId: string): PointerPresentationState {
  return {
    pointerId,
    claimed: false,
    blocked: false,
    hit: null,
    active: false
  };
}
