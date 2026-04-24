import "./styles.css";
import * as THREE from "three";
import { VRButton } from "three/examples/jsm/webxr/VRButton.js";
import {
  createEmbeddedSurfaceService,
  createHudPanelDriver,
  createPoseAnchoredPanelDriver,
  createRuntime,
  createScenePanelDriver,
  type ActionEvent,
  type ChangeRequestEvent,
  type DisplayRuntime,
  type RuntimeOutput,
  type SurfaceMetrics,
  type ThreePanelDriver,
  type ThreePointerSample
} from "../../../src/index.js";
import {
  routePointerSample,
  type CoordinatedPanel
} from "./coordinator.js";
import {
  createXrHudRoot,
  createWallMirrorRoot,
  createWallPictureRoot,
  createRoomPanelRoot,
  getXrHudSurface,
  getXrHudTheme,
  getWallMirrorSurface,
  getWallMirrorTheme,
  getWallPictureSurface,
  getWallPictureTheme,
  getRoomPanelSurface,
  getRoomPanelTheme
} from "./panel-ui.js";
import {
  REAR_VIEW_SOURCE_ID,
  clearMirrorSurface,
  publishMirrorSurface
} from "./mirror.js";
import {
  createShaderPicturePresenter,
  createShaderPictureSource
} from "./shader-picture.js";
import { createLivingRoomScene } from "./room.js";
import {
  createRoomDemoStore,
  type MovementIntent,
  type RoomDemoAction,
  type RoomDemoState
} from "./store.js";

type ScreenPointerSample = ThreePointerSample & {
  transport: "screen";
};

const room = createLivingRoomScene();
const store = createRoomDemoStore();
const app = document.querySelector<HTMLDivElement>("#app");
if (!app) {
  throw new Error("Unable to find the demo root element.");
}

const wrapper = document.createElement("div");
wrapper.className = "living-room-demo";
app.append(wrapper);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = false;
renderer.xr.enabled = true;
wrapper.append(renderer.domElement);

const xrEntry = document.createElement("div");
xrEntry.className = "xr-entry";
xrEntry.append(VRButton.createButton(renderer));
wrapper.append(xrEntry);

const mirrorCanvas = document.createElement("canvas");
mirrorCanvas.width = room.mirrorSize.width;
mirrorCanvas.height = room.mirrorSize.height;
const mirrorRenderer = new THREE.WebGLRenderer({
  canvas: mirrorCanvas,
  antialias: false,
  alpha: true,
  preserveDrawingBuffer: true
});
mirrorRenderer.setPixelRatio(1);
mirrorRenderer.setSize(room.mirrorSize.width, room.mirrorSize.height, false);

const sharedSurfaces = createEmbeddedSurfaceService();

interface RuntimeBinding {
  runtime: DisplayRuntime;
  sync(state: RoomDemoState): void;
  refresh(state: RoomDemoState): void;
}

interface StaticRuntimeBinding {
  runtime: DisplayRuntime;
  refresh(): void;
}

interface DriverBinding {
  key: "desktop-hud" | "xr-hud" | "tv" | "arm" | "wall-mirror" | "wall-picture";
  runtime: DisplayRuntime;
  driver: ThreePanelDriver;
  enabled: boolean;
  update(frame: THREEFrame): void;
  render(): void;
  hide(): void;
}

interface THREEFrame {
  scene: THREE.Scene;
  camera: THREE.Camera;
  anchorPose?: {
    position: { x: number; y: number; z: number };
    orientation: { x: number; y: number; z: number; w: number };
  };
  surfaceMetrics?: Partial<SurfaceMetrics>;
}

const desktopHudBinding = createRuntimeBinding("hud");
const tvBinding = createRuntimeBinding("tv");
const armBinding = createRuntimeBinding("arm");
const xrHudBinding = createXrHudRuntimeBinding();
const wallMirrorBinding = createWallMirrorRuntimeBinding();
const wallPictureBinding = createWallPictureRuntimeBinding();

const desktopHudDriverBinding = createDesktopHudDriverBinding(desktopHudBinding.runtime);
const tvDriverBinding = createTvDriverBinding(tvBinding.runtime);
const armDriverBinding = createArmDriverBinding(armBinding.runtime);
const xrHudDriverBinding = createXrHudDriverBinding(xrHudBinding.runtime);
const wallMirrorDriverBinding = createWallMirrorDriverBinding(wallMirrorBinding.runtime);
const wallPictureDriverBinding = createWallPictureDriverBinding(wallPictureBinding.runtime);

