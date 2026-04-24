import {
  createActionCard,
  createButton,
  createChoiceGroup,
  createSlider,
  createTextLabel,
  createToggle,
  createValueReadout
} from "../components/index.js";
import {
  normalizeChoiceGroupProps,
  type ChoiceOption
} from "../components/choice-group-contract.js";
import {
  normalizeSliderProps,
  type SliderValueLabel
} from "../components/slider-contract.js";
import {
  normalizeActionCardProps,
  type ActionCardProps
} from "../components/action-card-contract.js";
import { createColumn, createPageContainer, createScrollContainer } from "../containers/index.js";
import {
  type DisplayComponent,
  type DisplayNode,
  createNode
} from "../core/component.js";

export interface SchemaBaseItem {
  kind: string;
  id: string;
}

export interface SchemaTextItem extends SchemaBaseItem {
  kind: "text";
  text: string;
}

export interface SchemaButtonItem extends SchemaBaseItem {
  kind: "button";
  label: string;
  actionId: string;
  disabled?: boolean;
}

export interface SchemaToggleItem extends SchemaBaseItem {
  kind: "toggle";
  label: string;
  field: string;
  value: boolean;
}

export interface SchemaSliderItem extends SchemaBaseItem {
  kind: "slider";
  label: string;
  field: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  valueText?: string;
  valueTextField?: string;
  valueLabels?: readonly SliderValueLabel[];
}

export interface SchemaChoiceGroupItem extends SchemaBaseItem {
  kind: "choice-group";
  label?: string;
  field: string;
  selectionMode: "single" | "multiple";
  value?: string;
  values?: readonly string[];
  orientation?: "vertical" | "horizontal";
  columns?: number;
  options: readonly ChoiceOption[];
  disabled?: boolean;
}

export interface SchemaReadoutItem extends SchemaBaseItem {
  kind: "readout";
  id: string;
  label: string;
  value: string;
}

export type SchemaActionCardItem = SchemaBaseItem &
  ActionCardProps & {
    kind: "action-card";
  };

export interface SchemaCustomItem extends SchemaBaseItem {
  [key: string]: unknown;
}

export type SchemaBuiltinItem =
  | SchemaTextItem
  | SchemaButtonItem
  | SchemaToggleItem
  | SchemaSliderItem
  | SchemaChoiceGroupItem
  | SchemaReadoutItem
  | SchemaActionCardItem;

export type SchemaItem<TCustomItem extends SchemaCustomItem = never> =
  | SchemaBuiltinItem
  | TCustomItem;

export interface SchemaPage<TCustomItem extends SchemaCustomItem = never> {
  id: string;
  title?: string;
  items: readonly SchemaItem<TCustomItem>[];
}

export interface SchemaDocument<TCustomItem extends SchemaCustomItem = never> {
  version?: 1;
  pages: readonly SchemaPage<TCustomItem>[];
  initialPageId?: string;
}

export interface SchemaBuildContext {
  readField<TValue>(field: string, fallback: TValue): TValue;
  readText(itemId: string, fallback: string): string;
}

export interface SchemaKindRegistration<TItem extends SchemaCustomItem = SchemaCustomItem> {
  kind: TItem["kind"];
  validate(item: unknown): TItem;
  createNode(item: TItem, context: SchemaBuildContext): DisplayNode;
}

export interface SchemaAdapterOptions<TCustomItem extends SchemaCustomItem = never> {
  registrations?: readonly SchemaKindRegistration<TCustomItem>[];
}

export interface SchemaAdapterController<TCustomItem extends SchemaCustomItem = never> {
  setSchema(schema: SchemaDocument<TCustomItem>): void;
  setField(field: string, value: unknown): void;
  setText(id: string, text: string): void;
  replaceItem(itemId: string, nextItem: SchemaItem<TCustomItem>): void;
}

export interface SchemaAdapter<TCustomItem extends SchemaCustomItem = never> {
  root: DisplayNode<unknown>;
  controller: SchemaAdapterController<TCustomItem>;
}

interface SchemaAdapterProps<TCustomItem extends SchemaCustomItem = never> {
  store: SchemaAdapterStore<TCustomItem>;
}

