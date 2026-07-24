import { expect, test } from "@playwright/test";

test("デモ音声からf-tを確認し、Δf-tへ切り替えられる", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");
  await expect(page.locator("h1")).toContainText(
    "音の変化を、振動数として測る。",
  );
  await expect(
    page.getByRole("button", { name: "基準振動数を測定" }),
  ).toBeDisabled();
  await expect(page.locator("details.settings-panel")).not.toHaveAttribute(
    "open",
  );

  await page.getByRole("button", { name: "デモデータを使う" }).click();
  await expect(
    page.getByText(
      "デモ音声を読み込みました。台車が近づく想定で、振動数が徐々に高くなります。",
    ),
  ).toBeVisible({ timeout: 20_000 });
  await expect(
    page.getByRole("heading", { name: "PCが観測した振動数 f" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "基準の振動数からの「ずれ」を見る",
    }),
  ).toBeVisible();
  await expect(page.getByText("縦軸は測定値付近を拡大して表示しています")).toBeVisible();

  await page
    .getByRole("button", {
      name: "基準の振動数からの「ずれ」を見る",
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "基準の振動数からのずれ Δf" }),
  ).toBeVisible();
  await expect(
    page.getByText("観測された振動数 f", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("静止時の振動数 f₀", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("振動数のずれ Δf", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "観測された振動数 f に戻る" }),
  ).toBeVisible();

  expect(pageErrors).toEqual([]);
});

test("横幅の狭いChromebook相当でもページ全体が横にはみ出さない", async ({
  page,
}) => {
  await page.setViewportSize({ width: 720, height: 900 });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "デモデータを使う" }),
  ).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    page: document.documentElement.scrollWidth,
  }));
  expect(dimensions.page).toBeLessThanOrEqual(dimensions.viewport);
});
