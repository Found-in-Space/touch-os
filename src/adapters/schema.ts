import {
  createButton,
  createSlider,
  createTextLabel,
  createToggle,
  createValueReadout
} from "../components/index.js";
import { createColumn, createPageContainer, createScrollContainer } from "../containers/index.js";
import {
  type DisplayComponent,
  type DisplayNode,
  createNode
} from "../core/component.js";

export interface SchemaPage {
  id: string;
  title?: string;
  items: readonly SchemaItem[];
}

export interface SchemaDocument {
  pages: readonly SchemaPage[];
  initialPageId?: string;
}

export interface SchemaTextItem {
  kind: "text";
  id: string;
  text: string;
}

export interface SchemaButtonItem {
  kind: "button";
  id: string;
  label: string;
  actionId: string;
  disabled?: boolean;
}

export interface SchemaToggleItem {
  kind: "toggle";
  id: string;
  label: string;
  field: string;
  value: boolean;
}

export interface SchemaSliderItem {
  kind: "slider";
  id: string;
  label: string;
  field: string;
  value: number;
  min: number;
  max: number;
  step?: number;
}

export interface SchemaReadoutItem {
  kind: "readout";
  id: string;
  label: string;
  value: string;
}

export type SchemaItem =
  | SchemaTextItem
  | SchemaButtonItem
  | SchemaToggleItem
  | SchemaSliderItem
  | SchemaReadoutItem;

export interface SchemaAdapterController {
  setSchema(schema: SchemaDocument): void;
  setField(field: string, value: unknown): void;
  setText(id: string, text: string): void;
}

export interface SchemaAdapter {
  root: DisplayNode<SchemaAdapterProps>;
  controller: SchemaAdapterController;
}

interface SchemaAdapterProps {
  store: SchemaAdapterStore;
}

interface SchemaAdapterStore {
  schema: SchemaDocument;
  fields: Map<string, unknown>;
  texts: Map<string, string>;
  invalidateLayout?: () => void;
  invalidateRender?: () => void;
}

const SchemaAdapterComponent: DisplayComponent<SchemaAdapterProps> = {
  kind: "schema-adapter",
  mount(ctx) {
    bindStore(ctx.props.store, ctx.invalidateLayout, ctx.invalidateRender);
  },
  update(ctx) {
    bindStore(ctx.props.store, ctx.invalidateLayout, ctx.invalidateRender);
  },
  getChildren(ctx) {
    return [createSchemaPages(ctx.id, ctx.props.store)];
  },
  measure(ctx) {
    return ctx.measureChild(getPagesId(ctx.id));
  },
  layout(ctx) {
    ctx.setChildBounds(getPagesId(ctx.id), ctx.bounds);
    ctx.setContentBounds(ctx.bounds);
  },
  render() {
    return [];
  },
  hitTest() {
    return null;
  },
  dispose(ctx) {
    delete ctx.props.store.invalidateLayout;
    delete ctx.props.store.invalidateRender;
  }
};

export function createSchemaAdapter(id: string, schema: SchemaDocument): SchemaAdapter {
  const store: SchemaAdapterStore = {
    schema,
    fields: new Map(),
    texts: new Map()
  };

  const controller: SchemaAdapterController = {
    setSchema(nextSchema) {
      store.schema = nextSchema;
      store.invalidateLayout?.();
    },
    setField(field, value) {
      store.fields.set(field, value);
      store.invalidateLayout?.();
    },
    setText(itemId, text) {
      store.texts.set(itemId, text);
      store.invalidateLayout?.();
    }
  };

  return {
    root: createNode(id, SchemaAdapterComponent, { store }),
    controller
  };
}

function bindStore(
  store: SchemaAdapterStore,
  invalidateLayout: () => void,
  invalidateRender: () => void
): void {
  store.invalidateLayout = invalidateLayout;
  store.invalidateRender = invalidateRender;
}

function getPagesId(adapterId: string): string {
  return `${adapterId}:pages`;
}

function createSchemaPages(adapterId: string, store: SchemaAdapterStore): DisplayNode {
  return createPageContainer(getPagesId(adapterId), {
    ...(store.schema.initialPageId === undefined
      ? {}
      : { initialPageId: store.schema.initialPageId }),
    children: store.schema.pages.map((page) => createSchemaPage(page, store))
  });
}

function createSchemaPage(page: SchemaPage, store: SchemaAdapterStore): DisplayNode {
  return createScrollContainer(page.id, {
    children: [
      createColumn(`${page.id}:content`, {
        children: [
          ...(page.title
            ? [
                createTextLabel(`${page.id}:title`, {
                  text: page.title
                })
              ]
            : []),
          ...page.items.map((item) => createSchemaItem(item, store))
        ]
      })
    ]
  });
}

function createSchemaItem(item: SchemaItem, store: SchemaAdapterStore): DisplayNode {
  switch (item.kind) {
    case "text":
      return createTextLabel(item.id, {
        text: store.texts.get(item.id) ?? item.text
      });
    case "button":
      return createButton(item.id, {
        label: store.texts.get(item.id) ?? item.label,
        actionId: item.actionId,
        ...(item.disabled === undefined ? {} : { disabled: item.disabled })
      });
    case "toggle":
      return createToggle(item.id, {
        label: item.label,
        field: item.field,
        value: readFieldValue(store, item.field, item.value)
      });
    case "slider":
      return createSlider(item.id, {
        label: item.label,
        field: item.field,
        value: readFieldValue(store, item.field, item.value),
        min: item.min,
        max: item.max,
        ...(item.step === undefined ? {} : { step: item.step })
      });
    case "readout":
      return createValueReadout(item.id, {
        label: item.label,
        value: store.texts.get(item.id) ?? item.value
      });
  }
}

function readFieldValue<TValue>(
  store: SchemaAdapterStore,
  field: string,
  fallback: TValue
): TValue {
  return (store.fields.get(field) as TValue | undefined) ?? fallback;
}
