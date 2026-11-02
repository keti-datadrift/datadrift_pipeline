"use client";

import { LabelStatus } from "@/components/label-status";
import { displayName } from "@/lib/utils";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ImageIcon,
  RotateCcw,
  Save,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

type LabelHistory = {
  at?: string | null;
  note?: string;
  channel?: string;
  teacher?: { model_name?: string; model?: string; model_id?: string };
};
export type LabelSample = {
  label_state?: "unlabeled" | "labeled";
  id: string;
  product_id: string;
  source: string;
  filename?: string;
  upload_filename?: string;
  ai_labeled?: boolean;
  initial_label?: { model_name: string; at?: string | null };
  category?: string;
  schema_id?: string;
  split: string;
  target: Record<string, unknown>;
  label_source: string;
  original_label_source?: string;
  human_verified: boolean;
  unscored_fields: string[];
  label_history?: LabelHistory[];
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
  unassigned: "미지정",
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
  navigationBusy = false,
  navigationError = "",
}: {
  navigationBusy?: boolean;
  navigationError?: string;
  sample: LabelSample;
  dataset: Version;
  position: number;
  total: number;
  onClose: () => void;
  onMove: (direction: number) => void;
  onSaved: (dataset: Version, sample: LabelSample, message?: string) => void;
}) {
  const isBkave = !!dataset.schema_id && dataset.schema_id !== "visual-v1";
  const filename =
    sample.filename || sample.upload_filename || sample.product_id;
  const history: LabelHistory[] = [
    ...(sample.initial_label
      ? [
          {
            at: sample.initial_label.at,
            channel: "initial_label",
            teacher: { model_name: sample.initial_label.model_name },
          },
        ]
      : []),
    ...(sample.label_history || []),
  ];
  const [taxonomy, setTaxonomy] = useState<{
    name: string;
    colors: { code: string; name: string; group: string }[];
  } | null>(null);
  const [schema, setSchema] = useState<Record<string, string[]> | null>(null);
  const [target, setTarget] = useState(sample.target);
  const [split, setSplit] = useState(sample.split);
  const [category, setCategory] = useState(sample.category || "");
  const [excluded, setExcluded] = useState(sample.unscored_fields || []);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [action, setAction] = useState<"save" | "cancel-review" | null>(null);
  const saving = action !== null;
  const busy = saving || navigationBusy;
  const [zoom, setZoom] = useState(1);
  const [discard, setDiscard] = useState<null | (() => void)>(null);
  const dialog = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const dirty =
    category !== (sample.category || "") ||
    split !== sample.split ||
    JSON.stringify(target) !== JSON.stringify(sample.target) ||
    JSON.stringify([...excluded].sort()) !==
      JSON.stringify([...(sample.unscored_fields || [])].sort()) ||
    !!note.trim();
  const leaveRef = useRef({ dirty, busy: saving, onClose });
  leaveRef.current = { dirty, busy: saving, onClose };
  function leave(action: () => void) {
    if (saving) return;
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
  useEffect(() => {
    const controller = new AbortController();
    setSchema(null);
    setError("");
    fetch(
      `/api/label-schema?schema_id=${encodeURIComponent(dataset.schema_id || "visual-v1")}${isBkave && category ? "&category=" + encodeURIComponent(category) : ""}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error("속성 목록을 불러오지 못했습니다.");
        return response.json() as Promise<Record<string, string[]>>;
      })
      .then((values) => {
        setSchema(values);
        if (category !== (sample.category || "")) {
          setTarget(
            Object.fromEntries(
              Object.entries(values).map(([key, allowed]) => [
                key,
                key === "details"
                  ? []
                  : allowed.length === 1 && allowed[0] === "not_applicable"
                    ? "not_applicable"
                    : "unknown",
              ]),
            ),
          );
          setExcluded(Object.keys(values));
        }
      })
      .catch((error) => {
        if (error.name !== "AbortError") setError(error.message);
      });
    return () => controller.abort();
  }, [category, dataset.schema_id]);
  function update(field: string, value: unknown) {
    setTarget((v) => ({ ...v, [field]: value }));
  }
  function reset() {
    setTarget(sample.target);
    setSplit(sample.split);
    setCategory(sample.category || "");
    setExcluded(sample.unscored_fields || []);
    setNote("");
    setError("");
  }
  async function save() {
    setAction("save");
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
            human_verified: true,
            category: isBkave && category ? category : undefined,
            split,
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
      setAction(null);
    }
  }
  async function cancelReview() {
    setAction("cancel-review");
    setError("");
    try {
      const response = await fetch(
        `/api/datasets/${dataset.id}/samples/${sample.id}/review`,
        { method: "DELETE" },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : "검토를 취소하지 못했습니다.",
        );
      onSaved(data.dataset, data.sample, "검토를 취소했습니다.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "검토를 취소하지 못했습니다.");
    } finally {
      setAction(null);
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
              <h2>레이블 상세</h2>
            </div>
          </div>
          <div className="label-navigation">
            <span>
              {position + 1} / {total}
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
              disabled={saving}
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
              <span className="label-filename" title={filename}>
                {filename}
              </span>
              <select
                aria-label="데이터 구분"
                value={split}
                disabled={busy}
                onChange={(e) => setSplit(e.target.value)}
              >
                {Object.entries(splitName).map(([value, name]) => (
                  <option key={value} value={value}>
                    {name} 데이터
                  </option>
                ))}
              </select>
            </div>
            <div
              className="label-image-stage"
              tabIndex={0}
              aria-label="상품 이미지 확대 영역"
            >
              <img
                style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}
                src={`/api/datasets/${dataset.id}/images/${sample.id}`}
                alt={filename}
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
              <LabelStatus sample={sample} />
              <details>
                <summary>수정 이력</summary>
                {!history.length && <p>수정 이력이 없습니다.</p>}
                {history.map((h, i) => (
                  <p key={i}>
                    {h.at && (
                      <>
                        {new Date(h.at).toLocaleString("ko-KR", {
                          timeZone: "Asia/Seoul",
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: false,
                        })}
                        {" / "}
                      </>
                    )}
                    {h.channel === "manual_web_or_api"
                      ? "직접 수정"
                      : h.channel === "review_cancelled"
                        ? "검토 취소"
                        : h.channel === "taxonomy_mapping"
                          ? "기준 변환"
                          : displayName(
                              h.teacher?.model_name ||
                                h.teacher?.model
                                  ?.split("/")
                                  .filter(Boolean)
                                  .pop() ||
                                h.teacher?.model_id ||
                                "모델 미기록",
                            )}
                    {(h.channel === "initial_label" ||
                      h.channel === "ai_relabel") &&
                      "로 레이블링 완료"}
                  </p>
                ))}
              </details>
            </div>
          </div>
          <div className="label-fields">
            <div className="label-fields-heading">
              <div>
                <h3>속성 레이블</h3>
              </div>
              <span>
                {completed} / {applicableCount} 입력됨
              </span>
            </div>
            {navigationError && (
              <div role="alert" className="alert error">
                {navigationError}
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
            {isBkave && !sample.category && (
              <label className="field">
                상품 카테고리
                <select
                  value={category}
                  disabled={busy}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="">카테고리 선택</option>
                  {["아우터", "상의", "하의", "ACC"].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
            )}
            <fieldset
              disabled={busy || !schema || (isBkave && !category)}
              className="label-form-fields"
            >
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
                                ? `${v} ${taxonomy?.colors.find((c) => c.code === v)?.name || v} (${taxonomy?.colors.find((c) => c.code === v)?.group || ""})`
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
                            }}
                          />
                          학습 및 평가 제외{" "}
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
                  <span>여러 항목 선택 가능</span>
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
                    }}
                  />
                  학습 및 평가 제외 <span className="sr-only">디테일</span>
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
            <strong>{dirty ? "저장하지 않은 변경사항" : ""}</strong>
          </div>
          <div className="actions">
            {sample.human_verified && (
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => leave(() => void cancelReview())}
              >
                {action === "cancel-review" ? "취소 중…" : "검토 취소"}
              </button>
            )}
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
              disabled={
                busy ||
                !schema ||
                (isBkave && !category) ||
                (!dirty && sample.human_verified)
              }
              onClick={save}
            >
              <Save size={16} />
              {action === "save" ? "저장 중…" : "저장"}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
