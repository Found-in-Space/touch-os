import type {
  InteractionContext, InteractionDelivery, InteractionGeometry,
  InteractionHit, InteractionInput, InteractionResolver, InteractionSource, InteractionTarget,
  ResolvedInteraction
} from "./contracts.js";

export function resolveInteractionHit(source: InteractionSource, targets: readonly InteractionTarget[],
  accept?: (hit: InteractionHit, target: InteractionTarget) => boolean): InteractionHit | undefined {
  let selected: InteractionHit | undefined;
  let priority = -Infinity;
  for (const target of targets) {
    if (target.enabled?.() === false) continue;
    const hit = target.query(source);
    if (!hit || !Number.isFinite(hit.distance) || hit.distance < 0) continue;
    if (accept?.(hit, target) === false) continue;
    const nextPriority = target.priority ?? 0;
    if (!selected || nextPriority > priority || (nextPriority === priority && hit.distance < selected.distance)) {
      selected = { ...hit, targetId: target.id };
      priority = nextPriority;
    }
  }
  return selected;
}

/** One routing authority, shared by panels and aggregate scene targets. No host dependencies. */
export function createInteractionContext(options: { resolver?: InteractionResolver; dragThreshold?: number } = {}): InteractionContext {
  const targets = new Map<string, InteractionTarget>();
  const states = new Map<string, ResolvedInteraction>();
  // Cancelled inputs cannot resume a held gesture. Only a new begin can acquire ownership.
  const held = new Set<string>();
  let now = 0;
  let disposed = false;
  const resolver: InteractionResolver = options.resolver ?? { resolve: resolveInteractionHit };
  const context: InteractionContext = {
    register(target) {
      assertAlive();
      if (targets.has(target.id)) throw new Error(`Duplicate interaction target: ${target.id}`);
      targets.set(target.id, target);
      let registered = true;
      return () => {
        if (!registered) return;
        registered = false;
        context.cancelTarget(target.id);
        targets.delete(target.id);
      };
    },
    process(input) {
      assertAlive();
      if (!Number.isFinite(input.timestamp)) throw new TypeError("Interaction timestamps must be finite milliseconds.");
      now = Math.max(now, input.timestamp);
      const { source } = input;
      const previous = states.get(source.id);
      let capture = previous?.capture;
      if (capture) {
        const target = targets.get(capture.targetId);
        if (!source.tracked || target?.enabled?.() === false || !target || target.validCapture?.(capture) === false) {
          cancel(previous!, input);
          capture = undefined;
        }
      }
      const hit = source.tracked && input.phase !== "cancel"
        ? resolver.resolve(source, Array.from(targets.values())) : undefined;
      let projection: InteractionGeometry | undefined;
      if (capture) {
        const target = targets.get(capture.targetId)!;
        projection = target.project ? target.project(source, capture) ?? undefined : hit ?? undefined;
        // Aggregate targets can lose hover while retaining press; surfaces require a valid plane projection.
        if (target.project && !projection) {
          cancel(previous!, input);
          capture = undefined;
        }
      }
      if (previous?.hover && !same(previous.hover, hit)) deliver("leave", input, previous.hover, previous.hover);
      if (hit) deliver("hover", input, hit, hit);
      if (capture && (!targets.has(capture.targetId) || targets.get(capture.targetId)?.enabled?.() === false)) {
        if (previous?.capture) cancel(previous, input);
        capture = undefined; projection = undefined;
      }
      const snapshot: ResolvedInteraction = {
        source, timestamp: input.timestamp, trackingValid: source.tracked,
        hover: hit, hit, pressed: capture?.start, capture, projection
      };
      states.set(source.id, snapshot);
      if (input.phase === "cancel" || !source.tracked) {
        if (snapshot.capture) cancel(snapshot, input);
        held.delete(source.id);
        snapshot.hover = snapshot.hit = snapshot.projection = undefined;
        return snapshot;
      }
      if (input.phase === "begin" && !held.has(source.id)) {
        held.add(source.id);
        const groupBusy = Array.from(states.values()).some(s => s.source.id !== source.id && s.capture &&
          (s.source.group ?? s.source.id) === (source.group ?? source.id));
        const editorId = hit?.editorId ?? hit?.subtargetId ?? hit?.targetId;
        const target = hit ? targets.get(hit.targetId) : undefined;
        const editorBusy = target && !target.multipleEditors && Array.from(states.values()).some(s =>
          s.capture?.targetId === hit?.targetId && s.capture?.editorId === editorId);
        if (hit && editorId && target && target.enabled?.() !== false && !groupBusy && !editorBusy) {
          snapshot.capture = { sourceId: source.id, targetId: hit.targetId,
            ...(hit.subtargetId === undefined ? {} : { subtargetId: hit.subtargetId }),
            editorId, gesture: "press", start: hit };
          snapshot.pressed = hit;
          snapshot.projection = hit;
          deliver("begin", input, hit, hit);
        }
      } else if (input.phase === "move" && capture) {
        const geometry = projection ?? capture.start;
        if (Math.hypot(geometry.point.x - capture.start.point.x, geometry.point.y - capture.start.point.y,
          geometry.point.z - capture.start.point.z) >= (options.dragThreshold ?? 0.002)) capture.gesture = "drag";
        deliver("update", input, capture.start, geometry);
      } else if (input.phase === "complete") {
        held.delete(source.id);
        if (capture) {
          // Clear before callbacks: removal/disposal from a completion handler cannot cancel twice.
          snapshot.capture = undefined; snapshot.pressed = undefined;
          deliver("complete", input, capture.start, projection ?? hit ?? capture.start, same(capture.start, hit));
          if (same(capture.start, hit)) deliver("activate", input, hit!, hit!);
        }
      } else if (input.phase === "scroll" && hit) {
        deliver("scroll", input, hit, hit);
      }
      return snapshot;
    },
    frame(timestamp, sources, edges = []) {
      assertAlive();
      if (!Number.isFinite(timestamp) || timestamp < now) throw new RangeError("Frame timestamps must be monotonic milliseconds.");
      const preferred = new Map<string, InteractionSource>();
      for (const source of sources) {
        if (!source.tracked) continue;
        const group = source.group ?? source.id;
        const current = preferred.get(group);
        if (!current || (source.precedence ?? 0) > (current.precedence ?? 0)) preferred.set(group, source);
      }
      // Edges retain their own poses and queue order, including complete interactions between frames.
      for (const edge of edges) {
        const best = preferred.get(edge.source.group ?? edge.source.id);
        context.process(best && best.id !== edge.source.id && edge.phase === "begin"
          ? { ...edge, phase: "cancel" } : edge);
      }
      const present = new Set(sources.map(s => s.id));
      for (const id of states.keys()) if (!present.has(id)) {
        context.cancelSource(id, timestamp);
        context.forgetSource(id);
      }
      for (const source of sources) context.process({ source, phase: "move", timestamp });
      now = timestamp;
    },
    cancelSource(id, timestamp = now) {
      const state = states.get(id);
      if (!state) return;
      context.process({ phase: "cancel", timestamp, source: { ...state.source, tracked: false } });
    },
    forgetSource(id) {
      context.cancelSource(id);
      states.delete(id); held.delete(id);
      resolver.releaseSource?.(id);
    },
    cancelTarget(id) {
      for (const state of states.values()) {
        if (state.capture?.targetId === id) cancel(state, { phase: "cancel", source: state.source, timestamp: now });
        if (state.hover?.targetId === id) {
          deliver("leave", { phase: "cancel", source: state.source, timestamp: now }, state.hover, state.hover);
          state.hover = state.hit = state.projection = undefined;
        }
      }
    },
    getSnapshot: id => states.get(id),
    getSnapshots: () => Array.from(states.values()),
    dispose() {
      if (disposed) return;
      for (const id of states.keys()) context.forgetSource(id);
      targets.clear(); resolver.dispose?.(); disposed = true;
    }
  };
  return context;

  function assertAlive() { if (disposed) throw new Error("Interaction context is disposed."); }
  function deliver(type: InteractionDelivery["type"], input: InteractionInput, hit: InteractionHit, geometry: InteractionGeometry, activationAllowed?: boolean) {
    targets.get(hit.targetId)?.deliver({ type, input, hit, geometry,
      ...(activationAllowed === undefined ? {} : { activationAllowed }) });
  }
  function cancel(state: ResolvedInteraction, input: InteractionInput) {
    const capture = state.capture;
    state.capture = undefined; state.pressed = undefined; state.projection = undefined;
    if (capture) deliver("cancel", input, capture.start, capture.start);
  }
}
function same(a: InteractionHit | undefined, b: InteractionHit | undefined): boolean {
  return !!a && !!b && a.targetId === b.targetId && a.subtargetId === b.subtargetId;
}
