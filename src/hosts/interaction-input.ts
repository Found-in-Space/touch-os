import * as THREE from "three";
import type { InteractionInput, InteractionSource } from "../interaction/contracts.js";

export interface InteractionInputFrame { timestamp: number; xrFrame?: XRFrame }
export interface InteractionInputAdapter {
  sample(frame: InteractionInputFrame): { sources: readonly InteractionSource[]; edges: readonly InteractionInput[] };
  /** Detach cancels current input; listeners and resources are released by dispose. */
  reset(): void;
  dispose(): void;
}

/** Pointer events retain edge poses. Each canvas has its own local input identity. */
export function createDesktopInteractionInput(options: {
  element: HTMLElement;
  camera?: THREE.Camera;
  surface?: { targetId: string; width: number; height: number } | (() => { targetId: string; width: number; height: number });
  now?: () => number;
}): InteractionInputAdapter {
  const sources = new Map<number, InteractionSource>();
  const positions = new Map<number, Pick<PointerEvent, "clientX" | "clientY" | "pointerId" | "pointerType">>();
  let edges: InteractionInput[] = [];
  const prefix = `desktop:${desktopSequence++}:`;
  const now = options.now ?? (() => performance.now());
  const callbacks: [string, EventListener][] = [];
  let disposed = false;
  function listen(type: string, callback: (event: PointerEvent) => void) {
    const listener: EventListener = event => callback(event as PointerEvent);
    options.element.addEventListener(type, listener); callbacks.push([type, listener]);
  }
  function read(event: Pick<PointerEvent, "clientX" | "clientY" | "pointerId" | "pointerType">): InteractionSource {
    const rect = options.element.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width, y = (event.clientY - rect.top) / rect.height;
    const source: InteractionSource = { id: prefix + event.pointerId, pointerType: event.pointerType === "touch" ? "touch" : event.pointerType === "pen" ? "stylus" : "mouse",
      tracked: rect.width > 0 && rect.height > 0, space: "world-metres", capabilities: ["hover"] };
    const surface = typeof options.surface === "function" ? options.surface() : options.surface;
    if (surface) source.surface = { targetId: surface.targetId, x: x * surface.width, y: y * surface.height };
    else if (options.camera) {
      options.camera.updateWorldMatrix(true, false);
      const raycaster = new THREE.Raycaster(); raycaster.setFromCamera(new THREE.Vector2(x * 2 - 1, 1 - y * 2), options.camera);
      source.ray = { origin: raycaster.ray.origin.clone(), direction: raycaster.ray.direction.clone() };
    }
    return source;
  }
  for (const [type, phase] of [["pointerdown", "begin"], ["pointerup", "complete"], ["pointercancel", "cancel"], ["lostpointercapture", "cancel"], ["pointermove", "move"]] as const) {
    listen(type, event => {
      if (event.button > 0 && type !== "pointermove") return;
      const source = read(event);
      if (phase === "begin") options.element.setPointerCapture?.(event.pointerId);
      if (phase === "cancel") { source.tracked = false; sources.delete(event.pointerId); positions.delete(event.pointerId); }
      else {
        sources.set(event.pointerId, source);
        positions.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY, pointerId: event.pointerId, pointerType: event.pointerType });
      }
      if (phase !== "move") edges.push({ source, phase, timestamp: now() });
      if (phase === "complete") {
        // A successful release often causes lostpointercapture synchronously; it is harmless after completion.
        if (options.element.hasPointerCapture?.(event.pointerId)) options.element.releasePointerCapture(event.pointerId);
        if (source.pointerType === "touch") { sources.delete(event.pointerId); positions.delete(event.pointerId); }
      }
      event.preventDefault();
    });
  }
  listen("pointerleave", event => {
    if (options.element.hasPointerCapture?.(event.pointerId)) return;
    sources.delete(event.pointerId); positions.delete(event.pointerId);
  });
  const wheel: EventListener = event => {
    const e = event as WheelEvent;
    const source = read({ clientX: e.clientX, clientY: e.clientY, pointerId: 0, pointerType: "mouse" } as PointerEvent);
    const mode = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? options.element.clientHeight : 1;
    edges.push({ phase: "scroll", timestamp: now(), source, delta: { x: e.deltaX * mode, y: e.deltaY * mode } });
    e.preventDefault();
  };
  options.element.addEventListener("wheel", wheel, { passive: false }); callbacks.push(["wheel", wheel]);
  return {
    sample() {
      for (const [id, position] of positions) sources.set(id, read(position));
      const queued = edges; edges = []; return { sources: Array.from(sources.values()), edges: queued };
    },
    reset() {
      for (const source of sources.values()) edges.push({ phase: "cancel", timestamp: now(), source: { ...source, tracked: false } });
      sources.clear(); positions.clear();
    },
    dispose() {
      if (disposed) return;
      disposed = true; sources.clear(); positions.clear(); edges = [];
      for (const [type, listener] of callbacks) options.element.removeEventListener(type, listener);
    }
  };
}
let desktopSequence = 0;

