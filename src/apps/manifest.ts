import type { Size } from "../core/geometry.js";

export interface TouchIconDescriptor {
  kind: "symbol" | "image" | "emoji";
  value: string;
  label?: string;
}

export type TouchAppCapability = string;

export interface TouchAppPreferredWindow extends Size {
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  resizable?: boolean;
}

export interface TouchAppManifest {
  id: string;
  name: string;
  version: string;
  minTouchOsVersion?: string;
  icon?: TouchIconDescriptor;
  preferredWindow?: TouchAppPreferredWindow;
  capabilities?: readonly TouchAppCapability[];
}

export function validateTouchAppManifest(manifest: TouchAppManifest): TouchAppManifest {
  assertNonEmpty(manifest.id, "Touch app manifest id");
  assertNonEmpty(manifest.name, "Touch app manifest name");
  assertNonEmpty(manifest.version, "Touch app manifest version");

  if (manifest.preferredWindow) {
    assertPositive(manifest.preferredWindow.width, "Touch app preferred window width");
    assertPositive(manifest.preferredWindow.height, "Touch app preferred window height");
    assertOptionalPositive(manifest.preferredWindow.minWidth, "Touch app preferred window minWidth");
    assertOptionalPositive(manifest.preferredWindow.minHeight, "Touch app preferred window minHeight");
    assertOptionalPositive(manifest.preferredWindow.maxWidth, "Touch app preferred window maxWidth");
    assertOptionalPositive(manifest.preferredWindow.maxHeight, "Touch app preferred window maxHeight");
  }

  return manifest;
}

function assertNonEmpty(value: string, label: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
}

function assertPositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number.`);
  }
}

function assertOptionalPositive(value: number | undefined, label: string): void {
  if (value !== undefined) {
    assertPositive(value, label);
  }
}