desktopHudDriverBinding.driver.attach();
tvDriverBinding.driver.attach();
armDriverBinding.driver.attach();
xrHudDriverBinding.driver.attach();
wallMirrorDriverBinding.driver.attach();
wallPictureDriverBinding.driver.attach();

const shaderPictureSource = createShaderPictureSource();
const shaderPicturePresenter = createShaderPicturePresenter(wallPictureDriverBinding.driver.host.mesh);

const pressedKeys = new Set<string>();
let lookActive = false;
let yaw = 0;
let pitch = -0.08;
let lastFrameTime = performance.now();
let latestPointerNdc = new THREE.Vector2();
let lastLookPoint:
  | {
      x: number;
      y: number;
    }
  | undefined;
const pendingScreenSamples: ScreenPointerSample[] = [];

interface XrControllerState {
  handedness: XRHandedness | "none";
  selectStarted: boolean;
  selectEnded: boolean;
  selectActive: boolean;
}

interface XrControllerBinding {
  index: number;
  controller: THREE.XRTargetRaySpace;
  grip: THREE.XRGripSpace;
  state: XrControllerState;
}

const xrBindings: XrControllerBinding[] = [0, 1].map((index) => ({
  index,
  controller: renderer.xr.getController(index),
  grip: renderer.xr.getControllerGrip(index),
  state: {
    handedness: "none",
    selectStarted: false,
    selectEnded: false,
    selectActive: false
  }
}));

const xrPointerVisual = createXrPointerVisual(room.scene);

for (const binding of xrBindings) {
  room.scene.add(binding.controller);
  room.scene.add(binding.grip);
  binding.controller.addEventListener("connected", (event) => {
    const data = (event as { data?: { handedness?: XRHandedness } }).data;
    binding.state.handedness = data?.handedness ?? "none";
  });
  binding.controller.addEventListener("disconnected", () => {
    binding.state.handedness = "none";
    binding.state.selectStarted = false;
    binding.state.selectEnded = false;
    binding.state.selectActive = false;
  });
  binding.controller.addEventListener("selectstart", () => {
    binding.state.selectStarted = true;
    binding.state.selectActive = true;
  });
  binding.controller.addEventListener("selectend", () => {
    binding.state.selectEnded = true;
    binding.state.selectActive = false;
  });
}

const desktopPanels: CoordinatedPanel<ScreenPointerSample, THREEFrame>[] = [
  toCoordinatedPanel(desktopHudDriverBinding),
  toCoordinatedPanel(tvDriverBinding)
];
const xrPanels: CoordinatedPanel<ThreePointerSample, THREEFrame>[] = [
  toCoordinatedPanel(armDriverBinding),
  toCoordinatedPanel(tvDriverBinding)
];

store.subscribe(() => {
  const state = store.getState();
  syncRuntimeBindings(state);
  room.applyState(state);
  if (isXrPresentationActive()) {
    desktopHudDriverBinding.driver.clearPointer();
    xrHudDriverBinding.driver.clearPointer();
  } else {
    armDriverBinding.driver.clearPointer();
  }
});
const initialState = store.getState();
syncRuntimeBindings(initialState);
room.applyState(initialState);

renderer.xr.addEventListener("sessionstart", () => {
  dispatchStoreAction({
    type: "xr.set",
    value: true
  });
});
renderer.xr.addEventListener("sessionend", () => {
  dispatchStoreAction({
    type: "xr.set",
    value: false
  });
});

window.addEventListener("keydown", (event) => {
  if (pressedKeys.has(event.code)) {
    return;
  }

  pressedKeys.add(event.code);
  syncMovementFromKeyboard(event.code);
});
window.addEventListener("keyup", (event) => {
  pressedKeys.delete(event.code);
  syncMovementFromKeyboard(event.code);
});
window.addEventListener("blur", () => {
  for (const code of [...pressedKeys]) {
    pressedKeys.delete(code);
    syncMovementFromKeyboard(code);
  }
  lookActive = false;
  lastLookPoint = undefined;
});

