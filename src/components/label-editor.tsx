"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  ImageIcon,
  RotateCcw,
  Save,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

export type LabelSample = {
  id: string;
  product_id: string;
  source: string;
  category?: string;
  schema_id?: string;
  split: string;
  target: Record<string, unknown>;
  label_source: string;
  original_label_source?: string;
  human_verified: boolean;
  unscored_fields: string[];
  label_history?: { at: string; note: string; channel?: string }[];
  ai_label?: {
    raw: string;
    schema_valid: boolean;
    rejected_fields: Record<string, unknown>;
  };
};
type Version = {
  schema_id?: string;
  id: string;
  name: string;
  workspace_id: string;
  count: number;
  splits: Record<string, number>;
  provenance: string;
  fingerprint: string;
  kind: string;
  parent_ids: string[];
};
const legacyGroups = [
  {
    title: "형태와 실루엣",
    fields: [
      ["fit", "핏"],
      ["sleeve", "소매"],
      ["length", "길이"],
      ["neckline", "넥라인"],
    ],
  },
  {
    title: "구조와 마감",
    fields: [
      ["closure", "여밈"],
      ["hood", "후드"],
      ["visible_pocket", "포켓"],
      ["cuff", "소매단"],
      ["hem", "밑단"],
    ],
  },
  {
    title: "패턴과 표면",
    fields: [
      ["pattern", "패턴"],
      ["surface_texture", "표면 질감"],
      ["graphic_location", "그래픽 위치"],
      ["graphic_scale", "그래픽 크기"],
    ],
  },
];
const display = (value: string) =>
  value === "unknown"
    ? "판단 어려움"
    : value === "not_applicable"
      ? "해당 없음"
      : value;
const splitName: Record<string, string> = {
  train: "학습",
  validation: "검증",
  test: "테스트",
};

