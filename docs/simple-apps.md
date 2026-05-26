# Simple Apps

`defineControlsApp` is the shortest path for common control and status panels. It builds a standard touch app with manifest, default surface sizing, shell layout, scroll behavior, and output routing.

```ts
import {
  createTouchAppRuntime,
  defineControlsApp
} from "@found-in-space/touch-os";

interface RoomState {
  lightOn: boolean;
  xrActive: boolean;
  moveSpeed: number;
}

export const RoomControlsApp = defineControlsApp<RoomState>({
  id: "space.found.room.controls",
  name: "Room",
  controls: ({ toggle, status, slider }) => [
    toggle("Lamp", "lightOn"),
    status("Mode", (state) => state.xrActive ? "XR" : "Desktop"),
    slider("Speed", "moveSpeed", { min: 0.2, max: 4, step: 0.2 })
  ]
});

const runtime = createTouchAppRuntime({
  app: RoomControlsApp,
  state,
  surface: { width: 320, height: 180 },
  onAppEvent(event) {
    dispatch(event);
  }
});
```

The generated app returns DisplayNodes. It never draws directly.

`createTouchAppRuntime().takeOutputs()` returns app-level `app-event` outputs by default. Set `forwardRuntimeOutputs: true` only when the host also needs the raw control outputs such as `change-request` and `action`.

When the host receives new application state, update the single-app runtime explicitly:

```ts
runtime.setAppState(nextState);
```

## Controls

The builder supports:

- `toggle(label, field)`
- `status(label, read)`
- `button(label, actionId)`
- `slider(label, field, { min, max, step })`
- `section(title, children)`

The generated root uses `createSurfaceShell`, safe-area padding, a scrollable body, touch-friendly row heights, and standard theme tokens.

## Default Events

Field controls emit `app-change`:

```ts
{
  type: "app-change",
  appId: ctx.appId,
  instanceId: ctx.instanceId,
  windowId: ctx.windowId,
  name: "lightOn.change",
  payload: {
    field: "lightOn",
    value: true
  }
}
```

Buttons emit `app-action`:

```ts
{
  type: "app-action",
  appId: ctx.appId,
  instanceId: ctx.instanceId,
  windowId: ctx.windowId,
  name: "room.reset",
  payload
}
```

`onChange` and `onAction` hooks can observe or supplement the default behavior.

## Run Anywhere

The same generated app can run:

- alone on one surface with `createTouchAppRuntime`
- in desktop movable windows with `createWindowManager`
- in tablet home mode with `createAppShell` and `createTabletHomePresentation`

App code does not need to know whether it is running as a HUD, tablet app, child runtime, desktop window, or nested surface.
