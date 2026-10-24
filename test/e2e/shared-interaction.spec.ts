import { test, expect } from "@playwright/test";

test.use({ launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] } });

test("two public panel views edit applied state with a visible connected marker", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/interaction.html");
  const thumb = await page.evaluate(async () => {
    const path = "/src/interaction.ts";
    const { views, camera, renderer } = await import(path);
    const panel = views[0];
    const command = panel.runtime.render().commands.find((c: { role?: string }) => c.role === "slider-thumb");
    const p = camera.position.clone().set((command.cx / 320 - 0.5) * 0.6, (0.5 - command.cy / 280) * 0.525, 0);
    panel.host.mesh.updateWorldMatrix(true, false); p.applyMatrix4(panel.host.mesh.matrixWorld).project(camera);
    const rect = renderer.domElement.getBoundingClientRect();
    return { x: rect.left + (p.x + 1) * rect.width / 2, y: rect.top + (1 - p.y) * rect.height / 2 };
  });
  await page.mouse.move(thumb.x, thumb.y); await page.mouse.down();
  await page.mouse.move(thumb.x + 180, thumb.y, { steps: 8 });
  const dragging = await page.evaluate(async () => {
    const path = "/src/interaction.ts"; const { ui, values, views } = await import(path);
    const state = ui.interaction.getSnapshots().find((s: { capture?: unknown }) => s.capture);
    return { value: values[0].get().value, second: values[1].get().value,
      text: views[0].runtime.render().commands.find((c: { role?: string }) => c.role === "slider-value")?.text,
      projection: !!state?.projection, gesture: state?.capture?.gesture,
      markerVisible: views[0].host.mesh.parent.children.some((object: { geometry?: { type?: string }; visible: boolean }) => object.geometry?.type === "RingGeometry" && object.visible) };
  });
  expect(dragging.value).toBeGreaterThan(25); expect(dragging.second).toBe(75);
  expect(dragging.text).toBe(String(dragging.value)); expect(dragging.projection).toBe(true); expect(dragging.gesture).toBe("drag"); expect(dragging.markerVisible).toBe(true);
  const pixel = await page.evaluate(async () => {
    const path = "/src/interaction.ts"; const { views, camera, renderer } = await import(path);
    renderer.render(views[0].host.mesh.parent, camera);
    const gl = renderer.getContext(), pixel = new Uint8Array(4);
    const p = views[0].host.mesh.position.clone().project(camera);
    gl.readPixels(Math.round((p.x + 1) * renderer.domElement.width / 2), Math.round((p.y + 1) * renderer.domElement.height / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    return [...pixel];
  });
  expect(pixel[3]).toBeGreaterThan(0);
  await page.screenshot({ path: testInfo.outputPath("shared-interaction.png") });
  await page.mouse.up();
  expect(await page.evaluate(async () => {
    const path = "/src/interaction.ts"; const { ui } = await import(path);
    return ui.interaction.getSnapshots().some((s: { capture?: unknown }) => !!s.capture);
  })).toBe(false);
  expect(errors).toEqual([]);
});

test("an opaque rendered wall blocks slider editing, then hiding it restores the gesture", async ({ page }) => {
  await page.goto("/interaction.html");
  const point = await page.evaluate(async () => {
    const path = "/src/interaction.ts";
    const { views, camera, renderer } = await import(path);
    const panel = views[0], scene = panel.host.mesh.parent;
    const wall = panel.host.mesh.clone(); wall.name = "test-occluder";
    wall.material = panel.host.material.clone(); wall.material.map = null;
    wall.material.color.setHex(0xff0000); wall.material.transparent = false; wall.material.depthWrite = true;
    wall.position.z += 0.1; scene.add(wall);
    const command = panel.runtime.render().commands.find((c: { role?: string }) => c.role === "slider-thumb");
    const p = camera.position.clone().set((command.cx / 320 - 0.5) * 0.6, (0.5 - command.cy / 280) * 0.525, 0);
    panel.host.mesh.updateWorldMatrix(true, false); p.applyMatrix4(panel.host.mesh.matrixWorld).project(camera);
    const rect = renderer.domElement.getBoundingClientRect();
    return { x: rect.left + (p.x + 1) * rect.width / 2, y: rect.top + (1 - p.y) * rect.height / 2 };
  });
  const pixel = await page.evaluate(async point => {
    const path = "/src/interaction.ts"; const { views, camera, renderer } = await import(path);
    renderer.render(views[0].host.mesh.parent, camera);
    const rect = renderer.domElement.getBoundingClientRect(), gl = renderer.getContext(), pixel = new Uint8Array(4);
    gl.readPixels(Math.round((point.x - rect.left) / rect.width * renderer.domElement.width),
      Math.round((1 - (point.y - rect.top) / rect.height) * renderer.domElement.height), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    return [...pixel];
  }, point);
  expect(pixel[0]).toBeGreaterThan(200); expect(pixel[1]).toBeLessThan(40);
  await page.mouse.move(point.x, point.y); await page.mouse.down();
  await page.mouse.move(point.x + 80, point.y, { steps: 8 }); await page.mouse.up();
  const value = () => page.evaluate(async () => {
    const path = "/src/interaction.ts"; return (await import(path)).values[0].get().value;
  });
  expect(await value()).toBe(25);
  await page.evaluate(async () => {
    const path = "/src/interaction.ts"; const { views } = await import(path);
    views[0].host.mesh.parent.getObjectByName("test-occluder").visible = false;
  });
  await page.mouse.move(point.x, point.y); await page.mouse.down();
  await page.mouse.move(point.x + 80, point.y, { steps: 8 }); await page.mouse.up();
  await expect.poll(value).toBeGreaterThan(25);
});
