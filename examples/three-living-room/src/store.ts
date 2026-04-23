export type MovementIntent =
  | "forward"
  | "back"
  | "strafeLeft"
  | "strafeRight"
  | "turnLeft"
  | "turnRight";

export interface MovementIntentState {
  forward: boolean;
  back: boolean;
  strafeLeft: boolean;
  strafeRight: boolean;
  turnLeft: boolean;
  turnRight: boolean;
}

export interface RoomDemoState {
  lightOn: boolean;
  xrActive: boolean;
  moveSpeed: number;
  movement: MovementIntentState;
}

export type RoomDemoAction =
  | {
      type: "light.set";
      value: boolean;
    }
  | {
      type: "xr.set";
      value: boolean;
    }
  | {
      type: "movement.set";
      intent: MovementIntent;
      active: boolean;
    }
  | {
      type: "moveSpeed.adjust";
      delta: number;
    };

export interface RoomDemoStore {
  getState(): RoomDemoState;
  dispatch(action: RoomDemoAction): RoomDemoState;
  subscribe(listener: () => void): () => void;
}

const DEFAULT_MOVEMENT: MovementIntentState = {
  forward: false,
  back: false,
  strafeLeft: false,
  strafeRight: false,
  turnLeft: false,
  turnRight: false
};

const DEFAULT_STATE: RoomDemoState = {
  lightOn: true,
  xrActive: false,
  moveSpeed: 1.9,
  movement: { ...DEFAULT_MOVEMENT }
};

export function reduceRoomDemoState(
  state: RoomDemoState,
  action: RoomDemoAction
): RoomDemoState {
  switch (action.type) {
    case "light.set":
      return state.lightOn === action.value
        ? state
        : {
            ...state,
            lightOn: action.value
          };
    case "xr.set":
      return state.xrActive === action.value
        ? state
        : {
            ...state,
            xrActive: action.value
          };
    case "movement.set":
      return state.movement[action.intent] === action.active
        ? state
        : {
            ...state,
            movement: {
              ...state.movement,
              [action.intent]: action.active
            }
          };
    case "moveSpeed.adjust": {
      const nextSpeed = clampSpeed(state.moveSpeed + action.delta);
      return nextSpeed === state.moveSpeed
        ? state
        : {
            ...state,
            moveSpeed: nextSpeed
          };
    }
  }
}

export function createRoomDemoStore(
  initialState: Partial<RoomDemoState> = {}
): RoomDemoStore {
  let state: RoomDemoState = {
    ...DEFAULT_STATE,
    ...initialState,
    movement: {
      ...DEFAULT_MOVEMENT,
      ...initialState.movement
    }
  };
  const listeners = new Set<() => void>();

  return {
    getState() {
      return state;
    },
    dispatch(action) {
      const nextState = reduceRoomDemoState(state, action);
      if (nextState === state) {
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

function clampSpeed(value: number): number {
  return Math.max(0.8, Math.min(3.2, Number(value.toFixed(2))));
}
