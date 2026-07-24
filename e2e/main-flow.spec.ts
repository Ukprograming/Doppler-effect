import { expect, test } from "@playwright/test";

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
    page.getByText(
      "デモを表示しました。台車が近づくと振動数が高くなる例です。",
    ),
  ).toBeVisible({ timeout: 20_000 });
  await expect(
    page.getByRole("heading", { name: "観測振動数 f" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Δf" }).click();
  await expect(
    page.getByRole("heading", { name: "振動数のずれ Δf" }),
  ).toBeVisible();
  await expect(page.getByText("Δf", { exact: true }).first()).toBeVisible();

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
