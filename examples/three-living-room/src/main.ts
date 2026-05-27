import "./styles.css";
import * as THREE from "three";
import { VRButton } from "three/examples/jsm/webxr/VRButton.js";
import {
  createEmbeddedSurfaceService,
  createRuntime,
  type AppShellChange,
  type ChangeRequestEvent,
  type DisplayRuntime,
  type RuntimeOutput,
  type SurfaceMetrics,
  type SystemCommandInputEvent
} from "../../../src/index.js";
import {
  createHudPanelDriver,
  createPoseAnchoredPanelDriver,
  createScenePanelDriver,
  createThreePanelSession,
  resolveCompositeSurfacePlacements,
  type ThreePanelHostFrame,
  type ThreePanelDriver,
  type ThreePanelSession,
  type ThreePointerSample
} from "../../../src/hosts/three.js";
import { createPanelCoordinator } from "../../../src/coordination/index.js";
import {
  createXrHudRoot,
  createWallMirrorRoot,
  createWallPictureRoot,
  createDefaultRoomPanelDiagnostics,
  createRoomPanelRoot,
  getXrHudSurface,
  getXrHudTheme,
  getWallMirrorSurface,
  getWallMirrorTheme,
  getWallPictureSurface,
  getWallPictureTheme,
  getRoomPanelSurface,
  getRoomPanelTheme,
  TV_PANEL_ACTION_IDS,
  TV_VIDEO_APP_ID,
  type RoomPanelDiagnostics,
  type RoomPanelOptions
} from "./panel-ui.js";
import {
  REAR_VIEW_SOURCE_ID,
  clearMirrorSurface,
  publishMirrorSurface
} from "./mirror.js";
import {
  createShaderPictureSource,
  WALL_PICTURE_SOURCE_ID
} from "./shader-picture.js";
import {
  DEFAULT_TV_VIDEO_URL,
  createVideoTextureSource,
  TV_VIDEO_SOURCE_ID,
  type VideoTextureSource
} from "./video-source.js";
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

interface ScreenRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SurfaceRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface LivingRoomFractalTestState {
  armVisible: boolean;
  compositeSurfaceCount: number;
  pictureSurfaceCount: number;
  fractalComponentId?: string;
  surfaceRevision?: number;
  screenRect?: ScreenRect;
}

interface LivingRoomTestApi {
  readonly ready: boolean;
  readonly ids: typeof ARM_TEST_COMPONENT_IDS;
  getArmComponentScreenRect(componentId: string): ScreenRect | undefined;
  getFractalState(): LivingRoomFractalTestState;
}

declare global {
  interface Window {
    __TOUCH_OS_LIVING_ROOM_TEST__?: LivingRoomTestApi;
  }
}

const urlParams = new URLSearchParams(window.location.search);
const livingRoomTestMode = urlParams.has("touchOsTest");
const ARM_TEST_COMPONENT_IDS = {
  fractalIcon: "arm-os:home:open:space-found-living-room-fractal-art",
  homeControl: "arm-os:tablet-screen:home-control"
} as const;

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

interface RoomRuntimeController {
  runtime: DisplayRuntime;
  sync(state: RoomDemoState): void;
  syncDiagnostics(diagnostics: RoomPanelDiagnostics): void;
  syncPanelState(): void;
}

interface StaticRuntimeController {
  runtime: DisplayRuntime;
}

interface THREEFrame extends ThreePanelHostFrame {
  scene: THREE.Scene;
  camera: THREE.Camera;
}

interface RoomPanelAction {
  actionId: string;
  payload?: Record<string, unknown>;
}

const TV_VOLUME_STEP = 0.1;
let tvScreenOn = true;
let tvVideoVolume = 0.75;

const desktopHudRuntime = createRoomRuntimeController("hud");
const tvRuntime = createRoomRuntimeController("tv");
const armRuntime = createRoomRuntimeController("arm");
const xrHudRuntime = createXrHudRuntimeController();
const wallMirrorRuntime = createWallMirrorRuntimeController();
const wallPictureRuntime = createWallPictureRuntimeController();