window.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});
renderer.domElement.addEventListener("mousedown", (event) => {
  const shiftLeftLook = event.button === 0 && event.shiftKey;
  if (event.button === 2 || shiftLeftLook) {
    lookActive = true;
    lastLookPoint = {
      x: event.clientX,
      y: event.clientY
    };
    event.preventDefault();
    return;
  }
  if (event.button !== 0 || isXrPresentationActive()) {
    return;
  }
  latestPointerNdc.copy(getNdcFromMouseEvent(event, renderer.domElement));
  pendingScreenSamples.push(createScreenSample("down", event.timeStamp, latestPointerNdc));
});
window.addEventListener("mouseup", (event) => {
  if (event.button === 2 || (event.button === 0 && lookActive)) {
    lookActive = false;
    lastLookPoint = undefined;
    return;
  }
  if (event.button !== 0 || isXrPresentationActive()) {
    return;
  }
  latestPointerNdc.copy(getNdcFromMouseEvent(event, renderer.domElement));
  pendingScreenSamples.push(createScreenSample("up", event.timeStamp, latestPointerNdc));
});
window.addEventListener("mousemove", (event) => {
  latestPointerNdc.copy(getNdcFromMouseEvent(event, renderer.domElement));
  const rightButtonDown = (event.buttons & 2) === 2;
  const shiftLeftLook = event.shiftKey && (event.buttons & 1) === 1;
  if (!isXrPresentationActive() && (rightButtonDown || shiftLeftLook)) {
    const deltaX = event.clientX - (lastLookPoint?.x ?? event.clientX);
    const deltaY = event.clientY - (lastLookPoint?.y ?? event.clientY);
    yaw -= deltaX * 0.0035;
    pitch = THREE.MathUtils.clamp(pitch - deltaY * 0.0025, -1.2, 1.2);
    lookActive = true;
    lastLookPoint = {
      x: event.clientX,
      y: event.clientY
    };
    event.preventDefault();
    return;
  } else if (lookActive) {
    lookActive = false;
    lastLookPoint = undefined;
  }
  if (isXrPresentationActive()) {
    return;
  }
  pendingScreenSamples.push(createScreenSample("move", event.timeStamp, latestPointerNdc));
});
renderer.domElement.addEventListener("mouseleave", (event) => {
  if (isXrPresentationActive()) {
    return;
  }
  pendingScreenSamples.push(createScreenSample("cancel", event.timeStamp, latestPointerNdc));
});

