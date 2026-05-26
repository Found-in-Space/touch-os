import { expect, test, type Page } from "@playwright/test";
import { inflateSync } from "node:zlib";

const ARM_FRACTAL_ICON_ID = "arm-os:home:open:space-found-living-room-fractal-art";
const ARM_HOME_CONTROL_ID = "arm-os:tablet-screen:home-control";
const REOPEN_ATTEMPTS = 5;

interface ScreenRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface LivingRoomFractalTestState {
  armVisible: boolean;
  compositeSurfaceCount: number;
  pictureSurfaceCount: number;
  fractalComponentId?: string;
  surfaceRevision?: number;
  screenRect?: ScreenRect;
}

interface LivingRoomTestApi {
  ready: boolean;
  getArmComponentScreenRect(componentId: string): ScreenRect | undefined;
  getFractalState(): LivingRoomFractalTestState;
}

interface FractalOpenAttempt {
  index: number;
  durationMs: number;
  compositeSurfaceCount: number;
  pictureSurfaceCount: number;
}

interface PngImage {
  width: number;
  height: number;
  channels: 3 | 4;
  pixels: Uint8Array;
}

interface RegionAnalysis {
  samples: number;
  nonTransparentPixels: number;
  distinctColors: number;
  lumaStdDev: number;
  averageSaturation: number;
}

test("arm tablet Fractal Art reopens reliably and renders a GPU composite", async ({
  page
}, testInfo) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  await page.goto("/?touchOsTest=1", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () =>
      (window as Window & {
        __TOUCH_OS_LIVING_ROOM_TEST__?: LivingRoomTestApi;
      }).__TOUCH_OS_LIVING_ROOM_TEST__?.ready === true
  );
  await waitForArmComponent(page, ARM_FRACTAL_ICON_ID);

  const attempts: FractalOpenAttempt[] = [];
  let finalState: LivingRoomFractalTestState | undefined;
  for (let index = 0; index < REOPEN_ATTEMPTS; index += 1) {
    const iconRect = await waitForArmComponent(page, ARM_FRACTAL_ICON_ID);
    const startedAt = Date.now();
    await clickScreenRect(page, iconRect);
    finalState = await waitForFractalComposite(page);
    attempts.push({
      index,
      durationMs: Date.now() - startedAt,
      compositeSurfaceCount: finalState.compositeSurfaceCount,
      pictureSurfaceCount: finalState.pictureSurfaceCount
    });

    if (index < REOPEN_ATTEMPTS - 1) {
      const homeRect = await waitForArmComponent(page, ARM_HOME_CONTROL_ID);
      await clickScreenRect(page, homeRect);
      await waitForArmComponent(page, ARM_FRACTAL_ICON_ID);
    }
  }

  if (!finalState?.screenRect) {
    throw new Error("Fractal composite did not expose a projected screen rect.");
  }

  const screenshot = await page.screenshot({
    fullPage: false,
    path: testInfo.outputPath("living-room-fractal-arm.png")
  });
  const analysis = analyzePngRegion(screenshot, insetRect(finalState.screenRect, 0.18));
  console.info(JSON.stringify({ attempts, finalState, analysis }, null, 2));

  expect(pageErrors).toEqual([]);
  expect(attempts).toHaveLength(REOPEN_ATTEMPTS);
  expect(attempts.every((attempt) => attempt.pictureSurfaceCount > 0)).toBe(true);
  expect(Math.max(...attempts.map((attempt) => attempt.durationMs))).toBeLessThan(2_500);
  expect(analysis.nonTransparentPixels).toBeGreaterThan(100);
  expect(analysis.distinctColors).toBeGreaterThan(16);
  expect(analysis.lumaStdDev).toBeGreaterThan(6);
  expect(analysis.averageSaturation).toBeGreaterThan(0.2);
});

async function clickScreenRect(page: Page, rect: ScreenRect): Promise<void> {
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
}

async function waitForArmComponent(page: Page, componentId: string): Promise<ScreenRect> {
  const handle = await page.waitForFunction(
    (id) => {
      const api = (window as Window & {
        __TOUCH_OS_LIVING_ROOM_TEST__?: LivingRoomTestApi;
      }).__TOUCH_OS_LIVING_ROOM_TEST__;
      const rect = api?.getArmComponentScreenRect(id);
      if (!rect || rect.width < 4 || rect.height < 4) {
        return undefined;
      }
      return rect;
    },
    componentId,
    { timeout: 5_000 }
  );
  const rect = await handle.jsonValue();
  await handle.dispose();
  if (!rect) {
    throw new Error(`Timed out waiting for arm component ${componentId}.`);
  }
  return rect;
}

async function waitForFractalComposite(page: Page): Promise<LivingRoomFractalTestState> {
  const handle = await page.waitForFunction(
    () => {
      const api = (window as Window & {
        __TOUCH_OS_LIVING_ROOM_TEST__?: LivingRoomTestApi;
      }).__TOUCH_OS_LIVING_ROOM_TEST__;
      const state = api?.getFractalState();
      if (!state?.armVisible || state.pictureSurfaceCount < 1 || !state.screenRect) {
        return undefined;
      }
      return state;
    },
    undefined,
    { timeout: 5_000 }
  );
  const state = await handle.jsonValue();
  await handle.dispose();
  if (!state) {
    throw new Error("Timed out waiting for the Fractal Art composite surface.");
  }
  return state;
}

function insetRect(rect: ScreenRect, ratio: number): ScreenRect {
  const insetX = rect.width * ratio;
  const insetY = rect.height * ratio;
  return {
    x: rect.x + insetX,
    y: rect.y + insetY,
    width: Math.max(1, rect.width - insetX * 2),
    height: Math.max(1, rect.height - insetY * 2)
  };
}

