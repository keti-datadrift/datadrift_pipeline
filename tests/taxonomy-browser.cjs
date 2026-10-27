const { chromium, expect } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const book = require("../backend/bkave_taxonomy.json");
const base = process.env.TEST_BASE_URL || "http://121.126.210.3:18091";
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN || "/usr/bin/google-chrome",
    args: ["--no-sandbox", "--disable-gpu"],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const checks = [];
  try {
    const datasets = await (
      await page.request.get(base + "/api/datasets")
    ).json();
    const d = datasets.find(
      (d) =>
        d.workspace_id === "gsshop" &&
        d.schema_id === book.id &&
        d.kind === "taxonomy_migration",
    );
    assert(d);
    const samples = {};
    for (let offset = 0; offset < d.count; offset += 100) {
      const batch = await (
        await page.request.get(
          `${base}/api/datasets/${d.id}/samples?limit=100&offset=${offset}`,
        )
      ).json();
      for (const r of batch.items) samples[r.category] ||= r;
    }
    await page.goto(base + "/ko/workspaces/gsshop");
    await page.getByLabel("데이터셋 버전").selectOption(d.id);
    for (const category of ["상의", "아우터", "하의"]) {
      const sample = samples[category];
      assert(sample);
      await page
        .getByPlaceholder("상품 ID 또는 속성 검색")
        .fill(sample.product_id);
      await expect(page.locator(".sample-card")).toHaveCount(1);
      await page.locator(".sample-card").click();
      const dialog = page.getByRole("dialog", { name: "레이블 상세" });
      await expect(dialog.getByLabel("핏", { exact: true })).toBeEnabled();
      await expect(dialog.locator(".label-fields-heading")).toContainText(
        category,
      );
      const fits = await dialog
        .getByLabel("핏", { exact: true })
        .locator("option")
        .evaluateAll((options) => options.map((o) => o.value));
      assert.deepEqual(fits, [...book.groups[category]["핏"], "unknown"]);
      assert.equal(
        await dialog
          .getByLabel("색상 코드", { exact: true })
          .locator("option")
          .count(),
        213,
      );
      if (category === "하의")
        await expect(
          dialog.getByLabel("소매 길이", { exact: true }),
        ).toHaveCount(0);
      else if (category === "상의")
        await expect(
          dialog
            .getByLabel("소매 길이", { exact: true })
            .locator('option[value="반소매"]'),
        ).toHaveCount(1);
      await expect(dialog.getByLabel("생산처", { exact: true })).toHaveValue(
        "unknown",
      );
      await expect(
        dialog.getByRole("button", { name: "수정본 저장", exact: true }),
      ).toBeDisabled();
      if (category === "상의")
        await dialog.screenshot({
          path: ".runtime/ui-verification/bkave-labels.png",
        });
      await dialog
        .getByRole("button", { name: "상세 닫기", exact: true })
        .click();
      checks.push(category + " values match workbook");
    }
    const old = datasets.find(
      (d) => d.workspace_id === "gsshop" && d.kind === "import",
    );
    const mixed = await page.request.post(
      base + "/api/reconstructions/preview",
      {
        data: {
          workspace_id: "gsshop",
          name: "QA preview only",
          dataset_ids: [old.id, d.id],
          train_budget: 2,
        },
      },
    );
    assert.equal(mixed.status(), 422);
    checks.push("mixed criteria rejected without saving");
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole("button", { name: "레이블 검토", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "레이블 상세" });
    await expect(dialog).toBeVisible();
    assert(await dialog.evaluate((el) => el.scrollWidth <= innerWidth));
    checks.push("mobile taxonomy editor without overflow");
    assert.equal(errors.length, 0);
    fs.writeFileSync(
      ".runtime/ui-verification/taxonomy.json",
      JSON.stringify({ status: "passed", checks, errors }, null, 2),
    );
    console.log({ checks, errors });
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
