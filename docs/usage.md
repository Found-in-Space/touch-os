# Usage

This document shows the supported integration patterns for `touch-os` today.

## Choose An Authoring Style

`touch-os` supports two authoring styles:

- direct code-authored trees built from component factories or custom components
- declarative schema documents compiled through the schema adapter

Most behavior-rich surfaces should start with direct code-authored trees. The schema adapter is best when the surface needs serialization, whole-document replacement, or tool generation.

## Create A Runtime From Built-In Components

```ts
import {
  createButton,
  createColumn,
  createRuntime,
  createSlider
} from "@found-in-space/touch-os";

const root = createColumn("settings", {
  gap: 12,
  children: [
    createButton("sync", {
      label: "Sync",
      actionId: "sync.run"
    }),
    createSlider("brightness", {
      label: "Brightness",
      field: "brightness",
      value: 35,
      min: 0,
      max: 100,
      step: 5
    })
  ]
});

const runtime = createRuntime({
  root,
  surface: { width: 320, height: 180 }
});

const snapshot = runtime.render();
```

`snapshot.commands` is the host-facing render output. A host can rasterize those commands into a canvas, texture, or other retained surface.

## Fit Content To The Surface

Use `createSurfaceShell` for full-surface pages that need to survive different panel sizes, HUD safe areas, or XR tablet dimensions. The shell keeps optional header and footer regions fixed and gives the remaining height to a scrollable body.

```ts
import {
  createButton,
  createSection,
  createSlider,
  createSurfaceShell,
  createTextLabel,
  createToggle
} from "@found-in-space/touch-os";

const root = createSurfaceShell("settings", {
  padding: 12,
  header: createTextLabel("settings-title", {
    text: "Settings"
  }),
  footer: createButton("settings-save", {
    label: "Save",
    actionId: "settings.save"
  }),
  children: [
    createSection("settings-display", {
      title: "Display",
      children: [
        createToggle("settings-labels", {
          label: "Show Labels",
          field: "showLabels",
          value: true
        }),
        createSlider("settings-brightness", {
          label: "Brightness",
          field: "brightness",
          value: 45,
          min: 0,
          max: 100,
          step: 5
        })
      ]
    })
  ]
});
```

Guidelines:

- Start every full-panel app page with `createSurfaceShell`.
- Keep persistent controls in `header` or `footer`.
- Put variable lists, forms, and sections in `children`; the body scrolls when needed.
- Use fixed heights only for content with a real aspect or data need, such as media and graphs.
- Let hosts call `runtime.resize()` or pass updated surface metrics when the display size changes.

## Define A Touch App

Use the app bundle contracts when a panel shell or future window manager needs to launch standardized apps without exposing host details to the app.

```ts
import {
  createButton,
  createSurfaceShell,
  createTextLabel,
  defineTouchApp
} from "@found-in-space/touch-os";

export const SettingsApp = defineTouchApp({
  manifest: {
    id: "space.found.settings",
    name: "Settings",
    version: "1.0.0",
    preferredWindow: {
      width: 360,
      height: 260,
      minWidth: 280,
      minHeight: 200,
      resizable: true
    }
  },
  createApp(ctx) {
    return {
      render() {
        return createSurfaceShell("settings-root", {
          header: createTextLabel("settings-title", {
            text: "Settings"
          }),
          children: [
            createButton("settings-sync", {
              label: "Sync",
              actionId: "settings.sync"
            })
          ]
        });
      },
      handleOutput(output) {
        if (output.type === "action" && output.actionId === "settings.sync") {
          ctx.actions.emit({
            type: "app-action",
            appId: ctx.appId,
            instanceId: ctx.instanceId,
            windowId: ctx.windowId,
            name: "sync"
          });
        }
      }
    };
  }
});
```

Register apps explicitly with `createTouchAppRegistry([SettingsApp])`. The app context exposes surface metrics, theme, action emission, window requests, optional storage, and optional embedded-surface publication; it does not expose Three.js, WebXR sessions, DOM events, controller rays, or scene placement.

The app bundle contract is standardized packaging and lifecycle for trusted same-runtime modules. It is not a security sandbox.

## Create A Simple Controls App

Use `defineControlsApp` for common control/status panels. The helper creates the manifest, default preferred surface, surface shell, scroll layout, safe-area padding, and default app-event routing.