const desktopHudPanel = createDesktopHudPanelSession(desktopHudRuntime.runtime);
const tvPanel = createTvPanelSession(tvRuntime.runtime);
const armPanel = createArmPanelSession(armRuntime.runtime);
const xrHudPanel = createXrHudPanelSession(xrHudRuntime.runtime);
const wallMirrorPanel = createWallMirrorPanelSession(wallMirrorRuntime.runtime);
const wallPicturePanel = createWallPicturePanelSession(wallPictureRuntime.runtime);

desktopHudPanel.attach();
tvPanel.attach();
armPanel.attach();
xrHudPanel.attach();
wallMirrorPanel.attach();
wallPicturePanel.attach();

const shaderPictureSource = createShaderPictureSource();
const tvVideoSource = createVideoTextureSource({
  sourceId: TV_VIDEO_SOURCE_ID,
  url: DEFAULT_TV_VIDEO_URL,
  loop: true,
  volume: tvVideoVolume
});

const pressedKeys = new Set<string>();
let lookActive = false;
let yaw = 0;
let pitch = -0.08;
let lastFrameTime = performance.now();
let lastArmDiagnosticsSync = 0;
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

const desktopPanels = livingRoomTestMode
  ? [desktopHudPanel, armPanel, tvPanel]
  : [desktopHudPanel, tvPanel];
const xrPanels = [armPanel, tvPanel];
const desktopPanelCoordinator = createPanelCoordinator({
  panels: desktopPanels
});
const xrPanelCoordinator = createPanelCoordinator({
  panels: xrPanels
});

store.subscribe(() => {
  const state = store.getState();
  syncRoomRuntimeControllers(state);
  room.applyState(state);
  if (isXrPresentationActive()) {
    desktopHudPanel.driver.clearPointer();
    xrHudPanel.driver.clearPointer();
  } else {
    armPanel.driver.clearPointer();
  }
});
const initialState = store.getState();
syncRoomRuntimeControllers(initialState);
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
  if (dispatchSystemCommandFromKeyboard(event)) {
    return;
  }

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

if (livingRoomTestMode) {
  installLivingRoomTestApi();
}

