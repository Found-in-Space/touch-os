import "./styles.css";
import * as THREE from "three";
import { VRButton } from "three/examples/jsm/webxr/VRButton.js";
import {
  createHeldTabletDriver,
  createHudPanelDriver,
  createRuntime,
  createScenePanelDriver,
  createScenePanelHost,
  type ActionEvent,
  type ChangeRequestEvent,
  type DisplayRuntime,
  type RuntimeOutput,
  type ThreePanelDriver,
  type ThreePointerSample
} from "../../../src/index.js";
import {
  routePointerSample,
  type CoordinatedPanel
} from "./coordinator.js";
import {
  createMirrorRoot,
  createRoomPanelRoot,
  getRoomPanelSurface,
  getRoomPanelTheme
} from "./panel-ui.js";
import { MIRROR_COMPONENT_ID, clearMirrorSurface, publishMirrorSurface } from "./mirror.js";
import { createLivingRoomScene } from "./room.js";
import { createRoomDemoStore, type RoomDemoAction, type RoomDemoState } from "./store.js";

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

const overlay = document.createElement("section");
overlay.className = "demo-overlay";
overlay.innerHTML = `
  <h1>Touch OS Living Room</h1>
  <p>Walk around a simple room, touch the wall TV or HUD, and confirm both surfaces control the same lamp state.</p>
  <ul>
    <li>Desktop: <strong>WASD</strong> or <strong>arrow keys</strong> to move, <strong>left/right arrows</strong> to turn, <strong>right mouse drag</strong> or <strong>Shift + left drag</strong> to look, <strong>left click</strong> to touch panels.</li>
    <li>XR: the HUD hides, the arm panel appears, and the dominant controller ray can touch the arm panel or TV.</li>
  </ul>
  <div class="demo-status">Lamp: On</div>
`;
wrapper.append(overlay);
const statusLabel = overlay.querySelector<HTMLDivElement>(".demo-status");
if (!statusLabel) {
  throw new Error("Unable to create the demo status label.");
}

const renderer = new THREE.WebGLRenderer({
  antialias: true
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = false;
renderer.xr.enabled = true;
wrapper.append(renderer.domElement);
overlay.append(VRButton.createButton(renderer));

const mirrorCanvas = document.createElement("canvas");
mirrorCanvas.width = room.mirrorSize.width;
mirrorCanvas.height = room.mirrorSize.height;
const mirrorRenderer = new THREE.WebGLRenderer({
  canvas: mirrorCanvas,
  antialias: false,
  alpha: true
});
mirrorRenderer.setPixelRatio(1);
mirrorRenderer.setSize(room.mirrorSize.width, room.mirrorSize.height, false);

interface RuntimeBinding {
  runtime: DisplayRuntime;
  sync(state: RoomDemoState): void;
}

interface DriverBinding {
  key: "hud" | "tv" | "arm";
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
  xrPose?: {
    position: { x: number; y: number; z: number };
    orientation: { x: number; y: number; z: number; w: number };
  };
}

const hudBinding = createRuntimeBinding("hud");
const tvBinding = createRuntimeBinding("tv");
const armBinding = createRuntimeBinding("arm");
const mirrorRuntime = createRuntime({
  root: createMirrorRoot(),
  surface: getRoomPanelSurface("mirror"),
  theme: getRoomPanelTheme("mirror")
});

const hudDriverBinding = createHudDriverBinding(hudBinding.runtime);
const tvDriverBinding = createTvDriverBinding(tvBinding.runtime);
const armDriverBinding = createArmDriverBinding(armBinding.runtime);
const mirrorHost = createScenePanelHost({
  runtime: mirrorRuntime,
  surface: getRoomPanelSurface("mirror"),
  panelWidth: 0.86,
  panelHeight: 0.54,
  position: room.mirrorAnchor.position,
  quaternion: room.mirrorAnchor.quaternion
});

hudDriverBinding.driver.attach();
tvDriverBinding.driver.attach();
armDriverBinding.driver.attach();
mirrorHost.attach();

const keyboardState = new Set<string>();
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
    selectEnded: false
  }
}));

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
  });
  binding.controller.addEventListener("selectstart", () => {
    binding.state.selectStarted = true;
  });
  binding.controller.addEventListener("selectend", () => {
    binding.state.selectEnded = true;
  });
}