```ts
import {
  createTouchAppRuntime,
  defineControlsApp
} from "@found-in-space/touch-os";

const RoomControlsApp = defineControlsApp<RoomState>({
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

Generated controls emit `app-change` for field changes and `app-action` for buttons. The app still returns DisplayNodes; it never draws directly.

`createTouchAppRuntime().takeOutputs()` reports those app-level events by default. Pass `forwardRuntimeOutputs: true` only when a host intentionally wants raw control outputs as well.

## Host Apps In A Window Manager

Use `createWindowManager` when a panel should behave like an app host. Same-runtime mode renders registered app roots inside the panel runtime and scopes app component ids before mounting them.

```ts
import {
  createRuntime,
  createTouchAppRegistry,
  createWindowManager
} from "@found-in-space/touch-os";

const registry = createTouchAppRegistry([SettingsApp]);

const root = createWindowManager("tablet-os", {
  registry,
  appHostMode: "same-runtime",
  launcher: true,
  taskSwitcher: true,
  initialWindows: [
    {
      id: "settings-window",
      appId: "space.found.settings",
      instanceId: "settings-1",
      title: "Settings",
      rect: { x: 24, y: 24, width: 360, height: 260 },
      zIndex: 1,
      mode: "normal",
      focused: true,
      movable: true,
      resizable: true
    }
  ]
});

const runtime = createRuntime({
  root,
  surface: { width: 1024, height: 720 }
});
```

`initialWindows` seeds the panel OS session. After mount, the manager owns live window state for launch, focus, move, resize, minimize, restore, fullscreen, and close. Persist state by observing `window-manager-change` outputs; remount with a new manager id when you intentionally want a fresh seed.

App render state is resolved with `getAppState(window)` first, then by `appStates[instanceId]`, `appStates[windowId]`, and `appStates[appId]`. Key shared app state by app id when launcher-created windows should reuse the same external state.

The launcher and task switcher render above app windows by default. Set `utilityWindows: "back"` for the older behind-app behavior, or `utilityWindows: "none"` to suppress built-in utility windows even if `launcher` or `taskSwitcher` are enabled.

Same-runtime id scoping covers built-in components and the standard `child`/`children`, `header`, `footer`, and dock-slot structural props. Use child-runtime mode when hosting arbitrary app trees or custom components that store child nodes under non-standard prop names.

For OS-style isolation, switch to child-runtime mode:

```ts
const root = createWindowManager("tablet-os", {
  registry,
  appHostMode: "child-runtime",
  initialWindows
});
```

In child-runtime mode, each app session owns a `DisplayRuntime`. The app shell publishes each child runtime as an embedded surface and forwards viewport input into the child runtime in session-local coordinates. App instances still receive local ids such as `"settings-sync"` in `handleOutput`, while hosts consume the public app contract: app events arrive as `app-event`, and window manager requests arrive as `window-manager-change`.

Apps should communicate outward by calling `ctx.actions.emit(...)` from `handleOutput`; hosts should listen for `app-event`. Set `forwardAppOutputs: true` only when the host intentionally wants transparent raw child-runtime outputs with component ids scoped to the app window.

## Run Apps In Tablet Home Mode

Use `createAppShell` and `createTabletHomePresentation` for a home-screen shell with full-screen foreground apps.

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

The tablet shell starts on the home screen, launches apps from registry icons, renders the foreground app without desktop chrome, and routes `home`/`app-switcher` system commands at the shell level. Tablet task switchers can optionally show session close controls with `taskCloseControl: "button"`.

Foreground apps receive the available app area after tablet safe area and shell chrome are applied. The tablet presentation consumes the outer safe area, so app-local `ctx.surface.safeArea` is zero unless a custom presentation explicitly returns remaining local insets.

The existing manager API can use the same presentation:

```ts
const root = createWindowManager("tablet-os", {
  registry,
  presentation: createTabletHomePresentation(),
  appHostMode: "child-runtime",
  homeKey: true
});
```

## Map Host Home Keys

Hosts should translate platform input to `system-command` input events instead of special-casing presentations:

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
- wrist or hardware home gesture -> `home`

The runtime dispatches system commands to the root component first. App shells consume supported commands; normal leaf controls ignore them.

## Feed Input And Consume Outputs

The runtime accepts normalized input rather than DOM or XR-native event objects.

```ts
runtime.dispatchInput({
  type: "pointer-down",
  surfaceX: 24,
  surfaceY: 24,
  timestamp: 1
});

runtime.dispatchInput({
  type: "pointer-up",
  surfaceX: 24,
  surfaceY: 24,
  timestamp: 2
});

