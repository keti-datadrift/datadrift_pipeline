const { chromium, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const output = path.resolve(".runtime/ui-verification");
fs.mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN || "/usr/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-gpu"],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const paths = [
    "workspaces",
    "workspaces/musinsa",
    "reconstruction",
    "models",
    "models/qwen35_2b",
    "training",
    "evaluation",
    "monitoring/training",
    "monitoring/drift",
  ];
  const results = [];
  for (const route of paths) {
    await page.goto("http://121.126.210.3:18091/ko/" + route);
    await page.locator(".loading").waitFor({ state: "hidden" });
    await page.locator("h1").waitFor();
    await page.waitForTimeout(200);
    results.push({
      route,
      title: await page.locator("h1").innerText(),
      overflow: await page.evaluate(
        () => document.body.scrollWidth > innerWidth,
      ),
      alerts: await page.locator("[role=alert]").allTextContents(),
    });
    await page.screenshot({
      path: path.join(output, route.replaceAll("/", "-") + ".png"),
      fullPage: true,
    });
  }
  await page.goto("http://121.126.210.3:18091/ko/workspaces/musinsa");
  await page.locator(".sample-card").first().waitFor();
  await page.locator(".sample-card").first().click();
  await page.getByRole("dialog", { name: "레이블 상세" }).waitFor();
  await page.getByRole("button", { name: "상세 닫기" }).click();
  await page.goto("http://121.126.210.3:18091/ko/reconstruction");
  await page.getByRole("button", { name: "미리보기", exact: true }).click();
  await page.getByRole("status").waitFor();
  results.push({ postPreview: await page.getByRole("status").innerText() });
  await page.goto("http://121.126.210.3:18091/ko/models/qwen35_2b");
  await page.getByRole("link", { name: "이 모델로 학습" }).click();
  await page.waitForURL("**/ko/training/qwen35_2b");
  results.push({
    modelSelection: await page.getByLabel("시작 모델").inputValue(),
  });
  await page.getByLabel("학습 스텝").fill("1");
  const createdResponse = page.waitForResponse(
    (r) => r.url().endsWith("/api/jobs") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "학습 시작", exact: true }).click();
  const createdJob = await (await createdResponse).json();
  await page.waitForURL("**/ko/monitoring/training");
  await page
    .getByRole("button", { name: createdJob.id.slice(0, 8), exact: true })
    .click();
  await expect(page.locator(".run-head")).toContainText(
    createdJob.id.slice(0, 8),
  );
  await page.getByRole("button", { name: "실행 취소", exact: true }).click();
  await page.locator(".run-head .badge").filter({ hasText: "취소" }).waitFor();
  results.push({ trainingFormAndCancellation: "cancelled" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://121.126.210.3:18091/ko/workspaces");
  await page.locator(".workspace-card").first().waitFor();
  results.push({
    mobileOverflow: await page.evaluate(
      () => document.body.scrollWidth > innerWidth,
    ),
  });
  await page.screenshot({
    path: path.join(output, "mobile.png"),
    fullPage: true,
  });
  const report = { results, errors };
  fs.writeFileSync(
    path.join(output, "browser.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  if (
    errors.length ||
    results.some(
      (r) => r.overflow || r.mobileOverflow || (r.alerts || []).some(Boolean),
    )
  )
    process.exitCode = 1;
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