function analyzePngRegion(data: Uint8Array, rect: ScreenRect): RegionAnalysis {
  const image = decodePng(data);
  const x0 = clampInteger(Math.floor(rect.x), 0, image.width - 1);
  const y0 = clampInteger(Math.floor(rect.y), 0, image.height - 1);
  const x1 = clampInteger(Math.ceil(rect.x + rect.width), x0 + 1, image.width);
  const y1 = clampInteger(Math.ceil(rect.y + rect.height), y0 + 1, image.height);
  const regionPixels = (x1 - x0) * (y1 - y0);
  const step = Math.max(1, Math.floor(Math.sqrt(regionPixels / 20_000)));
  const colors = new Set<string>();
  let samples = 0;
  let nonTransparentPixels = 0;
  let lumaSum = 0;
  let lumaSquaredSum = 0;
  let saturationSum = 0;

  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const offset = (y * image.width + x) * image.channels;
      const r = image.pixels[offset] ?? 0;
      const g = image.pixels[offset + 1] ?? 0;
      const b = image.pixels[offset + 2] ?? 0;
      const a = image.channels === 4 ? image.pixels[offset + 3] ?? 0 : 255;
      if (a > 16) {
        nonTransparentPixels += 1;
      }
      colors.add(`${r >> 4}:${g >> 4}:${b >> 4}`);
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const maxChannel = Math.max(r, g, b);
      const minChannel = Math.min(r, g, b);
      saturationSum += maxChannel === 0 ? 0 : (maxChannel - minChannel) / maxChannel;
      lumaSum += luma;
      lumaSquaredSum += luma * luma;
      samples += 1;
    }
  }

  const meanLuma = samples > 0 ? lumaSum / samples : 0;
  const lumaVariance = samples > 0 ? lumaSquaredSum / samples - meanLuma * meanLuma : 0;
  return {
    samples,
    nonTransparentPixels,
    distinctColors: colors.size,
    lumaStdDev: Math.sqrt(Math.max(0, lumaVariance)),
    averageSaturation: samples > 0 ? saturationSum / samples : 0
  };
}

function decodePng(data: Uint8Array): PngImage {
  assertPngSignature(data);

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks: Uint8Array[] = [];
  let offset = 8;
  while (offset + 8 <= data.length) {
    const length = readUint32(data, offset);
    const type = readAscii(data, offset + 4, 4);
    const start = offset + 8;
    const end = start + length;
    if (end > data.length) {
      throw new Error(`Invalid PNG chunk length for ${type}.`);
    }

    if (type === "IHDR") {
      width = readUint32(data, start);
      height = readUint32(data, start + 4);
      bitDepth = data[start + 8] ?? 0;
      colorType = data[start + 9] ?? 0;
    } else if (type === "IDAT") {
      idatChunks.push(data.slice(start, end));
    } else if (type === "IEND") {
      break;
    }
    offset = end + 4;
  }

  if (width <= 0 || height <= 0 || bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`Unsupported PNG format: ${width}x${height}, depth ${bitDepth}, color ${colorType}.`);
  }

  const channels: 3 | 4 = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const inflated = inflateSync(concatUint8Arrays(idatChunks));
  const pixels = new Uint8Array(height * stride);
  let sourceOffset = 0;
  let previous = new Uint8Array(stride);

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset] ?? -1;
    sourceOffset += 1;
    const scanline = inflated.subarray(sourceOffset, sourceOffset + stride);
    sourceOffset += stride;
    const reconstructed = new Uint8Array(stride);

    for (let index = 0; index < stride; index += 1) {
      const raw = scanline[index] ?? 0;
      const left = index >= channels ? reconstructed[index - channels] ?? 0 : 0;
      const up = previous[index] ?? 0;
      const upLeft = index >= channels ? previous[index - channels] ?? 0 : 0;
      reconstructed[index] = (raw + predictPngFilter(filter, left, up, upLeft)) & 0xff;
    }

    pixels.set(reconstructed, y * stride);
    previous = reconstructed;
  }

  return { width, height, channels, pixels };
}

function predictPngFilter(filter: number, left: number, up: number, upLeft: number): number {
  switch (filter) {
    case 0:
      return 0;
    case 1:
      return left;
    case 2:
      return up;
    case 3:
      return Math.floor((left + up) / 2);
    case 4:
      return paethPredictor(left, up, upLeft);
    default:
      throw new Error(`Unsupported PNG filter ${filter}.`);
  }
}

function paethPredictor(left: number, up: number, upLeft: number): number {
  const prediction = left + up - upLeft;
  const leftDistance = Math.abs(prediction - left);
  const upDistance = Math.abs(prediction - up);
  const upLeftDistance = Math.abs(prediction - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) {
    return left;
  }
  return upDistance <= upLeftDistance ? up : upLeft;
}

function assertPngSignature(data: Uint8Array): void {
  const expected = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let index = 0; index < expected.length; index += 1) {
    if ((data[index] ?? -1) !== expected[index]) {
      throw new Error("Screenshot is not a PNG image.");
    }
  }
}

function concatUint8Arrays(chunks: readonly Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function readUint32(data: Uint8Array, offset: number): number {
  return (
    ((data[offset] ?? 0) * 0x1000000) +
    ((data[offset + 1] ?? 0) << 16) +
    ((data[offset + 2] ?? 0) << 8) +
    (data[offset + 3] ?? 0)
  ) >>> 0;
}

function readAscii(data: Uint8Array, offset: number, length: number): string {
  let text = "";
  for (let index = 0; index < length; index += 1) {
    text += String.fromCharCode(data[offset + index] ?? 0);
  }
  return text;
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
