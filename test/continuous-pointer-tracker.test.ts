import { describe, expect, it } from "vitest";
import {
  createContinuousPointerTracker,
  type ContinuousPointerSnapshot
} from "../src/hosts/continuous-pointer-tracker.js";

interface TestSample extends ContinuousPointerSnapshot {
  metadata: { pressure: number };
}

describe("continuous pointer tracker", () => {
  it("cancels omitted ids and treats repeated held downs as moves", () => {
    const source = {};
    const processed: TestSample[] = [];
    const cancelled: TestSample[] = [];
    const tracker = createTracker([source]);

    tracker.reconcile(source, [sample("pointer", "down", 0.5)], push(processed), push(cancelled));
    tracker.reconcile(source, [sample("pointer", "down", 0.6)], push(processed), push(cancelled));
    tracker.reconcile(source, [sample("pointer", "move", 0.7)], push(processed), push(cancelled));
    tracker.reconcile(source, [], push(processed), push(cancelled));

    expect(processed.map((entry) => entry.phase)).toEqual(["down", "move", "move"]);
    expect(cancelled).toEqual([sample("pointer", "move", 0.7)]);
  });

  it("removes explicit cancellations and resets press state after up", () => {
    const source = {};
    const processed: TestSample[] = [];
    const cancelled: TestSample[] = [];
    const tracker = createTracker([]);

    tracker.reconcile(source, [sample("cancelled", "cancel", 0)], push(processed), push(cancelled));
    tracker.reconcile(source, [], push(processed), push(cancelled));
    tracker.reconcile(source, [sample("pointer", "down", 0.5)], push(processed), push(cancelled));
    tracker.reconcile(source, [sample("pointer", "up", 0)], push(processed), push(cancelled));
    tracker.reconcile(source, [sample("pointer", "down", 0.8)], push(processed), push(cancelled));

    expect(cancelled).toEqual([]);
    expect(processed.map((entry) => entry.phase)).toEqual([
      "cancel",
      "down",
      "up",
      "down"
    ]);
  });

  it("clears one pointer or every pointer across independent sources", () => {
    const first = {};
    const second = {};
    const cancelled: TestSample[] = [];
    const tracker = createTracker([first, second]);
    tracker.reconcile(first, [
      sample("left", "down", 0.4),
      sample("right", "down", 0.5)
    ], () => {}, push(cancelled));
    tracker.reconcile(second, [sample("other", "move", 0.6)], () => {}, push(cancelled));

    tracker.cancel("left", push(cancelled));
    expect(cancelled.map((entry) => entry.pointerId)).toEqual(["left"]);
    tracker.cancel(undefined, push(cancelled));
    expect(cancelled.map((entry) => entry.pointerId)).toEqual(["left", "right", "other"]);
  });
});

function createTracker(sources: readonly object[]) {
  return createContinuousPointerTracker<object, TestSample>(sources, (entry) => ({
    ...entry,
    metadata: { ...entry.metadata }
  }));
}

function sample(pointerId: string, phase: TestSample["phase"], pressure: number): TestSample {
  return { pointerId, phase, metadata: { pressure } };
}

function push(target: TestSample[]): (entry: TestSample) => void {
  return (entry) => target.push(entry);
}
