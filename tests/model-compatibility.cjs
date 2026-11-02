const { chromium, expect } = require("@playwright/test");
const assert = require("node:assert/strict");
const base = process.env.TEST_BASE_URL || "http://121.126.210.3:18091";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  const submitted = [];
  let trainingDataReads = 0;
  page.on("pageerror", (error) => errors.push(error.message));
  const models = [
    { id: "qwen35_2b", name: "기본 모델", kind: "base" },
    {
      id: "trained",
      name: "혼합 100step",
      kind: "lora",
      schema_id: "bkave-106baf22f720",
      dataset_id: "training-only",
    },
    { id: "missing", name: "파일 없는 모델", kind: "lora", available: false },
    { id: "archived", name: "보관 모델", kind: "lora", status: "archived" },
  ].map((model) => ({ status: "ready", available: true, ...model }));
  const current = {
    id: "current",
    name: "현재 데이터",
    schema_id: "bkave-106baf22f720",
    workspace_id: "w",
    count: 10,
    splits: { train: 6, validation: 2, test: 2 },
  };
  const trainOnly = {
    ...current,
    id: "train-only",
    name: "평가 분할 없는 데이터",
    splits: { train: 10 },
  };
  try {
    await page.route(/\/api\/models(?:\?.*)?$/, (route) =>
      route.fulfill({ json: models }),
    );
    await page.route("**/api/datasets?current=true", (route) =>
      route.fulfill({ json: [current, trainOnly] }),
    );
    await page.route("**/api/datasets/training-only", (route) => {
      trainingDataReads++;
      return route.fulfill({
        status: 404,
        json: { detail: "학습 데이터는 평가 선택에 사용하지 않음" },
      });
    });
    await page.route("**/api/jobs", async (route) => {
      assert.equal(route.request().method(), "POST");
      submitted.push(route.request().postDataJSON());
      await route.fulfill({
        status: 422,
        json: { detail: "QA 작업 접수 차단" },
      });
    });
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 844 });
      for (const [route, label, datasetLabel, buttonLabel] of [
        ["training", "시작 모델", "학습 데이터셋", "학습 시작"],
        ["evaluation", "모델", "데이터셋", "평가 시작"],
      ]) {
        await page.goto(`${base}/ko/${route}`);
        const picker = page.getByRole("combobox", { name: label, exact: true });
        const dataset = page.getByLabel(datasetLabel, { exact: true });
        const submit = page.getByRole("button", {
          name: buttonLabel,
          exact: true,
        });
        await expect(picker).toHaveAttribute("data-model-id", "qwen35_2b");
        await picker.click();
        const popup = page.locator(".model-picker-popup");
        await expect(popup.getByRole("option")).toHaveCount(3);
        await expect(
          popup.getByRole("option", { name: /파일 없는/ }),
        ).toHaveAttribute("aria-disabled", "true");
        await popup.locator('[data-model-id="trained"]').click();
        await expect(picker).toHaveAttribute("data-model-id", "trained");
        await expect(dataset).toHaveValue(current.id);
        await expect(page.locator(".model-dataset-notice")).toHaveCount(0);
        await expect(
          page.getByRole("button", { name: "모델 학습 데이터 선택" }),
        ).toHaveCount(0);
        assert(
          !/비케이브 기준|기존 속성 기준|저장된 학습 데이터/.test(
            await page.locator("main").innerText(),
          ),
        );
        await expect(submit).toBeEnabled();
        for (const split of route === "evaluation"
          ? ["test", "validation"]
          : ["train"]) {
          if (route === "evaluation") {
            await page.getByLabel("평가 분할").selectOption(split);
            await expect(
              page.locator(".field-hint").filter({ hasText: "전체를 평가" }),
            ).toContainText("2개 전체를 평가합니다.");
          }
          await submit.click();
          await expect(page.locator(".alert.error")).toContainText(
            "QA 작업 접수 차단",
          );
          const body = submitted.pop();
          assert.equal(body.model_id, "trained");
          assert.equal(body.dataset_id, current.id);
          if (route === "evaluation") {
            assert.equal(body.split, split);
            assert.equal(body.sample_limit, undefined);
          }
        }
        if (route === "evaluation") {
          await dataset.selectOption(trainOnly.id);
          await expect(submit).toBeDisabled();
          await page.locator(".horizontal-form").dispatchEvent("submit");
          await expect(page.locator(".alert.error")).toContainText(
            "평가할 데이터가 없습니다.",
          );
          assert.equal(submitted.length, 0);
        }
        await page.goto(`${base}/ko/${route}/trained`);
        await expect(picker).toHaveAttribute("data-model-id", "trained");
        await expect(submit).toBeEnabled();
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
        );
      }
    }
    assert.equal(trainingDataReads, 0);
    assert.deepEqual(errors, []);
    console.log(
      "PC/mobile training/evaluation: default attributes, all active models, no schema labels or training-data selection; exact selected dataset/model and held-out test/validation requests; empty evaluation split blocked. Jobs mocked.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