interface SchemaAdapterStore<TCustomItem extends SchemaCustomItem = never> {
  schema: SchemaDocument<TCustomItem>;
  compiled: CompiledSchemaDocument;
  fields: Map<string, unknown>;
  texts: Map<string, string>;
  registrations: Map<string, ErasedSchemaRegistration>;
  invalidateLayout?: () => void;
  invalidateRender?: () => void;
}

interface CompiledSchemaItem {
  id: string;
  createNode(context: SchemaBuildContext): DisplayNode;
}

interface CompiledSchemaPage {
  id: string;
  title?: string;
  items: readonly CompiledSchemaItem[];
}

interface CompiledSchemaDocument {
  version: 1;
  pages: readonly CompiledSchemaPage[];
  initialPageId?: string;
  itemLocations: ReadonlyMap<string, CompiledItemLocation>;
}

interface CompiledItemLocation {
  pageIndex: number;
  itemIndex: number;
}

interface SchemaItemRegistration<TItem extends SchemaBaseItem> {
  kind: TItem["kind"];
  validate(item: unknown): TItem;
  createNode(item: TItem, context: SchemaBuildContext): DisplayNode;
}

type SchemaAnyItem = SchemaBuiltinItem | SchemaCustomItem;

interface ErasedSchemaRegistration {
  kind: string;
  validate(item: unknown): SchemaAnyItem;
  createNode(item: SchemaAnyItem, context: SchemaBuildContext): DisplayNode;
}

