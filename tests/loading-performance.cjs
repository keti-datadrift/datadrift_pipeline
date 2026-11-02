const { chromium, expect } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const base = process.env.TEST_BASE_URL || "http://121.126.210.3:18091";
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [],
    measurements = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const requests = [];
  page.on("request", (r) => {
    if (r.url().startsWith(base + "/api/"))
      requests.push(new URL(r.url()).pathname + new URL(r.url()).search);
  });
  try {
    for (const path of [
      "workspaces",
      "workspaces/gsshop",
      "models",
      "reconstruction",
      "evaluation",
      "monitoring/drift",
    ]) {
      const start = Date.now(),
        requestStart = requests.length;
      await page.goto(base + "/ko/" + path);
      await page.waitForFunction(
        () =>
          !document.querySelector("main > .loading") &&
          document.querySelector(
            "main .stats,main .panel,main .workspace-card,main .sample-page",
          ),
      );
      if (path.includes("gsshop")) {
        await page.locator(".sample-card").first().waitFor();
        await expect(page.locator(".sample-card img").first()).toHaveJSProperty(
          "complete",
          true,
        );
        assert(
          await page
            .locator(".sample-card img")
            .first()
            .evaluate((im) => im.naturalWidth > 0),
        );
      }
      measurements.push({ path, readyMs: Date.now() - start });
      if (path === "workspaces" || path === "reconstruction") {
        assert(
          !requests
            .slice(requestStart)
            .some(
              (u) => u.startsWith("/api/jobs") || u.startsWith("/api/models"),
            ),
        );
      }
      assert(
        !requests.slice(requestStart).includes("/api/jobs"),
        "UI must request job summaries",
      );
      assert(
        !requests.slice(requestStart).some((u) => u.endsWith("/logs")),
        "logs only belong on training monitor",
      );
      if (path === "evaluation") {
        await expect(
          page.getByRole("heading", { name: "속성별 평가", exact: true }),
        ).toBeVisible();
      }
    }
    const drift = (
      await (await page.request.get(base + "/api/jobs?kind=drift")).json()
    )[0];
    await expect(page.locator(".drift-decision-header")).toHaveAttribute(
      "data-run-id",
      drift.id,
    );
    await page.locator(".drift-distribution-details > summary").click();
    await expect(
      page.getByRole("heading", {
        name: "속성별 분포",
        exact: true,
      }),
    ).toBeVisible();
    const driftHistory = await (
      await page.request.get(base + "/api/jobs?kind=drift")
    ).json();
    const older = driftHistory.find(
      (j) => j.id !== drift.id && j.status === "succeeded" && j.result?.fields,
    );
    if (older) {
      await page.locator(".drift-history-section > summary").click();
      await page
        .getByRole("button", { name: older.id.slice(0, 8), exact: true })
        .click();
      await expect(page.locator(".drift-decision-header")).toHaveAttribute(
        "data-run-id",
        older.id,
      );
      await expect(page.locator(".metric-row")).toHaveCount(
        older.result.fields.length,
      );
    }
    // A single refresh click must not send two catalog refreshes.
    const catalogPath = "/api/datasets?current=true";
    const old = requests.filter((u) => u === catalogPath).length;
    await page.getByRole("button", { name: "새로고침", exact: true }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "새로고침했습니다" }),
    ).toBeVisible();
    assert.equal(requests.filter((u) => u === catalogPath).length - old, 1);
    // Returning from a hidden tab refreshes immediately, instead of waiting 30s.
    await page.goto(base + "/ko/evaluation");
    await page.locator(".loading").waitFor({ state: "hidden" });
    await page.evaluate(() =>
      Object.defineProperty(document, "hidden", {
        configurable: true,
        get: () => true,
      }),
    );
    await expect(
      page.getByRole("heading", { name: "속성별 평가", exact: true }),
    ).toBeVisible();
    const count = requests.length;
    await page.waitForTimeout(4200);
    assert.equal(requests.length, count);
    const response = page.waitForResponse((r) =>
      r.url().endsWith("/api/jobs?summary=true"),
    );
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        get: () => false,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await response;
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base + "/ko/monitoring/training");
    await page.locator(".run-head").waitFor();
    assert(
      !(await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      )),
    );
    const training = (
      await (await page.request.get(base + "/api/jobs?kind=training")).json()
    ).find((j) => j.status === "succeeded" && j.progress?.history?.length);
    if (training) {
      await page
        .getByRole("button", { name: training.id.slice(0, 8), exact: true })
        .click();
      await expect(
        page.getByRole("img", { name: "학습 손실 곡선" }).locator("circle"),
      ).toHaveCount(training.progress.history.length);
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      ".runtime/loading-after.json",
      JSON.stringify(measurements, null, 2),
    );
    console.log(
      JSON.stringify(
        {
          measurements,
          checks:
            "selective requests, indexed image, full results, single refresh, visibility refresh, mobile, no JS errors",
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