window.addEventListener("resize", () => {
  room.camera.aspect = window.innerWidth / window.innerHeight;
  room.camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

renderer.setAnimationLoop(() => {
  const xrActive = isXrPresentationActive();
  syncXrPresentationState(xrActive);
  const now = performance.now();
  const deltaSeconds = Math.min((now - lastFrameTime) / 1000, 0.05);
  lastFrameTime = now;
  const state = store.getState();
  syncRuntimeBindings(state);

  if (!xrActive) {
    updateDesktopCamera(deltaSeconds, state);
  } else {
    // Keep the app-facing camera in step with the current XR pose before any
    // HUD or mirror placement work that happens outside renderer.render().
    renderer.xr.updateCamera(room.camera);
  }

  const viewerCamera = room.camera;

  room.syncRearViewCamera(viewerCamera);
  const desktopHudVisible = desktopHudDriverBinding.driver.host.mesh.visible;
  const xrHudVisible = xrHudDriverBinding.driver.host.mesh.visible;
  const armVisible = armDriverBinding.driver.host.mesh.visible;
  desktopHudDriverBinding.driver.host.mesh.visible = false;
  xrHudDriverBinding.driver.host.mesh.visible = false;
  armDriverBinding.driver.host.mesh.visible = false;
  mirrorRenderer.render(room.scene, room.rearViewCamera);
  desktopHudDriverBinding.driver.host.mesh.visible = desktopHudVisible;
  xrHudDriverBinding.driver.host.mesh.visible = xrHudVisible;
  armDriverBinding.driver.host.mesh.visible = armVisible;
  publishMirrorSurface(sharedSurfaces, REAR_VIEW_SOURCE_ID, mirrorCanvas, now);
  shaderPictureSource.render(renderer, now);
  shaderPictureSource.publish(sharedSurfaces, now);
  desktopHudBinding.refresh(state);
  xrHudBinding.refresh();
  wallMirrorBinding.refresh();
  wallPictureBinding.refresh();

  const baseFrame: THREEFrame = {
    scene: room.scene,
    camera: viewerCamera
  };

  tvDriverBinding.enabled = true;
  tvDriverBinding.update(baseFrame);
  wallMirrorDriverBinding.enabled = true;
  wallMirrorDriverBinding.update(baseFrame);
  wallPictureDriverBinding.enabled = true;
  wallPictureDriverBinding.update(baseFrame);

  if (xrActive) {
    desktopHudDriverBinding.enabled = false;
    desktopHudDriverBinding.hide();

    const headPose = resolveHeadPose(viewerCamera);
    xrHudDriverBinding.enabled = Boolean(headPose);
    xrHudDriverBinding.update(
      headPose
        ? {
            ...baseFrame,
            anchorPose: headPose
          }
        : baseFrame
    );

    const armPose = resolveArmPose();
    armDriverBinding.enabled = Boolean(armPose);
    armDriverBinding.update(
      armPose
        ? {
            ...baseFrame,
            anchorPose: armPose
          }
        : baseFrame
    );
  } else {
    desktopHudDriverBinding.enabled = true;
    desktopHudDriverBinding.update({
      ...baseFrame,
      surfaceMetrics: getDesktopSurfaceMetrics()
    });

    armDriverBinding.enabled = false;
    armDriverBinding.hide();
    xrHudDriverBinding.enabled = false;
    xrHudDriverBinding.hide();
  }

  if (xrActive) {
    let pointerVisualUpdated = false;
    const armPose = resolveArmPose();
    const xrFrame = armPose
      ? {
          ...baseFrame,
          anchorPose: armPose
        }
      : baseFrame;
    for (const sample of consumeXrSamples(now)) {
      const routing = routePointerSample(xrPanels, sample, xrFrame);
      if (sample.pointerId === "xr-ray" && sample.transport === "ray") {
        updateXrPointerVisual(sample, routing.ownerKey);
        pointerVisualUpdated = true;
      }
    }
    if (!pointerVisualUpdated) {
      xrPointerVisual.hide();
    }
  } else {
    xrPointerVisual.hide();
    while (pendingScreenSamples.length > 0) {
      const sample = pendingScreenSamples.shift();
      if (!sample) {
        continue;
      }
      routePointerSample(desktopPanels, sample, baseFrame);
    }
  }

  tickActiveRuntime(tvDriverBinding, now);
  tickActiveRuntime(wallMirrorDriverBinding, now);
  tickActiveRuntime(wallPictureDriverBinding, now);
  if (desktopHudDriverBinding.enabled) {
    tickActiveRuntime(desktopHudDriverBinding, now);
  }
  if (xrHudDriverBinding.enabled) {
    tickActiveRuntime(xrHudDriverBinding, now);
  }
  if (armDriverBinding.enabled) {
    tickActiveRuntime(armDriverBinding, now);
  }

  tvDriverBinding.render();
  wallMirrorDriverBinding.render();
  wallPictureDriverBinding.render();
  shaderPicturePresenter.update(wallPictureDriverBinding.driver.host);
  desktopHudDriverBinding.render();
  xrHudDriverBinding.render();
  if (armDriverBinding.enabled) {
    armDriverBinding.render();
  }

  renderer.render(room.scene, viewerCamera);
});

function createRuntimeBinding(
  variant: "hud" | "tv" | "arm"
): RuntimeBinding {
  let lastRenderKey = "";
  const runtime = createRuntime({
    root: createRoomPanelRoot(variant, store.getState()),
    surface: getRoomPanelSurface(variant),
    theme: getRoomPanelTheme(variant),
    services: {
      surfaces: sharedSurfaces
    }
  });

  return {
    runtime,
    sync(state) {
      const nextRenderKey = JSON.stringify({
        variant,
        state
      });
      if (nextRenderKey === lastRenderKey) {
        return;
      }

      lastRenderKey = nextRenderKey;
      runtime.setRoot(createRoomPanelRoot(variant, state));
    },
    refresh(state) {
      runtime.setRoot(createRoomPanelRoot(variant, state));
    }
  };
}

function createXrHudRuntimeBinding(): StaticRuntimeBinding {
  const runtime = createRuntime({
    root: createXrHudRoot(),
    surface: getXrHudSurface(),
    theme: getXrHudTheme(),
    services: {
      surfaces: sharedSurfaces
    }
  });

  return {
    runtime,
    refresh() {
      runtime.setRoot(createXrHudRoot());
    }
  };
}

function createDesktopHudDriverBinding(runtime: DisplayRuntime): DriverBinding {
  const driver = createHudPanelDriver({
    runtime,
    surface: getRoomPanelSurface("hud"),
    distance: 0.68,
    sizing: "viewport"
  });

  return createDriverBinding("desktop-hud", driver, runtime);
}

function createXrHudDriverBinding(runtime: DisplayRuntime): DriverBinding {
  const driver = createPoseAnchoredPanelDriver({
    runtime,
    surface: getXrHudSurface(),
    panelWidth: 0.17,
    panelHeight: 0.095625,
    tiltRadians: 0,
    offset: { x: 0.08, y: 0.02, z: -0.42 }
  });

  return createDriverBinding("xr-hud", driver, runtime);
}

function createTvDriverBinding(runtime: DisplayRuntime): DriverBinding {
  const driver = createScenePanelDriver({
    runtime,
    surface: getRoomPanelSurface("tv"),
    panelWidth: 1.44,
    panelHeight: 0.92,
    position: room.tvAnchor.position,
    quaternion: room.tvAnchor.quaternion
  });

  return createDriverBinding("tv", driver, runtime);
}

function createWallMirrorRuntimeBinding(): StaticRuntimeBinding {
  const runtime = createRuntime({
    root: createWallMirrorRoot(),
    surface: getWallMirrorSurface(),
    theme: getWallMirrorTheme(),
    services: {
      surfaces: sharedSurfaces
    }
  });

  return {
    runtime,
    refresh() {
      runtime.setRoot(createWallMirrorRoot());
    }
  };
}

function createWallPictureRuntimeBinding(): StaticRuntimeBinding {
  const runtime = createRuntime({
    root: createWallPictureRoot(),
    surface: getWallPictureSurface(),
    theme: getWallPictureTheme(),
    services: {
      surfaces: sharedSurfaces
    }
  });

  return {
    runtime,
    refresh() {
      runtime.setRoot(createWallPictureRoot());
    }
  };
}

function createWallMirrorDriverBinding(runtime: DisplayRuntime): DriverBinding {
  const driver = createScenePanelDriver({
    runtime,
    surface: getWallMirrorSurface(),
    panelWidth: 0.86,
    panelHeight: 0.54,
    position: room.mirrorAnchor.position,
    quaternion: room.mirrorAnchor.quaternion
  });

  return createDriverBinding("wall-mirror", driver, runtime);
}

function createWallPictureDriverBinding(runtime: DisplayRuntime): DriverBinding {
  const driver = createScenePanelDriver({
    runtime,
    surface: getWallPictureSurface(),
    panelWidth: 1.12,
    panelHeight: 0.7,
    position: room.pictureAnchor.position,
    quaternion: room.pictureAnchor.quaternion
  });

  return createDriverBinding("wall-picture", driver, runtime);
}

function createArmDriverBinding(runtime: DisplayRuntime): DriverBinding {
  const driver = createPoseAnchoredPanelDriver({
    runtime,
    surface: getRoomPanelSurface("arm"),
    panelWidth: 0.48,
    panelHeight: 0.34,
    tiltRadians: -Math.PI * 0.24,
    offset: { x: 0.04, y: 0.05, z: -0.03 }
  });

  return createDriverBinding("arm", driver, runtime);
}

function createDriverBinding(
  key: "desktop-hud" | "xr-hud" | "tv" | "arm" | "wall-mirror" | "wall-picture",
  driver: ThreePanelDriver,
  runtime: DisplayRuntime
): DriverBinding {
  return {
    key,
    runtime,
    driver,
    enabled: true,
    update(frame) {
      if (!this.enabled) {
        this.hide();
        return;
      }
      if ((key === "arm" || key === "xr-hud") && !frame.anchorPose) {
        this.hide();
        return;
      }
      driver.host.update({
        scene: frame.scene,
        camera: frame.camera,
        ...(frame.anchorPose ? { anchorPose: frame.anchorPose } : {}),
        ...(frame.surfaceMetrics ? { surfaceMetrics: frame.surfaceMetrics } : {})
      });
    },
    render() {
      if (!this.enabled) {
        return;
      }
      driver.render();
      flushRuntimeOutputs(runtime);
    },
    hide() {
      driver.clearPointer();
      driver.host.mesh.visible = false;
    }
  };
}

function toCoordinatedPanel<TSample extends ThreePointerSample>(
  binding: DriverBinding
): CoordinatedPanel<TSample, THREEFrame> {
  return {
    key: binding.key,
    get enabled() {
      return binding.enabled;
    },
    process(sample, frame) {
      const result = binding.driver.interactor.process(sample, {
        scene: frame.scene,
        camera: frame.camera,
        ...(frame.anchorPose ? { anchorPose: frame.anchorPose } : {}),
        ...(frame.surfaceMetrics ? { surfaceMetrics: frame.surfaceMetrics } : {})
      });
      flushRuntimeOutputs(binding.runtime);
      return {
        claimed: result.claimed,
        blocked: result.blocked
      };
    },
    clearPointer(pointerId) {
      binding.driver.clearPointer(pointerId);
    }
  };
}

function flushRuntimeOutputs(runtime: DisplayRuntime): void {
  for (const output of runtime.takeOutputs()) {
    applyRuntimeOutput(output, store.getState());
  }
}

function applyRuntimeOutput(output: RuntimeOutput, state: RoomDemoState): void {
  if (output.type === "change-request") {
    const request = output as ChangeRequestEvent<unknown>;
    if (request.field === "lightOn" && typeof request.value === "boolean") {
      dispatchStoreAction({
        type: "light.set",
        value: request.value
      });
    }
    return;
  }

  if (output.type !== "action") {
    return;
  }

  const action = output as ActionEvent;
  if (action.actionId === "light.toggle") {
    dispatchStoreAction({
      type: "light.set",
      value: !state.lightOn
    });
    return;
  }

  if (action.actionId === "movement.set") {
    const intent = action.payload?.intent;
    const active = action.payload?.active;
    if (isMovementIntent(intent) && typeof active === "boolean") {
      dispatchStoreAction({
        type: "movement.set",
        intent,
        active
      });
    }
    return;
  }

  if (action.actionId === "moveSpeed.adjust") {
    const delta = action.payload?.delta;
    if (typeof delta === "number" && Number.isFinite(delta)) {
      dispatchStoreAction({
        type: "moveSpeed.adjust",
        delta
      });
    }
  }
}

function dispatchStoreAction(action: RoomDemoAction): void {
  store.dispatch(action);
}

function updateDesktopCamera(deltaSeconds: number, state: RoomDemoState): void {
  const speed = state.moveSpeed;
  const turnSpeed = 1.6;
  const move = new THREE.Vector3();
  if (state.movement.forward) {
    move.z += 1;
  }
  if (state.movement.back) {
    move.z -= 1;
  }
  if (state.movement.strafeLeft) {
    move.x -= 1;
  }
  if (state.movement.strafeRight) {
    move.x += 1;
  }

  if (state.movement.turnLeft) {
    yaw += turnSpeed * deltaSeconds;
  }
  if (state.movement.turnRight) {
    yaw -= turnSpeed * deltaSeconds;
  }

  const euler = new THREE.Euler(pitch, yaw, 0, "YXZ");
  room.camera.quaternion.setFromEuler(euler);

  if (move.lengthSq() > 0) {
    move.normalize().multiplyScalar(speed * deltaSeconds);
    const forward = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, yaw, 0, "YXZ"));
    const right = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, yaw, 0, "YXZ"));
    room.camera.position.addScaledVector(forward, move.z);
    room.camera.position.addScaledVector(right, move.x);
  }

  room.camera.position.y = 1.65;
  room.camera.position.x = THREE.MathUtils.clamp(room.camera.position.x, -2.3, 2.3);
  room.camera.position.z = THREE.MathUtils.clamp(room.camera.position.z, -2.2, 2.45);
  room.camera.updateMatrixWorld(true);
}