for (const output of runtime.takeOutputs()) {
  if (output.type === "action" && output.actionId === "sync.run") {
    runSync();
  }

  if (output.type === "change-request" && output.field === "brightness") {
    setBrightness(output.value as number);
  }
}
```

The important pattern is:

- runtime emits intent
- application owns domain state changes
- application creates the next root or updates shared services when state changes

## Replace The Root When External State Changes

`touch-os` is designed for controlled application state.

```ts
function renderSettings(state: { brightness: number }) {
  return createColumn("settings", {
    gap: 12,
    children: [
      createSlider("brightness", {
        label: "Brightness",
        field: "brightness",
        value: state.brightness,
        min: 0,
        max: 100,
        step: 5
      })
    ]
  });
}

const runtime = createRuntime({
  root: renderSettings({ brightness: 35 }),
  surface: { width: 320, height: 180 }
});

runtime.setRoot(renderSettings({ brightness: 55 }));
```

## Build A Custom Component

Custom components use the same runtime contract as built-in components.

```ts
import {
  createNode,
  type DisplayComponent,
  type DisplayNode
} from "@found-in-space/touch-os/core";

interface StatusChipProps {
  text: string;
}

const StatusChipComponent: DisplayComponent<StatusChipProps> = {
  kind: "status-chip",
  measure(ctx) {
    return {
      width: ctx.constraints.maxWidth,
      height: 32
    };
  },
  render(ctx) {
    const theme = ctx.services.theme.getTokens();
    return [
      {
        type: "rect",
        componentId: ctx.id,
        role: "status-chip-background",
        rect: ctx.bounds,
        fill: theme.surfaceColor,
        stroke: theme.borderColor,
        strokeWidth: 1,
        radius: theme.radius
      },
      {
        type: "text",
        componentId: ctx.id,
        role: "status-chip-label",
        rect: ctx.bounds,
        text: ctx.props.text,
        color: theme.textColor,
        align: "center",
        verticalAlign: "middle",
        fontSize: theme.typography.fontSize,
        fontWeight: theme.typography.fontWeight
      }
    ];
  }
};

function createStatusChip(id: string, props: StatusChipProps): DisplayNode<StatusChipProps> {
  return createNode(id, StatusChipComponent, props);
}
```

When you need richer rendering, you can also use:

- the bitmap service for runtime-managed raster content
- the embedded-surface service for externally owned live surfaces

## Use The Embedded-Surface Service

Embedded surfaces are components backed by published sources.

```ts
import {
  createEmbeddedSurface,
  createEmbeddedSurfaceService,
  createRuntime
} from "@found-in-space/touch-os";

const surfaces = createEmbeddedSurfaceService();

const runtime = createRuntime({
  root: createEmbeddedSurface("rear-camera", {
    sourceId: "camera.rear",
    title: "Rear Camera",
    interactive: true,
    acceptsForwardedInput: true,
    compositionMode: "composite"
  }),
  services: { surfaces },
  surface: { width: 480, height: 320 }
});

surfaces.publish("camera.rear", {
  available: true,
  handle: someExternalSurfaceHandle,
  sourceWidth: 1920,
  sourceHeight: 1080,
  aspectRatio: 1920 / 1080
});
```

One published `sourceId` may be referenced by more than one presentation. The current forwarding model is presentation-scoped; richer source-bound input is tracked in [plan-embedded-surface-input.md](./plan-embedded-surface-input.md).

## Use The Schema Adapter

The schema adapter compiles a document to a normal runtime root plus a controller API.

```ts
import { createRuntime } from "@found-in-space/touch-os";
import { createSchemaAdapter } from "@found-in-space/touch-os/adapters/schema";

const adapter = createSchemaAdapter("settings-shell", {
  version: 1,
  pages: [
    {
      id: "main",
      items: [
        {
          kind: "text",
          id: "status",
          text: "Offline"
        },
        {
          kind: "button",
          id: "sync",
          label: "Sync",
          actionId: "sync.run"
        }
      ]
    }
  ]
});

const runtime = createRuntime({
  root: adapter.root,
  surface: { width: 320, height: 180 }
});

