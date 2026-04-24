import * as THREE from "three";
import type { QuaternionLike, Vector3Like } from "../../../src/hosts/three.js";
import type { RoomDemoState } from "./store.js";

export interface PanelAnchor {
  position: Vector3Like;
  quaternion: QuaternionLike;
}

export interface LivingRoomScene {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly lampLight: THREE.PointLight;
  readonly tvAnchor: PanelAnchor;
  readonly mirrorAnchor: PanelAnchor;
  readonly pictureAnchor: PanelAnchor;
  readonly rearViewCamera: THREE.PerspectiveCamera;
  readonly mirrorSize: { width: number; height: number };
  applyState(state: RoomDemoState): void;
  syncRearViewCamera(viewerCamera: THREE.Camera): void;
}

export function createLivingRoomScene(): LivingRoomScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#d7c4a8");
  scene.fog = new THREE.Fog("#d7c4a8", 4, 12);

  const camera = new THREE.PerspectiveCamera(65, 1, 0.1, 40);
  camera.position.set(0, 1.65, 1.75);
  scene.add(camera);

  const ambientLight = new THREE.AmbientLight("#f6ead6", 0.55);
  scene.add(ambientLight);

  const daylight = new THREE.DirectionalLight("#fff4df", 1.1);
  daylight.position.set(2.6, 3.4, 2.1);
  scene.add(daylight);

  const lampLight = new THREE.PointLight("#ffd27a", 2.2, 7, 2);
  lampLight.position.set(-1.65, 1.55, -0.55);
  scene.add(lampLight);

  const lampBulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 16, 16),
    new THREE.MeshStandardMaterial({
      color: "#fff1b8",
      emissive: "#ffcf6a",
      emissiveIntensity: 1.7,
      roughness: 0.25
    })
  );
  lampBulb.position.copy(lampLight.position);
  scene.add(lampBulb);

  const room = new THREE.Group();
  scene.add(room);

  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(6.5, 0.12, 6.5),
    new THREE.MeshStandardMaterial({
      color: "#8b6b4b",
      roughness: 0.82
    })
  );
  floor.position.set(0, -0.06, 0);
  room.add(floor);

  room.add(createWall(0, 1.4, -3.1, 6.4, 2.8, 0.14, "#dcc7aa"));
  room.add(createWall(0, 1.4, 3.1, 6.4, 2.8, 0.14, "#ddc8ae"));
  room.add(createWall(-3.1, 1.4, 0, 0.14, 2.8, 6.4, "#d8c2a1"));

  const rightWallSegments = [
    createWall(3.1, 1.4, -1.85, 0.14, 2.8, 2.4, "#d8c2a1"),
    createWall(3.1, 1.4, 1.85, 0.14, 2.8, 2.4, "#d8c2a1"),
    createWall(3.1, 2.4, 0, 0.14, 0.8, 1.9, "#d8c2a1"),
    createWall(3.1, 0.4, 0, 0.14, 0.8, 1.9, "#d8c2a1")
  ];
  for (const segment of rightWallSegments) {
    room.add(segment);
  }

  const outsideSky = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 1.4),
    new THREE.MeshBasicMaterial({
      color: "#b9d8ec"
    })
  );
  outsideSky.position.set(3.55, 1.45, 0);
  outsideSky.rotation.y = -Math.PI / 2;
  room.add(outsideSky);

  const windowFrameMaterial = new THREE.MeshStandardMaterial({
    color: "#7b5f44",
    roughness: 0.7
  });
  room.add(createFrameBar(new THREE.BoxGeometry(0.06, 1.45, 0.08), 3.08, 1.45, 0, windowFrameMaterial));
  room.add(createFrameBar(new THREE.BoxGeometry(0.06, 0.08, 1.65), 3.08, 2.1, 0, windowFrameMaterial));
  room.add(createFrameBar(new THREE.BoxGeometry(0.06, 0.08, 1.65), 3.08, 0.8, 0, windowFrameMaterial));
  room.add(createFrameBar(new THREE.BoxGeometry(0.06, 1.45, 0.08), 3.08, 1.45, -0.82, windowFrameMaterial));
  room.add(createFrameBar(new THREE.BoxGeometry(0.06, 1.45, 0.08), 3.08, 1.45, 0.82, windowFrameMaterial));

  const rug = new THREE.Mesh(
    new THREE.BoxGeometry(2.35, 0.02, 1.8),
    new THREE.MeshStandardMaterial({
      color: "#6f3c2c",
      roughness: 0.92
    })
  );
  rug.position.set(0, 0.01, -0.55);
  room.add(rug);

  const coffeeTable = new THREE.Group();
  const tableTop = new THREE.Mesh(
    new THREE.BoxGeometry(1.05, 0.08, 0.6),
    new THREE.MeshStandardMaterial({
      color: "#6d513c",
      roughness: 0.7
    })
  );
  tableTop.position.y = 0.36;
  coffeeTable.add(tableTop);
  const legGeometry = new THREE.BoxGeometry(0.07, 0.36, 0.07);
  const legMaterial = new THREE.MeshStandardMaterial({
    color: "#4c3929",
    roughness: 0.78
  });
  const legOffsets = [
    [-0.44, 0.18, -0.22],
    [0.44, 0.18, -0.22],
    [-0.44, 0.18, 0.22],
    [0.44, 0.18, 0.22]
  ] as const;
  for (const [x, y, z] of legOffsets) {
    const leg = new THREE.Mesh(legGeometry, legMaterial);
    leg.position.set(x, y, z);
    coffeeTable.add(leg);
  }
  coffeeTable.position.set(0, 0, -0.25);
  room.add(coffeeTable);

  const couch = new THREE.Group();
  const couchMaterial = new THREE.MeshStandardMaterial({
    color: "#c9d0d8",
    roughness: 0.95
  });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.38, 0.9), couchMaterial);
  seat.position.y = 0.36;
  couch.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.68, 0.18), couchMaterial);
  back.position.set(0, 0.7, 0.36);
  couch.add(back);
  const armGeometry = new THREE.BoxGeometry(0.18, 0.58, 0.9);
  const leftArm = new THREE.Mesh(armGeometry, couchMaterial);
  leftArm.position.set(-1.01, 0.56, 0);
  couch.add(leftArm);
  const rightArm = leftArm.clone();
  rightArm.position.x = 1.01;
  couch.add(rightArm);
  couch.position.set(0, 0, 1.25);
  room.add(couch);

  const tvStand = new THREE.Mesh(
    new THREE.BoxGeometry(2.3, 0.4, 0.45),
    new THREE.MeshStandardMaterial({
      color: "#554231",
      roughness: 0.8
    })
  );
  tvStand.position.set(0, 0.22, -2.5);
  room.add(tvStand);

  const tvFrame = new THREE.Mesh(
    new THREE.BoxGeometry(1.62, 0.98, 0.06),
    new THREE.MeshStandardMaterial({
      color: "#171717",
      metalness: 0.18,
      roughness: 0.35
    })
  );
  tvFrame.position.set(0, 1.52, -2.92);
  room.add(tvFrame);

  const pictureFrame = new THREE.Mesh(
    new THREE.BoxGeometry(1.24, 0.82, 0.05),
    new THREE.MeshStandardMaterial({
      color: "#6f5238",
      metalness: 0.04,
      roughness: 0.64
    })
  );
  pictureFrame.position.set(0, 1.58, 3.02);
  room.add(pictureFrame);

  const pictureBacking = new THREE.Mesh(
    new THREE.BoxGeometry(1.18, 0.76, 0.02),
    new THREE.MeshStandardMaterial({
      color: "#140f0c",
      roughness: 0.82
    })
  );
  pictureBacking.position.set(0, 1.58, 2.995);
  room.add(pictureBacking);

  const lampBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.22, 0.04, 24),
    new THREE.MeshStandardMaterial({
      color: "#2e2f33",
      roughness: 0.68
    })
  );
  lampBase.position.set(-1.65, 0.02, -0.55);
  room.add(lampBase);
  const lampPole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 1.48, 16),
    new THREE.MeshStandardMaterial({
      color: "#44474c",
      roughness: 0.48
    })
  );
  lampPole.position.set(-1.65, 0.78, -0.55);
  room.add(lampPole);
  const lampShade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.34, 0.36, 24, 1, true),
    new THREE.MeshStandardMaterial({
      color: "#f1e1c7",
      side: THREE.DoubleSide,
      roughness: 0.92
    })
  );
  lampShade.position.set(-1.65, 1.45, -0.55);
  room.add(lampShade);

  const rearViewCamera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 40);
  const mirrorSize = { width: 640, height: 360 };

  const tvAnchor: PanelAnchor = {
    position: { x: 0, y: 1.52, z: -2.88 },
    quaternion: { x: 0, y: 0, z: 0, w: 1 }
  };
  const mirrorAnchor: PanelAnchor = {
    position: { x: -3.02, y: 1.52, z: 0 },
    quaternion: {
      x: 0,
      y: Math.sin(Math.PI / 4),
      z: 0,
      w: Math.cos(Math.PI / 4)
    }
  };
  const pictureAnchor: PanelAnchor = {
    position: { x: 0, y: 1.58, z: 3.0 },
    quaternion: {
      x: 0,
      y: 1,
      z: 0,
      w: 0
    }
  };

  function applyState(state: RoomDemoState): void {
    lampLight.intensity = state.lightOn ? 2.2 : 0.12;
    const bulbMaterial = lampBulb.material;
    if (bulbMaterial instanceof THREE.MeshStandardMaterial) {
      bulbMaterial.emissiveIntensity = state.lightOn ? 1.7 : 0.1;
    }
  }

  function syncRearViewCamera(viewerCamera: THREE.Camera): void {
    viewerCamera.getWorldPosition(rearViewCamera.position);
    viewerCamera.getWorldQuaternion(rearViewCamera.quaternion);
    rearViewCamera.rotateY(Math.PI);
    rearViewCamera.updateMatrixWorld(true);
  }

  return {
    scene,
    camera,
    lampLight,
    tvAnchor,
    mirrorAnchor,
    pictureAnchor,
    rearViewCamera,
    mirrorSize,
    applyState,
    syncRearViewCamera
  };
}

function createWall(
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  depth: number,
  color: string
): THREE.Mesh {
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.96
    })
  );
  wall.position.set(x, y, z);
  return wall;
}

function createFrameBar(
  geometry: THREE.BufferGeometry,
  x: number,
  y: number,
  z: number,
  material: THREE.Material
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  return mesh;
}
