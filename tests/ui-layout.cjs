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
  page.on("pageerror", (e) => errors.push(e.message));
  fs.mkdirSync(".runtime/ui-cleanup", { recursive: true });
  try {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const route of [
        "workspaces",
        "workspaces/gsshop",
        "reconstruction",
        "models",
        "model-api",
        "models/qwen35_2b",
        "training",
        "evaluation",
        "monitoring/training",
        "monitoring/drift",
      ]) {
        await page.goto(base + "/ko/" + route);
        await page.locator("main > .loading").waitFor({ state: "hidden" });
        await page.locator("main h1").waitFor();
        if (route === "workspaces/gsshop")
          await page.locator(".sample-card").first().waitFor();
        if (route === "monitoring/drift") {
          await page.locator(".drift-distribution-details > summary").click();
          await page.locator(".metric-row").first().waitFor();
          const report = page.getByTestId("relabel-report");
          await expect(report).not.toHaveAttribute("open");
          assert(
            (await page.locator(".metric-row").first().boundingBox()).y <
              (await report.boundingBox()).y,
          );
          const panel = page.locator(".panel").filter({
            has: page.getByRole("heading", {
              name: "속성별 분포",
              exact: true,
            }),
          });
          await expect(
            panel
              .locator(".panel-heading")
              .getByRole("link", { name: "데이터 재구성", exact: true }),
          ).toHaveAttribute("href", /^\/ko\/reconstruction\?sources=/);
          const jobs = await (
            await page.request.get(base + "/api/jobs?kind=drift")
          ).json();
          const result = jobs[0].result;
          const field = [...result.fields].sort(
            (a, b) => b.js_divergence - a.js_divergence,
          )[0];
          await expect(
            page.getByRole("region", { name: "탐지 결과 요약" }),
          ).toContainText(
            `${result.fields.length}개 속성 중 ${result.fields.filter((f) => f.detected).length}개 차이 감지`,
          );
          await expect(page.locator(".drift-threshold")).toHaveCount(
            result.fields.length,
          );
          await expect(page.locator(".drift-field").first()).toHaveAttribute(
            "data-field",
            field.field,
          );
          const referenceTotal = Object.values(field.reference).reduce(
            (sum, n) => sum + n,
            0,
          );
          const currentTotal = Object.values(field.current).reduce(
            (sum, n) => sum + n,
            0,
          );
          await page.locator(".metric-row").first().focus();
          await page.locator(".metric-row").first().press("Enter");
          const data = page.locator(".distribution-detail").first();
          await expect(data).toBeVisible();
          for (const [value, count] of Object.entries(field.reference)) {
            const row = data.locator("tbody tr").filter({
              has: page.getByRole("cell", { name: value, exact: true }),
            });
            await expect(row.locator("td").nth(1)).toHaveText(
              count.toLocaleString(),
            );
            await expect(row.locator("td").nth(2)).toHaveText(
              (field.current[value] || 0).toLocaleString(),
            );
            const referencePct = referenceTotal
              ? (count / referenceTotal) * 100
              : 0;
            const currentPct = currentTotal
              ? ((field.current[value] || 0) / currentTotal) * 100
              : 0;
            await expect(row.locator(".drift-share")).toHaveAttribute(
              "aria-label",
              `기준 ${referencePct.toFixed(1)}%, 비교 ${currentPct.toFixed(1)}%`,
            );
            const delta = currentPct - referencePct;
            await expect(row.locator("td").nth(4)).toHaveText(
              `${delta > 0 ? "+" : ""}${delta.toFixed(1)}`,
            );
          }
          assert(
            !(await page.evaluate(
              () => document.documentElement.scrollWidth > innerWidth,
            )),
            "open drift detail overflow",
          );
          await page.evaluate(() => scrollTo(0, 0));
          await page.screenshot({
            path: `.runtime/ui-cleanup/drift-detail-${width}.png`,
            fullPage: true,
          });
          await page.locator(".metric-row").first().click();
          await report.locator("summary").first().click();
          await expect(report.locator("tbody tr")).toHaveCount(5);
          await expect(report.getByRole("link").first()).toHaveAttribute(
            "href",
            /\/ko\/models\//,
          );
          await report.locator("summary").first().click();
        }
        if (route === "workspaces/gsshop") {
          await expect(
            page
              .locator(".page-actions")
              .getByRole("button", { name: "워크스페이스 수정" }),
          ).toBeVisible();
          const menu = page.locator(".action-menu");
          await menu.locator("summary").click();
          const currentDatasets = await (
            await page.request.get(base + "/api/datasets?current=true")
          ).json();
          const supportsLabeling =
            currentDatasets.find((d) => d.workspace_id === "gsshop")?.count > 0;
          const labelingButton = page.getByRole("button", {
            name: "자동 레이블링",
            exact: true,
          });
          if (supportsLabeling) await expect(labelingButton).toBeEnabled();
          else await expect(labelingButton).toBeDisabled();
          await expect(
            menu.getByRole("link", { name: "레이블 내보내기" }),
          ).toHaveAttribute("href", /\/export$/);
          await menu.locator("summary").press("Escape");
          await expect(menu).not.toHaveAttribute("open");
          await menu.locator("summary").click();
          await page
            .getByRole("button", { name: "레이블 검토", exact: true })
            .click();
          const dialog = page.getByRole("dialog", { name: "레이블 상세" });
          await expect(dialog.getByLabel("핏", { exact: true })).toBeEnabled();
          assert(!(await dialog.innerText()).includes("·"));
          await page.getByRole("button", { name: "상세 닫기" }).click();
        }
        assert(
          !(await page.locator("body").innerText()).includes("·"),
          route + ": visible middle dot",
        );
        assert(
          !(await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          )),
          route + ": overflow at " + width,
        );
        await expect(page.locator(".alert.error")).toHaveCount(0);
        if (
          ["monitoring/drift", "workspaces/gsshop", "training"].includes(route)
        ) {
          await page.evaluate(() => scrollTo(0, 0));
          await page.screenshot({
            path: `.runtime/ui-cleanup/after-${width}-${route.replaceAll("/", "-")}.png`,
            fullPage: true,
          });
        }
      }
    }
    assert.deepEqual(errors, []);
    console.log(
      "20 page visits passed: desktop/mobile layout, no visible middle dots, menus/Escape, label editor, drift counts, collapsed comparison report, no JS errors",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