const desktopPanels: CoordinatedPanel<ScreenPointerSample, THREEFrame>[] = [
  toCoordinatedPanel(hudDriverBinding),
  toCoordinatedPanel(tvDriverBinding)
];
const xrPanels: CoordinatedPanel<ThreePointerSample, THREEFrame>[] = [
  toCoordinatedPanel(armDriverBinding),
  toCoordinatedPanel(tvDriverBinding)
];

store.subscribe(() => {
  const state = store.getState();
  hudBinding.sync(state);
  tvBinding.sync(state);
  armBinding.sync(state);
  room.applyState(state);
  statusLabel.textContent = `Lamp: ${state.lightOn ? "On" : "Off"}${state.xrActive ? " | XR" : ""}`;
  if (state.xrActive) {
    hudDriverBinding.driver.clearPointer();
  } else {
    armDriverBinding.driver.clearPointer();
  }
});
const initialState = store.getState();
hudBinding.sync(initialState);
tvBinding.sync(initialState);
armBinding.sync(initialState);
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
  keyboardState.add(event.code);
});
window.addEventListener("keyup", (event) => {
  keyboardState.delete(event.code);
});
window.addEventListener("blur", () => {
  keyboardState.clear();
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
  if (event.button !== 0 || store.getState().xrActive) {
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
  if (event.button !== 0 || store.getState().xrActive) {
    return;
  }
  latestPointerNdc.copy(getNdcFromMouseEvent(event, renderer.domElement));
  pendingScreenSamples.push(createScreenSample("up", event.timeStamp, latestPointerNdc));
});
window.addEventListener("mousemove", (event) => {
  latestPointerNdc.copy(getNdcFromMouseEvent(event, renderer.domElement));
  const rightButtonDown = (event.buttons & 2) === 2;
  const shiftLeftLook = event.shiftKey && (event.buttons & 1) === 1;
  if (!store.getState().xrActive && (rightButtonDown || shiftLeftLook)) {
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
  if (store.getState().xrActive) {
    return;
  }
  pendingScreenSamples.push(createScreenSample("move", event.timeStamp, latestPointerNdc));
});
renderer.domElement.addEventListener("mouseleave", (event) => {
  if (store.getState().xrActive) {
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
  const now = performance.now();
  const deltaSeconds = Math.min((now - lastFrameTime) / 1000, 0.05);
  lastFrameTime = now;
  const state = store.getState();

  if (!state.xrActive) {
    updateDesktopCamera(deltaSeconds);
  }

  const viewerCamera = state.xrActive
    ? renderer.xr.getCamera()
    : room.camera;

  room.syncRearViewCamera(viewerCamera);
  mirrorRenderer.render(room.scene, room.rearViewCamera);
  publishMirrorSurface(
    mirrorRuntime.getServices().surfaces,
    MIRROR_COMPONENT_ID,
    mirrorCanvas,
    now
  );

  const baseFrame: THREEFrame = {
    scene: room.scene,
    camera: viewerCamera
  };

  tvDriverBinding.enabled = true;
  tvDriverBinding.update(baseFrame);

  if (state.xrActive) {
    hudDriverBinding.enabled = false;
    hudDriverBinding.hide();
    const armPose = resolveArmPose();
    armDriverBinding.enabled = Boolean(armPose);
    armDriverBinding.update(
      armPose
        ? {
            ...baseFrame,
            xrPose: armPose
          }
        : baseFrame
    );
  } else {
    armDriverBinding.enabled = false;
    armDriverBinding.hide();
    hudDriverBinding.enabled = true;
    hudDriverBinding.update(baseFrame);
  }

  mirrorHost.update({
    scene: room.scene,
    camera: viewerCamera
  });

  if (state.xrActive) {
    const armPose = resolveArmPose();
    const xrFrame = armPose
      ? {
          ...baseFrame,
          xrPose: armPose
        }
      : baseFrame;
    for (const sample of consumeXrSamples(now)) {
      routePointerSample(xrPanels, sample, xrFrame);
    }
  } else {
    while (pendingScreenSamples.length > 0) {
      const sample = pendingScreenSamples.shift();
      if (!sample) {
        continue;
      }
      routePointerSample(desktopPanels, sample, baseFrame);
    }
  }

  tvDriverBinding.render();
  if (hudDriverBinding.enabled) {
    hudDriverBinding.render();
  }
  if (armDriverBinding.enabled) {
    armDriverBinding.render();
  }
  mirrorHost.render();

  renderer.render(room.scene, room.camera);
});

function createRuntimeBinding(
  variant: "hud" | "tv" | "arm"
): RuntimeBinding {
  const runtime = createRuntime({
    root: createRoomPanelRoot(variant, store.getState()),
    surface: getRoomPanelSurface(variant),
    theme: getRoomPanelTheme(variant)
  });

  return {
    runtime,
    sync(state) {
      runtime.setRoot(createRoomPanelRoot(variant, state));
    }
  };
}

function createHudDriverBinding(runtime: DisplayRuntime): DriverBinding {
  const driver = createHudPanelDriver({
    runtime,
    surface: getRoomPanelSurface("hud"),
    panelWidth: 0.62,
    panelHeight: 0.38,
    distance: 0.68,
    offset: { x: -0.38, y: 0.2 }
  });

  return createDriverBinding("hud", driver, runtime);
}

function createTvDriverBinding(runtime: DisplayRuntime): DriverBinding {
  const driver = createScenePanelDriver({
    runtime,
    surface: getRoomPanelSurface("tv"),
    panelWidth: 1.52,
    panelHeight: 0.95,
    position: room.tvAnchor.position,
    quaternion: room.tvAnchor.quaternion
  });

  return createDriverBinding("tv", driver, runtime);
}

function createArmDriverBinding(runtime: DisplayRuntime): DriverBinding {
  const driver = createHeldTabletDriver({
    runtime,
    surface: getRoomPanelSurface("arm"),
    panelWidth: 0.52,
    panelHeight: 0.36,
    tiltRadians: -Math.PI * 0.24,
    offset: { x: 0.04, y: 0.05, z: -0.03 }
  });

  return createDriverBinding("arm", driver, runtime);
}

function createDriverBinding(
  key: "hud" | "tv" | "arm",
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
      if (key === "arm" && !frame.xrPose) {
        this.hide();
        return;
      }
      driver.host.update({
        scene: frame.scene,
        camera: frame.camera,
        ...(frame.xrPose ? { xrPose: frame.xrPose } : {})
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
        ...(frame.xrPose ? { xrPose: frame.xrPose } : {})
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

  if (output.type === "action") {
    const action = output as ActionEvent;
    if (action.actionId === "light.toggle") {
      dispatchStoreAction({
        type: "light.set",
        value: !state.lightOn
      });
    }
  }
}

function dispatchStoreAction(action: RoomDemoAction): void {
  store.dispatch(action);
}

function updateDesktopCamera(deltaSeconds: number): void {
  const speed = 1.9;
  const turnSpeed = 1.6;
  const move = new THREE.Vector3();
  if (keyboardState.has("KeyW") || keyboardState.has("ArrowUp")) {
    move.z += 1;
  }
  if (keyboardState.has("KeyS") || keyboardState.has("ArrowDown")) {
    move.z -= 1;
  }
  if (keyboardState.has("KeyA")) {
    move.x -= 1;
  }
  if (keyboardState.has("KeyD")) {
    move.x += 1;
  }

  if (keyboardState.has("ArrowLeft")) {
    yaw += turnSpeed * deltaSeconds;
  }
  if (keyboardState.has("ArrowRight")) {
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

function resolveArmPose(): THREEFrame["xrPose"] | undefined {
  const binding =
    resolveXrBinding((entry) => entry.state.handedness === "left") ??
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

function resolveXrBinding(
  predicate: (binding: XrControllerBinding) => boolean
): XrControllerBinding | undefined {
  return xrBindings.find(predicate);
}

window.addEventListener("beforeunload", () => {
  hudDriverBinding.driver.detach();
  tvDriverBinding.driver.detach();
  armDriverBinding.driver.detach();
  mirrorHost.detach();
  mirrorRenderer.dispose();
  clearMirrorSurface(mirrorRuntime.getServices().surfaces, MIRROR_COMPONENT_ID);
});
