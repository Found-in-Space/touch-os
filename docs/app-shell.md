# App Shell

`touch-os` apps are host-neutral modules:

```text
manifest + lifecycle + render(state) => DisplayNode
```

An app shell manages registered apps, running sessions, foreground/background state, home behavior, task switching, and output routing. Presentation skins decide how sessions are shown; they do not define draw-command semantics.

## Desktop Window Mode

`createWindowManager` remains the compatibility API for movable windows. Internally it delegates to the app shell with the desktop presentation.

```ts
import {
  createRuntime,
  createTouchAppRegistry,
  createWindowManager
} from "@found-in-space/touch-os";

const registry = createTouchAppRegistry([RoomControlsApp]);

const root = createWindowManager("desktop-os", {
  registry,
  appHostMode: "child-runtime",
  launcher: true,
  taskSwitcher: true,
  homeKey: true,
  initialWindows
});

const runtime = createRuntime({
  root,
  surface: { width: 1024, height: 720 }
});
```

Desktop home command behavior:

- `home` toggles the launcher window.
- `app-switcher` toggles the task-switcher window.
- Apps can run same-runtime or child-runtime.

## Tablet Home Mode

Use `createAppShell` with `createTabletHomePresentation()` for an iPad-style home screen and full-screen foreground app.

```ts
import {
  createAppShell,
  createRuntime,
  createTabletHomePresentation,
  createTouchAppRegistry
} from "@found-in-space/touch-os";

const registry = createTouchAppRegistry([
  RoomControlsApp,
  DiagnosticsApp
]);

const root = createAppShell("tablet-os", {
  registry,
  presentation: createTabletHomePresentation({
    homeControl: "bar",
    taskSwitcher: "cards",
    taskCloseControl: "button"
  }),
  appHostMode: "child-runtime",
  homeKey: true,
  appStates: {
    [RoomControlsApp.manifest.id]: state
  }
});

const runtime = createRuntime({
  root,
  surface: { width: 1024, height: 720 }
});
```

Tablet behavior:

- The shell starts at home unless an initial foreground session is supplied.
- Home shows apps from the registry.
- Selecting an icon launches or resumes a session, activates it, and renders it full-screen.
- The foreground app has no desktop title bar, resize handle, or window controls.
- Foreground apps receive the already-available app area; the tablet presentation consumes the outer safe area and home control before updating `ctx.surface`.
- The soft home bar or button routes to the same shell home behavior as a host home key.
- `app-switcher` toggles the tablet task switcher.
- `taskCloseControl: "button"` adds close controls to tablet task cards.
- `launcherLayout` can tighten home icon tile, gap, padding, and symbol sizing for compact physical surfaces.
- By default, Home deactivates and suspends the foreground app. Pass `keepAlive: true` to deactivate without suspending.

The compatibility API can also use tablet mode:

```ts
const root = createWindowManager("tablet-os", {
  registry,
  presentation: createTabletHomePresentation(),
  appHostMode: "child-runtime",
  homeKey: true,
  keepAlive: true
});
```

## Host System Commands

Hosts normalize platform input to `SystemCommandInputEvent`:

```ts
runtime.dispatchInput({
  type: "system-command",
  command: "home",
  timestamp: performance.now(),
  source: "keyboard"
});
```

Recommended mappings:

- Meta, Windows, or Home key -> `home`
- Alt+Tab or Meta+Tab -> `app-switcher`
- XR controller menu button -> `home`
- Wrist/home gesture -> `home`

The runtime dispatches system commands to the root component first. App shells consume supported commands. Normal leaf controls ignore them, and apps do not receive system commands by default.

## Hosting Modes

`appHostMode: "same-runtime"` renders app DisplayNodes inside the shell runtime and scopes component ids.

`appHostMode: "child-runtime"` creates a child `DisplayRuntime` per app session, publishes the child snapshot as an embedded surface, and forwards surface-local input into that runtime.

Use same-runtime for trusted simple apps. Use child-runtime when apps may have custom component trees, local runtime services, or isolation needs.
