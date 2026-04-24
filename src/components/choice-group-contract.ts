export interface ChoiceOption<TValue extends string = string> {
  value: TValue;
  label: string;
  disabled?: boolean;
}

export type ChoiceGroupSelectionMode = "single" | "multiple";

export type ChoiceGroupOrientation = "vertical" | "horizontal";

export interface ChoiceGroupProps<TValue extends string = string> {
  label?: string;
  options: readonly ChoiceOption<TValue>[];
  selectionMode: ChoiceGroupSelectionMode;
  value?: TValue;
  values?: readonly TValue[];
  field?: string;
  orientation?: ChoiceGroupOrientation;
  columns?: number;
  disabled?: boolean;
}

export interface NormalizedChoiceGroupProps<TValue extends string = string>
  extends ChoiceGroupProps<TValue> {
  orientation: ChoiceGroupOrientation;
  disabled: boolean;
  options: readonly ChoiceOption<TValue>[];
}

export function normalizeChoiceGroupProps<TValue extends string>(
  props: ChoiceGroupProps<TValue>,
  context: string
): NormalizedChoiceGroupProps<TValue> {
  if (props.options.length === 0) {
    throw new Error(`${context} must declare at least one option.`);
  }

  const options = props.options.map((option) => ({
    value: option.value,
    label: option.label,
    disabled: option.disabled ?? false
  }));
  const optionValues = new Set<TValue>();
  for (const option of options) {
    if (optionValues.has(option.value)) {
      throw new Error(`${context} option values must be unique.`);
    }
    optionValues.add(option.value);
  }

  const orientation = props.orientation ?? "vertical";
  if (props.columns !== undefined) {
    if (!Number.isInteger(props.columns) || props.columns <= 0) {
      throw new Error(`${context} columns must be a positive integer.`);
    }
    if (orientation !== "horizontal") {
      throw new Error(`${context} columns are only supported for horizontal choice groups.`);
    }
  }

  if (props.selectionMode === "single") {
    if (props.values !== undefined) {
      throw new Error(`${context} single-select mode must not receive values.`);
    }
    if (props.value !== undefined && !optionValues.has(props.value)) {
      throw new Error(`${context} selected value must match one of the declared options.`);
    }
  } else {
    if (props.value !== undefined) {
      throw new Error(`${context} multiple-select mode must not receive value.`);
    }

    const values = props.values ?? [];
    const selectedValues = new Set<TValue>();
    for (const value of values) {
      if (!optionValues.has(value)) {
        throw new Error(`${context} selected values must match the declared options.`);
      }
      if (selectedValues.has(value)) {
        throw new Error(`${context} selected values must not contain duplicates.`);
      }
      selectedValues.add(value);
    }
  }

  return {
    ...props,
    orientation,
    disabled: props.disabled ?? false,
    options
  };
}

export function getChoiceGroupField<TValue extends string>(
  props: Pick<ChoiceGroupProps<TValue>, "field" | "selectionMode">
): string {
  return props.field ?? (props.selectionMode === "single" ? "value" : "values");
}

export function getChoiceGroupSelectedValues<TValue extends string>(
  props: Pick<ChoiceGroupProps<TValue>, "selectionMode" | "value" | "values">
): readonly TValue[] {
  if (props.selectionMode === "single") {
    return props.value === undefined ? [] : [props.value];
  }
  return props.values ?? [];
}