/** WebXR selection completion is `select`; `selectend` alone is interruption. No gamepad polling. */
export function createWebXRInteractionInput(options: {
  xr: THREE.WebXRManager;
  origin?: THREE.Object3D;
  include?: (source: XRInputSource) => boolean;
  now?: () => number;
}): InteractionInputAdapter {
  const now = options.now ?? (() => performance.now());
  const identities = new Map<XRInputSource, string>();
  const active = new Set<XRInputSource>();
  const ended = new Map<XRInputSource, InteractionInput>();
  let sequence = 0;
  const prefix = `xr:${xrSequence++}:`;
  let edges: InteractionInput[] = [];
  let session: XRSession | null = null;
  let disposed = false;
  const slots = [0, 1].map(index => {
    const controller = options.xr.getController(index);
    const entry: { controller: typeof controller; source?: XRInputSource | undefined } = { controller };
    const connected = (event: { data: XRInputSource }) => { entry.source = event.data; };
    const disconnected = () => { entry.source = undefined; };
    controller.addEventListener("connected", connected); controller.addEventListener("disconnected", disconnected);
    return { entry, connected, disconnected };
  });
  function read(source: XRInputSource, frame?: XRFrame): InteractionSource {
    let id = identities.get(source);
    if (!id) { id = prefix + sequence++; identities.set(source, id); }
    const result: InteractionSource = { id, group: id, pointerType: "controller", tracked: false, space: "world-metres", capabilities: ["hover"] };
    const referenceSpace = options.xr.getReferenceSpace();
    const pose = frame && referenceSpace ? frame.getPose(source.targetRaySpace, referenceSpace) : null;
    const matrix = new THREE.Matrix4();
    if (frame && !pose) return result;
    if (pose) {
      matrix.fromArray(pose.transform.matrix);
      if (options.origin) { options.origin.updateWorldMatrix(true, false); matrix.premultiply(options.origin.matrixWorld); }
    } else {
      const slot = slots.find(s => s.entry.source === source)?.entry;
      if (!slot?.controller.visible) return result;
      slot.controller.updateWorldMatrix(true, false); matrix.copy(slot.controller.matrixWorld);
    }
    result.tracked = true;
    result.ray = { origin: new THREE.Vector3().setFromMatrixPosition(matrix), direction: new THREE.Vector3(0, 0, -1).transformDirection(matrix) };
    return result;
  }
  const start = (event: XRInputSourceEvent) => {
    if (options.include?.(event.inputSource) === false) return;
    // An uncompleted previous gesture must end before this new begin, even between frames.
    const interruption = ended.get(event.inputSource);
    if (interruption) { edges.push(interruption); ended.delete(event.inputSource); active.delete(event.inputSource); }
    active.add(event.inputSource);
    edges.push({ phase: "begin", timestamp: now(), source: read(event.inputSource, event.frame) });
  };
  const select = (event: XRInputSourceEvent) => {
    if (!active.delete(event.inputSource)) return;
    ended.delete(event.inputSource);
    edges.push({ phase: "complete", timestamp: now(), source: read(event.inputSource, event.frame) });
  };
  const end = (event: XRInputSourceEvent) => {
    if (active.has(event.inputSource)) ended.set(event.inputSource, {
      phase: "cancel", timestamp: now(), source: read(event.inputSource, event.frame)
    });
  };
  const lost = (event: XRInputSourcesChangeEvent) => {
    for (const source of event.removed) {
      const identity = identities.get(source);
      if (!identity) continue;
      const sample = read(source); sample.tracked = false;
      edges.push({ phase: "cancel", timestamp: now(), source: sample });
      active.delete(source); ended.delete(source); identities.delete(source);
    }
  };
  function reset() {
    for (const source of identities.keys()) edges.push({ phase: "cancel", timestamp: now(), source: { ...read(source), tracked: false } });
    active.clear(); ended.clear(); identities.clear();
  }
  const visibility = () => { if (session?.visibilityState !== "visible") reset(); };
  const stop = () => reset();
  function bind(next: XRSession | null) {
    if (session === next) return;
    if (session) {
      session.removeEventListener("selectstart", start); session.removeEventListener("select", select); session.removeEventListener("selectend", end);
      session.removeEventListener("inputsourceschange", lost); session.removeEventListener("visibilitychange", visibility); session.removeEventListener("end", stop);
      reset();
    }
    session = next;
    if (session) {
      session.addEventListener("selectstart", start); session.addEventListener("select", select); session.addEventListener("selectend", end);
      session.addEventListener("inputsourceschange", lost); session.addEventListener("visibilitychange", visibility); session.addEventListener("end", stop);
    }
  }
  const sessionStart = () => bind(options.xr.getSession());
  options.xr.addEventListener("sessionstart", sessionStart); options.xr.addEventListener("sessionend", stop);
  bind(options.xr.getSession());
  return {
    sample(frame) {
      if (disposed) return { sources: [], edges: [] };
      bind(options.xr.getSession());
      // The spec fires selectend before select on success. Defer interruption until sampling.
      for (const [source, interruption] of ended) {
        if (active.delete(source)) edges.push(interruption);
      }
      ended.clear();
      const sources = session?.visibilityState === "visible" ? Array.from(session.inputSources)
        .filter(source => options.include?.(source) !== false).map(source => read(source, frame.xrFrame ?? options.xr.getFrame?.())) : [];
      const queued = edges.sort((a, b) => a.timestamp - b.timestamp); edges = [];
      return { sources, edges: queued };
    },
    reset,
    dispose() {
      if (disposed) return;
      disposed = true; bind(null); edges = [];
      options.xr.removeEventListener("sessionstart", sessionStart); options.xr.removeEventListener("sessionend", stop);
      for (const { entry, connected, disconnected } of slots) {
        entry.controller.removeEventListener("connected", connected); entry.controller.removeEventListener("disconnected", disconnected);
      }
    }
  };
}
let xrSequence = 0;