function createScreenSample(
  phase: ScreenPointerSample["phase"],
  timestamp: number,
  ndc: THREE.Vector2
): ScreenPointerSample {
  return {
    pointerId: "desktop-pointer",
    pointerType: "mouse",
    transport: "screen",
    phase,
    timestamp,
    ndcX: ndc.x,
    ndcY: ndc.y
  };
}

function getNdcFromMouseEvent(
  event: MouseEvent,
  element: HTMLElement
): THREE.Vector2 {
  const rect = element.getBoundingClientRect();
  return new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -(((event.clientY - rect.top) / rect.height) * 2 - 1)
  );
}

function resolveArmPose(): THREEFrame["anchorPose"] | undefined {
  return resolveGripPose("left");
}

function resolveHeadPose(camera: THREE.Camera): THREEFrame["anchorPose"] | undefined {
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  camera.getWorldPosition(position);
  camera.getWorldQuaternion(quaternion);
  return {
    position: {
      x: position.x,
      y: position.y,
      z: position.z
    },
    orientation: {
      x: quaternion.x,
      y: quaternion.y,
      z: quaternion.z,
      w: quaternion.w
    }
  };
}

function resolveGripPose(
  preferredHand: XRHandedness
): THREEFrame["anchorPose"] | undefined {
  const binding =
    resolveXrBinding((entry) => entry.state.handedness === preferredHand) ??
    resolveXrBinding((entry) => entry.state.handedness === "none");
  if (!binding) {
    return undefined;
  }

  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  binding.grip.getWorldPosition(position);
  binding.grip.getWorldQuaternion(quaternion);
  return {
    position: {
      x: position.x,
      y: position.y,
      z: position.z
    },
    orientation: {
      x: quaternion.x,
      y: quaternion.y,
      z: quaternion.z,
      w: quaternion.w
    }
  };
}

