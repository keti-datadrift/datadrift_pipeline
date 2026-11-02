import type { Dataset, Run } from "@/lib/platform-types";

export const ATTRIBUTE_LABELS: Record<string, string> = {
  color_code: "색상 코드",
  fabric: "원단 유형",
  origin: "생산처",
  pattern: "무늬",
  fit: "핏",
  sleeve: "소매",
  length: "길이",
  closure: "여밈",
  details: "디테일",
  neckline: "넥라인",
  hood: "후드",
  visible_pocket: "포켓",
  cuff: "소매단",
  hem: "밑단",
  surface_texture: "표면 질감",
  graphic_location: "그래픽 위치",
  graphic_scale: "그래픽 크기",
};
export const JOB_PHASE_LABELS: Record<string, string> = {
  preparing_drift: "비교 데이터 준비 중",
  testing_attributes: "속성 분포 검정 중",
  loading_image_encoder: "이미지 특징 모델 준비 중",
  embedding_images: "이미지 특징 추출 중",
  testing_images: "이미지 특징 검정 중",
  finishing_drift: "종합 결과 정리 중",
  loading: "모델 불러오는 중",
  loading_processor: "입력 준비 중",
  loading_model: "모델 불러오는 중",
  loading_adapter: "학습 가중치 적용 중",
  preparing_training: "학습 준비 중",
  loading_teacher: "모델 불러오는 중",
  labeling: "이미지 레이블링",
  training: "학습 중",
  evaluating: "평가 중",
  completed: "완료",
  queued: "대기 중",
};
export const STATUS_LABELS: Record<string, string> = {
  queued: "대기 중",
  running: "진행 중",
  succeeded: "완료",
  failed: "실패",
  cancelled: "취소",
  ready: "사용 가능",
  archived: "보관됨",
  unavailable: "파일 없음",
};
export const runState = (run: Run) =>
  run.status === "running"
    ? run.progress.phase === "completed"
      ? "결과 정리 중"
      : JOB_PHASE_LABELS[run.progress.phase || ""] || "실행 준비 중"
    : STATUS_LABELS[run.status] || run.status;
export const num = (v: number | undefined) =>
  v === undefined ? "—" : v.toLocaleString("ko-KR");
export const reconstructionCount = (d: Dataset) =>
  (d.splits.train || 0) + (d.splits.unassigned || 0);
export const reconstructionDefaultCount = (data: Dataset[]) =>
  data.length
    ? Math.min(200, data.length * Math.min(...data.map(reconstructionCount)))
    : 200;
export const pct = (v: number | undefined | null) =>
  v == null ? "—" : `${(v * 100).toFixed(1)}%`;
export const date = (v: string) =>
  new Date(v).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
