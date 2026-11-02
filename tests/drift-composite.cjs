const { chromium, expect } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const base = process.env.TEST_BASE_URL || "http://121.126.210.3:18091";
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    const result = JSON.parse(
      fs.readFileSync(".runtime/drift-composite/result.json"),
    );
    const prior = (
      await (await page.request.get(base + "/api/jobs?kind=drift")).json()
    )[0];
    assert(prior);
    let job = {
      ...prior,
      id: "qa-composite",
      status: "succeeded",
      result,
      error: null,
      progress: { phase: "completed", step: 1, total: 1 },
    };
    await page.route(/\/api\/jobs(?:\?|\/|$)/, (route) => {
      assert.equal(route.request().method(), "GET");
      return route.fulfill({
        json:
          new URL(route.request().url()).pathname === "/api/jobs" ? [job] : job,
      });
    });
    await page.goto(base + "/ko/monitoring/drift");
    const summary = page.locator(".drift-composite");
    await expect(summary.getByRole("status")).toHaveText("드리프트 감지됨");
    await expect(summary.locator(".drift-signal-summary tbody tr")).toHaveCount(
      4,
    );
    await expect(summary.locator(".drift-signal-table")).not.toBeVisible();
    await expect(
      page.locator(".drift-distribution-details"),
    ).not.toHaveAttribute("open");
    await expect(page.locator(".drift-settings-section")).not.toHaveAttribute(
      "open",
    );
    await expect(page.locator(".run-head")).toHaveCount(0);
    const headline = await summary.getByRole("status").boundingBox();
    const settings = await page
      .locator(".drift-settings-section")
      .boundingBox();
    assert(
      headline.y < settings.y,
      "Overall verdict should appear before comparison controls",
    );
    await expect(summary.locator(".drift-result-datasets")).toContainText(
      "651",
    );
    await expect(summary.locator(".drift-result-datasets")).toContainText(
      "1,000",
    );
    await expect(page.locator(".drift-field")).toHaveCount(
      result.fields.length,
    );
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      const verdictBox = await summary.getByRole("status").boundingBox();
      assert(
        verdictBox.y + verdictBox.height < 1000,
        "Verdict should be visible on initial screen",
      );
      await page.screenshot({
        path: `.runtime/drift-composite/verdict-${width}.png`,
        fullPage: true,
      });
      await page.locator(".drift-numbers > summary").click();
      await expect(summary.locator(".drift-signal-table")).toBeVisible();
      await page.locator(".drift-distribution-details > summary").click();
      await page.locator(".drift-field").first().locator("summary").click();
      await expect(page.locator(".distribution-detail").first()).toBeVisible();
      assert(
        !(await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        )),
      );
      await page.screenshot({
        path: `.runtime/drift-composite/page-${width}.png`,
        fullPage: true,
      });
      await page.locator(".drift-field").first().locator("summary").click();
      await page.locator(".drift-distribution-details > summary").click();
      await page.locator(".drift-numbers > summary").click();
    }
    await page.locator(".drift-settings-section > summary").click();
    await expect(page.getByLabel("기준 데이터셋")).toBeVisible();
    await expect(page.locator(".drift-advanced-options")).not.toHaveAttribute(
      "open",
    );
    await page.locator(".drift-advanced-options > summary").click();
    await expect(page.getByLabel("속성 변화 기준 (JS)")).toBeVisible();
    job = {
      ...job,
      status: "running",
      result: null,
      progress: { phase: "embedding_images", step: 0, total: 512 },
    };
    await expect(page.locator(".run-head .badge")).toHaveText(
      "이미지 특징 추출 중",
      { timeout: 12000 },
    );
    job = {
      ...job,
      status: "succeeded",
      result: {
        ...result,
        complete: false,
        decision: "insufficient",
        detected: false,
        fields: result.fields.map((f) => ({
          ...f,
          status: "insufficient",
          detected: false,
        })),
        signals: result.signals.map((s) => ({
          ...s,
          status: "insufficient",
          detected: false,
        })),
        image_embeddings: {
          status: "insufficient",
          reason: "각 20장 이상 필요",
          reference_count: 5,
          current_count: 5,
        },
      },
    };
    await page.reload();
    await expect(summary.getByRole("status")).toHaveText("드리프트 판정 보류");
    await expect(
      summary
        .locator(".drift-signal-summary tbody tr")
        .getByText("판정 불가", { exact: true }),
    ).toHaveCount(4);
    job = {
      ...job,
      result: {
        ...result,
        decision: "not_detected",
        complete: true,
        detected: false,
        fields: result.fields.map((f) => ({
          ...f,
          detected: false,
          category_detected: false,
          js_divergence: 0,
          adjusted_p_value: 1,
        })),
        signals: result.signals.map((s) => ({
          ...s,
          detected: false,
          detected_count: 0,
        })),
      },
    };
    await page.reload();
    await expect(summary.getByRole("status")).toHaveText(
      "드리프트 감지되지 않음",
    );
    await expect(
      summary
        .locator(".drift-signal-summary tbody tr")
        .getByText("미감지", { exact: true }),
    ).toHaveCount(4);
    job = {
      ...job,
      result: {
        ...result,
        complete: false,
        decision: "detected",
        detected: true,
        signals: result.signals.map((s) => ({
          ...s,
          status: s.kind === "image_embeddings" ? "tested" : "insufficient",
          detected: s.kind === "image_embeddings",
        })),
      },
    };
    await page.reload();
    await expect(summary.getByRole("status")).toHaveText("드리프트 감지됨");
    await expect(summary.locator(".drift-partial-note")).toBeVisible();
    await expect(
      summary
        .locator(".drift-signal-summary tbody tr")
        .getByText("판정 불가", { exact: true }),
    ).toHaveCount(3);
    const legacy = { ...result };
    delete legacy.method_version;
    job = { ...job, result: legacy };
    await page.reload();
    await expect(summary).toHaveCount(0);
    await expect(
      page.locator(".drift-legacy-summary").getByRole("status"),
    ).toHaveText("드리프트 감지됨");
    await expect(
      page.getByText(
        "이전 JS 기준의 결과입니다. 새로 실행하면 속성과 이미지 특징을 함께 분석합니다.",
        { exact: true },
      ),
    ).toBeVisible();
    assert.deepEqual(errors, []);
    console.log(
      "Overall detected/not-detected/deferred and partial decisions, clear verdict order, collapsed statistics/distributions/settings/history, expansion, progress, legacy results and desktop/mobile passed. All jobs mocked.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
