"use client";
import { displayName } from "@/lib/utils";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
type LabelModel = {
  id: string;
  name: string;
  kind: string;
  available: boolean;
  status: string;
};
export function AutoLabelDialog({
  dataset,
  initialModelId,
  onClose,
  onStarted,
}: {
  initialModelId: string;
  dataset: { id: string; name: string; count: number; schema_id?: string };
  onClose: () => void;
  onStarted: (jobId: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [models, setModels] = useState<LabelModel[]>([]);
  const [modelId, setModelId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
    const controller = new AbortController();
    fetch(
      `/api/labeling-models?schema_id=${encodeURIComponent(dataset.schema_id || "visual-v1")}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error("모델 목록을 불러오지 못했습니다.");
        return response.json();
      })
      .then((items: LabelModel[]) => {
        setModels(items);
        setModelId(initialModelId);
        setLoading(false);
      })
      .catch((e) => {
        if (e.name !== "AbortError") {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [initialModelId, dataset.schema_id]);
  async function submit() {
    if (
      !models.some(
        (m) => m.id === modelId && m.available && m.status === "ready",
      ) ||
      busy
    )
      return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "labeling",
          dataset_id: dataset.id,
          model_id: modelId,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          typeof result.detail === "string"
            ? result.detail
            : "작업을 등록하지 못했습니다.",
        );
      onStarted(result.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "작업을 등록하지 못했습니다.");
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="workspace-dialog"
      aria-labelledby="auto-label-title"
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else onClose();
      }}
    >
      <header>
        <h2 id="auto-label-title">자동 레이블링</h2>
        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          aria-label="자동 레이블링 닫기"
        >
          <X size={20} />
        </button>
      </header>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <dl className="details">
          <dt>데이터셋</dt>
          <dd>{displayName(dataset.name)}</dd>
          <dt>대상 이미지</dt>
          <dd>{dataset.count.toLocaleString()}개</dd>
        </dl>
        <label className="field">
          레이블링 모델
          <select
            value={modelId}
            onChange={(event) => setModelId(event.target.value)}
            disabled={loading || busy}
            required
          >
            {loading ? (
              <option>모델 불러오는 중</option>
            ) : (
              <option value="">모델 선택</option>
            )}
            {modelId && !models.some((m) => m.id === modelId) && (
              <option value={modelId} disabled>
                {modelId} / 사용 불가
              </option>
            )}
            {models.map((model) => (
              <option
                key={model.id}
                value={model.id}
                disabled={!model.available || model.status !== "ready"}
              >
                {displayName(model.name)} (
                {model.kind === "lora" ? "학습 모델" : "기본 모델"})
                {!model.available
                  ? " / 파일 없음"
                  : model.status !== "ready"
                    ? " / 보관됨"
                    : ""}
              </option>
            ))}
          </select>
        </label>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        {!loading &&
          !models.some((m) => m.available && m.status === "ready") && (
            <p className="error-text">사용 가능한 모델이 없습니다.</p>
          )}
        <footer>
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={onClose}
          >
            닫기
          </button>
          <button
            className="button"
            disabled={
              busy ||
              loading ||
              !models.some(
                (m) => m.id === modelId && m.available && m.status === "ready",
              )
            }
          >
            {busy ? "등록 중" : "레이블링 시작"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
