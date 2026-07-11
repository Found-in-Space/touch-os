import { expect, test } from "@playwright/test";

interface RenderFixtureResult {
  revision: number;
  dataUrl: string;
  logicalWidth: number;
  logicalHeight: number;
  backingWidth: number;
  backingHeight: number;
  buttonPixel: readonly number[];
  clippedInsidePixel: readonly number[];
  clippedOutsidePixel: readonly number[];
  bitmapLetterboxPixel: readonly number[];
  bitmapContentPixel: readonly number[];
  bitmapCoverLeftPixel: readonly number[];
  bitmapCoverRightPixel: readonly number[];
  bitmapStretchLeftPixel: readonly number[];
  bitmapStretchRightPixel: readonly number[];
  copiedSurfacePixel: readonly number[];
  nestedScrollFirstPixel: readonly number[];
  nestedScrollSecondPixel: readonly number[];
  nestedClipOutsidePixel: readonly number[];
  animatedSurfacePixel: readonly number[];
  animatedRevision: number;
  textInkPixels: number;
  transparentEdgePixel: readonly number[];
  logicalResize: {
    canvasReused: boolean;
    initialBackingWidth: number;
    initialBackingHeight: number;
    resizedBackingWidth: number;
    resizedBackingHeight: number;
    logicalWidth: number;
    logicalHeight: number;
    pixelDensity: number;
  };
}

interface RenderFixtureApi {
  readyRevision: number;
  render(pixelDensity: 1 | 2): RenderFixtureResult;
}

for (const pixelDensity of [1, 2] as const) {
  test(`real Canvas command rendering at DPR ${pixelDensity}`, async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => {
      pageErrors.push(error.stack ?? error.message);
    });
    await page.goto("/render-fixture.html", { waitUntil: "domcontentloaded" });
    try {
      await page.waitForFunction(() =>
        (window as Window & { __TOUCH_OS_RENDER_FIXTURE__?: RenderFixtureApi })
          .__TOUCH_OS_RENDER_FIXTURE__?.readyRevision === 3,
      undefined, { timeout: 5_000 });
    } catch {
      throw new Error(`Rendering fixture did not become ready. ${pageErrors.join("\n")}`);
    }

    const first = await page.evaluate((dpr) =>
      (window as Window & { __TOUCH_OS_RENDER_FIXTURE__?: RenderFixtureApi })
        .__TOUCH_OS_RENDER_FIXTURE__?.render(dpr), pixelDensity
    );
    const second = await page.evaluate((dpr) =>
      (window as Window & { __TOUCH_OS_RENDER_FIXTURE__?: RenderFixtureApi })
        .__TOUCH_OS_RENDER_FIXTURE__?.render(dpr), pixelDensity
    );
    if (!first || !second) {
      throw new Error("Browser rendering fixture did not return a result.");
    }

    expect(first.backingWidth).toBe(first.logicalWidth * pixelDensity);
    expect(first.backingHeight).toBe(first.logicalHeight * pixelDensity);
    expect(first.buttonPixel[3]).toBe(255);
    expect(first.clippedInsidePixel[3]).toBe(255);
    expect(first.clippedOutsidePixel[3]).toBe(0);
    expect(first.bitmapLetterboxPixel[3]).toBe(0);
    expect(first.bitmapContentPixel[3]).toBe(255);
    expect(first.bitmapCoverLeftPixel).toEqual([245, 158, 11, 255]);
    expect(first.bitmapCoverRightPixel).toEqual([124, 58, 237, 255]);
    expect(first.bitmapStretchLeftPixel).toEqual([245, 158, 11, 255]);
    expect(first.bitmapStretchRightPixel).toEqual([124, 58, 237, 255]);
    expect(first.copiedSurfacePixel[3]).toBe(255);
    expect(first.nestedScrollFirstPixel).toEqual([22, 163, 74, 255]);
    expect(first.nestedScrollSecondPixel).toEqual([37, 99, 235, 255]);
    expect(first.nestedClipOutsidePixel[3]).toBe(0);
    expect(first.animatedSurfacePixel).toEqual([8, 145, 178, 255]);
    expect(first.animatedRevision).toBe(3);
    expect(first.textInkPixels).toBeGreaterThan(50 * pixelDensity);
    expect(first.transparentEdgePixel[3]).toBe(0);
    expect(first.logicalResize).toEqual({
      canvasReused: true,
      initialBackingWidth: 320,
      initialBackingHeight: 200,
      resizedBackingWidth: 320,
      resizedBackingHeight: 200,
      logicalWidth: 320,
      logicalHeight: 200,
      pixelDensity: 1
    });
    expect(second.revision).toBe(first.revision + 1);
    expect(second.animatedRevision).toBe(first.animatedRevision);
    expect(second.dataUrl).toBe(first.dataUrl);
  });
}
