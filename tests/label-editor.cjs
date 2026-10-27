const { chromium, expect } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const base = process.env.TEST_BASE_URL || "http://121.126.210.3:18091";
const report = { datasets: [], checks: [], errors: [] };
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN || "/usr/bin/google-chrome",
    args: ["--no-sandbox", "--disable-gpu"],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  page.on("pageerror", (e) => report.errors.push(e.message));
  const post = async (url, data) => {
    const r = await page.request.post(base + "/api" + url, { data });
    assert.equal(r.status(), 201, await r.text());
    return r.json();
  };
  try {
    const source = (
      await (await page.request.get(base + "/api/datasets")).json()
    ).find((d) => d.kind === "import" && d.workspace_id === "gsshop");
    const workspace = await post("/workspaces", {
      name: "QA 레이블 편집 " + Date.now(),
    });
    report.workspaceId = workspace.id;
    const dataset = await post("/reconstructions", {
      workspace_id: workspace.id,
      name: "QA 레이블 원본",
      dataset_ids: [source.id],
      train_budget: 1,
    });
    report.datasets.push(dataset.id);
    const originals = await (
      await page.request.get(`${base}/api/datasets/${dataset.id}/samples`)
    ).json();
    const original = originals.items[0];
    await page.goto(`${base}/ko/workspaces/${workspace.id}`);
    await page.locator(".sample-card").first().click();
    const dialog = page.getByRole("dialog", { name: "레이블 상세" });
    await expect(dialog.getByLabel("패턴", { exact: true })).toBeEnabled();
    await page.waitForFunction(() => {
      const i = document.querySelector(".label-image-stage img");
      return i?.complete && i?.naturalWidth > 0;
    });
    assert.equal(await dialog.locator("select").count(), 13);
    await dialog.screenshot({
      path: ".runtime/ui-verification/label-editor-desktop.png",
    });
    await dialog
      .getByRole("button", { name: "이미지 확대", exact: true })
      .click();
    await expect(dialog.locator(".label-zoom")).toContainText("150%");
    await dialog.getByRole("button", { name: "맞춤", exact: true }).click();
    const pattern = original.target.pattern === "무지" ? "체크" : "무지";
    await dialog.getByLabel("패턴", { exact: true }).selectOption(pattern);
    await dialog
      .getByLabel("검토 메모", { exact: false })
      .fill("브라우저 저장·재조회 검증용 임시 수정");
    await dialog
      .getByRole("checkbox", { name: /전체 속성을 직접 검토/ })
      .check();
    await page.keyboard.press("Escape");
    await expect(dialog.locator(".label-discard")).toBeVisible();
    await dialog
      .getByRole("button", { name: "계속 편집", exact: true })
      .click();
    const saving = page.waitForResponse(
      (r) =>
        r.url().endsWith(`/samples/${original.id}/labels`) &&
        r.request().method() === "POST",
    );
    await dialog
      .getByRole("button", { name: "수정본 저장", exact: true })
      .click();
    const response = await saving;
    assert.equal(response.status(), 201, await response.text());
    const saved = await response.json();
    report.datasets.push(saved.dataset.id);
    assert.equal(saved.sample.target.pattern, pattern);
    assert.equal(saved.sample.human_verified, true);
    assert.equal(saved.sample.original_label_source, original.label_source);
    assert.equal(saved.dataset.count, dataset.count);
    assert.deepEqual(saved.dataset.splits, dataset.splits);
    assert.deepEqual(saved.dataset.parent_ids, [dataset.id]);
    await expect(dialog.getByLabel("패턴", { exact: true })).toHaveValue(
      pattern,
    );
    await expect(
      dialog.getByRole("button", { name: "수정본 저장", exact: true }),
    ).toBeDisabled();
    await dialog
      .getByRole("button", { name: "상세 닫기", exact: true })
      .click();
    await page.reload();
    await expect(page.getByLabel("데이터셋 버전")).toHaveValue(
      saved.dataset.id,
    );
    await page.locator(".sample-card").first().click();
    await expect(dialog.getByLabel("패턴", { exact: true })).toHaveValue(
      pattern,
    );
    await expect(
      dialog.getByRole("checkbox", { name: /전체 속성을 직접 검토/ }),
    ).toBeChecked();
    const unchanged = await (
      await page.request.get(`${base}/api/datasets/${dataset.id}/samples`)
    ).json();
    assert.deepEqual(unchanged.items[0], original);
    report.checks.push(
      "14 attributes, zoom, unsaved guard, immutable save, provenance, verification flag and reload",
    );
    await dialog
      .getByRole("button", { name: "다음 이미지", exact: true })
      .click();
    await expect(dialog.locator(".label-title p")).toHaveText(
      originals.items[1].product_id,
    );
    await dialog
      .getByRole("button", { name: "이전 이미지", exact: true })
      .click();
    await expect(dialog.locator(".label-title p")).toHaveText(
      original.product_id,
    );
    await dialog
      .getByLabel("패턴", { exact: true })
      .selectOption(original.target.pattern);
    await expect(
      dialog.getByRole("checkbox", { name: /전체 속성을 직접 검토/ }),
    ).not.toBeChecked();
    await page.route("**/samples/*/labels", (r) =>
      r.fulfill({ status: 500, json: { detail: "QA 저장 실패" } }),
    );
    await dialog
      .getByRole("button", { name: "수정본 저장", exact: true })
      .click();
    await expect(dialog.locator(".alert.error")).toHaveText("QA 저장 실패");
    await expect(dialog.getByLabel("패턴", { exact: true })).toHaveValue(
      original.target.pattern,
    );
    await dialog.getByRole("button", { name: "되돌리기", exact: true }).click();
    await expect(dialog.getByLabel("패턴", { exact: true })).toHaveValue(
      pattern,
    );
    await expect(
      dialog.getByRole("checkbox", { name: /전체 속성을 직접 검토/ }),
    ).toBeChecked();
    await page.unroute("**/samples/*/labels");
    report.checks.push(
      "previous/next, editing resets review confirmation, failed save retains draft, reset",
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(dialog).toBeVisible();
    assert(await dialog.evaluate((el) => el.scrollWidth <= innerWidth));
    await dialog.screenshot({
      path: ".runtime/ui-verification/label-editor-mobile.png",
    });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    report.checks.push("390px mobile, no horizontal overflow, Escape close");
    assert.equal(report.errors.length, 0);
    report.status = "passed";
  } finally {
    fs.writeFileSync(
      ".runtime/ui-verification/labels.json",
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
