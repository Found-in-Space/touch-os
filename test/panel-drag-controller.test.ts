import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  createColumn,
  createDragHandle,
  createPanelDragController,
  createPanelInteractor,
  createRuntime
} from "../src/index.js";
import { createScenePanelHost } from "../src/hosts/three.js";
import { createFakeCanvas } from "./helpers/fake-canvas.js";

describe("panel drag controller", () => {
  it("moves a panel from drag-handle input and clamps movement within configured bounds", () => {
    const runtime = createRuntime({
      root: createColumn("tv-root", {
        pointerOpaque: true,
        children: [createDragHandle("tv-drag", { label: "Move TV" })]
      }),
      surface: { width: 320, height: 180 }
    });

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 10);
    camera.position.set(0, 0, 2);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    scene.add(camera);

    const host = createScenePanelHost({
      runtime,
      surface: { width: 320, height: 180 },
      panelWidth: 1.2,
      panelHeight: 0.675,
      createCanvas: createFakeCanvas
    });
    host.attach();
    host.update({ scene, camera });

    const interactor = createPanelInteractor({
      runtime,
      mesh: host.mesh,
      getSurfaceMetrics: () => host.getSurfaceMetrics()
    });
    const controller = createPanelDragController({
      mesh: host.mesh,
      bounds: {
        minX: -0.2,
        maxX: 0.2,
        minY: -0.15,
        maxY: 0.15
      }
    });

    const down = {
      pointerId: "mouse",
      pointerType: "mouse" as const,
      transport: "screen" as const,
      phase: "down" as const,
      timestamp: 1,
      ndcX: 0,
      ndcY: 0
    };
    const downResult = interactor.process(down, { scene, camera });
    const start = controller.process(down, { scene, camera }, downResult);

    const move = {
      ...down,
      phase: "move" as const,
      timestamp: 2,
      ndcX: 0.8,
      ndcY: 0
    };
    const moveResult = interactor.process(move, { scene, camera });
    const moved = controller.process(move, { scene, camera }, moveResult);

    expect(start.active).toBe(true);
    expect(moved.moved).toBe(true);
    expect(host.mesh.position.x).toBeCloseTo(0.2, 5);
    expect(host.mesh.position.y).toBeCloseTo(0, 5);

    controller.process(
      {
        ...down,
        phase: "up",
        timestamp: 3
      },
      { scene, camera },
      interactor.process(
        {
          ...down,
          phase: "up",
          timestamp: 3
        },
        { scene, camera }
      )
    );

    expect(controller.isActive()).toBe(false);
    host.detach();
  });
});