function consumeXrSamples(timestamp: number): ThreePointerSample[] {
  const binding =
    resolveXrBinding((entry) => entry.state.handedness === "right") ??
    resolveXrBinding((entry) => entry.state.handedness === "none");
  const samples: ThreePointerSample[] = [];
  if (!binding) {
    return samples;
  }

  const origin = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  binding.controller.getWorldPosition(origin);
  binding.controller.getWorldQuaternion(quaternion);
  const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion).normalize();

  samples.push({
    pointerId: "xr-ray",
    pointerType: "ray",
    transport: "ray",
    phase: "move",
    timestamp,
    handedness: binding.state.handedness,
    origin: { x: origin.x, y: origin.y, z: origin.z },
    direction: { x: direction.x, y: direction.y, z: direction.z }
  });

  if (binding.state.selectStarted) {
    samples.push({
      pointerId: "xr-ray",
      pointerType: "ray",
      transport: "ray",
      phase: "down",
      timestamp,
      handedness: binding.state.handedness,
      origin: { x: origin.x, y: origin.y, z: origin.z },
      direction: { x: direction.x, y: direction.y, z: direction.z }
    });
    binding.state.selectStarted = false;
  }

  if (binding.state.selectEnded) {
    samples.push({
      pointerId: "xr-ray",
      pointerType: "ray",
      transport: "ray",
      phase: "up",
      timestamp,
      handedness: binding.state.handedness,
      origin: { x: origin.x, y: origin.y, z: origin.z },
      direction: { x: direction.x, y: direction.y, z: direction.z }
    });
    binding.state.selectEnded = false;
  }

  return samples;
}

