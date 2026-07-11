import * as THREE from "three";
import {
  createRuntime,
  type RuntimeOutput
} from "@found-in-space/touch-os";
import {
  createNode,
  rectContainsPoint,
  type DisplayComponent,
  type DisplayNode,
  type DisplayRuntime,
  type RuntimeInvalidationSource
} from "@found-in-space/touch-os/core";
import {
  createButton,
  createEmbeddedSurface,
  createSlider,
  createTextLabel,
  createToggle
} from "@found-in-space/touch-os/components";
import {
  createColumn,
  createSection,
  createSurfaceShell,
  createWindow,
  createWindowLayer
} from "@found-in-space/touch-os/containers";
import {
  createEmbeddedSurfaceService,
  createThemeService
} from "@found-in-space/touch-os/services";
import {
  createTouchAppRegistry,
  createTouchAppRuntime,
  defineControlsApp,
  defineTouchApp,
  type TouchAppEvent
} from "@found-in-space/touch-os/apps";
import {
  createAppShell,
  createTabletHomePresentation
} from "@found-in-space/touch-os/app-shell";
import { createWindowManager } from "@found-in-space/touch-os/window-manager";
import type {
  HostAdapter,
  HostFrame
} from "@found-in-space/touch-os/hosts";
import {
  createPanelCoordinator,
  type CoordinatedPanel,
  type PointerSampleLike
} from "@found-in-space/touch-os/coordination";
import { createSchemaAdapter } from "@found-in-space/touch-os/adapters/schema";
import {
  createScenePanelDriver,
  createScenePanelHost,
  createScreenPointerSource,
  createThreePanelSession,
  type ThreePanelHostFrame,
  type ThreePointerSample
} from "@found-in-space/touch-os/hosts/three";

interface SettingsState {
  brightness: number;
  showLabels: boolean;
}

interface RoomState {
  lightOn: boolean;
  moveSpeed: number;
  xrActive: boolean;
}

const initialSettings: SettingsState = {
  brightness: 35,
  showLabels: true
};

const initialRoom: RoomState = {
  lightOn: true,
  moveSpeed: 1,
  xrActive: false
};

/** Direct component and container authoring with a responsive surface shell. */
export function createSettingsRoot(state: SettingsState): DisplayNode<unknown> {
  return createSurfaceShell("settings", {
    padding: 12,
    header: createTextLabel("settings-title", { text: "Settings" }),
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
            value: state.showLabels
          }),
          createSlider("settings-brightness", {
            label: "Brightness",
            field: "brightness",
            value: state.brightness,
            min: 0,
            max: 100,
            step: 5
          })
        ]
      })
    ]
  });
}

export const directRuntime = createRuntime({
  root: createColumn("quick-settings", {
    gap: 12,
    children: [
      createButton("sync", { label: "Sync", actionId: "sync.run" }),
      createSettingsRoot(initialSettings)
    ]
  }),
  surface: { width: 320, height: 180 }
});

/** Normalized input, output consumption, root replacement, and direct clock ownership. */
export function exerciseRuntime(runtime: DisplayRuntime): readonly RuntimeOutput[] {
  runtime.render();
  runtime.dispatchInput({
    type: "pointer-down",
    pointerId: "primary",
    pointerType: "touch",
    pressure: 0.5,
    surfaceX: 24,
    surfaceY: 24,
    timestamp: 1,
    modifiers: { altKey: false, ctrlKey: false, metaKey: false, shiftKey: false }
  });
  runtime.dispatchInput({
    type: "pointer-up",
    pointerId: "primary",
    pointerType: "touch",
    pressure: 0,
    surfaceX: 24,
    surfaceY: 24,
    timestamp: 2,
    modifiers: { altKey: false, ctrlKey: false, metaKey: false, shiftKey: false }
  });
  runtime.dispatchInput({
    type: "system-command",
    command: "home",
    source: "keyboard",
    timestamp: 3
  });
  runtime.tick(4);
  runtime.resize({ width: 360, height: 240, pixelDensity: 2 });
  runtime.setRoot(createSettingsRoot({ ...initialSettings, brightness: 55 }));
  return runtime.takeOutputs();
}

export function consumeOutputs(outputs: readonly RuntimeOutput[]): void {
  for (const output of outputs) {
    if (output.type === "action" && output.actionId === "sync.run") {
      void output.payload;
    }
    if (output.type === "change-request" && output.field === "brightness") {
      void output.value;
    }
    if (output.type === "app-event") {
      handleAppEvent(output.event);
    }
  }
}

interface StatusChipProps {
  text: string;
}

interface StatusChipState {
  updates: number;
}

