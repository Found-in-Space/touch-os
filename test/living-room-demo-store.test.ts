import { describe, expect, it } from "vitest";
import {
  createRoomDemoStore,
  reduceRoomDemoState
} from "../examples/three-living-room/src/store.js";

describe("living room demo store", () => {
  it("reduces explicit light actions into external room state", () => {
    const next = reduceRoomDemoState(
      {
        lightOn: false,
        xrActive: false,
        moveSpeed: 1.9,
        movement: {
          forward: false,
          back: false,
          strafeLeft: false,
          strafeRight: false,
          turnLeft: false,
          turnRight: false
        }
      },
      {
        type: "light.set",
        value: true
      }
    );

    expect(next).toEqual({
      lightOn: true,
      xrActive: false,
      moveSpeed: 1.9,
      movement: {
        forward: false,
        back: false,
        strafeLeft: false,
        strafeRight: false,
        turnLeft: false,
        turnRight: false
      }
    });
  });

  it("notifies subscribers when light state changes", () => {
    const store = createRoomDemoStore({
      lightOn: true
    });
    let notifications = 0;
    const unsubscribe = store.subscribe(() => {
      notifications += 1;
    });

    store.dispatch({
      type: "light.set",
      value: false
    });

    expect(store.getState()).toMatchObject({
      lightOn: false
    });
    expect(notifications).toBe(1);

    unsubscribe();
  });

  it("tracks semantic movement intent changes", () => {
    const next = reduceRoomDemoState(createRoomDemoStore().getState(), {
      type: "movement.set",
      intent: "forward",
      active: true
    });

    expect(next.movement.forward).toBe(true);
    expect(next.movement.turnLeft).toBe(false);
  });

  it("clamps speed adjustments into a usable range", () => {
    const store = createRoomDemoStore({
      moveSpeed: 3.1
    });

    store.dispatch({
      type: "moveSpeed.adjust",
      delta: 1
    });
    expect(store.getState().moveSpeed).toBe(3.2);

    store.dispatch({
      type: "moveSpeed.adjust",
      delta: -10
    });
    expect(store.getState().moveSpeed).toBe(0.8);
  });
});