renderer.setAnimationLoop(() => {
  const xrActive = isXrPresentationActive();
  syncXrPresentationState(xrActive);
  const now = performance.now();
  const deltaSeconds = Math.min((now - lastFrameTime) / 1000, 0.05);
  lastFrameTime = now;
  const state = store.getState();

  if (!xrActive) {
    updateDesktopCamera(deltaSeconds, state);
  } else {
    // Keep the app-facing camera in step with the current XR pose before any
    // HUD or mirror placement work that happens outside renderer.render().
    renderer.xr.updateCamera(room.camera);
  }

  const viewerCamera = room.camera;

  room.syncRearViewCamera(viewerCamera);
  const desktopHudVisible = desktopHudPanel.driver.host.mesh.visible;
  const xrHudVisible = xrHudPanel.driver.host.mesh.visible;
  const armVisible = armPanel.driver.host.mesh.visible;
  desktopHudPanel.driver.host.mesh.visible = false;
  xrHudPanel.driver.host.mesh.visible = false;
  armPanel.driver.host.mesh.visible = false;
  mirrorRenderer.render(room.scene, room.rearViewCamera);
  desktopHudPanel.driver.host.mesh.visible = desktopHudVisible;
  xrHudPanel.driver.host.mesh.visible = xrHudVisible;
  armPanel.driver.host.mesh.visible = armVisible;
  publishMirrorSurface(sharedSurfaces, REAR_VIEW_SOURCE_ID, mirrorCanvas, now);
  shaderPictureSource.render(renderer, now);
  shaderPictureSource.publish(sharedSurfaces, now);
  tvVideoSource.publish(sharedSurfaces, now);

  const baseFrame: THREEFrame = {
    scene: room.scene,
    camera: viewerCamera
  };

  tvPanel.enabled = true;
  tvPanel.update(baseFrame);
  wallMirrorPanel.enabled = true;
  wallMirrorPanel.update(baseFrame);
  wallPicturePanel.enabled = true;
  wallPicturePanel.update(baseFrame);

  if (xrActive) {
    desktopHudPanel.enabled = false;
    desktopHudPanel.hide();

    const headPose = resolveHeadPose(viewerCamera);
    xrHudPanel.enabled = Boolean(headPose);
    xrHudPanel.update(
      headPose
        ? {
            ...baseFrame,
            anchorPose: headPose
          }
        : baseFrame
    );

    const armPose = resolveArmPose();
    armPanel.enabled = Boolean(armPose);
    armPanel.update(
      armPose
        ? {
            ...baseFrame,
            anchorPose: armPose
          }
        : baseFrame
    );
  } else if (livingRoomTestMode) {
    desktopHudPanel.enabled = false;
    desktopHudPanel.hide();
    xrHudPanel.enabled = false;
    xrHudPanel.hide();
    armPanel.enabled = true;
    armPanel.update({
      ...baseFrame,
      anchorPose: getTestArmPose()
    });
  } else {
    desktopHudPanel.enabled = true;
    desktopHudPanel.update({
      ...baseFrame,
      surfaceMetrics: getDesktopSurfaceMetrics()
    });

    armPanel.enabled = false;
    armPanel.hide();
    xrHudPanel.enabled = false;
    xrHudPanel.hide();
  }

  syncArmDiagnostics(now, deltaSeconds, xrActive);

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
      const routing = xrPanelCoordinator.route(sample, xrFrame);
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
      desktopPanelCoordinator.route(sample, baseFrame);
    }
  }

  tickActiveRuntime(tvPanel, now);
  tickActiveRuntime(wallMirrorPanel, now);
  tickActiveRuntime(wallPicturePanel, now);
  if (desktopHudPanel.enabled) {
    tickActiveRuntime(desktopHudPanel, now);
  }
  if (xrHudPanel.enabled) {
    tickActiveRuntime(xrHudPanel, now);
  }
  if (armPanel.enabled) {
    tickActiveRuntime(armPanel, now);
  }

  tvPanel.render();
  wallMirrorPanel.render();
  wallPicturePanel.render();
  desktopHudPanel.render();
  xrHudPanel.render();
  if (armPanel.enabled) {
    armPanel.render();
  }

  renderer.render(room.scene, viewerCamera);
});

function createRoomRuntimeController(
  variant: "hud" | "tv" | "arm"
): RoomRuntimeController {
  let lastState = store.getState();
  let lastDiagnostics = createDefaultRoomPanelDiagnostics();
  let lastPanelOptions = createRoomPanelOptions(variant);
  const runtime = createRuntime({
    root: createRoomPanelRoot(variant, lastState, lastDiagnostics, lastPanelOptions),
    surface: getRoomPanelSurface(variant),
    theme: getRoomPanelTheme(variant),
    services: {
      surfaces: sharedSurfaces
    }
  });

  const syncRoot = () => {
    runtime.setRoot(createRoomPanelRoot(variant, lastState, lastDiagnostics, lastPanelOptions));
  };

  return {
    runtime,
    sync(state) {
      if (state === lastState) {
        return;
      }

      lastState = state;
      syncRoot();
    },
    syncDiagnostics(diagnostics) {
      if (variant !== "arm" || diagnosticsEqual(diagnostics, lastDiagnostics)) {
        return;
      }

      lastDiagnostics = diagnostics;
      syncRoot();
    },
    syncPanelState() {
      const nextPanelOptions = createRoomPanelOptions(variant);
      if (roomPanelOptionsEqual(variant, nextPanelOptions, lastPanelOptions)) {
        return;
      }

      lastPanelOptions = nextPanelOptions;
      syncRoot();
    }
  };
}

