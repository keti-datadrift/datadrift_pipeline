const { chromium, expect } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { mockPagedModels } = require("./fixtures/models.cjs");
const base = process.env.TEST_BASE_URL || "http://121.126.210.3:18091";
const near = (a, b, label) =>
  assert(Math.abs(a - b) < 2, `${label}: ${a} -> ${b}`);
async function geometry(locator) {
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return {
      x: r.x,
      y: r.y,
      top: r.y + scrollY,
      width: r.width,
      height: r.height,
      documentHeight: document.documentElement.scrollHeight,
    };
  });
}
(async () => {
  const browser = await chromium.launch();
  const records = [];
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      try {
        await mockPagedModels(page);
        await page.goto(base + "/ko/models");
        const models = page.getByRole("navigation", {
          name: "모델 목록 페이지",
          exact: true,
        });
        await models.waitFor();
        await models.scrollIntoViewIfNeeded();
        const modelBefore = await geometry(models);
        const cols = await page
          .locator("main th")
          .evaluateAll((els) =>
            els.map((el) => el.getBoundingClientRect().width),
          );
        await models.getByRole("button", { name: "다음", exact: true }).click();
        await expect(models.getByRole("combobox")).toHaveValue("1");
        const modelAfter = await geometry(models);
        near(modelBefore.top, modelAfter.top, "model pager document position");
        near(modelBefore.y, modelAfter.y, "model pager screen position");
        near(
          modelBefore.documentHeight,
          modelAfter.documentHeight,
          "model document height",
        );
        const nextCols = await page
          .locator("main th")
          .evaluateAll((els) =>
            els.map((el) => el.getBoundingClientRect().width),
          );
        cols.forEach((v, i) => near(v, nextCols[i], "model column " + i));
        records.push({
          width,
          view: "models",
          before: modelBefore,
          after: modelAfter,
        });

        await page.goto(base + "/ko/evaluation");
        const evaluations = await (
          await page.request.get(base + "/api/jobs?kind=evaluation")
        ).json();
        const pagedResult = evaluations.find(
          (job) => job.status === "succeeded" && job.result?.count > 10,
        );
        assert(pagedResult, "Need a completed evaluation with multiple pages");
        await page
          .getByRole("button", {
            name: pagedResult.id.slice(0, 8),
            exact: true,
          })
          .click();
        await expect(page.locator(".run-head")).toContainText(
          pagedResult.id.slice(0, 8),
        );
        const results = page.locator(".evaluation-results");
        await results.locator("summary").first().click();
        const resultPager = page.getByRole("navigation", {
          name: "평가 결과 페이지",
          exact: true,
        });
        await resultPager.scrollIntoViewIfNeeded();
        const resultBefore = await geometry(resultPager);
        await results
          .locator(".evaluation-results-list > details")
          .first()
          .locator("summary")
          .click();
        near(
          resultBefore.top,
          (await geometry(resultPager)).top,
          "expanded result pager",
        );
        const count = await resultPager.locator("option").count();
        await resultPager.getByRole("combobox").selectOption(String(count - 1));
        const resultAfter = await geometry(resultPager);
        near(resultBefore.top, resultAfter.top, "result last page");
        near(
          resultBefore.documentHeight,
          resultAfter.documentHeight,
          "result document height",
        );
        records.push({
          width,
          view: "results",
          before: resultBefore,
          after: resultAfter,
        });
        const runs = page.getByRole("navigation", {
          name: "실행 이력 페이지",
          exact: true,
        });
        await runs.scrollIntoViewIfNeeded();
        const runBefore = await geometry(runs);
        await runs.getByRole("button", { name: "다음", exact: true }).click();
        near(runBefore.top, (await geometry(runs)).top, "run last page");

        const datasets = await (
          await page.request.get(base + "/api/datasets?current=true")
        ).json();
        const dataset = datasets.find((d) => d.workspace_id === "gsshop");
        const rows = (
          await (
            await page.request.get(
              base + `/api/datasets/${dataset.id}/samples?limit=30`,
            )
          ).json()
        ).items;
        await page.route("**/api/datasets/*/samples?*", async (route) => {
          const url = new URL(route.request().url());
          const offset = Number(url.searchParams.get("offset") || 0);
          if (url.searchParams.get("ids_only"))
            return route.fulfill({
              json: { ids: rows.map((r) => r.id), total: 30 },
            });
          if (offset) await new Promise((resolve) => setTimeout(resolve, 700));
          await route.fulfill({
            json: { items: rows.slice(offset, offset + 24), total: 30 },
          });
        });
        await page.goto(base + "/ko/workspaces/gsshop");
        await expect(page.locator(".sample-card")).toHaveCount(24);
        const grid = page.locator(".sample-page");
        const gridBefore = await geometry(grid);
        await page.locator(".sample-checkbox").first().check();
        near(
          gridBefore.top,
          (await geometry(grid)).top,
          "selection toolbar height",
        );
        await page
          .getByRole("button", { name: "선택 해제", exact: true })
          .click();
        near(
          gridBefore.top,
          (await geometry(grid)).top,
          "clear selection toolbar height",
        );
        const images = page.locator(".pagination");
        await images.scrollIntoViewIfNeeded();
        const imageBefore = await geometry(images);
        await images.getByRole("button", { name: "다음", exact: true }).click();
        await expect(grid).toHaveAttribute("aria-busy", "true");
        near(
          imageBefore.top,
          (await geometry(images)).top,
          "image loading height",
        );
        await expect(page.locator(".sample-card")).toHaveCount(6);
        await expect(grid).toHaveAttribute("aria-busy", "false");
        const imageAfter = await geometry(images);
        near(imageBefore.top, imageAfter.top, "image last page");
        near(imageBefore.y, imageAfter.y, "image pager screen position");
        near(
          imageBefore.documentHeight,
          imageAfter.documentHeight,
          "image document height",
        );
        records.push({
          width,
          view: "images",
          before: imageBefore,
          after: imageAfter,
        });

        const history = Array.from({ length: 11 }, (_, i) => ({
          id: "stable-" + i,
          status: "succeeded",
          created_at: "2026-10-29T00:00:00Z",
          result_url: "/api/predictions/stable-" + i,
        }));
        await page.route(
          "**/api/model-endpoints/*/predictions?*",
          async (route) => {
            const offset = Number(
              new URL(route.request().url()).searchParams.get("offset") || 0,
            );
            if (offset)
              await new Promise((resolve) => setTimeout(resolve, 700));
            await route.fulfill({
              json: { items: history.slice(offset, offset + 10), total: 11 },
            });
          },
        );
        await page.goto(base + "/ko/model-api");
        const api = page.getByRole("navigation", {
          name: "API 요청 페이지",
          exact: true,
        });
        await api.waitFor();
        await api.scrollIntoViewIfNeeded();
        const apiBefore = await geometry(api);
        await api.getByRole("button", { name: "다음", exact: true }).click();
        await expect(page.locator(".model-api .stable-page")).toHaveAttribute(
          "aria-busy",
          "true",
        );
        near(apiBefore.top, (await geometry(api)).top, "API loading height");
        await expect(page.locator(".model-api .stable-page")).toHaveAttribute(
          "aria-busy",
          "false",
        );
        const apiAfter = await geometry(api);
        near(apiBefore.top, apiAfter.top, "API last page");
        near(apiBefore.y, apiAfter.y, "API screen position");
        near(
          apiBefore.documentHeight,
          apiAfter.documentHeight,
          "API document height",
        );
        records.push({
          width,
          view: "api",
          before: apiBefore,
          after: apiAfter,
        });
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
          "page overflow",
        );
      } finally {
        await page.close();
      }
    }
    fs.mkdirSync(".runtime/ui-audit", { recursive: true });
    fs.writeFileSync(
      ".runtime/ui-audit/page-stability.json",
      JSON.stringify(records, null, 2),
    );
    console.log(
      "Desktop/mobile: model, history, result expansion/last page, image loading/last page/selection, API loading/last page positions stable within 2px. No data writes.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
