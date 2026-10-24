import type * as THREE from "three";
import { createRuntime, type DisplayRuntime, type RuntimeOptions } from "../core/runtime.js";
import type { RuntimeOutput } from "../core/actions.js";
import type { DisplayNode } from "../core/component.js";
import type { InteractionInput, InteractionSource, InteractionTarget } from "../interaction/contracts.js";
import {
  createScenePanelHost, createPoseAnchoredPanelHost, createThreeTextureCompositePresenter,
  isThreeTextureSurfaceHandle, resolveCompositeSurfacePlacements,
  type ThreePanelHost, type ThreePanelHostFrame, type ThreePanelHostOptions,
  type PoseAnchoredPanelHostOptions, type ThreeTextureCompositePresenter
} from "./three.js";
import { createThreeInteractionContext } from "./interaction-three.js";
import { createThreePanelTarget } from "./interaction-panel.js";
import { createThreePointerFeedback, type InteractionPresenter } from "./interaction-feedback.js";
import { createDesktopInteractionInput, type InteractionInputAdapter, type InteractionInputFrame } from "./interaction-input.js";
import type { ThreeInteractionOcclusion } from "./interaction-occlusion.js";

export interface ThreePanelViewOptions {
  id: string;
  content: DisplayNode | (() => DisplayNode);
  surface?: RuntimeOptions["surface"];
  theme?: RuntimeOptions["theme"];
  /** A supplied runtime is borrowed. Input state must not be shared across views. */
  runtime?: DisplayRuntime;
  canvas?: HTMLElement;
  placement?: Omit<PoseAnchoredPanelHostOptions, "runtime" | "surface" | "renderOnUpdate">;
  mode?: "spatial" | "overlay";
  anchor?: boolean;
  priority?: number;
  background?: "block" | "fallthrough";
  bind?: (output: RuntimeOutput, view: ThreePanelView) => void;
}
export interface ThreePanelView {
  id: string;
  runtime: DisplayRuntime;
  host: ThreePanelHost;
  attach(): void;
  detach(): void;
  hide(): void;
  show(): void;
  setContent(content: DisplayNode): void;
  dispose(): void;
}
/** Creates input, feedback and routing once; panels supply content, bindings and placement. */
export function createThreeUIEnvironment(options: {
  parent: THREE.Object3D;
  inputs?: readonly InteractionInputAdapter[];
  /** Supplied adapters/presenters are borrowed unless explicitly owned. */
  ownsInputs?: boolean;
  presenter?: InteractionPresenter;
  ownsPresenter?: boolean;
  mode?: "spatial" | "overlay";
  /** Default: opaque scene meshes block rays. Use a bounded root/custom policy, or false to disable scene occlusion. */
  occlusion?: ThreeInteractionOcclusion | false;
}) {
  let scene: THREE.Object3D | undefined;
  const panelMeshes = new WeakSet<THREE.Object3D>();
  const occlusion = options.occlusion === false ? undefined : {
    root: options.occlusion?.root ?? (() => {
      if (scene) return scene;
      let root = options.parent;
      while (root.parent) root = root.parent;
      return root;
    }),
    exclude: (object: THREE.Object3D) => panelMeshes.has(object) || !!(options.occlusion && options.occlusion.exclude?.(object)),
    ...(options.occlusion && options.occlusion.blocks ? { blocks: options.occlusion.blocks } : {})
  };
  const interaction = createThreeInteractionContext(occlusion ? { occlusion } : {});
  const inputs = [...(options.inputs ?? [])];
  const presenter = options.presenter ?? createThreePointerFeedback({ parent: options.parent, ...(options.mode ? { mode: options.mode } : {}) });
  const panels = new Map<string, { view: ThreePanelView; content: ThreePanelViewOptions["content"]; attached: boolean; visible: boolean; canvasOnly: boolean; flush(): void; composites: Map<string, ThreeTextureCompositePresenter> }>();
  let disposed = false;
  let now = 0;
  function flush(runtime: DisplayRuntime, bind: ThreePanelViewOptions["bind"], view: ThreePanelView) {
    if (!bind) return false;
    const outputs = runtime.takeOutputs();
    for (const output of outputs) bind(output, view);
    return outputs.length > 0;
  }
  const environment = {
    interaction,
    registerTarget(target: InteractionTarget) { return interaction.register(target); },
    mountPanel(config: ThreePanelViewOptions): ThreePanelView {
      assertAlive();
      if (panels.has(config.id)) throw new Error(`Duplicate view: ${config.id}`);
      if (config.runtime && Array.from(panels.values()).some(panel => panel.view.runtime === config.runtime)) {
        throw new Error("Each view needs its own runtime for independent input and layout.");
      }
      const runtime = config.runtime ?? createRuntime({ root: typeof config.content === "function" ? config.content() : config.content,
        ...(config.surface ? { surface: config.surface } : {}), ...(config.theme ? { theme: config.theme } : {}) });
      const overlay = (config.mode ?? options.mode) === "overlay";
      const canvas = config.canvas?.ownerDocument.createElement("canvas");
      if (canvas) { canvas.style.cssText = "display:block;width:100%;height:auto;touch-action:none"; canvas.setAttribute("aria-label", config.id); }
      const hostOptions: ThreePanelHostOptions = { ...config.placement, parent: config.placement?.parent ?? options.parent,
        ...(canvas ? { createCanvas: metrics => { canvas.width = Math.round(metrics.width * metrics.pixelDensity); canvas.height = Math.round(metrics.height * metrics.pixelDensity); return canvas as unknown as import("./three.js").CanvasLike; } } : {}),
        runtime, renderOnUpdate: false, ...(config.surface ? { surface: config.surface } : {}),
        ...(overlay ? { depthTest: false, depthWrite: false, renderOrder: 10000 } : {}) };
      const host = config.anchor ? createPoseAnchoredPanelHost({ ...config.placement, ...hostOptions }) : createScenePanelHost(hostOptions);
      panelMeshes.add(host.mesh);
      let retired = false;
      const view: ThreePanelView = {
        id: config.id, runtime, host,
        attach() {
          assertAlive();
          if (panel.attached) return;
          host.attach(); panel.attached = true;
          if (canvas) config.canvas?.append(canvas);
        },
        detach() {
          if (!panel.attached) return;
          interaction.cancelTarget(config.id); panel.flush(); host.detach(); panel.attached = false;
          desktop?.reset(); canvas?.remove();
          clearComposites();
        },
        hide() { interaction.cancelTarget(config.id); panel.visible = false; host.mesh.visible = false; if (canvas) canvas.hidden = true; clearComposites(); panel.flush(); },
        show() { panel.visible = true; if (canvas) canvas.hidden = false; },
        setContent(content) { runtime.setRoot(content); },
        dispose() {
          if (!panels.has(config.id)) return;
          view.detach(); retired = true; unregister(); panelMeshes.delete(host.mesh); host.dispose();
          if (!config.runtime) runtime.dispose();
          panel.flush(); panels.delete(config.id);
          if (desktop) { desktop.dispose(); const index = inputs.indexOf(desktop); if (index >= 0) inputs.splice(index, 1); }
        }
      };
      const panel = { view, content: config.content, attached: false, visible: true, canvasOnly: !!config.canvas,
        flush: () => {
          const changed = flush(runtime, config.bind, view);
          if (changed && !retired && typeof config.content === "function") runtime.setRoot(config.content());
        }, composites: new Map<string, ThreeTextureCompositePresenter>() };
      const desktop = canvas ? createDesktopInteractionInput({ element: canvas, surface: () => ({ targetId: config.id, ...host.getSurfaceMetrics() }) }) : undefined;
      if (desktop) inputs.push(desktop);
      const unregister = interaction.register(createThreePanelTarget({ id: config.id, runtime, host,
        priority: config.priority ?? (overlay ? 1000 : 0),
        occlusion: overlay ? "none" : "scene",
        ...(config.background ? { background: config.background } : {}),
        enabled: () => panel.attached && panel.visible && (!!config.canvas || host.mesh.visible), surfaceOnly: !!config.canvas,
        flush: panel.flush }));
      panels.set(config.id, panel); view.attach();
      return view;
      function clearComposites() { for (const composite of panel.composites.values()) composite.dispose(); panel.composites.clear(); }
    },
    update(frame: ThreePanelHostFrame & InteractionInputFrame & { sources?: readonly InteractionSource[]; edges?: readonly InteractionInput[] }) {
      assertAlive(); now = frame.timestamp; scene = frame.scene;
      // Prepare all placements before any query. Timing is advanced once per distinct runtime.
      for (const panel of panels.values()) {
        if (!panel.attached) continue;
        panel.view.host.prepare({ ...frame, events: [] });
        if (!panel.visible || panel.canvasOnly || !panel.view.host.mesh.parent) panel.view.host.mesh.visible = false;
      }
      const sources = [...(frame.sources ?? [])], edges = [...(frame.edges ?? [])];
      for (const input of inputs) { const sample = input.sample(frame); sources.push(...sample.sources); edges.push(...sample.edges); }
      edges.sort((a, b) => a.timestamp - b.timestamp);
      interaction.frame(now, sources, edges);
      const advanced = new Set<DisplayRuntime>();
      for (const panel of panels.values()) {
        if (!panel.attached) continue;
        const { runtime, host } = panel.view;
        if (!advanced.has(runtime)) { runtime.tick(now); advanced.add(runtime); }
        panel.flush(); host.render();
        const current = new Set<string>();
        for (const placement of host.mesh.visible ? resolveCompositeSurfacePlacements(host) : []) {
          if (!isThreeTextureSurfaceHandle(placement.command.handle)) continue;
          current.add(placement.componentId);
          let composite = panel.composites.get(placement.componentId);
          if (!composite) {
            composite = createThreeTextureCompositePresenter(host, { componentId: placement.componentId }); panel.composites.set(placement.componentId, composite);
          }
          composite.update();
        }
        for (const [id, composite] of panel.composites) if (!current.has(id)) { composite.dispose(); panel.composites.delete(id); }
      }
      presenter.update(interaction.getSnapshots());
    },
    dispose() {
      if (disposed) return;
      for (const panel of [...panels.values()]) panel.view.dispose();
      interaction.dispose(); presenter.update([]);
      if (options.ownsInputs) for (const input of inputs) input.dispose();
      if (!options.presenter || options.ownsPresenter) presenter.dispose();
      disposed = true;
    }
  };
  return environment;
  function assertAlive() { if (disposed) throw new Error("UI environment is disposed."); }
}
export type ThreeUIEnvironment = ReturnType<typeof createThreeUIEnvironment>;
