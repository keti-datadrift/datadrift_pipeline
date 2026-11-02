const { chromium, expect } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const base = process.env.TEST_BASE_URL || "http://121.126.210.3:18091";
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ hasTouch: true });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    const models = Array.from({ length: 45 }, (_, i) => ({
      id: "picker-" + i,
      name: `모델 ${String(i).padStart(2, "0")} 긴 모델 이름과 학습 데이터 출처 및 세부 학습 설정을 포함한 모델`,
      kind: "base",
      status: "ready",
      available: i !== 43,
    }));
    await page.route(/\/api\/models(?:\?.*)?$/, (r) =>
      r.fulfill({ json: models }),
    );
    const submitted = [];
    await page.route("**/api/jobs", async (r) => {
      assert.equal(r.request().method(), "POST");
      submitted.push(r.request().postDataJSON());
      await r.fulfill({
        status: 422,
        json: { detail: "검증용 작업 접수 차단" },
      });
    });
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 844 });
      for (const [route, label] of [
        ["training", "시작 모델"],
        ["evaluation", "모델"],
      ]) {
        await page.goto(base + "/ko/" + route);
        const control = page.getByRole("combobox", {
          name: label,
          exact: true,
        });
        await expect(control).toHaveAttribute("data-model-id", "picker-0");
        assert(
          await control
            .locator("span")
            .evaluate(
              (element) =>
                element.scrollWidth <= element.clientWidth + 1 &&
                element.scrollHeight <= element.clientHeight + 1 &&
                getComputedStyle(element).whiteSpace === "normal",
            ),
          "the selected model name must be fully readable without opening or searching",
        );
        await control.scrollIntoViewIfNeeded();
        await control.click();
        const popup = page.locator(".model-picker-popup");
        await expect(popup.getByRole("option")).toHaveCount(45);
        assert(
          await popup
            .locator(".model-picker-options")
            .evaluate((e) => e.scrollHeight > e.clientHeight),
        );
        const last = popup.locator('[role=option][data-model-id="picker-44"]');
        const list = popup.locator(".model-picker-options");
        const content = await list.boundingBox();
        const x = content.x + content.width / 2;
        const top = content.y + 25;
        const bottom = content.y + content.height - 25;
        await page.mouse.move(x, bottom);
        await page.mouse.down();
        await page.mouse.move(x, top, { steps: 12 });
        await page.mouse.up();
        await expect
          .poll(() => list.evaluate((element) => element.scrollTop))
          .toBeGreaterThan(80);
        await expect(popup).toBeVisible();
        await expect(control).toHaveAttribute("data-model-id", "picker-0");
        assert.equal(
          await page.evaluate(() => window.getSelection()?.toString()),
          "",
          "dragging the list must not select model name text",
        );
        await page.mouse.move(x, top);
        await page.mouse.down();
        await page.mouse.move(x, bottom, { steps: 12 });
        await page.mouse.up();
        await expect
          .poll(() => list.evaluate((element) => element.scrollTop))
          .toBe(0);
        // Capture must keep scrolling and prevent selection outside the popup.
        await page.mouse.move(x, bottom);
        await page.mouse.down();
        await page.mouse.move(x, content.y - 15, { steps: 12 });
        await page.mouse.up();
        await expect
          .poll(() => list.evaluate((element) => element.scrollTop))
          .toBeGreaterThan(80);
        await expect(popup).toBeVisible();
        await expect(control).toHaveAttribute("data-model-id", "picker-0");
        await expect(list).not.toHaveAttribute("data-dragging", "true");
        // Wheel and the original scrollbar must still work after a list drag.
        await list.hover();
        await page.mouse.wheel(0, -10000);
        await expect
          .poll(() => list.evaluate((element) => element.scrollTop))
          .toBe(0);
        const track = popup.getByRole("scrollbar");
        const listBox = await track.boundingBox();
        const thumb = await track.locator("[data-scroll-thumb]").boundingBox();
        assert(
          listBox.width >= 12,
          "the scrollbar needs a visible draggable track",
        );
        await page.mouse.move(
          thumb.x + thumb.width / 2,
          thumb.y + thumb.height / 2,
        );
        await page.mouse.down();
        await page.mouse.move(
          listBox.x + listBox.width / 2,
          listBox.y + listBox.height - 1,
          { steps: 12 },
        );
        await page.mouse.up();
        assert(
          await list.evaluate((element) => element.scrollTop > 0),
          "dragging the scrollbar must move the model list",
        );
        await expect(last).toBeInViewport();
        const bounds = await popup.boundingBox();
        assert(
          bounds.x >= 0 &&
            bounds.x + bounds.width <= width + 1 &&
            bounds.y >= 0 &&
            bounds.y + bounds.height <= 845,
          "dropdown must stay inside viewport",
        );
        assert(
          await last
            .locator("span")
            .evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
          "long names must wrap",
        );
        fs.mkdirSync(".runtime/model-picker", { recursive: true });
        await page.screenshot({
          path: `.runtime/model-picker/${route}-${width}.png`,
        });
        // Small hand movement is still a click, rather than a scroll gesture.
        const lastBounds = await last.boundingBox();
        await page.mouse.move(
          lastBounds.x + lastBounds.width / 2,
          lastBounds.y + lastBounds.height / 2,
        );
        await page.mouse.down();
        await page.mouse.move(
          lastBounds.x + lastBounds.width / 2,
          lastBounds.y + lastBounds.height / 2 + 2,
        );
        await page.mouse.up();
        await expect(control).toHaveAttribute("data-model-id", "picker-44");
        await expect(popup).toHaveCount(0);
        await control.click();
        const search = page.getByRole("searchbox", {
          name: label + " 검색",
          exact: true,
        });
        await search.fill("모델 43");
        const disabled = popup.getByRole("option");
        await expect(disabled).toHaveAttribute("aria-disabled", "true");
        await disabled.dispatchEvent("click");
        await expect(control).toHaveAttribute("data-model-id", "picker-44");
        await search.fill("없는 모델");
        await expect(
          popup.getByText("검색 조건에 맞는 모델이 없습니다."),
        ).toBeVisible();
        await search.fill("모델 01");
        await search.press("ArrowDown");
        await search.press("Enter");
        await expect(control).toHaveAttribute("data-model-id", "picker-1");
        await expect(control).toBeFocused();
        await control.press("ArrowDown");
        await expect(popup).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(popup).toHaveCount(0);
        assert.equal(
          submitted.length,
          0,
          "picker Enter must not submit the form",
        );
        if (route === "evaluation") {
          await expect(page.getByLabel("최대 샘플 수")).toHaveCount(0);
          await expect(page.getByLabel("평가 분할")).toHaveValue("test");
          const datasets = await (
            await page.request.get(base + "/api/datasets?current=true")
          ).json();
          await page
            .getByLabel("데이터셋", { exact: true })
            .selectOption(datasets[0].id);
          for (const split of ["test", "validation"]) {
            await page.getByLabel("평가 분할").selectOption(split);
            await expect(
              page.getByText(
                new RegExp(`${datasets[0].splits[split]}개 전체를 평가합니다`),
              ),
            ).toBeVisible();
            await page
              .getByRole("button", { name: "평가 시작", exact: true })
              .click();
            await expect(page.locator("main").getByRole("alert")).toContainText(
              "검증용 작업 접수 차단",
            );
            const body = submitted.pop();
            assert.equal(body.split, split);
            assert.equal(body.sample_limit, undefined);
            assert.equal(body.model_id, "picker-1");
          }
        }
        assert(
          !(await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          )),
          "page overflow",
        );
      }
    }
    // Real touch events exercise native panning, including pointer cancellation.
    const control = page.getByRole("combobox", { name: "모델", exact: true });
    await control.click();
    const list = page.getByRole("listbox");
    const track = page.getByRole("scrollbar");
    await track.focus();
    await track.press("Home");
    await expect
      .poll(() => list.evaluate((element) => element.scrollTop))
      .toBe(0);
    const content = await list.boundingBox();
    const session = await page.context().newCDPSession(page);
    const x = content.x + content.width / 2;
    const y = content.y + content.height - 30;
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y }],
    });
    for (let step = 1; step <= 12; step++)
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x, y: y - (step / 12) * (content.height - 60) }],
      });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect
      .poll(() => list.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(80);
    await expect(control).toHaveAttribute("data-model-id", "picker-1");
    await expect(list).not.toHaveAttribute("data-dragging", "true");
    await page.keyboard.press("Escape");
    await session.detach();
    assert.deepEqual(errors, []);
    console.log(
      "Training/evaluation picker: 45 models, list drag in both directions and outside popup without selecting, small-movement click, native touch pan, wheel/scrollbar, wrapping, viewport bounds, search, disabled files, keyboard and no accidental submit; full test/validation payloads passed. Jobs mocked.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
