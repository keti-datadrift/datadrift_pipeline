const { chromium, expect } = require("@playwright/test");
const assert = require("node:assert/strict");
const base = process.env.TEST_BASE_URL || "http://121.126.210.3:18091";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    const jobs = await (
      await page.request.get(base + "/api/jobs?kind=evaluation")
    ).json();
    const template = jobs.find((job) => job.request.kind === "evaluation");
    assert(template);
    let job = {
      ...template,
      status: "queued",
      started_at: undefined,
      finished_at: undefined,
      result: null,
      error: null,
      progress: { step: 0, total: 200 },
    };
    await page.route(/\/api\/jobs(?:\?|\/|$)/, (route) => {
      assert.equal(route.request().method(), "GET");
      return route.fulfill({
        json:
          new URL(route.request().url()).pathname === "/api/jobs" ? [job] : job,
      });
    });
    await page.goto(base + "/ko/evaluation");
    const phase = page.getByTestId("evaluation-phase");
    const bar = page.getByRole("progressbar", { name: "평가 진행률" });
    const timer = page.getByTestId("run-elapsed");
    await expect(phase).toHaveText("대기 중");
    await expect(timer).toHaveText("0초");
    for (const [state, text, step] of [
      ["loading", "모델 불러오는 중", 0],
      ["loading_processor", "입력 준비 중", 0],
      ["loading_model", "모델 불러오는 중", 0],
      ["loading_adapter", "학습 가중치 적용 중", 0],
      ["evaluating", "평가 중", 0],
      ["evaluating", "평가 중", 5],
      ["completed", "결과 정리 중", 200],
    ]) {
      job = {
        ...job,
        status: "running",
        started_at: new Date(Date.now() - 15000).toISOString(),
        progress: {
          phase: state,
          step,
          total: 200,
          elapsed_seconds: 0,
          batch_size: state === "evaluating" ? 8 : undefined,
        },
      };
      await expect(phase).toHaveText(text, { timeout: 12000 });
      if (state.startsWith("loading"))
        await expect(bar).not.toHaveAttribute("value");
      else
        await expect(bar).toHaveAttribute("value", String(step), {
          timeout: 12000,
        });
      await expect(page.locator(".run-head .badge")).toHaveText(text);
      if (state === "evaluating")
        await expect(page.getByText("8장", { exact: true })).toBeVisible();
    }
    job = {
      ...job,
      status: "succeeded",
      finished_at: new Date().toISOString(),
    };
    await expect(phase).toHaveText("완료", { timeout: 12000 });
    const stopped = await timer.innerText();
    job = {
      ...job,
      status: "failed",
      error: "검증용 실패",
      finished_at: new Date().toISOString(),
    };
    await expect(phase).toHaveText("검증용 실패", { timeout: 12000 });
    assert(stopped.endsWith("초"));
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    console.log(
      "Evaluation phases: queued, loading stages at unchanged step zero, first-image evaluation, counts, finalizing, completion, failure and elapsed timer passed. No jobs submitted.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
