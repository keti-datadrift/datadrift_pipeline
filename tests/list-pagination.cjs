const { chromium, expect } = require("@playwright/test");
const assert = require("node:assert/strict");
const { mockPagedModels } = require("./fixtures/models.cjs");
const base = process.env.TEST_BASE_URL || "http://121.126.210.3:18091";
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  try {
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await mockPagedModels(p);
    await p.goto(base + "/ko/models");
    let nav = p.getByRole("navigation", {
      name: "모델 목록 페이지",
      exact: true,
    });
    await expect(p.locator("main tbody tr")).toHaveCount(10);
    await nav.getByRole("button", { name: "다음", exact: true }).click();
    await expect(nav.getByRole("combobox")).toHaveValue("1");
    const modelName = await p.locator(".model-name").first().innerText();
    await p.getByPlaceholder("모델 이름 검색").fill(modelName);
    await expect(nav.getByRole("combobox")).toHaveCount(0);
    await expect(p.locator(".model-name").first()).toHaveText(modelName);
    await p.getByPlaceholder("모델 이름 검색").fill("__없는모델__");
    await expect(nav).toHaveCount(0);
    await expect(
      p.getByText("표시할 항목이 없습니다.", { exact: true }),
    ).toBeVisible();
    await p.goto(base + "/ko/evaluation");
    const evaluations = await (
      await p.request.get(base + "/api/jobs?kind=evaluation")
    ).json();
    const pagedResult = evaluations.find(
      (job) => job.status === "succeeded" && job.result?.count > 10,
    );
    assert(pagedResult, "Need a completed evaluation with multiple pages");
    await p
      .getByRole("button", {
        name: pagedResult.id.slice(0, 8),
        exact: true,
      })
      .click();
    await expect(p.locator(".run-head")).toContainText(
      pagedResult.id.slice(0, 8),
    );
    const results = p.locator(".evaluation-results");
    await results.locator("summary").first().click();
    nav = p.getByRole("navigation", { name: "평가 결과 페이지", exact: true });
    await expect(
      results.locator(".evaluation-results-list > details"),
    ).toHaveCount(10);
    await nav.getByRole("button", { name: "다음", exact: true }).click();
    await expect(
      results
        .locator(".evaluation-results-list > details")
        .first()
        .locator("summary"),
    ).toContainText("이미지 11");
    const options = await nav.locator("option").count();
    await nav.getByRole("combobox").selectOption(String(options - 1));
    await expect(
      nav.getByRole("button", { name: "다음", exact: true }),
    ).toBeDisabled();
    await expect(
      results
        .locator(".evaluation-results-list > details")
        .last()
        .locator("summary"),
    ).toContainText(`이미지 ${pagedResult.result.count}`);
    const history = p.getByRole("navigation", {
      name: "실행 이력 페이지",
      exact: true,
    });
    await history.getByRole("button", { name: "다음", exact: true }).click();
    const historyPanel = p.locator(".panel").filter({
      has: p.getByRole("heading", { name: "실행 이력", exact: true }),
    });
    await historyPanel.locator("tbody button").first().click();
    await expect(results).toBeVisible();
    if ((await results.getAttribute("open")) === null)
      await results.locator("summary").first().click();
    await expect(
      results
        .locator(".evaluation-results-list > details")
        .first()
        .locator("summary"),
    ).toContainText("이미지 1");
    // API history uses server pages, including records older than the former 20-item limit.
    const endpoints = await (
      await p.request.get(base + "/api/model-endpoints")
    ).json();
    const endpoint = endpoints[0];
    assert(endpoint);
    const predictions = Array.from({ length: 25 }, (_, i) => ({
      id: "mock" + String(i).padStart(4, "0"),
      status: "succeeded",
      created_at: "2026-10-29T00:00:00Z",
      result_url: "/api/predictions/mock" + i,
    }));
    await p.route("**/api/model-endpoints/*/predictions?*", async (route) => {
      const u = new URL(route.request().url());
      const start = Number(u.searchParams.get("offset"));
      const limit = Number(u.searchParams.get("limit"));
      await route.fulfill({
        json: {
          items: predictions.slice(start, start + limit),
          total: predictions.length,
        },
      });
    });
    await p.goto(base + "/ko/model-api");
    nav = p.getByRole("navigation", { name: "API 요청 페이지", exact: true });
    const apiPanel = p.locator(".panel").filter({
      has: p.getByRole("heading", { name: "요청 이력", exact: true }),
    });
    await expect(apiPanel.locator("tbody tr")).toHaveCount(10);
    await nav.getByRole("combobox").selectOption("2");
    await expect(apiPanel.locator("tbody tr")).toHaveCount(5);
    await expect(apiPanel.locator("tbody button").first()).toHaveText(
      "mock0020",
    );
    await p.waitForTimeout(2700);
    await expect(nav.getByRole("combobox")).toHaveValue("2");
    await p.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    assert.deepEqual(errors, []);
    console.log(
      "Model search reset/empty state, result and history paging, result reset on run selection, API >20 items/polling and mobile passed. No writes or GPU jobs.",
    );
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
