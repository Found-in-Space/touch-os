export interface ActionEvent {
  type: "action";
  actionId: string;
  componentId: string;
  payload?: Record<string, unknown>;
}

export interface ChangeRequestEvent<TValue = unknown> {
  type: "change-request";
  componentId: string;
  field: string;
  value: TValue;
}

export interface NavigationRequestEvent {
  type: "navigation-request";
  componentId: string;
  containerId: string;
  intent: "push" | "replace" | "back";
  pageId?: string;
}

export type RuntimeOutput =
  | ActionEvent
  | ChangeRequestEvent<unknown>
  | NavigationRequestEvent;