/** A custom component exercising the complete public lifecycle contract. */
const StatusChipComponent: DisplayComponent<StatusChipProps, StatusChipState> = {
  kind: "status-chip",
  mount() {
    return { updates: 0 };
  },
  update(ctx) {
    ctx.state.updates += 1;
  },
  measure(ctx) {
    return { width: ctx.constraints.maxWidth, height: 32 };
  },
  layout(ctx) {
    ctx.setContentBounds(ctx.bounds);
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
        text: `${ctx.props.text} (${ctx.state.updates})`,
        color: theme.textColor,
        align: "center",
        verticalAlign: "middle",
        fontFamily: theme.typography.fontFamily,
        fontSize: theme.typography.fontSize,
        fontWeight: theme.typography.fontWeight,
        overflow: "ellipsis"
      }
    ];
  },
  hitTest(ctx) {
    return rectContainsPoint(ctx.bounds, ctx.point)
      ? { targetId: `${ctx.id}:status` }
      : null;
  },
  handleEvent(ctx) {
    if (ctx.event.type === "press") {
      ctx.invalidateRender();
    }
  },
  dispose(ctx) {
    void ctx.state.updates;
  }
};

export function createStatusChip(
  id: string,
  props: StatusChipProps
): DisplayNode<StatusChipProps, StatusChipState> {
  return createNode(id, StatusChipComponent, props);
}

/** Externally published live content stays behind the embedded-surface service. */
export function createCameraSurface(externalHandle: unknown): DisplayRuntime {
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
    handle: externalHandle,
    sourceWidth: 1920,
    sourceHeight: 1080,
    aspectRatio: 1920 / 1080
  });

  return runtime;
}

