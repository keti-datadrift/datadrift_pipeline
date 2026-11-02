"use client";
import { jsonRequest, requestJson } from "@/lib/api-client";
import { displayName } from "@/lib/utils";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type DeleteTarget = {
  kind: "workspace" | "dataset" | "samples";
  id: string;
  sample_ids?: string[];
};
type Preview = {
  name: string;
  sample_count: number;
  remaining_count: number;
  token: string;
};
function request<T>(path: string, body?: unknown): Promise<T> {
  return requestJson<T>(
    "/api/deletions" + path,
    body === undefined ? {} : jsonRequest("POST", body),
  );
}
const titles = {
  workspace: "워크스페이스 삭제",
  dataset: "전체 데이터 삭제",
  samples: "선택 이미지 삭제",
};
export function DeleteDialog({
  target,
  onClose,
  onDeleted,
}: {
  target: DeleteTarget;
  onClose: () => void;
  onDeleted: (result: { dataset?: { id: string } | null }) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
    let alive = true;
    request<Preview>("/preview", target)
      .then((p) => {
        if (alive) setPreview(p);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [target]);
  async function submit() {
    if (!preview || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await request<{ dataset?: { id: string } | null }>("", {
        ...target,
        token: preview.token,
      });
      onDeleted(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "삭제하지 못했습니다.");
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="workspace-dialog"
      aria-labelledby="deletion-title"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
    >
      <header>
        <h2 id="deletion-title">{titles[target.kind]}</h2>
        <button onClick={onClose} disabled={busy} aria-label="삭제 창 닫기">
          <X size={20} />
        </button>
      </header>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {!preview && !error && (
          <p role="status">삭제 대상을 확인하고 있습니다.</p>
        )}
        {preview && (
          <>
            <dl className="details">
              <dt>대상</dt>
              <dd>{displayName(preview.name)}</dd>
              <dt>
                {target.kind === "samples" ? "선택 이미지" : "포함 이미지"}
              </dt>
              <dd>{preview.sample_count.toLocaleString()}개</dd>
            </dl>
            <p className="result-note">
              {target.kind === "workspace"
                ? "워크스페이스와 그 안의 이미지, 레이블을 삭제합니다."
                : target.kind === "dataset"
                  ? "이 워크스페이스의 이미지와 레이블을 모두 삭제합니다."
                  : preview.remaining_count
                    ? `선택한 이미지와 레이블을 삭제합니다. ${preview.remaining_count}개 이미지는 유지됩니다.`
                    : "전체 이미지를 선택했습니다. 이미지와 레이블을 모두 삭제합니다."}
            </p>
            <p className="result-note">
              이미지 원본 파일, 기존 모델과 작업 결과는 보관됩니다.
            </p>
            {target.kind === "workspace" && (
              <label className="field">
                확인을 위해 워크스페이스 이름을 입력하세요
                <input
                  autoComplete="off"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  placeholder={preview.name}
                  disabled={busy}
                />
              </label>
            )}
          </>
        )}
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <footer>
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={onClose}
          >
            취소
          </button>
          <button
            className="button danger"
            disabled={
              !preview ||
              busy ||
              (target.kind === "workspace" && confirmation !== preview.name)
            }
          >
            {busy ? "삭제 중" : "삭제"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
