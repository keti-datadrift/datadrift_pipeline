const { chromium, expect } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const base = process.env.TEST_BASE_URL || "http://121.126.210.3:18091";
const folder = path.resolve(".runtime/ui-verification");
fs.mkdirSync(folder, { recursive: true });
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
  const report = { base, checks: [], errors };
  const read = async (url) => {
    const r = await page.request.get(base + "/api" + url);
    assert.equal(r.status(), 200);
    return r.json();
  };
  const waitJob = async (id) => {
    const until = Date.now() + 240000;
    while (Date.now() < until) {
      const j = await read("/jobs/" + id);
      if (!["queued", "running"].includes(j.status)) {
        assert.equal(j.status, "succeeded", j.error);
        return j;
      }
      await page.waitForTimeout(1000);
    }
    throw new Error("Job timed out: " + id);
  };
  const submit = async (label) => {
    const pending = page.waitForResponse(
      (r) => r.url() === base + "/api/jobs" && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: label, exact: true }).click();
    const r = await pending;
    assert.equal(r.status(), 201, await r.text());
    return r.json();
  };
  try {
    const datasets = await read("/datasets");
    const mus = datasets.find(
      (d) => d.workspace_id === "musinsa" && d.kind === "import",
    );
    const gs = datasets.find(
      (d) => d.workspace_id === "gsshop" && d.kind === "import",
    );
    await page.goto(base + "/ko/workspaces");
    await page
      .getByRole("button", { name: "워크스페이스 만들기", exact: true })
      .click();
    const qa = "QA 브라우저 검증 " + Date.now();
    await page.getByLabel("이름", { exact: true }).fill(qa);
    await page
      .getByLabel("설명", { exact: true })
      .fill("자동 기능 검증 후 제거하는 임시 워크스페이스");
    const createdResponse = page.waitForResponse(
      (r) =>
        r.url() === base + "/api/workspaces" && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "만들기", exact: true }).click();
    const created = await (await createdResponse).json();
    report.workspaceId = created.id;
    fs.writeFileSync(
      path.join(folder, "workflows.json"),
      JSON.stringify(report, null, 2),
    );
    await page.goto(base + "/ko/workspaces/" + created.id);
    await page
      .getByRole("button", { name: "워크스페이스 수정", exact: true })
      .click();
    await page.getByLabel("이름", { exact: true }).fill(qa + " 수정");
    await page.getByRole("button", { name: "수정 저장", exact: true }).click();
    await expect(page.locator("h1")).toHaveText(qa + " 수정");
    report.checks.push("workspace create and edit");
    await page.goto(base + "/ko/workspaces/musinsa");
    await page.getByLabel("데이터셋 버전").selectOption(mus.id);
    await page.locator(".sample-card").first().waitFor();
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll(".sample-card img"))
        .slice(0, 4)
        .every((i) => i.complete && i.naturalWidth > 0),
    );
    await page.getByRole("button", { name: "검증", exact: true }).click();
    await expect(page.locator(".toolbar").last()).toContainText("100개 검색됨");
    const exported = await page.request.get(
      base + "/api/datasets/" + mus.id + "/export",
    );
    assert.equal(exported.status(), 200);
    const rows = (await exported.text()).trim().split("\n").map(JSON.parse);
    assert.equal(rows.length, 1000);
    assert(rows.every((r) => !("image" in r)));
    report.checks.push(
      "image loading, validation filter, export without server paths",
    );
    await page.goto(base + "/ko/training/qwen35_2b");
    await page.getByLabel("학습 데이터셋").selectOption(mus.id);
    await page.getByLabel("학습 스텝").fill("2");
    let j = await submit("학습 시작");
    j = await waitJob(j.id);
    report.trainingId = j.id;
    assert(j.result.policy_changed);
    const mid = j.result.model_id;
    report.modelId = mid;
    report.checks.push(
      "browser submitted real GPU training (2 steps), adapter registration",
    );
    await page.goto(base + "/ko/models/" + mid);
    await page
      .getByLabel("모델 이름", { exact: true })
      .fill("Qwen3.5-2B · 브라우저 검증 2step");
    await page.getByRole("button", { name: "이름 저장", exact: true }).click();
    await expect(
      page.getByRole("heading", {
        name: "Qwen3.5-2B · 브라우저 검증 2step",
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "모델 보관", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "사용 상태로 복원", exact: true }),
    ).toBeVisible();
    await page.goto(base + "/ko/training");
    await page.getByLabel("시작 모델").waitFor();
    await expect(
      page.getByLabel("시작 모델").locator('option[value="' + mid + '"]'),
    ).toHaveCount(0);
    await page.goto(base + "/ko/models/" + mid);
    await page
      .getByRole("button", { name: "사용 상태로 복원", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "모델 보관", exact: true }),
    ).toBeVisible();
    report.checks.push("model rename, archive excludes selection, restore");
    await page.goto(base + "/ko/evaluation/" + mid);
    await page.getByLabel("데이터셋").selectOption(mus.id);
    await page.getByLabel("최대 샘플 수").fill("2");
    let e = await submit("평가 시작");
    e = await waitJob(e.id);
    report.evaluationId = e.id;
    assert.equal(e.result.count, 2);
    assert.equal(e.result.predictions.length, 2);
    report.checks.push(
      "browser evaluation of saved adapter and result persistence",
    );
    await page.goto(base + "/ko/monitoring/drift");
    await page.getByLabel("기준 데이터셋").selectOption(mus.id);
    await page.getByLabel("비교 데이터셋").selectOption(gs.id);
    let d = await submit("탐지 실행");
    d = await waitJob(d.id);
    report.driftId = d.id;
    assert.equal(d.result.reference_count, 1000);
    assert.equal(d.result.current_count, 651);
    report.checks.push("browser drift over 1,651 actual images");
    await page.goto(base + "/ko/evaluation");
    await expect(page.locator(".stats")).toContainText("평가 샘플");
    await page.screenshot({
      path: path.join(folder, "evaluation-workflow.png"),
      fullPage: true,
    });
    assert.equal(errors.length, 0);
    report.status = "passed";
  } finally {
    fs.writeFileSync(
      path.join(folder, "workflows.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
