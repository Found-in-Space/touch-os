export interface RoomDemoState {
  lightOn: boolean;
  xrActive: boolean;
}

export type RoomDemoAction =
  | {
      type: "light.set";
      value: boolean;
    }
  | {
      type: "xr.set";
      value: boolean;
    };

export interface RoomDemoStore {
  getState(): RoomDemoState;
  dispatch(action: RoomDemoAction): RoomDemoState;
  subscribe(listener: () => void): () => void;
}

const DEFAULT_STATE: RoomDemoState = {
  lightOn: true,
  xrActive: false
};

export function reduceRoomDemoState(
  state: RoomDemoState,
  action: RoomDemoAction
): RoomDemoState {
  switch (action.type) {
    case "light.set":
      return {
        ...state,
        lightOn: action.value
      };
    case "xr.set":
      return {
        ...state,
        xrActive: action.value
      };
  }
}

export function createRoomDemoStore(
  initialState: Partial<RoomDemoState> = {}
): RoomDemoStore {
  let state: RoomDemoState = {
    ...DEFAULT_STATE,
    ...initialState
  };
  const listeners = new Set<() => void>();

  return {
    getState() {
      return state;
    },
    dispatch(action) {
      const nextState = reduceRoomDemoState(state, action);
      if (
        nextState.lightOn === state.lightOn &&
        nextState.xrActive === state.xrActive
      ) {
        return state;
      }

      state = nextState;
      for (const listener of listeners) {
        listener();
      }
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
  };
}
