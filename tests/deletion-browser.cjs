const { chromium, expect } = require("@playwright/test");
const fs = require("node:fs");
const assert = require("node:assert/strict");
const base = process.env.TEST_BASE_URL || "http://121.126.210.3:18091";
const dir = ".runtime/deletion-verification";
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const receipt = { workspace_id: null, datasets: [], batches: [] };
  const read = async (path) =>
    (await page.request.get(base + "/api" + path)).json();
  const save = async () => {
    if (receipt.workspace_id) {
      const datasets = (await read("/datasets")).filter(
        (d) => d.workspace_id === receipt.workspace_id,
      );
      receipt.datasets = [
        ...new Set([...receipt.datasets, ...datasets.map((d) => d.id)]),
      ];
      const batches = (await read("/deletions")).filter(
        (d) => d.workspace_id === receipt.workspace_id,
      );
      receipt.batches = [
        ...new Set([...receipt.batches, ...batches.map((d) => d.id)]),
      ];
    }
    fs.writeFileSync(dir + "/receipt.json", JSON.stringify(receipt, null, 2));
  };
  const current = async () =>
    (await read("/datasets?current=true")).find(
      (d) => d.workspace_id === receipt.workspace_id,
    );
  const upload = async (file) => {
    await page
      .getByRole("button", { name: "이미지 업로드", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "이미지 업로드",
      exact: true,
    });
    await expect(dialog.getByLabel("데이터셋 이름")).toHaveCount(0);
    await dialog
      .getByLabel("이미지 파일", { exact: true })
      .setInputFiles(dir + "/" + file);
    await expect(dialog.getByLabel("상품 카테고리")).toHaveCount(0);
    await dialog.getByRole("button", { name: "업로드", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await save();
  };
  const confirmDelete = async (title) => {
    await save();
    const dialog = page.getByRole("dialog", { name: title, exact: true });
    const response = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/deletions") && r.request().method() === "POST",
    );
    await dialog.getByRole("button", { name: "삭제", exact: true }).click();
    const result = await (await response).json();
    assert(result.id, JSON.stringify(result));
    receipt.batches.push(result.id);
    await save();
  };
  const restoreLast = async () => {
    const batch = receipt.batches.at(-1);
    const response = await page.request.post(
      base + "/api/deletions/" + batch + "/restore",
      { data: {} },
    );
    assert.equal(response.status(), 200, await response.text());
  };

  try {
    const workspace = await (
      await page.request.post(base + "/api/workspaces", {
        data: { name: "QA 삭제 복원 검증" },
      })
    ).json();
    receipt.workspace_id = workspace.id;
    await save();
    const url = base + "/ko/workspaces/" + workspace.id;
    await page.goto(url);
    await upload("one.png");
    await expect(page.locator(".sample-card")).toHaveCount(1);
    await upload("two.png");
    await expect(page.locator(".sample-card")).toHaveCount(2);
    assert.equal((await current()).count, 2);
    await upload("one.png");
    await expect(page.locator(".sample-card")).toHaveCount(2);
    await expect(page.getByLabel("데이터셋 버전")).toHaveCount(0);
    await expect(page.getByText("변경 이력", { exact: true })).toHaveCount(0);
    // Save a label directly onto an image, then reload the same workspace.
    const reviewedId = (
      await read("/datasets/" + (await current()).id + "/samples")
    ).items[0].id;
    const checkSavedLabel = async (value) => {
      const samples = (
        await read("/datasets/" + (await current()).id + "/samples")
      ).items;
      const sample = samples.find((row) => row.id === reviewedId);
      assert.equal(sample.target.fit, value);
      assert.equal(sample.human_verified, true);
    };
    await page.locator(".sample-review").first().click();
    let dialog = page.getByRole("dialog", { name: "레이블 상세", exact: true });
    const category = dialog.getByLabel("상품 카테고리");
    await expect(category).toBeVisible();
    await category.selectOption("상의");
    const fit = dialog.getByLabel("핏", { exact: true });
    await expect(fit).toBeEnabled();
    const options = await fit
      .locator("option")
      .evaluateAll((items) => items.map((o) => o.value));
    const value = options.find(
      (v) => !["unknown", "not_applicable", ""].includes(v),
    );
    await fit.selectOption(value);
    await dialog.getByRole("button", { name: "저장", exact: true }).click();
    await expect(
      dialog.getByRole("button", { name: "저장", exact: true }),
    ).toBeDisabled();
    await dialog
      .getByRole("button", { name: "상세 닫기", exact: true })
      .click();
    await save();
    await page.reload();
    await expect(page.locator(".sample-card")).toHaveCount(2);
    await checkSavedLabel(value);
    // Delete only the second image; the first image's label must survive restoration.
    await page.locator(".sample-checkbox").nth(1).check();
    await page.getByRole("button", { name: "선택 삭제", exact: true }).click();
    dialog = page.getByRole("dialog", {
      name: "선택 이미지 삭제",
      exact: true,
    });
    await expect(dialog).toContainText("1개 이미지는 유지됩니다.");
    await dialog.getByRole("button", { name: "취소", exact: true }).click();
    await expect(page.locator(".sample-card")).toHaveCount(2);
    await page.getByRole("button", { name: "선택 삭제", exact: true }).click();
    await confirmDelete("선택 이미지 삭제");
    await expect(page.locator(".sample-card")).toHaveCount(1);
    await page.setViewportSize({ width: 390, height: 1000 });
    await page.goto(base + "/ko/workspaces");
    await expect(
      page.getByRole("button", { name: "삭제 목록", exact: true }),
    ).toHaveCount(0);
    await restoreLast();
    await page.goto(url);
    await expect(page.locator(".sample-card")).toHaveCount(2);
    await checkSavedLabel(value);
    assert.equal(
      (await read("/datasets?current=true")).filter(
        (d) => d.workspace_id === workspace.id,
      ).length,
      1,
    );
    await save();
    await page.screenshot({
      path: dir + "/current-data-mobile.png",
      fullPage: true,
    });
    assert(
      !(await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      )),
    );
    // Remove the complete collection. Older internal job inputs must stay hidden.
    await page.locator("summary").filter({ hasText: "데이터 작업" }).click();
    await page
      .getByRole("button", { name: "전체 데이터 삭제", exact: true })
      .click();
    await confirmDelete("전체 데이터 삭제");
    await page.reload();
    await expect(
      page.getByText("이미지 업로드로 데이터를 추가하세요.", { exact: false }),
    ).toBeVisible();
    assert.equal(await current(), undefined);
    await restoreLast();
    await page.goto(url);
    await expect(page.locator(".sample-card")).toHaveCount(2);
    // Workspace removal and restore must return one collection, not every snapshot.
    await page.locator("summary").filter({ hasText: "데이터 작업" }).click();
    await page
      .getByRole("button", { name: "워크스페이스 삭제", exact: true })
      .click();
    dialog = page.getByRole("dialog", {
      name: "워크스페이스 삭제",
      exact: true,
    });
    await expect(
      dialog.getByRole("button", { name: "삭제", exact: true }),
    ).toBeDisabled();
    await dialog
      .getByLabel("확인을 위해 워크스페이스 이름을 입력하세요")
      .fill(workspace.name);
    await confirmDelete("워크스페이스 삭제");
    await expect(page).toHaveURL(base + "/ko/workspaces");
    await restoreLast();
    await page.goto(url);
    await expect(page.locator(".sample-card")).toHaveCount(2);
    await checkSavedLabel(value);
    assert.equal(
      (await read("/workspaces")).find((w) => w.id === workspace.id).datasets
        .length,
      1,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: consecutive uploads append, duplicates preserve labels, no version/history/deletion-list UI, label save/reload, selected/all/workspace delete and restore keep one collection, mobile, no JS errors",
    );
  } finally {
    await save();
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
