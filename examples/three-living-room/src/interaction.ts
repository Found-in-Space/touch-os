import * as THREE from "three";
import { VRButton } from "three/examples/jsm/webxr/VRButton.js";
import { createColumn, createDial, createSlider, createValueBinding } from "../../../src/index.js";
import { createDesktopInteractionInput, createWebXRInteractionInput, createThreeUIEnvironment } from "../../../src/hosts/three.js";

const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.01, 100);
camera.position.z = 1.5;
export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight); renderer.xr.enabled = true;
document.body.append(renderer.domElement, VRButton.createButton(renderer));
const origin = new THREE.Group(); scene.add(origin); origin.add(camera);
for (const index of [0, 1]) origin.add(renderer.xr.getController(index), renderer.xr.getControllerGrip(index));
const desktop = createDesktopInteractionInput({ element: renderer.domElement, camera });
const xr = createWebXRInteractionInput({ xr: renderer.xr, origin });
export const ui = createThreeUIEnvironment({ parent: scene, inputs: [desktop, xr], ownsInputs: true });
export const values = [25, 75].map(value => createValueBinding({ value, apply: next => Math.round(next), cancellation: "retain" }));
export const views = values.map((binding, index) => {
  const content = () => createColumn(`controls:${index}`, { padding: 12, gap: 20, backgroundColor: "#0e1e2c", children: [
    createSlider(`slider:${index}`, { label: "Value", field: "value", value: binding.get().value, min: 0, max: 100 }),
    createDial(`dial:${index}`, { label: "Same value", field: "value", value: binding.get().value, min: 0, max: 100 })
  ] });
  const view = ui.mountPanel({ id: `panel:${index}`, content, surface: { width: 320, height: 280 },
    placement: { panelWidth: 0.6, panelHeight: 0.525, position: { x: index === 0 ? -0.34 : 0.34, y: 0, z: -0.5 } },
    bind(output) {
      if (output.type !== "change-request") return;
      if (output.phase === "begin") binding.begin();
      else if (output.phase === "commit") binding.commit();
      else if (output.phase === "cancel") binding.cancel();
      else binding.request(Number(output.value));
    }
  });
  binding.subscribe(() => view.setContent(content()));
  return view;
});
renderer.setAnimationLoop((_timestamp, xrFrame) => {
  ui.update({ timestamp: performance.now(), scene, camera, ...(xrFrame ? { xrFrame } : {}) });
  renderer.render(scene, camera);
});
addEventListener("resize", () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
addEventListener("pagehide", () => { renderer.setAnimationLoop(null); for (const view of views) view.dispose(); for (const binding of values) binding.dispose(); ui.dispose(); renderer.dispose(); }, { once: true });
