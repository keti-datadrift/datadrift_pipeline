// Paging checks must keep working when the real catalog has fewer than 11 models.
async function mockPagedModels(page) {
  const models = Array.from({ length: 25 }, (_, index) => ({
    id: `paging-model-${index}`,
    name: `페이지 검증 모델 ${String(index + 1).padStart(2, "0")}`,
    family: "qwen35_2b",
    kind: "lora",
    status: "ready",
    available: true,
    created_at: "2026-10-29T00:00:00Z",
  }));
  await page.route(/\/api\/models(?:\?.*)?$/, (route) =>
    route.fulfill({ json: models }),
  );
}

module.exports = { mockPagedModels };