const BUILTIN_REGISTRATIONS: readonly ErasedSchemaRegistration[] = [
  eraseRegistration<SchemaTextItem>({
    kind: "text",
    validate(item) {
      const record = expectRecord(item, "Schema text item");
      return {
        kind: "text",
        id: readRequiredStringProperty(record, "id", "Schema text item id"),
        text: readRequiredStringProperty(record, "text", "Schema text item text")
      };
    },
    createNode(item, context) {
      return createTextLabel(item.id, {
        text: context.readText(item.id, item.text)
      });
    }
  }),
  eraseRegistration<SchemaButtonItem>({
    kind: "button",
    validate(item) {
      const record = expectRecord(item, "Schema button item");
      const disabled = readOptionalBooleanProperty(
        record,
        "disabled",
        "Schema button item disabled"
      );
      return {
        kind: "button",
        id: readRequiredStringProperty(record, "id", "Schema button item id"),
        label: readRequiredStringProperty(record, "label", "Schema button item label"),
        actionId: readRequiredStringProperty(record, "actionId", "Schema button item actionId"),
        ...(disabled === undefined ? {} : { disabled })
      };
    },
    createNode(item, context) {
      return createButton(item.id, {
        label: context.readText(item.id, item.label),
        actionId: item.actionId,
        ...(item.disabled === undefined ? {} : { disabled: item.disabled })
      });
    }
  }),
  eraseRegistration<SchemaToggleItem>({
    kind: "toggle",
    validate(item) {
      const record = expectRecord(item, "Schema toggle item");
      return {
        kind: "toggle",
        id: readRequiredStringProperty(record, "id", "Schema toggle item id"),
        label: readRequiredStringProperty(record, "label", "Schema toggle item label"),
        field: readRequiredStringProperty(record, "field", "Schema toggle item field"),
        value: readRequiredBooleanProperty(record, "value", "Schema toggle item value")
      };
    },
    createNode(item, context) {
      return createToggle(item.id, {
        label: item.label,
        field: item.field,
        value: context.readField(item.field, item.value)
      });
    }
  }),
  eraseRegistration<SchemaSliderItem>({
    kind: "slider",
    validate(item) {
      const record = expectRecord(item, "Schema slider item");
      const step = readOptionalNumberProperty(record, "step", "Schema slider item step");
      const disabled = readOptionalBooleanProperty(
        record,
        "disabled",
        "Schema slider item disabled"
      );
      const valueText = readOptionalStringProperty(
        record,
        "valueText",
        "Schema slider item valueText"
      );
      const valueTextField = readOptionalStringProperty(
        record,
        "valueTextField",
        "Schema slider item valueTextField"
      );
      const valueLabels = readOptionalSliderValueLabelsProperty(
        record,
        "valueLabels",
        "Schema slider item valueLabels"
      );
      const validatedItem: SchemaSliderItem = {
        kind: "slider",
        id: readRequiredStringProperty(record, "id", "Schema slider item id"),
        label: readRequiredStringProperty(record, "label", "Schema slider item label"),
        field: readRequiredStringProperty(record, "field", "Schema slider item field"),
        value: readRequiredNumberProperty(record, "value", "Schema slider item value"),
        min: readRequiredNumberProperty(record, "min", "Schema slider item min"),
        max: readRequiredNumberProperty(record, "max", "Schema slider item max"),
        ...(step === undefined ? {} : { step }),
        ...(disabled === undefined ? {} : { disabled }),
        ...(valueText === undefined ? {} : { valueText }),
        ...(valueTextField === undefined ? {} : { valueTextField }),
        ...(valueLabels === undefined ? {} : { valueLabels })
      };

      normalizeSliderProps(
        {
          label: validatedItem.label,
          field: validatedItem.field,
          value: validatedItem.value,
          min: validatedItem.min,
          max: validatedItem.max,
          ...(validatedItem.step === undefined ? {} : { step: validatedItem.step }),
          ...(validatedItem.disabled === undefined ? {} : { disabled: validatedItem.disabled }),
          ...(validatedItem.valueText === undefined ? {} : { valueText: validatedItem.valueText }),
          ...(validatedItem.valueLabels === undefined
            ? {}
            : { valueLabels: validatedItem.valueLabels })
        },
        "Schema slider item"
      );

      return validatedItem;
    },
    createNode(item, context) {
      const valueText =
        item.valueTextField === undefined
          ? item.valueText
          : context.readField<string | undefined>(item.valueTextField, item.valueText);

      return createSlider(item.id, {
        label: context.readText(item.id, item.label),
        field: item.field,
        value: context.readField(item.field, item.value),
        min: item.min,
        max: item.max,
        ...(item.step === undefined ? {} : { step: item.step }),
        ...(item.disabled === undefined ? {} : { disabled: item.disabled }),
        ...(valueText === undefined ? {} : { valueText }),
        ...(item.valueLabels === undefined ? {} : { valueLabels: item.valueLabels })
      });
    }
  }),
  eraseRegistration<SchemaChoiceGroupItem>({
    kind: "choice-group",
    validate(item) {
      const record = expectRecord(item, "Schema choice-group item");
      const label = readOptionalStringProperty(record, "label", "Schema choice-group item label");
      const value = readOptionalStringProperty(record, "value", "Schema choice-group item value");
      const values = readOptionalStringArrayProperty(
        record,
        "values",
        "Schema choice-group item values"
      );
      const orientation = readOptionalChoiceGroupOrientationProperty(
        record,
        "orientation",
        "Schema choice-group item orientation"
      );
      const columns = readOptionalNumberProperty(
        record,
        "columns",
        "Schema choice-group item columns"
      );
      const disabled = readOptionalBooleanProperty(
        record,
        "disabled",
        "Schema choice-group item disabled"
      );
      const validatedItem: SchemaChoiceGroupItem = {
        kind: "choice-group",
        id: readRequiredStringProperty(record, "id", "Schema choice-group item id"),
        field: readRequiredStringProperty(record, "field", "Schema choice-group item field"),
        selectionMode: readRequiredChoiceGroupSelectionModeProperty(
          record,
          "selectionMode",
          "Schema choice-group item selectionMode"
        ),
        options: readRequiredChoiceOptionsProperty(
          record,
          "options",
          "Schema choice-group item options"
        ),
        ...(label === undefined ? {} : { label }),
        ...(value === undefined ? {} : { value }),
        ...(values === undefined ? {} : { values }),
        ...(orientation === undefined ? {} : { orientation }),
        ...(columns === undefined ? {} : { columns }),
        ...(disabled === undefined ? {} : { disabled })
      };

      normalizeChoiceGroupProps(validatedItem, "Schema choice-group item");
      return validatedItem;
    },
    createNode(item, context) {
      const label =
        item.label === undefined ? undefined : context.readText(item.id, item.label);

      if (item.selectionMode === "single") {
        return createChoiceGroup(item.id, {
          options: item.options,
          selectionMode: item.selectionMode,
          field: item.field,
          ...(label === undefined ? {} : { label }),
          ...(item.value === undefined
            ? {}
            : { value: context.readField(item.field, item.value) }),
          ...(item.orientation === undefined ? {} : { orientation: item.orientation }),
          ...(item.columns === undefined ? {} : { columns: item.columns }),
          ...(item.disabled === undefined ? {} : { disabled: item.disabled })
        });
      }

      return createChoiceGroup(item.id, {
        options: item.options,
        selectionMode: item.selectionMode,
        field: item.field,
        values: context.readField(item.field, item.values ?? []),
        ...(label === undefined ? {} : { label }),
        ...(item.orientation === undefined ? {} : { orientation: item.orientation }),
        ...(item.columns === undefined ? {} : { columns: item.columns }),
        ...(item.disabled === undefined ? {} : { disabled: item.disabled })
      });
    }
  }),
  eraseRegistration<SchemaReadoutItem>({
    kind: "readout",
    validate(item) {
      const record = expectRecord(item, "Schema readout item");
      return {
        kind: "readout",
        id: readRequiredStringProperty(record, "id", "Schema readout item id"),
        label: readRequiredStringProperty(record, "label", "Schema readout item label"),
        value: readRequiredStringProperty(record, "value", "Schema readout item value")
      };
    },
    createNode(item, context) {
      return createValueReadout(item.id, {
        label: item.label,
        value: context.readText(item.id, item.value)
      });
    }
  }),
  eraseRegistration<SchemaActionCardItem>({
    kind: "action-card",
    validate(item) {
      const record = expectRecord(item, "Schema action-card item");
      const lines = readOptionalStringArrayProperty(
        record,
        "lines",
        "Schema action-card item lines"
      );
      const emptyStateText = readOptionalStringProperty(
        record,
        "emptyStateText",
        "Schema action-card item emptyStateText"
      );
      const primaryActionId = readOptionalStringProperty(
        record,
        "primaryActionId",
        "Schema action-card item primaryActionId"
      );
      const primaryActionLabel = readOptionalStringProperty(
        record,
        "primaryActionLabel",
        "Schema action-card item primaryActionLabel"
      );
      const dismissible = readOptionalBooleanProperty(
        record,
        "dismissible",
        "Schema action-card item dismissible"
      );
      const dismissActionId = readOptionalStringProperty(
        record,
        "dismissActionId",
        "Schema action-card item dismissActionId"
      );
      const props = normalizeActionCardProps(
        {
          title: readRequiredStringProperty(record, "title", "Schema action-card item title"),
          ...(lines === undefined ? {} : { lines }),
          ...(emptyStateText === undefined ? {} : { emptyStateText }),
          ...(primaryActionId === undefined ? {} : { primaryActionId }),
          ...(primaryActionLabel === undefined ? {} : { primaryActionLabel }),
          ...(dismissible === undefined ? {} : { dismissible }),
          ...(dismissActionId === undefined ? {} : { dismissActionId })
        },
        "Schema action-card item"
      );

      return {
        kind: "action-card",
        id: readRequiredStringProperty(record, "id", "Schema action-card item id"),
        ...props
      };
    },
    createNode(item) {
      return createActionCard(item.id, item);
    }
  })
];