export function LabelEditor({
  sample,
  dataset,
  position,
  total,
  onClose,
  onMove,
  onSaved,
}: {
  sample: LabelSample;
  dataset: Version;
  position: number;
  total: number;
  onClose: () => void;
  onMove: (direction: number) => void;
  onSaved: (dataset: Version, sample: LabelSample) => void;
}) {
  const isBkave = !!dataset.schema_id && dataset.schema_id !== "visual-v1";
  const [taxonomy, setTaxonomy] = useState<{
    name: string;
    colors: { code: string; name: string; group: string }[];
  } | null>(null);
  const [schema, setSchema] = useState<Record<string, string[]> | null>(null);
  const [target, setTarget] = useState(sample.target);
  const [excluded, setExcluded] = useState(sample.unscored_fields || []);
  const [verified, setVerified] = useState(sample.human_verified);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [discard, setDiscard] = useState<null | (() => void)>(null);
  const dialog = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const dirty =
    JSON.stringify(target) !== JSON.stringify(sample.target) ||
    JSON.stringify([...excluded].sort()) !==
      JSON.stringify([...(sample.unscored_fields || [])].sort()) ||
    verified !== sample.human_verified ||
    !!note.trim();
  const leaveRef = useRef({ dirty, busy, onClose });
  leaveRef.current = { dirty, busy, onClose };
  function leave(action: () => void) {
    if (busy) return;
    if (dirty) setDiscard(() => action);
    else action();
  }
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (leaveRef.current.busy) return;
        if (leaveRef.current.dirty) setDiscard(() => leaveRef.current.onClose);
        else leaveRef.current.onClose();
      }
      if (event.key === "Tab") {
        const items = Array.from(
          dialog.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), select:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
          ) || [],
        ).filter((el) => el.getClientRects().length);
        const first = items[0],
          last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", keydown);
    const controller = new AbortController();
    fetch(
      `/api/label-schema?schema_id=${encodeURIComponent(dataset.schema_id || "visual-v1")}${isBkave ? "&category=" + encodeURIComponent(sample.category || "") : ""}`,
      { signal: controller.signal },
    )
      .then(async (r) => {
        if (!r.ok)
          throw new Error("속성 목록을 불러오지 못했습니다. 다시 열어주세요.");
        setSchema(await r.json());
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    if (isBkave)
      fetch("/api/taxonomy", { signal: controller.signal })
        .then((r) => {
          if (!r.ok) throw new Error("기준 사전을 불러오지 못했습니다.");
          return r.json();
        })
        .then(setTaxonomy)
        .catch((e) => {
          if (e.name !== "AbortError") setError(e.message);
        });
    return () => {
      controller.abort();
      document.removeEventListener("keydown", keydown);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  function update(field: string, value: unknown) {
    setTarget((v) => ({ ...v, [field]: value }));
    setVerified(false);
  }
  function reset() {
    setTarget(sample.target);
    setExcluded(sample.unscored_fields || []);
    setVerified(sample.human_verified);
    setNote("");
    setError("");
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(
        `/api/datasets/${dataset.id}/samples/${sample.id}/labels`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target,
            unscored_fields: excluded,
            human_verified: verified,
            note,
          }),
        },
      );
      const data = await r.json();
      if (!r.ok)
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : "입력한 속성을 확인하세요.",
        );
      onSaved(data.dataset, data.sample);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }
  const groups = isBkave
    ? [
        {
          title: "형태와 실루엣",
          fields: [
            ["fit", "핏"],
            ["length", "기장"],
            ["sleeve", "소매 길이"],
            ["neckline", "넥라인"],
          ],
        },
        {
          title: "무늬와 원단",
          fields: [
            ["pattern", "무늬"],
            ["fabric", "원단 유형"],
          ],
        },
        {
          title: "색상과 생산처",
          fields: [
            ["color_code", "색상 코드"],
            ["origin", "생산처"],
          ],
        },
      ]
        .map((group) => ({
          ...group,
          fields: group.fields.filter(
            ([field]) => schema?.[field]?.[0] !== "not_applicable",
          ),
        }))
        .filter((group) => group.fields.length)
    : legacyGroups;
  const applicableCount = Object.keys(target).filter(
    (k) => target[k] !== "not_applicable",
  ).length;
  const completed = Object.keys(target).filter(
    (k) =>
      target[k] !== "unknown" &&
      target[k] !== "not_applicable" &&
      !excluded.includes(k),
  ).length;
  return (
    <div className="label-backdrop" onClick={() => leave(onClose)}>
      <section
        ref={dialog}
        className="label-editor"
        role="dialog"
        aria-modal="true"
        aria-label="레이블 상세"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="label-header">
          <div className="label-title">
            <span className="label-title-icon">
              <ImageIcon size={21} />
            </span>
            <div>
              <h2>
                레이블 상세{" "}
                <span>{isBkave ? "비케이브 기준" : "기존 기준"}</span>
              </h2>
              <p>{sample.product_id}</p>
            </div>
          </div>
          <div className="label-navigation">
            <span>
              {position + 1} / {total} <small>현재 페이지</small>
            </span>
            <button
              disabled={busy || position <= 0}
              aria-label="이전 이미지"
              onClick={() => leave(() => onMove(-1))}
            >
              <ArrowLeft size={18} />
            </button>
            <button
              disabled={busy || position >= total - 1}
              aria-label="다음 이미지"
              onClick={() => leave(() => onMove(1))}
            >
              <ArrowRight size={18} />
            </button>
            <button
              ref={closeButton}
              disabled={busy}
              aria-label="상세 닫기"
              onClick={() => leave(onClose)}
            >
              <X size={21} />
            </button>
          </div>
        </header>
        <div className="label-body">
          <div className="label-preview">
            <div className="label-image-toolbar">
              <span>
                {sample.source === "gsshop"
                  ? "GS SHOP"
                  : sample.source === "musinsa"
                    ? "무신사 · BKAVE"
                    : sample.source}
              </span>
              <span className="label-pill">
                {splitName[sample.split] || sample.split} 데이터
              </span>
            </div>
            <div
              className="label-image-stage"
              tabIndex={0}
              aria-label="상품 이미지 확대 영역"
            >
              <img
                style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}
                src={`/api/datasets/${dataset.id}/images/${sample.id}`}
                alt={sample.product_id}
              />
            </div>
            <div className="label-zoom">
              <button
                aria-label="이미지 축소"
                disabled={zoom <= 1}
                onClick={() => setZoom((v) => Math.max(1, v - 0.5))}
              >
                <ZoomOut size={18} />
              </button>
              <span>{Math.round(zoom * 100)}%</span>
              <button
                aria-label="이미지 확대"
                disabled={zoom >= 3}
                onClick={() => setZoom((v) => Math.min(3, v + 0.5))}
              >
                <ZoomIn size={18} />
              </button>
              <button onClick={() => setZoom(1)}>맞춤</button>
            </div>
            <div className="label-provenance">
              <div>
                <span
                  className={`label-pill ${sample.human_verified ? "verified" : ""}`}
                >
                  {sample.human_verified ? <CheckCheck size={14} /> : null}
                  {sample.human_verified ? "사람 검토 완료" : "사람 검토 전"}
                </span>
                <span className="label-pill">
                  {sample.label_history?.some(
                    (h) => h.channel === "manual_web_or_api",
                  )
                    ? "수동 수정본"
                    : sample.label_history?.some(
                          (h) => h.channel === "ai_relabel",
                        )
                      ? "AI 재레이블"
                      : isBkave
                        ? "기준 변환본"
                        : "AI 레이블"}
                </span>
              </div>
              <p>
                이미지에서 확인되는 속성만 선택하세요. 판단하기 어려우면 ‘판단
                어려움’을 사용하세요.
              </p>
              <details>
                <summary>레이블 출처와 수정 이력</summary>
                <p>현재: {sample.label_source}</p>
                {sample.original_label_source && (
                  <p>원본: {sample.original_label_source}</p>
                )}
                <p className="label-version">{dataset.name}</p>
                {sample.label_history?.map((h, i) => (
                  <p key={i}>
                    {new Date(h.at).toLocaleString("ko-KR", {
                      timeZone: "Asia/Seoul",
                    })}{" "}
                    · {h.note || "속성 수정"}
                  </p>
                ))}
              </details>
              {sample.ai_label && (
                <details>
                  <summary>
                    AI 판독 원문 ·{" "}
                    {sample.ai_label.schema_valid
                      ? "허용값 검사 통과"
                      : "부적합 필드 제외"}
                  </summary>
                  <pre className="logs">{sample.ai_label.raw}</pre>
                  {!!Object.keys(sample.ai_label.rejected_fields).length && (
                    <p>
                      제외된 필드:{" "}
                      {Object.keys(sample.ai_label.rejected_fields)
                        .map(
                          (k) =>
                            Object.fromEntries(groups.flatMap((g) => g.fields))[
                              k
                            ] || k,
                        )
                        .join(", ")}
                    </p>
                  )}
                </details>
              )}
            </div>
          </div>
          <div className="label-fields">
            <div className="label-fields-heading">
              <div>
                <h3>속성 레이블</h3>
                <p>
                  {isBkave
                    ? `${sample.category} · ${taxonomy?.name || "비케이브"} 엑셀 기준`
                    : "이미지와 비교하며 값을 수정하세요."}
                </p>
              </div>
              <span>
                {completed} / {applicableCount} 입력됨
              </span>
            </div>
            {isBkave && (
              <div className="callout">
                엑셀의 카테고리별 허용값입니다. 변환 과정에서 제외된 속성은 직접
                검토한 뒤 제외 설정을 해제하세요. 생산처·세부 색상 코드는 근거가
                있을 때만 입력하세요.
              </div>
            )}
            {error && (
              <div className="alert error" role="alert">
                {error}
              </div>
            )}
            {!schema && !error && (
              <div className="empty">속성 목록을 불러오는 중입니다…</div>
            )}
            <fieldset disabled={busy || !schema} className="label-form-fields">
              {groups.map((group) => (
                <section className="label-section" key={group.title}>
                  <h4>{group.title}</h4>
                  <div className="label-field-grid">
                    {group.fields.map(([field, title]) => (
                      <div
                        className={`label-attribute ${excluded.includes(field) ? "excluded" : ""}`}
                        key={field}
                      >
                        <label htmlFor={`label-${field}`}>
                          {title}
                          {JSON.stringify(target[field]) !==
                            JSON.stringify(sample.target[field]) && (
                            <span className="label-changed">수정됨</span>
                          )}
                        </label>
                        <select
                          id={`label-${field}`}
                          aria-label={title}
                          value={String(target[field] ?? "unknown")}
                          onChange={(e) => update(field, e.target.value)}
                        >
                          {(schema?.[field] || []).map((v) => (
                            <option key={v} value={v}>
                              {field === "color_code" && v !== "unknown"
                                ? `${v} · ${taxonomy?.colors.find((c) => c.code === v)?.name || v} (${taxonomy?.colors.find((c) => c.code === v)?.group || ""})`
                                : display(v)}
                            </option>
                          ))}
                        </select>
                        <label className="label-exclude">
                          <input
                            type="checkbox"
                            checked={excluded.includes(field)}
                            onChange={(e) => {
                              setExcluded((v) =>
                                e.target.checked
                                  ? [...v, field]
                                  : v.filter((k) => k !== field),
                              );
                              setVerified(false);
                            }}
                          />
                          학습·평가 제외{" "}
                          <span className="sr-only">{title}</span>
                        </label>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
              <section className="label-section">
                <h4>
                  {isBkave ? "디자인 디테일" : "디테일"}{" "}
                  <span>복수 선택 · 선택하지 않으면 없음</span>
                </h4>
                <div className="label-chips">
                  {(schema?.details || []).map((value) => {
                    const checked =
                      Array.isArray(target.details) &&
                      target.details.includes(value);
                    return (
                      <button
                        type="button"
                        key={value}
                        aria-pressed={checked}
                        className={checked ? "selected" : ""}
                        onClick={() => {
                          const values = Array.isArray(target.details)
                            ? (target.details as string[])
                            : [];
                          update(
                            "details",
                            checked
                              ? values.filter((v) => v !== value)
                              : [...values, value],
                          );
                        }}
                      >
                        {checked && <Check size={13} />}
                        {value}
                      </button>
                    );
                  })}
                </div>
                <label className="label-exclude">
                  <input
                    type="checkbox"
                    checked={excluded.includes("details")}
                    onChange={(e) => {
                      setExcluded((v) =>
                        e.target.checked
                          ? [...v, "details"]
                          : v.filter((k) => k !== "details"),
                      );
                      setVerified(false);
                    }}
                  />
                  학습·평가 제외 <span className="sr-only">디테일</span>
                </label>
              </section>
              <section className="label-section">
                <label className="label-note">
                  검토 메모 <span>선택</span>
                  <textarea
                    maxLength={1000}
                    placeholder="수정 이유나 확인이 필요한 내용을 남겨주세요."
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </label>
                <label className="label-verify">
                  <input
                    type="checkbox"
                    checked={verified}
                    onChange={(e) => setVerified(e.target.checked)}
                  />
                  <span>
                    <strong>전체 속성을 직접 검토했습니다</strong>
                    <small>
                      선택한 경우에만 사람 검토 완료로 기록됩니다. 제외한 속성은
                      그대로 제외됩니다.
                    </small>
                  </span>
                </label>
              </section>
            </fieldset>
          </div>
        </div>
        {discard && (
          <div className="label-discard" role="alert">
            <span>저장하지 않은 수정 내용이 있습니다.</span>
            <button
              className="button secondary"
              onClick={() => setDiscard(null)}
            >
              계속 편집
            </button>
            <button
              className="button danger"
              onClick={() => {
                const action = discard;
                setDiscard(null);
                action();
              }}
            >
              수정 버리기
            </button>
          </div>
        )}
        <footer className="label-footer">
          <div>
            <strong>
              {dirty
                ? "저장하지 않은 변경사항"
                : "원본과 실행 이력을 보존합니다"}
            </strong>
            <p>저장하면 수정본이 새 데이터셋 버전으로 생성됩니다.</p>
          </div>
          <div className="actions">
            <button
              className="button secondary"
              disabled={busy || !dirty}
              onClick={reset}
            >
              <RotateCcw size={15} />
              되돌리기
            </button>
            <button
              className="button"
              disabled={busy || !schema || !dirty}
              onClick={save}
            >
              <Save size={16} />
              {busy ? "저장 중…" : "수정본 저장"}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
