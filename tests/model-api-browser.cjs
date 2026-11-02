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
    const endpoints = [
      {
        id: "qa-base-api",
        name: "기본 모델 API",
        model_name: "Qwen3.5-2B",
        model_id: "qwen35_2b",
        enabled: true,
        available: true,
        runtime: { state: "ready", active_requests: 0, shared: false },
      },
      {
        id: "qa-trained-api",
        name: "학습된 모델 API",
        model_name: "Qwen3.5-4B 학습 모델",
        model_id: "qa-trained",
        enabled: false,
        available: true,
        runtime: { state: "stopped", active_requests: 0, shared: false },
      },
    ].map((e) => ({ ...e, path: `/api/model-endpoints/${e.id}/predictions` }));
    const attrs = {
      fit: "레귤러핏",
      length: "unknown",
      sleeve: "반소매",
      neckline: "unknown",
      pattern: "무지",
      details: [],
      fabric: "unknown",
      origin: "unknown",
      color_code: "unknown",
    };
    const prediction = (id, category = "상의") => ({
      id,
      status: "succeeded",
      created_at: "2026-10-29T00:00:00Z",
      result_url: "/api/predictions/" + id,
      category,
      result: {
        category,
        category_valid: !!category,
        attributes: attrs,
        excluded_attributes: category ? [] : Object.keys(attrs),
        schema_valid: !!category,
        parse_valid: true,
        processing_seconds: 1.2,
        raw: "{}",
      },
    });
    const histories = {
      "qa-base-api": [prediction("base-request")],
      "qa-trained-api": [prediction("trained-request")],
    };
    await page.route("**/api/model-endpoints", (route) =>
      route.fulfill({ json: endpoints }),
    );
    await page.route(/\/api\/model-endpoints\/[^/?]+$/, async (route) => {
      assert.equal(route.request().method(), "PATCH");
      const endpoint = endpoints.find((e) =>
        route
          .request()
          .url()
          .endsWith("/" + e.id),
      );
      endpoint.enabled = route.request().postDataJSON().enabled;
      endpoint.runtime.state = endpoint.enabled ? "starting" : "stopping";
      await route.fulfill({ json: endpoint });
    });
    let submitted;
    let inferredCategory = "상의";
    let requestNumber = 0;
    await page.route("**/api/model-endpoints/*/predictions*", async (route) => {
      const url = new URL(route.request().url());
      const eid = url.pathname.split("/")[3];
      if (route.request().method() === "POST") {
        submitted = url;
        assert(!url.searchParams.has("category"));
        assert.match(
          route.request().headers()["content-type"],
          /multipart\/form-data/,
        );
        const result = prediction(
          "new-request-" + inferredCategory + "-" + ++requestNumber,
          inferredCategory,
        );
        histories[eid].unshift(result);
        await route.fulfill({ status: 202, json: result });
      } else
        await route.fulfill({
          json: { items: histories[eid], total: histories[eid].length },
        });
    });
    await page.goto(base + "/ko/model-api");
    const registry = page.getByRole("region", {
      name: "등록된 API",
      exact: true,
    });
    await expect(registry.locator(".endpoint-card")).toHaveCount(2);
    await registry
      .getByRole("button", { name: "API 등록", exact: true })
      .click();
    const registration = registry.locator("form.api-create");
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      const [input, select, button] = await Promise.all([
        registration.locator("input").boundingBox(),
        registration.locator("select").boundingBox(),
        registration
          .getByRole("button", { name: "등록", exact: true })
          .boundingBox(),
      ]);
      assert.equal(input.height, select.height);
      assert.equal(select.height, button.height);
      if (width >= 768) {
        assert(
          Math.abs(input.y + input.height - button.y - button.height) <= 1,
        );
        assert(
          Math.abs(select.y + select.height - button.y - button.height) <= 1,
        );
      }
      const style = await registration.locator("select").evaluate((e) => ({
        padding: parseFloat(getComputedStyle(e).paddingRight),
        appearance: getComputedStyle(e).appearance,
      }));
      assert(style.padding >= 40 && style.appearance === "none");
      assert(
        !(await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        )),
        JSON.stringify(
          await page.evaluate(() => ({
            width: innerWidth,
            scroll: document.documentElement.scrollWidth,
            elements: [...document.querySelectorAll("main *")]
              .filter((e) => e.getBoundingClientRect().right > innerWidth + 1)
              .slice(0, 12)
              .map((e) => ({
                tag: e.tagName,
                cls: e.className,
                text: e.textContent.slice(0, 60),
                rect: e.getBoundingClientRect().toJSON(),
              })),
          })),
        ),
      );
      fs.mkdirSync(".runtime/model-api-layout", { recursive: true });
      await page.screenshot({
        path: `.runtime/model-api-layout/registration-${width}.png`,
        fullPage: true,
      });
    }
    await registry.getByRole("button", { name: "닫기", exact: true }).click();
    await page.setViewportSize({ width: 1440, height: 1000 });
    let workspace = page.locator(".api-workspace");
    await expect(workspace.getByRole("heading", { level: 2 })).toHaveText(
      "기본 모델 API",
    );
    for (const name of ["연결 정보", "요청 테스트", "요청 이력"])
      await expect(
        workspace.getByRole("heading", { name, exact: true }),
      ).toBeVisible();
    await expect(
      registry.getByRole("heading", { name: "요청 이력" }),
    ).toHaveCount(0);
    await expect(
      page.locator(".endpoint-card.selected .endpoint-selection"),
    ).toHaveText("선택됨");
    await expect(workspace.locator("tbody .text-button")).toHaveText(
      "base-req",
    );
    await registry.locator(".endpoint-select").nth(1).click();
    await expect(workspace.getByRole("heading", { level: 2 })).toHaveText(
      "학습된 모델 API",
    );
    await expect(workspace.locator(".api-reception-state")).toHaveText(
      "신규 요청 접수 중지",
    );
    await expect(workspace.locator("tbody .text-button")).toHaveText(
      "trained-",
    );
    await expect(workspace.getByLabel("요청 주소")).toHaveValue(
      base + endpoints[1].path,
    );
    await expect(
      workspace.getByRole("button", { name: "요청 보내기", exact: true }),
    ).toBeDisabled();
    await registry
      .locator(".endpoint-card")
      .nth(1)
      .getByRole("button", { name: "접수 시작", exact: true })
      .click();
    await expect(workspace.locator(".api-reception-state")).toHaveText(
      "신규 요청 접수 중",
    );
    await expect(workspace.locator(".api-runtime-state")).toContainText(
      "서비스 준비 중",
    );
    endpoints[1].runtime.state = "ready";
    await expect(workspace.locator(".api-runtime-state")).toContainText(
      "서비스 실행 중",
    );
    endpoints[1].runtime = {
      state: "draining",
      active_requests: 2,
      shared: false,
    };
    await expect(workspace.locator(".api-runtime-state")).toContainText(
      "기존 요청 2건 처리 후 서비스 종료",
    );
    endpoints[1].runtime = { state: "ready", active_requests: 0, shared: true };
    await expect(workspace.locator(".api-runtime-state")).toContainText(
      "다른 API가 접수 중이어서 서버를 유지합니다",
    );
    endpoints[1].runtime = {
      state: "error",
      active_requests: 0,
      shared: false,
      error: "서버 기동 실패",
    };
    await expect(
      workspace.locator(".api-runtime-state").getByRole("alert"),
    ).toHaveText("서버 기동 실패");
    endpoints[1].runtime = {
      state: "stopped",
      active_requests: 0,
      shared: false,
    };
    await expect(workspace.locator(".api-runtime-state")).toContainText(
      "서비스 중지됨 · GPU 메모리 해제",
    );
    await expect(
      workspace.getByRole("combobox", { name: "상품 카테고리" }),
    ).toHaveCount(0);
    await workspace.getByText("호출 방법", { exact: true }).click();
    await expect(workspace.locator(".api-code").first()).toContainText(
      base + "/api/model-endpoints/" + endpoints[1].id + "/status",
    );
    await expect(workspace.locator(".help-details")).toContainText(
      "accepting_requests",
    );
    await expect(workspace.locator(".api-code").nth(1)).toContainText(
      "?wait=true",
    );
    await expect(workspace.locator(".api-code").first()).not.toContainText(
      "?category=",
    );
    await expect(
      workspace.getByText("상품 카테고리는 이미지에서 자동 판별합니다.", {
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(workspace.locator(".api-call-steps > li")).toHaveCount(2);
    const chooserEvent = page.waitForEvent("filechooser");
    await workspace
      .getByRole("button", { name: "이미지 선택", exact: true })
      .click();
    const chooser = await chooserEvent;
    await chooser.setFiles({
      name: "clicked.png",
      mimeType: "image/png",
      buffer: Buffer.from("mock clicked image"),
    });
    await expect(workspace.locator(".api-image-dropzone")).toContainText(
      "clicked.png",
    );
    assert.equal(submitted, undefined);
    const transfer = await page.evaluateHandle(() => {
      const data = new DataTransfer();
      data.items.add(
        new File(["mock dragged image"], "dragged.png", { type: "image/png" }),
      );
      return data;
    });
    const zone = workspace.locator(".api-image-dropzone");
    await zone.dispatchEvent("dragover", { dataTransfer: transfer });
    await expect(zone).toHaveClass(/is-dragging/);
    await zone.dispatchEvent("drop", { dataTransfer: transfer });
    await transfer.dispose();
    await expect(zone).not.toHaveClass(/is-dragging/);
    await expect(zone).toContainText("dragged.png");
    assert.equal(submitted, undefined);
    // Submit the dropped file; state must pass form validation without a file input value.
    await workspace
      .getByRole("button", { name: "요청 보내기", exact: true })
      .click();
    await expect(workspace.locator(".prediction-result")).toContainText(
      "상품 카테고리: 상의",
    );
    assert.equal(submitted.pathname, endpoints[1].path);
    await workspace.getByLabel("이미지", { exact: true }).setInputFiles({
      name: "mock.png",
      mimeType: "image/png",
      buffer: Buffer.from("mocked request only"),
    });
    await workspace
      .getByRole("button", { name: "요청 보내기", exact: true })
      .click();
    await expect(
      workspace.getByRole("region", { name: "요청 결과", exact: true }),
    ).toContainText("상품 카테고리: 상의");
    assert.equal(submitted.pathname, endpoints[1].path);
    assert.equal(
      await workspace.locator(".api-detail-grid .prediction-result").count(),
      0,
    );
    inferredCategory = null;
    await workspace
      .getByRole("button", { name: "요청 보내기", exact: true })
      .click();
    await expect(
      workspace.getByRole("region", { name: "요청 결과", exact: true }),
    ).toContainText("판별하지 못함");
    await expect(workspace.locator(".prediction-result tbody tr")).toHaveCount(
      9,
    );
    await expect(
      workspace.locator(".prediction-result tbody tr").first(),
    ).toContainText("판정 제외");
    await registry.locator(".endpoint-select").first().click();
    await expect(
      workspace.getByRole("region", { name: "요청 결과", exact: true }),
    ).toHaveCount(0);
    await expect(
      workspace.getByRole("button", { name: "요청 보내기", exact: true }),
    ).toBeDisabled();
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 844 });
      const [dropBox, sendBox] = await Promise.all([
        workspace.locator(".api-image-dropzone").boundingBox(),
        workspace
          .getByRole("button", { name: "요청 보내기", exact: true })
          .boundingBox(),
      ]);
      assert(
        sendBox.x >= dropBox.x + dropBox.width + 8,
        "Send button should be beside the drop area",
      );
      assert(
        Math.abs(sendBox.y + sendBox.height - dropBox.y - dropBox.height) <= 1,
        "Send button should align with the drop area's bottom",
      );
      assert(
        !(await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        )),
        "API overflow at " + width,
      );
      fs.mkdirSync(".runtime/model-api-layout", { recursive: true });
      await page.screenshot({
        path: `.runtime/model-api-layout/page-${width}.png`,
        fullPage: true,
      });
    }
    assert.deepEqual(errors, []);
    console.log(
      "API registry/detail/result/history separation, endpoint switch and stop/start, category-free multipart, inferred/unknown category and mobile passed. All mutations mocked.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