const SchemaAdapterComponent: DisplayComponent<SchemaAdapterProps<SchemaCustomItem>> = {
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

export function createSchemaAdapter<TCustomItem extends SchemaCustomItem = never>(
  id: string,
  schema: SchemaDocument<TCustomItem>,
  options?: SchemaAdapterOptions<TCustomItem>
): SchemaAdapter<TCustomItem> {
  const registrations = createRegistrationMap(options?.registrations);
  const compiled = compileSchemaDocument(schema, registrations);

  const store: SchemaAdapterStore<TCustomItem> = {
    schema,
    compiled,
    fields: new Map(),
    texts: new Map(),
    registrations
  };

  const controller: SchemaAdapterController<TCustomItem> = {
    setSchema(nextSchema) {
      const compiledSchema = compileSchemaDocument(nextSchema, store.registrations);
      store.schema = nextSchema;
      store.compiled = compiledSchema;
      store.invalidateLayout?.();
    },
    setField(field, value) {
      store.fields.set(field, value);
      store.invalidateLayout?.();
    },
    setText(itemId, text) {
      store.texts.set(itemId, text);
      store.invalidateLayout?.();
    },
    replaceItem(itemId, nextItem) {
      if (nextItem.id !== itemId) {
        throw new Error(
          `Schema item replacement for "${itemId}" must preserve the existing item id.`
        );
      }

      const location = store.compiled.itemLocations.get(itemId);
      if (!location) {
        throw new Error(`Unable to replace schema item "${itemId}" because it does not exist.`);
      }

      const nextPages = store.schema.pages.map((page, pageIndex) => {
        if (pageIndex !== location.pageIndex) {
          return page;
        }

        return {
          ...page,
          items: page.items.map((item, itemIndex) =>
            itemIndex === location.itemIndex ? nextItem : item
          )
        };
      });

      const nextSchema: SchemaDocument<TCustomItem> = {
        ...(store.schema.version === undefined ? {} : { version: store.schema.version }),
        ...(store.schema.initialPageId === undefined
          ? {}
          : { initialPageId: store.schema.initialPageId }),
        pages: nextPages
      };

      const compiledSchema = compileSchemaDocument(nextSchema, store.registrations);
      store.schema = nextSchema;
      store.compiled = compiledSchema;
      store.invalidateLayout?.();
    }
  };

  return {
    root: createNode(id, SchemaAdapterComponent, {
      store: store as SchemaAdapterStore<SchemaCustomItem>
    }),
    controller
  };
}

function bindStore(
  store: SchemaAdapterStore<SchemaCustomItem>,
  invalidateLayout: () => void,
  invalidateRender: () => void
): void {
  store.invalidateLayout = invalidateLayout;
  store.invalidateRender = invalidateRender;
}

function getPagesId(adapterId: string): string {
  return `${adapterId}:pages`;
}

function createSchemaPages(
  adapterId: string,
  store: SchemaAdapterStore<SchemaCustomItem>
): DisplayNode {
  return createPageContainer(getPagesId(adapterId), {
    ...(store.compiled.initialPageId === undefined
      ? {}
      : { initialPageId: store.compiled.initialPageId }),
    children: store.compiled.pages.map((page) => createSchemaPage(page, store))
  });
}

function createSchemaPage(
  page: CompiledSchemaPage,
  store: SchemaAdapterStore<SchemaCustomItem>
): DisplayNode {
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
          ...page.items.map((item) => item.createNode(createBuildContext(store)))
        ]
      })
    ]
  });
}

