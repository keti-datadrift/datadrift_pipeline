import type { Endpoint, Prediction } from "@/lib/model-api-types";

export const states: Record<string, string> = {
  queued: "대기 중",
  running: "추출 중",
  succeeded: "완료",
  failed: "실패",
  cancelled: "취소",
};
export const labels: Record<string, string> = {
  fit: "핏",
  length: "기장",
  sleeve: "소매 길이",
  neckline: "넥라인",
  pattern: "무늬",
  details: "디자인 디테일",
  fabric: "원단 유형",
  origin: "생산처",
  color_code: "색상 코드",
};

export const active = (p: Prediction) =>
  ["queued", "running"].includes(p.status);
export function runtimeLabel(endpoint: Endpoint) {
  const runtime = endpoint.runtime;
  if (!runtime) return "";
  if (runtime.state === "draining")
    return `기존 요청 ${runtime.active_requests}건 처리 후 서비스 종료`;
  const labels: Record<string, string> = {
    ready: "서비스 실행 중",
    starting: "서비스 준비 중",
    waiting: "서비스 시작 대기 중",
    stopping: "서비스 종료 중",
    stopped: "서비스 중지됨 · GPU 메모리 해제",
    error: "서비스 실행 오류",
    unknown: "서비스 실행 상태 확인 필요",
  };
  return labels[runtime.state] || "서비스 실행 상태 확인 중";
}