function updateXrPointerVisual(
  sample: ThreePointerSample,
  ownerKey: string | undefined
): void {
  if (!sample.origin || !sample.direction) {
    xrPointerVisual.hide();
    return;
  }

  const origin = new THREE.Vector3(sample.origin.x, sample.origin.y, sample.origin.z);
  const direction = new THREE.Vector3(
    sample.direction.x,
    sample.direction.y,
    sample.direction.z
  ).normalize();
  const activeBinding =
    resolveXrBinding((entry) => entry.state.handedness === "right") ??
    resolveXrBinding((entry) => entry.state.handedness === "none");
  const pointerState = ownerKey ? getPointerStateForOwner(ownerKey, sample.pointerId) : undefined;
  const hitDistance =
    pointerState?.hit?.length && Number.isFinite(pointerState.hit.length)
      ? pointerState.hit.length
      : undefined;
  const lineLength = hitDistance ?? 3.5;
  const hitPoint = hitDistance
    ? origin.clone().addScaledVector(direction, hitDistance)
    : undefined;

  xrPointerVisual.update({
    origin,
    direction,
    lineLength,
    active: activeBinding?.state.selectActive ?? false,
    hovering: Boolean(pointerState?.hit),
    ...(hitPoint ? { hitPoint } : {})
  });
}

function getPointerStateForOwner(
  ownerKey: string,
  pointerId: string
): ReturnType<ThreePanelDriver["getPointerState"]> {
  switch (ownerKey) {
    case "arm":
      return armDriverBinding.driver.getPointerState(pointerId);
    case "tv":
      return tvDriverBinding.driver.getPointerState(pointerId);
    case "xr-hud":
      return xrHudDriverBinding.driver.getPointerState(pointerId);
    case "desktop-hud":
      return desktopHudDriverBinding.driver.getPointerState(pointerId);
    default:
      return undefined;
  }
}

