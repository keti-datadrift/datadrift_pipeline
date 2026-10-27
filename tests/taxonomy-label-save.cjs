const { chromium, expect } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const taxonomy = require("../backend/bkave_taxonomy.json");
const base = process.env.TEST_BASE_URL || "http://121.126.210.3:18091";
const report = { datasets: [], checks: [] };
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN || "/usr/bin/google-chrome",
    args: ["--no-sandbox", "--disable-gpu"],
  });
  const page = await browser.newPage();
  const post = async (path, data) => {
    const r = await page.request.post(base + "/api" + path, { data });
    assert.equal(r.status(), 201, await r.text());
    return r.json();
  };
  try {
    const datasets = await (
      await page.request.get(base + "/api/datasets")
    ).json();
    const source = datasets.find(
      (d) =>
        d.schema_id === taxonomy.id &&
        d.workspace_id === "gsshop" &&
        d.kind === "taxonomy_migration",
    );
    assert(source);
    const w = await post("/workspaces", {
      name: "QA 레이블 편집 비케이브 " + Date.now(),
    });
    report.workspaceId = w.id;
    const d = await post("/reconstructions", {
      workspace_id: w.id,
      name: "QA 레이블 원본",
      dataset_ids: [source.id],
      train_budget: 1,
    });
    report.datasets.push(d.id);
    const original = (
      await (
        await page.request.get(`${base}/api/datasets/${d.id}/samples`)
      ).json()
    ).items[0];
    await page.goto(base + "/ko/workspaces/" + w.id);
    await page
      .getByRole("button", { name: "레이블 검토", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "레이블 상세" });
    await expect(dialog.getByLabel("핏", { exact: true })).toBeEnabled();
    const fits = await dialog
      .getByLabel("핏", { exact: true })
      .locator("option")
      .evaluateAll((options) => options.map((o) => o.value));
    const value = fits.find(
      (v) => v !== original.target.fit && v !== "unknown",
    );
    assert(value);
    await dialog.getByLabel("핏", { exact: true }).selectOption(value);
    await dialog.getByLabel("색상 코드", { exact: true }).selectOption("BK");
    await dialog
      .getByLabel("검토 메모", { exact: false })
      .fill("QA temporary schema save, not a source label");
    const response = page.waitForResponse(
      (r) => r.url().endsWith("/labels") && r.request().method() === "POST",
    );
    await dialog
      .getByRole("button", { name: "수정본 저장", exact: true })
      .click();
    const r = await response;
    assert.equal(r.status(), 201, await r.text());
    const saved = await r.json();
    report.datasets.push(saved.dataset.id);
    assert.equal(saved.dataset.schema_id, taxonomy.id);
    assert.equal(saved.sample.target.fit, value);
    assert.equal(saved.sample.target.color_code, "BK");
    assert.equal(Object.keys(saved.sample.target).length, 9);
    assert.equal(saved.sample.human_verified, false);
    assert(saved.sample.unscored_fields.includes("color_code"));
    await expect(dialog.getByLabel("핏", { exact: true })).toHaveValue(value);
    await dialog
      .getByRole("button", { name: "상세 닫기", exact: true })
      .click();
    await page.reload();
    await expect(page.getByLabel("데이터셋 버전")).toHaveValue(
      saved.dataset.id,
    );
    await page
      .getByRole("button", { name: "레이블 검토", exact: true })
      .click();
    await expect(dialog.getByLabel("색상 코드", { exact: true })).toHaveValue(
      "BK",
    );
    const unchanged = (
      await (
        await page.request.get(`${base}/api/datasets/${d.id}/samples`)
      ).json()
    ).items[0];
    assert.deepEqual(unchanged, original);
    report.checks.push(
      "BKAVE 9-key UI save, hidden non-applicable fields retained, exclusions and false human verification preserved, reload, source immutable",
    );
    report.status = "passed";
  } finally {
    if (fs.existsSync(".runtime/ui-verification/labels.json"))
      fs.copyFileSync(
        ".runtime/ui-verification/labels.json",
        ".runtime/ui-verification/labels-legacy.json",
      );
    fs.writeFileSync(
      ".runtime/ui-verification/labels.json",
      JSON.stringify(report, null, 2),
    );
    console.log(report);
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
