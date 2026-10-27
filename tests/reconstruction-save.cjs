const { chromium, expect } = require("@playwright/test");
const fs = require("node:fs");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN || "/usr/bin/google-chrome",
    args: ["--no-sandbox", "--disable-gpu"],
  });
  const page = await browser.newPage();
  const base = "http://121.126.210.3:18091";
  const record = JSON.parse(
    fs.readFileSync(".runtime/ui-verification/workflows.json"),
  );
  try {
    await page.goto(base + "/ko/reconstruction");
    await page
      .getByLabel("저장할 워크스페이스")
      .selectOption(record.workspaceId);
    await page.getByLabel("버전 이름").fill("QA 재구성 저장 확인");
    await page.getByLabel("학습 데이터 수").fill("12");
    const response = page.waitForResponse(
      (r) =>
        r.url() === base + "/api/reconstructions" &&
        r.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "새 버전 저장", exact: true })
      .click();
    const r = await response;
    assert.equal(r.status(), 201, await r.text());
    const d = await r.json();
    record.reconstructionId = d.id;
    assert.deepEqual(d.splits, { train: 12, validation: 181, test: 280 });
    await page.goto(base + "/ko/workspaces/" + record.workspaceId);
    await expect(page.getByLabel("데이터셋 버전")).toHaveValue(d.id);
    await page.locator(".sample-card").first().waitFor();
    record.checks.push(
      "browser saves reconstruction version and opens its images",
    );
  } finally {
    fs.writeFileSync(
      ".runtime/ui-verification/workflows.json",
      JSON.stringify(record, null, 2),
    );
    console.log(JSON.stringify(record, null, 2));
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