function createBuildContext(store: SchemaAdapterStore<SchemaCustomItem>): SchemaBuildContext {
  return {
    readField(field, fallback) {
      return readFieldValue(store, field, fallback);
    },
    readText(itemId, fallback) {
      return store.texts.get(itemId) ?? fallback;
    }
  };
}

function readFieldValue<TValue>(
  store: SchemaAdapterStore<SchemaCustomItem>,
  field: string,
  fallback: TValue
): TValue {
  return (store.fields.get(field) as TValue | undefined) ?? fallback;
}

function createRegistrationMap<TCustomItem extends SchemaCustomItem>(
  registrations: readonly SchemaKindRegistration<TCustomItem>[] | undefined
): Map<string, ErasedSchemaRegistration> {
  const map = new Map<string, ErasedSchemaRegistration>();

  for (const registration of BUILTIN_REGISTRATIONS) {
    map.set(registration.kind, registration);
  }

  for (const registration of registrations ?? []) {
    validateRegistrationShape(registration);
    if (map.has(registration.kind)) {
      throw new Error(`Schema kind "${registration.kind}" is already registered.`);
    }
    map.set(registration.kind, eraseRegistration(registration));
  }

  return map;
}

function compileSchemaDocument<TCustomItem extends SchemaCustomItem>(
  schema: SchemaDocument<TCustomItem>,
  registrations: Map<string, ErasedSchemaRegistration>
): CompiledSchemaDocument {
  const schemaRecord = expectRecord(schema as unknown, "Schema document");
  const version = readOptionalLiteralVersion(schemaRecord.version);
  const rawPages = readRequiredArray(schemaRecord.pages, "Schema document pages");
  const initialPageId = readOptionalStringProperty(
    schemaRecord,
    "initialPageId",
    "Schema document initialPageId"
  );
  const pageIds = new Set<string>();
  const itemIds = new Set<string>();
  const itemLocations = new Map<string, CompiledItemLocation>();
  const compiledPages: CompiledSchemaPage[] = rawPages.map((page, pageIndex) => {
    const pagePath = `Schema document page ${pageIndex}`;
    const pageRecord = expectRecord(page, pagePath);
    const pageId = readRequiredStringProperty(pageRecord, "id", `${pagePath} id`);
    const title = readOptionalStringProperty(pageRecord, "title", `${pagePath} title`);
    const rawItems = readRequiredArray(pageRecord.items, `${pagePath} items`);

    if (pageIds.has(pageId)) {
      throw new Error(`Schema document contains duplicate page id "${pageId}".`);
    }
    pageIds.add(pageId);

    const compiledItems = rawItems.map((item, itemIndex) => {
      const itemPath = `${pagePath} item ${itemIndex}`;
      const itemRecord = expectRecord(item, itemPath);
      const kind = readRequiredStringProperty(itemRecord, "kind", `${itemPath} kind`);
      const registration = registrations.get(kind);

      if (!registration) {
        throw new Error(`${itemPath} uses unknown kind "${kind}".`);
      }

      let validatedItem: SchemaAnyItem;
      try {
        validatedItem = registration.validate(item);
      } catch (error) {
        throw new Error(`${itemPath} is invalid: ${toErrorMessage(error)}`);
      }

      const validatedKind = readRequiredString(validatedItem.kind, `${itemPath} kind`);
      const validatedId = readRequiredString(validatedItem.id, `${itemPath} id`);

      if (validatedKind !== kind) {
        throw new Error(
          `${itemPath} validated as kind "${validatedKind}" but was registered as "${kind}".`
        );
      }
      if (itemIds.has(validatedId)) {
        throw new Error(`Schema document contains duplicate item id "${validatedId}".`);
      }

      itemIds.add(validatedId);
      itemLocations.set(validatedId, { pageIndex, itemIndex });

      return {
        id: validatedId,
        createNode(context: SchemaBuildContext) {
          return registration.createNode(validatedItem, context);
        }
      };
    });

    return {
      id: pageId,
      ...(title === undefined ? {} : { title }),
      items: compiledItems
    };
  });

  if (initialPageId !== undefined && !pageIds.has(initialPageId)) {
    throw new Error(
      `Schema document initialPageId "${initialPageId}" does not match any declared page.`
    );
  }

  return {
    version,
    ...(initialPageId === undefined ? {} : { initialPageId }),
    pages: compiledPages,
    itemLocations
  };
}