function createRoomPanelOptions(
  variant: "hud" | "tv" | "arm"
): RoomPanelOptions {
  if (variant !== "tv") {
    return {};
  }

  return {
    tv: {
      screenOn: tvScreenOn,
      volume: tvVideoVolume,
      onShellChange: handleTvShellChange
    }
  };
}

function roomPanelOptionsEqual(
  variant: "hud" | "tv" | "arm",
  left: RoomPanelOptions,
  right: RoomPanelOptions
): boolean {
  if (variant !== "tv") {
    return true;
  }

  return left.tv?.screenOn === right.tv?.screenOn &&
    left.tv?.volume === right.tv?.volume;
}

function createXrHudRuntimeController(): StaticRuntimeController {
  const runtime = createRuntime({
    root: createXrHudRoot(),
    surface: getXrHudSurface(),
    theme: getXrHudTheme(),
    services: {
      surfaces: sharedSurfaces
    }
  });

  return {
    runtime
  };
}

function createDesktopHudPanelSession(runtime: DisplayRuntime): ThreePanelSession {
  const driver = createHudPanelDriver({
    runtime,
    surface: getRoomPanelSurface("hud"),
    distance: 0.68,
    sizing: "viewport"
  });

  return createPanelSession("desktop-hud", driver, runtime);
}

function createXrHudPanelSession(runtime: DisplayRuntime): ThreePanelSession {
  const driver = createPoseAnchoredPanelDriver({
    runtime,
    surface: getXrHudSurface(),
    panelWidth: 0.17,
    panelHeight: 0.095625,
    tiltRadians: 0,
    offset: { x: 0.08, y: 0.02, z: -0.42 }
  });

  return createPanelSession("xr-hud", driver, runtime);
}

function createTvPanelSession(runtime: DisplayRuntime): ThreePanelSession {
  const driver = createScenePanelDriver({
    runtime,
    surface: getRoomPanelSurface("tv"),
    panelWidth: 1.44,
    panelHeight: 0.73,
    depthTest: false,
    position: room.tvAnchor.position,
    quaternion: room.tvAnchor.quaternion
  });

  return createPanelSession("tv", driver, runtime);
}

function createWallMirrorRuntimeController(): StaticRuntimeController {
  const runtime = createRuntime({
    root: createWallMirrorRoot(),
    surface: getWallMirrorSurface(),
    theme: getWallMirrorTheme(),
    services: {
      surfaces: sharedSurfaces
    }
  });

  return {
    runtime
  };
}

function createWallPictureRuntimeController(): StaticRuntimeController {
  const runtime = createRuntime({
    root: createWallPictureRoot(),
    surface: getWallPictureSurface(),
    theme: getWallPictureTheme(),
    services: {
      surfaces: sharedSurfaces
    }
  });

  return {
    runtime
  };
}

function createWallMirrorPanelSession(runtime: DisplayRuntime): ThreePanelSession {
  const driver = createScenePanelDriver({
    runtime,
    surface: getWallMirrorSurface(),
    panelWidth: 0.86,
    panelHeight: 0.54,
    position: room.mirrorAnchor.position,
    quaternion: room.mirrorAnchor.quaternion
  });

  return createPanelSession("wall-mirror", driver, runtime);
}

function createWallPicturePanelSession(runtime: DisplayRuntime): ThreePanelSession {
  const driver = createScenePanelDriver({
    runtime,
    surface: getWallPictureSurface(),
    panelWidth: 1.12,
    panelHeight: 0.7,
    position: room.pictureAnchor.position,
    quaternion: room.pictureAnchor.quaternion
  });

  return createPanelSession("wall-picture", driver, runtime);
}

function createArmPanelSession(runtime: DisplayRuntime): ThreePanelSession {
  const driver = createPoseAnchoredPanelDriver({
    runtime,
    surface: getRoomPanelSurface("arm"),
    panelWidth: 0.48,
    panelHeight: 0.34,
    tiltRadians: -Math.PI * 0.24,
    offset: { x: 0.04, y: 0.05, z: -0.03 }
  });

  return createPanelSession("arm", driver, runtime);
}

