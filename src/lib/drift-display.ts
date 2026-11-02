export const count = (value?: number) => value?.toLocaleString() ?? "—";

export const signalNames: Record<string, string> = {
  attribute: "속성 분포",
  within_category: "같은 카테고리의 속성",
  category_mix: "카테고리 비율",
  image_embeddings: "이미지 특징",
};
export const decimal = (value?: number) => value?.toFixed(4) ?? "—";

export const percent = (value: number, total: number) =>
  total ? (value / total) * 100 : 0;
