import { devices, expect, test } from "@playwright/test";

const {
  defaultBrowserType: _ipadDefaultBrowserType,
  ...ipadDevice
} = devices["iPad (gen 7)"];

test("デモ音声からf-tを確認し、Δf-tへ切り替えられる", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");
  await expect(page.locator("h1")).toContainText("ドップラー振動数ラボ");
  await expect(
    page.getByRole("button", { name: "基準を測る" }),
  ).toBeDisabled();

  await page.getByRole("button", { name: "デモ" }).click();
  await expect(
    page.getByText("基準 f₀ = 4000.0 Hz"),
  ).toBeVisible({ timeout: 20_000 });
  await expect(
    page.getByRole("heading", { name: "観測振動数 f" }),
  ).toBeVisible();
  await expect(page.locator(".status-message-success")).toHaveCount(0);

  const chart = page.locator(".chart-shell");
  await page.getByRole("button", { name: "グラフを拡大" }).click();
  await expect(chart).toHaveAttribute("data-zoomed", "true");
  const xBeforePan = await chart.getAttribute("data-view-x-min");
  const plot = page.locator(".frequency-chart");
  const box = await plot.boundingBox();
  if (!box) {
    throw new Error("グラフ領域を取得できませんでした。");
  }
  await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.46, box.y + box.height * 0.5);
  await page.mouse.up();
  await expect(chart).not.toHaveAttribute("data-view-x-min", xBeforePan ?? "");
  await page
    .getByRole("button", { name: "グラフの表示範囲をリセット" })
    .click();
  await expect(chart).toHaveAttribute("data-zoomed", "false");

  await page.getByRole("button", { name: "Δf" }).click();
  await expect(
    page.getByRole("heading", { name: "振動数のずれ Δf" }),
  ).toBeVisible();
  await expect(page.getByText("0 Hz", { exact: true })).toBeVisible();

  expect(pageErrors).toEqual([]);
});

test("Chromebookの一画面にグラフと操作UIが収まる", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "デモ" }),
  ).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    viewportHeight: document.documentElement.clientHeight,
    pageWidth: document.documentElement.scrollWidth,
    pageHeight: document.documentElement.scrollHeight,
  }));
  expect(dimensions.pageWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
  expect(dimensions.pageHeight).toBeLessThanOrEqual(
    dimensions.viewportHeight,
  );
  await expect(page.locator(".graph-panel")).toBeInViewport();
  await expect(page.locator(".control-panel")).toBeInViewport();
});

test("狭いChromebook相当でも横にはみ出さない", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 900 });
  await page.goto("/");
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    page: document.documentElement.scrollWidth,
  }));
  expect(dimensions.page).toBeLessThanOrEqual(dimensions.viewport);
});

test("低い画面でも主要操作が一画面に残る", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 600 });
  await page.goto("/");
  const dimensions = await page.evaluate(() => ({
    viewportHeight: document.documentElement.clientHeight,
    pageHeight: document.documentElement.scrollHeight,
  }));
  expect(dimensions.pageHeight).toBeLessThanOrEqual(
    dimensions.viewportHeight,
  );
  await expect(page.getByRole("button", { name: "準備する" })).toBeInViewport();
  await expect(page.getByRole("button", { name: "基準を測る" })).toBeInViewport();
  await expect(page.getByRole("button", { name: "測定開始" })).toBeInViewport();
  await expect(page.getByRole("button", { name: "設定" })).toBeInViewport();
});

test.describe("iPad相当", () => {
  test.use(ipadDevice);

  test("縦向きで主要操作とタッチ用グラフ操作が使える", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "デモ" })).toBeInViewport();
    await expect(page.getByRole("button", { name: "準備する" })).toBeInViewport();
    await page.getByRole("button", { name: "デモ" }).click();
    await expect(page.getByText("基準 f₀ = 4000.0 Hz")).toBeVisible({
      timeout: 20_000,
    });

    const dimensions = await page.evaluate(() => ({
      viewportWidth: document.documentElement.clientWidth,
      viewportHeight: document.documentElement.clientHeight,
      pageWidth: document.documentElement.scrollWidth,
      pageHeight: document.documentElement.scrollHeight,
    }));
    expect(dimensions.pageWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
    expect(dimensions.pageHeight).toBeLessThanOrEqual(
      dimensions.viewportHeight,
    );

    const zoomButton = page.getByRole("button", { name: "グラフを拡大" });
    const zoomBox = await zoomButton.boundingBox();
    expect(zoomBox?.width).toBeGreaterThanOrEqual(44);
    expect(zoomBox?.height).toBeGreaterThanOrEqual(44);
    await zoomButton.tap();
    await expect(page.locator(".chart-shell")).toHaveAttribute(
      "data-zoomed",
      "true",
    );
    await page
      .getByRole("button", { name: "グラフの表示範囲をリセット" })
      .tap();
    await expect(page.locator(".chart-shell")).toHaveAttribute(
      "data-zoomed",
      "false",
    );
  });
});