function createPanelSession(
  key: "desktop-hud" | "xr-hud" | "tv" | "arm" | "wall-mirror" | "wall-picture",
  driver: ThreePanelDriver,
  runtime: DisplayRuntime
): ThreePanelSession {
  return createThreePanelSession({
    key,
    runtime,
    driver,
    outputHandler(output) {
      applyRuntimeOutput(output, store.getState());
    }
  });
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

  if (output.type === "app-event") {
    const event = output.event;
    if (event.type === "app-action" && typeof event.name === "string") {
      applyPanelAction({
        actionId: event.name,
        ...(isRecord(event.payload) ? { payload: event.payload } : {})
      }, state);
    }
    if (event.type === "app-change" && isRecord(event.payload)) {
      applyPanelChange(event.payload);
    }
    return;
  }

  if (output.type !== "action") {
    return;
  }

  applyPanelAction(output, state);
}

function applyPanelChange(payload: Record<string, unknown>): void {
  if (payload.field === "lightOn" && typeof payload.value === "boolean") {
    dispatchStoreAction({
      type: "light.set",
      value: payload.value
    });
  }
}

function applyPanelAction(action: RoomPanelAction, state: RoomDemoState): void {
  if (action.actionId === TV_PANEL_ACTION_IDS.powerToggle) {
    setTvScreenOn(!tvScreenOn);
    return;
  }

  if (action.actionId === TV_PANEL_ACTION_IDS.volumeDown) {
    adjustTvVideoVolume(-TV_VOLUME_STEP);
    return;
  }

  if (action.actionId === TV_PANEL_ACTION_IDS.volumeUp) {
    adjustTvVideoVolume(TV_VOLUME_STEP);
    return;
  }

  if (action.actionId === "light.set") {
    const value = action.payload?.value;
    if (typeof value === "boolean") {
      dispatchStoreAction({
        type: "light.set",
        value
      });
    }
    return;
  }

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

function handleTvShellChange(change: AppShellChange): void {
  if (change.type === "open-app" && change.targetAppId === TV_VIDEO_APP_ID) {
    playTvVideo();
    return;
  }

  if (
    change.type === "window-state" &&
    change.session?.appId === TV_VIDEO_APP_ID &&
    change.session.focused
  ) {
    playTvVideo();
    return;
  }

  if (change.type === "shell-mode" && change.mode === "home") {
    stopTvVideo();
  }
}

function setTvScreenOn(screenOn: boolean): void {
  if (tvScreenOn === screenOn) {
    return;
  }

  tvScreenOn = screenOn;
  if (!tvScreenOn) {
    stopTvVideo();
  }
  tvRuntime.syncPanelState();
}

function adjustTvVideoVolume(delta: number): void {
  const nextVolume = Math.max(0, Math.min(1, tvVideoVolume + delta));
  if (nextVolume === tvVideoVolume) {
    return;
  }

  tvVideoVolume = nextVolume;
  tvVideoSource.setVolume(tvVideoVolume);
  tvRuntime.syncPanelState();
}

function playTvVideo(): void {
  if (!tvScreenOn) {
    return;
  }

  playVideoSource(tvVideoSource);
}

function stopTvVideo(): void {
  tvVideoSource.stop();
}

function playVideoSource(source: VideoTextureSource): void {
  void source.play().catch((error: unknown) => {
    console.warn("Unable to start TV video playback.", error);
  });
}

function dispatchSystemCommandFromKeyboard(event: KeyboardEvent): boolean {
  const command = resolveSystemCommandFromKeyboard(event);
  if (!command) {
    return false;
  }

  event.preventDefault();
  armRuntime.runtime.dispatchInput({
    type: "system-command",
    command,
    timestamp: event.timeStamp,
    source: "keyboard"
  });
  return true;
}

function resolveSystemCommandFromKeyboard(
  event: KeyboardEvent
): SystemCommandInputEvent["command"] | undefined {
  if (event.code === "Tab" && (event.altKey || event.metaKey)) {
    return "app-switcher";
  }
  if (
    event.code === "Home" ||
    event.key === "Home" ||
    event.key === "Meta" ||
    event.code === "MetaLeft" ||
    event.code === "MetaRight" ||
    event.code === "OSLeft" ||
    event.code === "OSRight"
  ) {
    return "home";
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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
      return armPanel.driver.getPointerState(pointerId);
    case "tv":
      return tvPanel.driver.getPointerState(pointerId);
    case "xr-hud":
      return xrHudPanel.driver.getPointerState(pointerId);
    case "desktop-hud":
      return desktopHudPanel.driver.getPointerState(pointerId);
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

function tickActiveRuntime(binding: ThreePanelSession, timestamp: number): void {
  binding.runtime.tick(timestamp);
  binding.flushOutputs();
}

function syncRoomRuntimeControllers(
  state: RoomDemoState
): void {
  desktopHudRuntime.sync(state);
  tvRuntime.sync(state);
  armRuntime.sync(state);
}

function syncArmDiagnostics(
  timestamp: number,
  deltaSeconds: number,
  xrActive: boolean
): void {
  if (timestamp - lastArmDiagnosticsSync < 250) {
    return;
  }

  lastArmDiagnosticsSync = timestamp;
  const fps = deltaSeconds > 0 ? Math.round(1 / deltaSeconds) : 0;
  const frameMs = (deltaSeconds * 1000).toFixed(1);
  armRuntime.syncDiagnostics({
    pointerMode: xrActive ? "XR ray/contact" : "Desktop hidden",
    timing: `${fps} fps / ${frameMs} ms`,
    activePanel: armPanel.enabled ? "Arm tablet" : xrActive ? "No arm pose" : "HUD only"
  });
}

function diagnosticsEqual(
  left: RoomPanelDiagnostics,
  right: RoomPanelDiagnostics
): boolean {
  return (
    left.pointerMode === right.pointerMode &&
    left.timing === right.timing &&
    left.activePanel === right.activePanel
  );
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

function installLivingRoomTestApi(): void {
  window.__TOUCH_OS_LIVING_ROOM_TEST__ = {
    ready: true,
    ids: ARM_TEST_COMPONENT_IDS,
    getArmComponentScreenRect(componentId) {
      renderArmPanelForTest();
      return getArmComponentScreenRect(componentId);
    },
    getFractalState() {
      renderArmPanelForTest();
      return getArmFractalTestState();
    }
  };
}

function renderArmPanelForTest(): void {
  if (!livingRoomTestMode) {
    return;
  }

  const now = performance.now();
  desktopHudPanel.enabled = false;
  desktopHudPanel.hide();
  xrHudPanel.enabled = false;
  xrHudPanel.hide();
  shaderPictureSource.render(renderer, now);
  shaderPictureSource.publish(sharedSurfaces, now);
  room.camera.updateMatrixWorld(true);
  armPanel.enabled = true;
  armPanel.update({
    scene: room.scene,
    camera: room.camera,
    anchorPose: getTestArmPose()
  });
  tickActiveRuntime(armPanel, now);
  armPanel.render();
  renderer.render(room.scene, room.camera);
}

function getArmComponentScreenRect(componentId: string): ScreenRect | undefined {
  const bounds = armRuntime.runtime.getBounds(componentId);
  if (!bounds) {
    return undefined;
  }

  return projectArmSurfaceRect(bounds);
}

function getArmFractalTestState(): LivingRoomFractalTestState {
  const commands = armPanel.driver.getCompositeSurfaces();
  const pictureCommands = commands.filter((command) => command.sourceId === WALL_PICTURE_SOURCE_ID);
  const placement = resolveCompositeSurfacePlacements(armPanel.driver.host).find(
    (candidate) =>
      candidate.sourceId === WALL_PICTURE_SOURCE_ID &&
      candidate.componentId.includes("fractal-art-surface")
  );
  const state: LivingRoomFractalTestState = {
    armVisible: armPanel.driver.host.mesh.visible,
    compositeSurfaceCount: commands.length,
    pictureSurfaceCount: pictureCommands.length
  };
  if (placement) {
    state.fractalComponentId = placement.componentId;
    if (placement.command.surfaceRevision !== undefined) {
      state.surfaceRevision = placement.command.surfaceRevision;
    }
    const screenRect = projectArmLocalRect({
      x: placement.localCenter.x - placement.size.width / 2,
      y: placement.localCenter.y - placement.size.height / 2,
      width: placement.size.width,
      height: placement.size.height
    });
    if (screenRect) {
      state.screenRect = screenRect;
    }
  }
  return state;
}

function projectArmSurfaceRect(rect: SurfaceRect): ScreenRect | undefined {
  const metrics = armPanel.driver.host.getSurfaceMetrics();
  if (metrics.width <= 0 || metrics.height <= 0) {
    return undefined;
  }

  const geometry = armPanel.driver.host.mesh.geometry.parameters;
  const panelWidth = geometry.width ?? 1;
  const panelHeight = geometry.height ?? 1;
  const halfWidth = panelWidth / 2;
  const halfHeight = panelHeight / 2;
  const localRect = {
    x: -halfWidth + (rect.x / metrics.width) * panelWidth,
    y: halfHeight - ((rect.y + rect.height) / metrics.height) * panelHeight,
    width: (rect.width / metrics.width) * panelWidth,
    height: (rect.height / metrics.height) * panelHeight
  };

  return projectArmLocalRect(localRect);
}

function projectArmLocalRect(rect: SurfaceRect): ScreenRect | undefined {
  const mesh = armPanel.driver.host.mesh;
  const corners = [
    new THREE.Vector3(rect.x, rect.y, 0.002),
    new THREE.Vector3(rect.x + rect.width, rect.y, 0.002),
    new THREE.Vector3(rect.x + rect.width, rect.y + rect.height, 0.002),
    new THREE.Vector3(rect.x, rect.y + rect.height, 0.002)
  ].map((corner) => mesh.localToWorld(corner).project(room.camera));

  if (corners.some((corner) => corner.z < -1 || corner.z > 1)) {
    return undefined;
  }

  const canvasRect = renderer.domElement.getBoundingClientRect();
  const points = corners.map((corner) => ({
    x: canvasRect.left + ((corner.x + 1) / 2) * canvasRect.width,
    y: canvasRect.top + ((1 - corner.y) / 2) * canvasRect.height
  }));
  const xValues = points.map((point) => point.x);
  const yValues = points.map((point) => point.y);
  const x = Math.min(...xValues);
  const y = Math.min(...yValues);
  const width = Math.max(...xValues) - x;
  const height = Math.max(...yValues) - y;
  if (!Number.isFinite(x) || !Number.isFinite(y) || width <= 0 || height <= 0) {
    return undefined;
  }

  return { x, y, width, height };
}

function getTestArmPose(): NonNullable<THREEFrame["anchorPose"]> {
  return {
    position: { x: 0, y: 1.34, z: 1.02 },
    orientation: { x: 0, y: 0, z: 0, w: 1 }
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
  desktopHudPanel.dispose();
  tvPanel.dispose();
  armPanel.dispose();
  xrHudPanel.dispose();
  wallMirrorPanel.dispose();
  wallPicturePanel.dispose();
  shaderPictureSource.dispose();
  tvVideoSource.dispose();
  mirrorRenderer.dispose();
  clearMirrorSurface(sharedSurfaces, REAR_VIEW_SOURCE_ID);
  shaderPictureSource.unpublish(sharedSurfaces);
  tvVideoSource.unpublish(sharedSurfaces);
});
