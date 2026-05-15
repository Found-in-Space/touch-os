import { clamp } from "../core/geometry.js";

export interface SliderValueLabel {
  value: number;
  text: string;
}

export interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  field: string;
  disabled?: boolean;
  valueText?: string;
  valueLabels?: readonly SliderValueLabel[];
}

export interface NormalizedSliderProps extends SliderProps {
  value: number;
  step: number;
  disabled: boolean;
  valueLabels?: readonly SliderValueLabel[];
}

export function normalizeSliderProps(
  props: SliderProps,
  context: string
): NormalizedSliderProps {
  const field = readRequiredString(props.field, `${context} field`);
  assertFiniteNumber(props.value, `${context} value`);
  assertFiniteNumber(props.min, `${context} min`);
  assertFiniteNumber(props.max, `${context} max`);

  if (props.max <= props.min) {
    throw new Error(`${context} max must be greater than min.`);
  }

  const step = props.step ?? 1;
  assertFiniteNumber(step, `${context} step`);
  if (step <= 0) {
    throw new Error(`${context} step must be greater than 0.`);
  }

  const valueLabels = props.valueLabels?.map((label) => {
    assertFiniteNumber(label.value, `${context} valueLabels value`);
    if (label.value < props.min || label.value > props.max) {
      throw new Error(`${context} valueLabels values must stay within the slider range.`);
    }
    return {
      value: label.value,
      text: label.text
    };
  });

  if (valueLabels) {
    const seen = new Set<number>();
    for (const label of valueLabels) {
      if (seen.has(label.value)) {
        throw new Error(`${context} valueLabels must not repeat the same value.`);
      }
      seen.add(label.value);
    }
  }

  return {
    ...props,
    field,
    value: normalizeSliderValue(props.value, props.min, props.max, step),
    step,
    disabled: props.disabled ?? false,
    ...(valueLabels === undefined ? {} : { valueLabels })
  };
}

export function normalizeSliderValue(
  value: number,
  min: number,
  max: number,
  step: number
): number {
  const clamped = clamp(value, min, max);
  const snapped = Math.round((clamped - min) / step) * step + min;
  const precision = Math.max(
    getDecimalPlaces(min),
    getDecimalPlaces(max),
    getDecimalPlaces(step)
  );
  return clamp(Number(snapped.toFixed(precision)), min, max);
}

export function resolveSliderValueText(props: NormalizedSliderProps): string {
  if (props.valueText !== undefined) {
    return props.valueText;
  }

  const label = props.valueLabels?.find((entry) => entry.value === props.value);
  if (label) {
    return label.text;
  }

  return String(props.value);
}

function assertFiniteNumber(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
}

function readRequiredString(value: string, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} is required.`);
  }
  if (value.trim().length === 0) {
    throw new Error(`${label} must not be empty.`);
  }
  return value;
}

function getDecimalPlaces(value: number): number {
  const text = value.toString().toLowerCase();
  if (text.includes("e-")) {
    const [coefficient, exponentText] = text.split("e-");
    const coefficientDecimals = coefficient?.split(".")[1]?.length ?? 0;
    return coefficientDecimals + Number(exponentText);
  }
  return text.split(".")[1]?.length ?? 0;
}