function eraseRegistration<TItem extends SchemaAnyItem>(
  registration: SchemaItemRegistration<TItem>
): ErasedSchemaRegistration {
  return {
    kind: registration.kind,
    validate(item) {
      return registration.validate(item) as SchemaAnyItem;
    },
    createNode(item, context) {
      return registration.createNode(item as unknown as TItem, context);
    }
  };
}

function validateRegistrationShape<TItem extends SchemaCustomItem>(
  registration: SchemaKindRegistration<TItem>
): void {
  if (typeof registration.kind !== "string" || registration.kind.trim().length === 0) {
    throw new Error("Schema kind registrations require a non-empty kind.");
  }
  if (typeof registration.validate !== "function") {
    throw new Error(`Schema kind "${registration.kind}" is missing a validate function.`);
  }
  if (typeof registration.createNode !== "function") {
    throw new Error(`Schema kind "${registration.kind}" is missing a createNode function.`);
  }
}

function expectRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function readRequiredArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
  return value;
}

function readOptionalLiteralVersion(value: unknown): 1 {
  if (value === undefined) {
    return 1;
  }
  if (value !== 1) {
    throw new Error(`Schema document version must be 1 when provided.`);
  }
  return value;
}

function readRequiredStringProperty(
  record: Record<string, unknown>,
  key: string,
  label: string
): string {
  return readRequiredString(record[key], label);
}