function createXrPointerVisual(scene: THREE.Scene): {
  update(options: {
    origin: THREE.Vector3;
    direction: THREE.Vector3;
    lineLength: number;
    hitPoint?: THREE.Vector3;
    active: boolean;
    hovering: boolean;
  }): void;
  hide(): void;
} {
  const lineMaterial = new THREE.LineBasicMaterial({
    color: "#38bdf8",
    transparent: true,
    opacity: 0.95
  });
  const lineGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(),
    new THREE.Vector3(0, 0, -1)
  ]);
  const line = new THREE.Line(lineGeometry, lineMaterial);
  line.visible = false;
  scene.add(line);

  const hitMarker = new THREE.Mesh(
    new THREE.SphereGeometry(0.012, 20, 20),
    new THREE.MeshBasicMaterial({
      color: "#ffffff",
      transparent: true,
      opacity: 0.95
    })
  );
  hitMarker.visible = false;
  scene.add(hitMarker);

  const points = lineGeometry.getAttribute("position");

  return {
    update({ origin, direction, lineLength, hitPoint, active, hovering }) {
      const end = origin.clone().addScaledVector(direction, lineLength);
      if (!("setXYZ" in points) || typeof points.setXYZ !== "function") {
        return;
      }
      points.setXYZ(0, origin.x, origin.y, origin.z);
      points.setXYZ(1, end.x, end.y, end.z);
      points.needsUpdate = true;
      lineGeometry.computeBoundingSphere();
      line.visible = true;
      lineMaterial.color.set(active ? "#f59e0b" : hovering ? "#22c55e" : "#38bdf8");

      if (hitPoint) {
        hitMarker.visible = true;
        hitMarker.position.copy(hitPoint);
        (hitMarker.material as THREE.MeshBasicMaterial).color.set(
          active ? "#f59e0b" : "#ffffff"
        );
      } else {
        hitMarker.visible = false;
      }
    },
    hide() {
      line.visible = false;
      hitMarker.visible = false;
    }
  };
}

function resolveXrBinding(
  predicate: (binding: XrControllerBinding) => boolean
): XrControllerBinding | undefined {
  return xrBindings.find(predicate);
}

function tickActiveRuntime(binding: DriverBinding, timestamp: number): void {
  binding.runtime.tick(timestamp);
  flushRuntimeOutputs(binding.runtime);
}

function syncRuntimeBindings(
  state: RoomDemoState
): void {
  desktopHudBinding.sync(state);
  tvBinding.sync(state);
  armBinding.sync(state);
}

function isXrPresentationActive(): boolean {
  return renderer.xr.isPresenting || renderer.xr.getSession() !== null;
}

function syncXrPresentationState(xrActive: boolean): void {
  if (store.getState().xrActive === xrActive) {
    return;
  }

  dispatchStoreAction({
    type: "xr.set",
    value: xrActive
  });
}

function isMovementIntent(value: unknown): value is MovementIntent {
  return (
    value === "forward" ||
    value === "back" ||
    value === "strafeLeft" ||
    value === "strafeRight" ||
    value === "turnLeft" ||
    value === "turnRight"
  );
}

function getDesktopSurfaceMetrics(): Partial<SurfaceMetrics> {
  const size = new THREE.Vector2();
  renderer.getSize(size);
  return {
    width: size.x,
    height: size.y,
    pixelDensity: renderer.getPixelRatio()
  };
}

function syncMovementFromKeyboard(code: string): void {
  for (const intent of KEY_TO_INTENT.get(code) ?? []) {
    dispatchStoreAction({
      type: "movement.set",
      intent,
      active: KEY_BINDINGS[intent].some((entry) => pressedKeys.has(entry))
    });
  }
}

const KEY_BINDINGS: Record<MovementIntent, readonly string[]> = {
  forward: ["KeyW", "ArrowUp"],
  back: ["KeyS", "ArrowDown"],
  strafeLeft: ["KeyA"],
  strafeRight: ["KeyD"],
  turnLeft: ["ArrowLeft"],
  turnRight: ["ArrowRight"]
};

const KEY_TO_INTENT = new Map<string, MovementIntent[]>();
for (const [intent, keys] of Object.entries(KEY_BINDINGS) as Array<[MovementIntent, readonly string[]]>) {
  for (const key of keys) {
    const existing = KEY_TO_INTENT.get(key);
    if (existing) {
      existing.push(intent);
      continue;
    }
    KEY_TO_INTENT.set(key, [intent]);
  }
}

window.addEventListener("beforeunload", () => {
  desktopHudDriverBinding.driver.detach();
  tvDriverBinding.driver.detach();
  armDriverBinding.driver.detach();
  xrHudDriverBinding.driver.detach();
  wallMirrorDriverBinding.driver.detach();
  wallPictureDriverBinding.driver.detach();
  shaderPicturePresenter.dispose();
  shaderPictureSource.dispose();
  mirrorRenderer.dispose();
  clearMirrorSurface(sharedSurfaces, REAR_VIEW_SOURCE_ID);
  shaderPictureSource.unpublish(sharedSurfaces);
});
