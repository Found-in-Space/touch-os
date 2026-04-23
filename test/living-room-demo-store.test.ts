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
        xrActive: false
      },
      {
        type: "light.set",
        value: true
      }
    );

    expect(next).toEqual({
      lightOn: true,
      xrActive: false
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
});