adapter.controller.setText({ itemId: "status", slot: "text" }, "Online");
adapter.controller.replaceItem("sync", {
  kind: "button",
  id: "sync",
  label: "Sync Again",
  actionId: "sync.run"
});
```

You can also register custom schema kinds when you need declarative access to app-specific components without pushing those components into core.

## Drive The Runtime Through A Generic Host

If you are building your own host, the generic contract is intentionally small:

```ts
import type {
  DisplayRuntime,
  HostAdapter,
  HostFrame
} from "@found-in-space/touch-os";

function createHost(runtime: DisplayRuntime): HostAdapter {
  return {
    attach() {},
    update(frame: HostFrame) {
      runtime.resize({
        width: frame.viewport.width,
        height: frame.viewport.height
      });

      for (const event of frame.events ?? []) {
        runtime.dispatchInput(event);
      }
    },
    detach() {}
  };
}
```

That is enough for a canvas host, a texture-backed scene host, or a test harness.

## Use Movable Windows

Use `createWindowLayer` when a panel needs surface-local windows with explicit rects, z-order, drag handles, and optional chrome controls.

```ts
import {
  createButton,
  createRuntime,
  createWindow,
  createWindowLayer
} from "@found-in-space/touch-os";

const root = createWindowLayer("tablet-windows", {
  constraintPadding: 8,
  windows: [
    createWindow("settings-window", {
      title: "Settings",
      rect: { x: 24, y: 24, width: 320, height: 220 },
      controls: ["minimize", "maximize", "close"],
      child: createButton("sync", {
        label: "Sync",
        actionId: "settings.sync"
      })
    })
  ]
});

const runtime = createRuntime({
  root,
  surface: { width: 640, height: 420 }
});
```

The layer keeps live window rect, mode, focus, and z-order as runtime session state. Apps can persist changes by consuming `window-state-change` outputs and storing the emitted `rect`, `zIndex`, and `mode`.

## Coordinate Multiple Panels

Use the coordination helper when more than one panel can receive samples from the same pointer source.

```ts
import {
  createPanelCoordinator,
  type CoordinatedPanel,
  type PointerSampleLike
} from "@found-in-space/touch-os/coordination";

type PointerSample = PointerSampleLike & {
  phase: "move" | "down" | "up" | "cancel";
};

interface Frame {
  timestamp: number;
}

const panels: CoordinatedPanel<PointerSample, Frame>[] = [
  hudPanel,
  tabletPanel,
  wallPanel
];

const coordinator = createPanelCoordinator({ panels });

for (const sample of pointerSamples) {
  const routing = coordinator.route(sample, frame);
  updatePointerVisual(sample.pointerId, routing.ownerKey);
}
```

Panels are processed in array order. If a panel misses without blocking, lower-priority panels get the same sample in the same routing step. Once a panel claims a pointer, the coordinator keeps routing that pointer to the owner until an `up` or `cancel` phase is observed.

## Use The Three.js Host Package

The current first-class host integration is `@found-in-space/touch-os/hosts/three`.

```ts
import * as THREE from "three";
import { createRuntime, createTextLabel } from "@found-in-space/touch-os";
import { createScenePanelHost } from "@found-in-space/touch-os/hosts/three";

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera();

const runtime = createRuntime({
  root: createTextLabel("title", { text: "Navigation Panel" }),
  surface: { width: 1024, height: 640 }
});

const host = createScenePanelHost({
  runtime,
  parent: scene,
  panelWidth: 1.2,
  panelHeight: 0.75,
  renderOnUpdate: true
});

host.attach();
host.update({ scene, camera });
```

For more advanced Three.js integrations, the host package also includes:

- pose-anchored panel hosts
- tablet and HUD helpers
- panel drivers
- `createThreePanelSession` for wrapping a runtime and driver as a coordinated panel that flushes outputs
- `PanelInteractor` for app-owned pointer pipelines
- screen, XR ray, and direct-touch pointer-source helpers

When multiple Three panels share a pointer source, pass sessions directly to `createPanelCoordinator`:

```ts
const session = createThreePanelSession({
  key: "tablet",
  runtime,
  driver,
  outputHandler(output) {
    handlePanelOutput(output);
  }
});

const coordinator = createPanelCoordinator({
  panels: [session]
});
```

See [`examples/three-living-room`](../examples/three-living-room) for a fuller end-to-end example.

## Roadmap Links

If you need a feature that is not shipped yet, check the relevant plan doc first:

- [plan-browser-hosts.md](./plan-browser-hosts.md)
- [plan-presentation-variants.md](./plan-presentation-variants.md)
- [plan-embedded-surface-input.md](./plan-embedded-surface-input.md)
