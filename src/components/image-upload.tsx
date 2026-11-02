"use client";
import { displayName } from "@/lib/utils";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Workspace = { id: string; name: string };
type UploadResult = {
  added_count?: number;
  dataset: { id: string; workspace_id: string; count: number };
  duplicate: boolean;
  skipped_duplicates: number;
};
export function ImageUpload({
  workspaces,
  workspaceId,
  onClose,
  onComplete,
}: {
  workspaces: Workspace[];
  workspaceId?: string;
  onClose: () => void;
  onComplete: (result: UploadResult) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef<XMLHttpRequest | null>(null);
  const [selected, setSelected] = useState(
    workspaceId || workspaces[0]?.id || "",
  );
  const name =
    workspaces.find((w) => w.id === selected)?.name || "이미지 업로드";
  const [split, setSplit] = useState("unassigned");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
    return () => request.current?.abort();
  }, []);
  function add(incoming: File[]) {
    if (busy) return;
    const next = [...files, ...incoming];
    if (
      next.length > 200 ||
      next.reduce((sum, file) => sum + file.size, 0) > 100 * 1024 * 1024
    ) {
      setError("한 번에 200개, 총 100MB까지 선택할 수 있습니다.");
      return;
    }
    if (
      incoming.some(
        (file) =>
          !/\.(jpe?g|png|webp)$/i.test(file.name) ||
          file.size > 20 * 1024 * 1024,
      )
    ) {
      setError(
        "JPEG, PNG, WebP 이미지 파일만 선택하세요. 파일당 최대 20MB입니다.",
      );
      return;
    }
    setFiles(next);
    setError("");
  }
  function upload() {
    if (busy || !files.length || !selected || !name.trim()) return;
    setBusy(true);
    setError("");
    setProgress(0);
    const data = new FormData();
    files.forEach((file) => data.append("files", file));
    const xhr = new XMLHttpRequest();
    request.current = xhr;
    xhr.open(
      "POST",
      `/api/workspaces/${encodeURIComponent(selected)}/images?${new URLSearchParams({ name: name.trim(), split })}`,
    );
    xhr.timeout = 180000;
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable)
        setProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      setBusy(false);
      let result;
      try {
        result = JSON.parse(xhr.responseText);
      } catch {
        setError(
          "서버 응답을 확인하지 못했습니다. 목록을 새로고침한 뒤 다시 시도하세요.",
        );
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) onComplete(result);
      else
        setError(
          typeof result.detail === "string"
            ? result.detail
            : "업로드 항목을 확인하세요.",
        );
    };
    xhr.onerror = xhr.ontimeout = () => {
      setBusy(false);
      setError(
        "전송 결과를 확인하지 못했습니다. 목록을 새로고침한 뒤 다시 시도하세요. 같은 파일은 중복 저장하지 않습니다.",
      );
    };
    xhr.send(data);
  }
  return (
    <dialog
      ref={dialog}
      className="workspace-dialog"
      aria-labelledby="upload-title"
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else onClose();
      }}
    >
      <header>
        <h2 id="upload-title">이미지 업로드</h2>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          aria-label="업로드 닫기"
        >
          <X size={20} />
        </button>
      </header>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          upload();
        }}
      >
        <div className="form-grid">
          <label className="field">
            워크스페이스
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              disabled={busy || !!workspaceId}
              required
            >
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {displayName(w.name)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            데이터 분할
            <select
              value={split}
              onChange={(e) => setSplit(e.target.value)}
              disabled={busy}
            >
              <option value="unassigned">미지정</option>
              <option value="train">학습</option>
              <option value="validation">검증</option>
              <option value="test">테스트</option>
            </select>
          </label>
        </div>
        <div
          className="image-file-picker"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            add(Array.from(event.dataTransfer.files));
          }}
        >
          <label className="field">
            이미지 파일
            <input
              type="file"
              multiple
              accept=".jpg,.jpeg,.png,.webp"
              disabled={busy}
              onChange={(e) => {
                add(Array.from(e.target.files || []));
                e.target.value = "";
              }}
            />
          </label>
          <p>파일을 선택하거나 이 영역에 놓으세요.</p>
          <p>최대 200개, 파일당 20MB, 합계 100MB</p>
        </div>
        {!!files.length && (
          <div className="upload-file-list">
            <div className="upload-file-summary">
              <span>
                {files.length}개 선택 /{" "}
                {(files.reduce((n, f) => n + f.size, 0) / 1024 / 1024).toFixed(
                  1,
                )}
                MB
              </span>
              <button
                type="button"
                onClick={() => setFiles([])}
                disabled={busy}
              >
                선택 비우기
              </button>
            </div>
            <ul>
              {files.map((file, index) => (
                <li key={index}>
                  <span>{file.name}</span>
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={`${file.name} 선택 해제`}
                    onClick={() =>
                      setFiles(files.filter((_, i) => i !== index))
                    }
                  >
                    <X size={15} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
        {busy && (
          <div role="status">
            <progress value={progress} max={100} />
            <p>
              {progress < 100
                ? `전송 중 ${progress}%`
                : "이미지 검사 및 저장 중"}
            </p>
          </div>
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
            disabled={busy || !files.length || !name.trim() || !selected}
          >
            {busy ? "업로드 중" : "업로드"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
