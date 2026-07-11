export interface ContinuousPointerSnapshot {
  pointerId: string;
  phase: "move" | "down" | "up" | "cancel" | "scroll";
}

interface TrackedPointer<TSample> {
  sample: TSample;
  pressed: boolean;
}

export interface ContinuousPointerTracker<TSource extends object, TSample extends ContinuousPointerSnapshot> {
  reconcile(
    source: TSource,
    samples: readonly TSample[],
    process: (sample: TSample) => void,
    cancel: (lastSample: TSample) => void
  ): void;
  cancel(pointerId: string | undefined, cancel: (lastSample: TSample) => void): void;
}

/** Tracks the complete per-frame pointer snapshot owned by one or more continuous sources. */
export function createContinuousPointerTracker<
  TSource extends object,
  TSample extends ContinuousPointerSnapshot
>(
  sources: readonly TSource[],
  copySample: (sample: TSample) => TSample
): ContinuousPointerTracker<TSource, TSample> {
  const pointersBySource = new Map<TSource, Map<string, TrackedPointer<TSample>>>(
    sources.map((source) => [source, new Map<string, TrackedPointer<TSample>>()])
  );

  return {
    reconcile(source, samples, process, cancel) {
      const previous = pointersBySource.get(source) ?? new Map<string, TrackedPointer<TSample>>();
      const reportedIds = new Set(samples.map((sample) => sample.pointerId));
      for (const [pointerId, tracked] of previous) {
        if (!reportedIds.has(pointerId)) {
          cancel(tracked.sample);
          previous.delete(pointerId);
        }
      }

      for (const sample of samples) {
        const tracked = previous.get(sample.pointerId);
        const effectiveSample = sample.phase === "down" && tracked?.pressed
          ? { ...sample, phase: "move" as const } as TSample
          : sample;
        process(effectiveSample);

        if (sample.phase === "cancel") {
          previous.delete(sample.pointerId);
          continue;
        }

        previous.set(sample.pointerId, {
          sample: copySample(sample),
          pressed:
            sample.phase === "up"
              ? false
              : sample.phase === "down" || (tracked?.pressed ?? false)
        });
      }
      pointersBySource.set(source, previous);
    },
    cancel(pointerId, cancel) {
      for (const pointers of pointersBySource.values()) {
        for (const [id, tracked] of [...pointers]) {
          if (pointerId !== undefined && id !== pointerId) {
            continue;
          }
          cancel(tracked.sample);
          pointers.delete(id);
        }
      }
    }
  };
}
