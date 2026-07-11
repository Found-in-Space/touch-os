import type { RuntimeOutput } from "../core/actions.js";
import type { RenderSnapshot } from "../core/draw.js";
import type { DisplayRuntime } from "../core/runtime.js";
import type { CoordinatedPanel } from "../coordination/index.js";
import type {
  PointerPresentationState,
  ThreePanelDriver,
  ThreePanelHostFrame,
  ThreePointerSample
} from "./three.js";

export type ThreePanelSessionOutputHandler = (
  output: RuntimeOutput,
  session: ThreePanelSession
) => void;

export interface ThreePanelSessionOptions {
  key: string;
  runtime: DisplayRuntime;
  driver: ThreePanelDriver;
  enabled?: boolean;
  outputHandler?: ThreePanelSessionOutputHandler;
}

export interface ThreePanelSession
  extends CoordinatedPanel<ThreePointerSample, ThreePanelHostFrame> {
  readonly runtime: DisplayRuntime;
  readonly driver: ThreePanelDriver;
  enabled: boolean;
  attach(): void;
  update(frame: ThreePanelHostFrame): void;
  render(): RenderSnapshot;
  hide(): void;
  dispose(): void;
  flushOutputs(): void;
  getPointerState(pointerId: string): PointerPresentationState | undefined;
}

/** Create a coordinated lifecycle wrapper around a Three panel driver. */
export function createThreePanelSession(options: ThreePanelSessionOptions): ThreePanelSession {
  let attached = false;
  let disposed = false;
  let latestFrameTimestamp = 0;
  let enabled = options.enabled ?? true;

  const session: ThreePanelSession = {
    key: options.key,
    runtime: options.runtime,
    driver: options.driver,
    get enabled() {
      return enabled;
    },
    set enabled(nextEnabled) {
      if (disposed) {
        return;
      }
      if (enabled === nextEnabled) {
        return;
      }
      enabled = nextEnabled;
      if (!enabled && !disposed) {
        options.driver.clearPointer(undefined, latestFrameTimestamp);
        options.driver.host.mesh.visible = false;
        session.flushOutputs();
      }
    },
    attach() {
      assertNotDisposed("attach");
      if (attached) {
        return;
      }
      options.driver.attach();
      attached = true;
    },
    update(frame) {
      assertNotDisposed("update");
      if (!attached) {
        throw new Error("Cannot update a detached Three panel session. Call attach() first.");
      }
      validateFrameTimestamp(frame.timestamp, latestFrameTimestamp);
      latestFrameTimestamp = frame.timestamp;
      if (!session.enabled) {
        options.driver.clearPointer(undefined, frame.timestamp);
        options.driver.host.mesh.visible = false;
        options.runtime.tick(frame.timestamp);
        session.flushOutputs();
        return;
      }
      options.driver.update(frame);
      session.flushOutputs();
    },
    render() {
      assertNotDisposed("render");
      const snapshot = options.driver.render();
      session.flushOutputs();
      return snapshot;
    },
    hide() {
      if (disposed) {
        return;
      }
      enabled = false;
      options.driver.clearPointer(undefined, latestFrameTimestamp);
      options.driver.host.mesh.visible = false;
      session.flushOutputs();
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      enabled = false;
      attached = false;
      options.driver.dispose();
      session.flushOutputs();
    },
    process(sample, frame) {
      assertNotDisposed("process input through");
      latestFrameTimestamp = Math.max(latestFrameTimestamp, frame.timestamp, sample.timestamp);
      if (!session.enabled) {
        options.driver.clearPointer(sample.pointerId, frame.timestamp);
        session.flushOutputs();
        return {
          claimed: false,
          blocked: false
        };
      }

      const result = options.driver.processPointer(sample, frame);
      session.flushOutputs();
      return {
        claimed: result.claimed,
        blocked: result.blocked
      };
    },
    clearPointer(pointerId) {
      if (disposed) {
        return;
      }
      options.driver.clearPointer(pointerId, latestFrameTimestamp);
      session.flushOutputs();
    },
    flushOutputs() {
      if (!options.outputHandler) {
        return;
      }

      for (const output of options.runtime.takeOutputs()) {
        options.outputHandler(output, session);
      }
    },
    getPointerState(pointerId) {
      return options.driver.getPointerState(pointerId);
    }
  };

  return session;

  function assertNotDisposed(operation: string): void {
    if (disposed) {
      throw new Error(`Cannot ${operation} a disposed Three panel session.`);
    }
  }
}

function validateFrameTimestamp(timestamp: number, previousTimestamp: number): void {
  if (!Number.isFinite(timestamp)) {
    throw new TypeError("Three panel frame timestamps must be finite monotonic milliseconds.");
  }
  if (timestamp < previousTimestamp) {
    throw new RangeError("Three panel frame timestamps must be monotonic.");
  }
}
