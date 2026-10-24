import * as THREE from "three";
import type { ResolvedInteraction } from "../interaction/contracts.js";

export interface InteractionPresenter {
  update(states: readonly ResolvedInteraction[]): void;
  dispose(): void;
}
/** Transparent, non-depth-writing beam and ring. Shape/size distinguish hover, press and drag. */
export function createThreePointerFeedback(options: { parent: THREE.Object3D; mode?: "spatial" | "overlay" }): InteractionPresenter {
  const visuals = new Map<string, { beam: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>; marker: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial> }>();
  let disposed = false;
  const worldToParent = new THREE.Matrix4();
  return {
    update(states) {
      if (disposed) return;
      options.parent.updateWorldMatrix(true, false);
      const validParent = options.parent.matrixWorld.elements.every(Number.isFinite) && options.parent.matrixWorld.determinant() !== 0;
      if (validParent) worldToParent.copy(options.parent.matrixWorld).invert();
      const present = new Set<string>();
      for (const state of states) {
        if (!validParent || !state.trackingValid || !state.source.ray) continue;
        const geometry = state.projection ?? state.hit;
        if (!geometry) continue;
        present.add(state.source.id);
        let visual = visuals.get(state.source.id);
        if (!visual) {
          const overlay = options.mode === "overlay";
          const beam = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ transparent: true, opacity: 0.7, depthWrite: false, depthTest: !overlay, toneMapped: false }));
          const marker = new THREE.Mesh(new THREE.RingGeometry(0.003, 0.0045, 24), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, depthTest: !overlay, side: THREE.DoubleSide, toneMapped: false }));
          beam.renderOrder = marker.renderOrder = overlay ? 10010 : 1;
          beam.frustumCulled = marker.frustumCulled = false;
          // Full matrices also cancel non-uniform parent scale/shear without distorting the ring.
          beam.matrixAutoUpdate = marker.matrixAutoUpdate = false;
          options.parent.add(beam, marker); visual = { beam, marker }; visuals.set(state.source.id, visual);
        }
        const active = state.capture?.gesture;
        const color = active === "drag" ? 0xffc857 : active ? 0xffffff : 0x76ddf1;
        visual.beam.material.color.setHex(color); visual.marker.material.color.setHex(color);
        visual.beam.geometry.setFromPoints([new THREE.Vector3().copy(state.source.ray.origin), new THREE.Vector3().copy(geometry.point)]);
        visual.beam.matrix.copy(worldToParent);
        const orientation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3().copy(state.source.ray.direction).normalize().negate());
        const scale = new THREE.Vector3().setScalar(active === "drag" ? 1.8 : active ? 1.35 : 1);
        visual.marker.matrix.compose(new THREE.Vector3().copy(geometry.point), orientation, scale).premultiply(worldToParent);
        visual.beam.matrixWorldNeedsUpdate = visual.marker.matrixWorldNeedsUpdate = true;
        visual.beam.visible = visual.marker.visible = true;
      }
      for (const [id, visual] of visuals) {
        if (present.has(id)) continue;
        visual.beam.removeFromParent(); visual.marker.removeFromParent();
        visual.beam.geometry.dispose(); visual.beam.material.dispose(); visual.marker.geometry.dispose(); visual.marker.material.dispose();
        visuals.delete(id);
      }
    },
    dispose() {
      if (disposed) return;
      this.update([]); disposed = true;
    }
  };
}