/** Declarative documents compile to the same runtime tree. */
export const schemaAdapter = createSchemaAdapter("settings-schema", {
  version: 1,
  pages: [
    {
      id: "main",
      items: [
        { kind: "text", id: "status", text: "Offline" },
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

export function updateSchema(): void {
  schemaAdapter.controller.setText({ itemId: "status", slot: "text" }, "Online");
  schemaAdapter.controller.replaceItem("sync", {
    kind: "button",
    id: "sync",
    label: "Sync Again",
    actionId: "sync.run"
  });
}

/** A generic host owns normalized frame timing and reversible attachment. */
export function createGenericHost(runtime: DisplayRuntime): HostAdapter {
  let attached = false;
  return {
    attach() {
      attached = true;
    },
    update(frame: HostFrame) {
      if (!attached) {
        return;
      }
      runtime.resize({
        width: frame.viewport.width,
        height: frame.viewport.height
      });
      for (const event of frame.events ?? []) {
        runtime.dispatchInput(event);
      }
      runtime.tick(frame.timestamp);
    },
    detach() {
      attached = false;
    },
    dispose() {
      attached = false;
      runtime.dispose();
    }
  };
}

export const SettingsApp = defineTouchApp<SettingsState>({
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
      render(state) {
        return createSettingsRoot(state);
      },
      handleOutput(output) {
        if (output.type === "action" && output.actionId === "settings.save") {
          ctx.actions.emit({ type: "app-action", name: "save" });
        }
      }
    };
  }
});

export const RoomControlsApp = defineControlsApp<RoomState>({
  id: "space.found.room.controls",
  name: "Room",
  controls: ({ toggle, status, slider, button }) => [
    toggle("Lamp", "lightOn"),
    status("Mode", (state) => state.xrActive ? "XR" : "Desktop"),
    slider("Speed", "moveSpeed", { min: 0.2, max: 4, step: 0.2 }),
    button("Reset", "room.reset")
  ]
});

export const appRegistry = createTouchAppRegistry([
  SettingsApp,
  RoomControlsApp
]);

/** Single-app, window-manager, and tablet-shell hosting modes. */
export const singleAppRuntime = createTouchAppRuntime({
  app: RoomControlsApp,
  state: initialRoom,
  surface: { width: 320, height: 180 },
  onAppEvent: handleAppEvent
});

singleAppRuntime.setAppState({ ...initialRoom, moveSpeed: 1.2 });
singleAppRuntime.takeOutputs();

export const windowManagerRoot = createWindowManager("desktop-os", {
  registry: appRegistry,
  appHostMode: "same-runtime",
  launcher: true,
  taskSwitcher: true,
  homeKey: true,
  initialWindows: [
    {
      id: "settings-window",
      appId: SettingsApp.manifest.id,
      instanceId: "settings-1",
      title: "Settings",
      rect: { x: 24, y: 24, width: 360, height: 260 },
      zIndex: 1,
      mode: "normal",
      focused: true,
      movable: true,
      resizable: true
    }
  ],
  appStates: {
    [SettingsApp.manifest.id]: initialSettings,
    [RoomControlsApp.manifest.id]: initialRoom
  },
  onAppEvent: handleAppEvent
});

export const tabletShellRoot = createAppShell("tablet-os", {
  registry: appRegistry,
  presentation: createTabletHomePresentation({
    homeControl: "bar",
    taskSwitcher: "cards",
    taskCloseControl: "button",
    launcherLayout: { tileWidth: 84, tileHeight: 96, gap: 10 }
  }),
  appHostMode: "child-runtime",
  homeKey: true,
  appStates: {
    [RoomControlsApp.manifest.id]: initialRoom
  }
});

/** Surface-local movable windows remain a runtime container feature. */
export const movableWindowsRoot = createWindowLayer("tablet-windows", {
  constraintPadding: 8,
  windows: [
    createWindow("settings-window", {
      title: "Settings",
      rect: { x: 24, y: 24, width: 320, height: 220 },
      controls: ["minimize", "maximize", "close"],
      movable: true,
      resizable: true,
      child: createStatusChip("connection-status", { text: "Online" })
    })
  ]
});

interface PointerSample extends PointerSampleLike {
  phase: "move" | "down" | "up" | "cancel";
}

interface CoordinationFrame {
  timestamp: number;
}

const coordinatedPanel: CoordinatedPanel<PointerSample, CoordinationFrame> = {
  key: "tablet",
  enabled: true,
  process(sample, frame) {
    void sample.pointerId;
    void frame.timestamp;
    return { claimed: sample.phase === "down", blocked: true };
  },
  clearPointer(pointerId) {
    void pointerId;
  }
};

export const panelCoordinator = createPanelCoordinator({
  panels: [coordinatedPanel]
});

export const routingResult = panelCoordinator.route(
  { pointerId: "primary", phase: "down" },
  { timestamp: 1 }
);

void (routingResult.panelKey ?? routingResult.ownerKey);

/** Observable and explicit invalidation paths are both public contracts. */
export function connectInvalidation(
  source: RuntimeInvalidationSource,
  runtime: DisplayRuntime
): () => void {
  return source.subscribeInvalidation((kind) => {
    if (kind === "layout") {
      runtime.invalidateLayout();
    } else {
      runtime.invalidateRender();
    }
  });
}

export function createThemedRuntime(): DisplayRuntime {
  const theme = createThemeService();
  const runtime = createRuntime({
    root: createTextLabel("status", { text: "Ready" }),
    services: { theme }
  });
  theme.update({ accentColor: "#66ccff" });
  runtime.invalidateRender();
  runtime.invalidateLayout();
  return runtime;
}

/** Three host quality, continuous pointers, coordination, and final disposal. */
export function exerciseThreeIntegration(
  scene: THREE.Scene,
  camera: THREE.Camera,
  renderer: THREE.WebGLRenderer,
  timestamp: number
): void {
  const hostRuntime = createRuntime({
    root: createTextLabel("host-title", { text: "Navigation Panel" }),
    surface: { width: 1024, height: 640 }
  });
  const host = createScenePanelHost({
    runtime: hostRuntime,
    parent: scene,
    panelWidth: 1.2,
    panelHeight: 0.75,
    renderOnUpdate: true,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    textureQuality: {
      anisotropy: renderer.capabilities.getMaxAnisotropy(),
      colorSpace: THREE.SRGBColorSpace
    }
  });
  const frame: ThreePanelHostFrame = {
    timestamp,
    scene,
    camera,
    surfaceMetrics: { width: 1024, height: 640, pixelDensity: 2 }
  };

  host.attach();
  host.update(frame);
  host.detach();
  host.attach();
  host.dispose();
  hostRuntime.dispose();

  const sessionRuntime = createRuntime({
    root: createButton("launch", { label: "Launch", actionId: "launch.run" }),
    surface: { width: 640, height: 400 }
  });
  const pointerSource = createScreenPointerSource((pointerFrame) => ({
    pointerId: "mouse",
    pointerType: "mouse",
    phase: "move",
    timestamp: pointerFrame.timestamp,
    ndcX: 0,
    ndcY: 0
  }));
  const driver = createScenePanelDriver({
    runtime: sessionRuntime,
    parent: scene,
    pointerSources: [pointerSource],
    pointerClaimPolicy: "block-on-press",
    textureQuality: {
      anisotropy: renderer.capabilities.getMaxAnisotropy()
    }
  });
  const session = createThreePanelSession({
    key: "tablet",
    runtime: sessionRuntime,
    driver,
    outputHandler(output) {
      consumeOutputs([output]);
    }
  });
  const coordinator = createPanelCoordinator<ThreePointerSample, ThreePanelHostFrame>({
    panels: [session]
  });

  session.attach();
  session.update(frame);
  session.render();
  coordinator.route({
    pointerId: "mouse",
    pointerType: "mouse",
    transport: "screen",
    phase: "move",
    timestamp,
    ndcX: 0,
    ndcY: 0
  }, frame);
  session.hide();
  session.dispose();
  sessionRuntime.dispose();
}

function handleAppEvent(event: TouchAppEvent): void {
  void event.type;
}
