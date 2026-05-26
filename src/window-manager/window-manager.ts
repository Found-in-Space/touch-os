import type { RuntimeOutput, WindowStateChangeEvent } from "../core/actions.js";
import type { DisplayNode } from "../core/component.js";
import type { AppShellChange } from "../app-shell/app-shell-events.js";
import { createAppShell } from "../app-shell/app-shell-core.js";
import { createDesktopWindowPresentation } from "../app-shell/presentations/desktop-window-presentation.js";
import {
  copyTouchWindowState,
  type WindowManagerChange,
  type WindowManagerProps
} from "./window-state.js";

export function createWindowManager(
  id: string,
  props: WindowManagerProps
): DisplayNode<WindowManagerProps> {
  return createAppShell(id, {
    registry: props.registry,
    presentation: props.presentation ?? createDesktopWindowPresentation({
      ...(props.utilityWindows !== undefined ? { utilityWindows: props.utilityWindows } : {}),
      ...(props.pointerOpaque !== undefined ? { pointerOpaque: props.pointerOpaque } : {}),
      ...(props.constraintPadding !== undefined ? { constraintPadding: props.constraintPadding } : {}),
      ...(props.focusOnPress !== undefined ? { focusOnPress: props.focusOnPress } : {}),
      ...(props.windowControls !== undefined ? { windowControls: props.windowControls } : {})
    }),
    ...(props.appHostMode !== undefined ? { appHostMode: props.appHostMode } : {}),
    ...(props.initialWindows !== undefined ? { initialSessions: props.initialWindows } : {}),
    ...(props.launcher !== undefined ? { launcher: props.launcher } : {}),
    ...(props.taskSwitcher !== undefined ? { taskSwitcher: props.taskSwitcher } : {}),
    ...(props.homeKey !== undefined ? { homeKey: props.homeKey } : {}),
    ...(props.keepAlive !== undefined ? { keepAlive: props.keepAlive } : {}),
    ...(props.appStates !== undefined ? { appStates: props.appStates } : {}),
    ...(props.getAppState !== undefined
      ? { getAppState: (session) => props.getAppState?.(session) }
      : {}),
    ...(props.forwardAppOutputs !== undefined ? { forwardAppOutputs: props.forwardAppOutputs } : {}),
    ...(props.storage !== undefined ? { storage: props.storage } : {}),
    ...(props.surfaces !== undefined ? { surfaces: props.surfaces } : {}),
    ...(props.onAppEvent !== undefined ? { onAppEvent: props.onAppEvent } : {}),
    onShellChange(change) {
      props.onWindowChange?.(mapAppShellChangeToWindowManagerChange(change));
    }
  }) as unknown as DisplayNode<WindowManagerProps>;
}

function mapAppShellChangeToWindowManagerChange(
  change: AppShellChange
): WindowManagerChange {
  return {
    type: mapAppShellChangeReason(change.type),
    ...(change.windowId ? { windowId: change.windowId } : {}),
    ...(change.appId ? { appId: change.appId } : {}),
    ...(change.instanceId ? { instanceId: change.instanceId } : {}),
    ...(change.session ? { window: copyTouchWindowState(change.session) } : {}),
    ...(change.event ? { event: change.event } : {}),
    ...(isWindowStateChangeOutput(change.output) ? { output: change.output } : {}),
    ...(change.title !== undefined ? { title: change.title } : {}),
    ...(change.size ? { size: change.size } : {}),
    ...(change.targetAppId ? { targetAppId: change.targetAppId } : {}),
    ...(change.options ? { options: change.options } : {})
  };
}

function mapAppShellChangeReason(change: AppShellChange["type"]): WindowManagerChange["type"] {
  switch (change) {
    case "window-state":
    case "set-title":
    case "request-close":
    case "request-resize":
    case "open-app":
      return change;
    case "activate-session":
    case "close-session":
    case "shell-mode":
      return "window-state";
  }
}

function isWindowStateChangeOutput(
  output: RuntimeOutput | undefined
): output is WindowStateChangeEvent {
  return output?.type === "window-state-change";
}