function readOptionalStringProperty(
  record: Record<string, unknown>,
  key: string,
  label: string
): string | undefined {
  return readOptionalString(record[key], label);
}

function readRequiredBooleanProperty(
  record: Record<string, unknown>,
  key: string,
  label: string
): boolean {
  const value = record[key];
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean.`);
  }
  return value;
}

function readOptionalBooleanProperty(
  record: Record<string, unknown>,
  key: string,
  label: string
): boolean | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean.`);
  }
  return value;
}

function readRequiredNumberProperty(
  record: Record<string, unknown>,
  key: string,
  label: string
): number {
  const value = record[key];
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`${label} must be a number.`);
  }
  return value;
}

function readOptionalNumberProperty(
  record: Record<string, unknown>,
  key: string,
  label: string
): number | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`${label} must be a number.`);
  }
  return value;
}

function readOptionalStringArrayProperty(
  record: Record<string, unknown>,
  key: string,
  label: string
): readonly string[] | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array of strings.`);
  }
  for (const entry of value) {
    if (typeof entry !== "string") {
      throw new Error(`${label} must contain only strings.`);
    }
  }
  return [...value];
}

function readOptionalSliderValueLabelsProperty(
  record: Record<string, unknown>,
  key: string,
  label: string
): readonly SliderValueLabel[] | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }

  const entries = readRequiredArray(value, label);
  return entries.map((entry, index) => {
    const entryRecord = expectRecord(entry, `${label} entry ${index}`);
    return {
      value: readRequiredNumberProperty(entryRecord, "value", `${label} entry ${index} value`),
      text: readRequiredStringProperty(entryRecord, "text", `${label} entry ${index} text`)
    };
  });
}

function readRequiredChoiceOptionsProperty(
  record: Record<string, unknown>,
  key: string,
  label: string
): readonly ChoiceOption[] {
  const value = readRequiredArray(record[key], label);
  return value.map((entry, index) => {
    const optionRecord = expectRecord(entry, `${label} entry ${index}`);
    const disabled = readOptionalBooleanProperty(
      optionRecord,
      "disabled",
      `${label} entry ${index} disabled`
    );
    return {
      value: readRequiredStringProperty(optionRecord, "value", `${label} entry ${index} value`),
      label: readRequiredStringProperty(optionRecord, "label", `${label} entry ${index} label`),
      ...(disabled === undefined ? {} : { disabled })
    };
  });
}

function readRequiredChoiceGroupSelectionModeProperty(
  record: Record<string, unknown>,
  key: string,
  label: string
): "single" | "multiple" {
  const value = readRequiredStringProperty(record, key, label);
  if (value !== "single" && value !== "multiple") {
    throw new Error(`${label} must be "single" or "multiple".`);
  }
  return value;
}

function readOptionalChoiceGroupOrientationProperty(
  record: Record<string, unknown>,
  key: string,
  label: string
): "vertical" | "horizontal" | undefined {
  const value = readOptionalStringProperty(record, key, label);
  if (value === undefined) {
    return undefined;
  }
  if (value !== "vertical" && value !== "horizontal") {
    throw new Error(`${label} must be "vertical" or "horizontal".`);
  }
  return value;
}

function readRequiredString(value: unknown, label: string): string {
  const normalized = readOptionalString(value, label);
  if (normalized === undefined) {
    throw new Error(`${label} is required.`);
  }
  return normalized;
}

function readOptionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string.`);
  }
  if (value.trim().length === 0) {
    throw new Error(`${label} must not be empty.`);
  }
  return value;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
