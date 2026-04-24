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

adapter.controller.setText("status", "Online");
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
- `PanelInteractor` for app-owned pointer pipelines
- screen, XR ray, and direct-touch pointer-source helpers

See [`examples/three-living-room`](../examples/three-living-room) for a fuller end-to-end example.

## Roadmap Links

If you need a feature that is not shipped yet, check the relevant plan doc first:

- [plan-browser-hosts.md](./plan-browser-hosts.md)
- [plan-movable-components.md](./plan-movable-components.md)
- [plan-panel-coordination.md](./plan-panel-coordination.md)
- [plan-presentation-variants.md](./plan-presentation-variants.md)
- [plan-embedded-surface-input.md](./plan-embedded-surface-input.md)
