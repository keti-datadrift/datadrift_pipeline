"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Database,
  Layers,
  Boxes,
  FlaskConical,
  Activity,
  Radar,
  ChevronRight,
  Plus,
  RefreshCw,
  ArrowUpRight,
  Search,
  X,
  CircleCheck,
  ArrowLeft,
  Download,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LabelEditor, type LabelSample } from "@/components/label-editor";
import { RelabelReport } from "@/components/relabel-report";

type Dataset = {
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
type Workspace = {
  id: string;
  name: string;
  description: string;
  datasets: Dataset[];
};
type Model = {
  schema_id?: string;
  id: string;
  name: string;
  family: string;
  kind: string;
  status: string;
  available: boolean;
  training_job_id?: string;
  dataset_id?: string;
  parent_id?: string;
};
type Run = {
  id: string;
  status: string;
  created_at: string;
  started_at?: string;
  finished_at?: string;
  request: {
    kind: string;
    dataset_id: string;
    model_id?: string;
    reference_id?: string;
    max_steps: number;
    split: string;
  };
  progress: {
    phase?: string;
    step?: number;
    total?: number;
    loss?: number;
    history?: { step: number; loss: number }[];
    elapsed_seconds?: number;
  };
  error?: string;
  result?: {
    dataset_id?: string;
    model_id?: string;
    count?: number;
    macro_attribute_accuracy?: number;
    exact_match?: number;
    parse_failures?: number;
    schema_failures?: number;
    fields?:
      Record<string, { accuracy: number | null; count: number }> | DriftField[];
    predictions?: {
      sample_id: string;
      raw: string;
      target: Record<string, unknown>;
      prediction: Record<string, unknown> | null;
      schema_valid?: boolean;
    }[];
    note?: string;
    detected?: boolean;
    image_histogram_js?: number;
    reference_count?: number;
    current_count?: number;
    threshold?: number;
    optimizer_steps?: number;
    loss?: number;
    policy_changed?: boolean;
  };
};
type DriftField = {
  reference_scored?: number;
  current_scored?: number;
  q_value?: number;
  category_adjusted_js?: number;
  category_adjusted_q?: number;
  field: string;
  js_divergence: number;
  detected: boolean;
  reference: Record<string, number>;
  current: Record<string, number>;
};
type Sample = LabelSample;
const names: Record<string, string> = {
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
const states: Record<string, string> = {
  queued: "대기 중",
  running: "진행 중",
  succeeded: "완료",
  failed: "실패",
  cancelled: "취소",
  ready: "사용 가능",
  archived: "보관됨",
};
const num = (v: number | undefined) =>
  v === undefined ? "—" : v.toLocaleString("ko-KR");
const pct = (v: number | undefined | null) =>
  v == null ? "—" : `${(v * 100).toFixed(1)}%`;
const date = (v: string) =>
  new Date(v).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
async function api<T>(
  url: string,
  body?: unknown,
  method = "POST",
): Promise<T> {
  const r = await fetch(
    "/api" + url,
    body === undefined
      ? { cache: "no-store" }
      : {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const data = await r.json();
  if (!r.ok)
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : JSON.stringify(data.detail),
    );
  return data;
}
function Badge({
  status,
  children,
}: {
  status?: string;
  children?: ReactNode;
}) {
  return (
    <span className={`badge ${status || ""}`}>
      {children || states[status || ""] || status}
    </span>
  );
}
function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="empty">
      <Layers size={32} />
      <p>{children}</p>
    </div>
  );
}
function Panel({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Card className="panel">
      <div className="panel-heading">
        <h2>{title}</h2>
        {action}
      </div>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
}) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
      {sub && <small>{sub}</small>}
    </div>
  );
}
function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="field">
      {label}
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
    </label>
  );
}
function Chart({ points }: { points: { step: number; loss: number }[] }) {
  if (!points.length) return <Empty>첫 학습 스텝을 기다리고 있습니다.</Empty>;
  const min = Math.min(...points.map((p) => p.loss)) * 0.9,
    max = Math.max(...points.map((p) => p.loss)) * 1.1;
  const xy = points.map(
    (p, i) =>
      `${40 + (i / (points.length - 1 || 1)) * 640},${160 - ((p.loss - min) / (max - min || 1)) * 130}`,
  );
  return (
    <svg
      role="img"
      aria-label="학습 손실 곡선"
      viewBox="0 0 720 200"
      className="chart"
    >
      <line x1="40" y1="170" x2="700" y2="170" stroke="#dce3ec" />
      <line x1="40" y1="20" x2="40" y2="170" stroke="#dce3ec" />
      <text x="5" y="25">
        {max.toFixed(2)}
      </text>
      <text x="5" y="165">
        {min.toFixed(2)}
      </text>
      <polyline
        points={xy.join(" ")}
        fill="none"
        stroke="#3478ee"
        strokeWidth="3"
      />
      {points.map((p, i) => (
        <circle
          key={i}
          cx={xy[i].split(",")[0]}
          cy={xy[i].split(",")[1]}
          r="3"
          fill="#3478ee"
        />
      ))}
      <text x="40" y="193">
        step 1
      </text>
      <text x="630" y="193">
        step {points.at(-1)?.step}
      </text>
    </svg>
  );
}

export default function Dashboard({ path }: { path: string[] }) {
  const router = useRouter();
  const section = path[0] || "workspaces";
  const detail = path[1];
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]),
    [datasets, setDatasets] = useState<Dataset[]>([]),
    [models, setModels] = useState<Model[]>([]),
    [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [search, setSearch] = useState(""),
    [datasetId, setDatasetId] = useState(""),
    [modelId, setModelId] = useState("qwen35_2b"),
    [split, setSplit] = useState(""),
    [offset, setOffset] = useState(0);
  const [samples, setSamples] = useState<{ total: number; items: Sample[] }>({
      total: 0,
      items: [],
    }),
    [samplesLoading, setSamplesLoading] = useState(false),
    [sample, setSample] = useState<Sample | null>(null);
  const [newWorkspace, setNewWorkspace] = useState(false),
    [name, setName] = useState(""),
    [description, setDescription] = useState("");
  const [editWorkspaceId, setEditWorkspaceId] = useState("");
  const [budget, setBudget] = useState(200),
    [method, setMethod] = useState("source_balanced"),
    [seed, setSeed] = useState(42),
    [parentIds, setParentIds] = useState<string[]>([]),
    [workspaceId, setWorkspaceId] = useState(""),
    [preview, setPreview] = useState<Dataset | null>(null);
  const [steps, setSteps] = useState(20),
    [lr, setLr] = useState(0.00002),
    [limit, setLimit] = useState(8),
    [evalSplit, setEvalSplit] = useState("validation"),
    [reference, setReference] = useState(""),
    [threshold, setThreshold] = useState(0.1),
    [selectedRun, setSelectedRun] = useState(""),
    [logs, setLogs] = useState("");
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setNewWorkspace(false);
      }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, []);
  const refresh = useCallback(async () => {
    const [w, d, m, j] = await Promise.all([
      api<Workspace[]>("/workspaces"),
      api<Dataset[]>("/datasets"),
      api<Model[]>("/models"),
      api<Run[]>("/jobs"),
    ]);
    setWorkspaces(w);
    setDatasets(d);
    setModels(m);
    setRuns(j);
    setLoading(false);
  }, []);
  useEffect(() => {
    let alive = true;
    const go = () =>
      refresh().catch((e) => {
        if (alive) {
          setError(e.message);
          setLoading(false);
        }
      });
    go();
    const timer = setInterval(go, 4000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [refresh]);
  useEffect(() => {
    if ((section === "training" || section === "evaluation") && detail)
      setModelId(detail);
  }, [section, detail]);
  useEffect(() => {
    setSearch("");
    setOffset(0);
    setSample(null);
    setSelectedRun("");
    setPreview(null);
  }, [section, detail]);
  const workspace = workspaces.find((w) => w.id === detail);
  const workspaceDatasets = datasets.filter((d) => d.workspace_id === detail);
  const currentDataset =
    (section === "workspaces" && detail ? workspaceDatasets : datasets).find(
      (d) => d.id === datasetId,
    ) || (section === "workspaces" && detail ? workspaceDatasets : datasets)[0];
  useEffect(() => {
    if (section !== "workspaces" || !detail || !currentDataset) return;
    let alive = true;
    setSamplesLoading(true);
    api<{ total: number; items: Sample[] }>(
      `/datasets/${currentDataset.id}/samples?limit=24&offset=${offset}&q=${encodeURIComponent(search)}${split ? "&split=" + split : ""}`,
    )
      .then((v) => {
        if (alive) setSamples(v);
      })
      .catch((e) => setError(e.message))
      .finally(() => {
        if (alive) setSamplesLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [section, detail, currentDataset?.id, offset, search, split]);
  async function act(fn: () => Promise<unknown>, message = "저장했습니다.") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      await refresh();
      setNotice(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  const route = section === "monitoring" ? `monitoring/${detail}` : section;
  const nav = [
    {
      group: "데이터",
      items: [
        ["workspaces", "워크스페이스", Database],
        ["reconstruction", "데이터 재구성", Layers],
      ],
    },
    {
      group: "모델",
      items: [
        ["models", "목록 및 관리", Boxes],
        ["training", "학습", FlaskConical],
        ["evaluation", "모델 평가", CircleCheck],
      ],
    },
    {
      group: "모니터링",
      items: [
        ["monitoring/training", "학습 진행 상태", Activity],
        ["monitoring/drift", "드리프트 탐지", Radar],
      ],
    },
  ] as const;
  const title =
    section === "workspaces"
      ? detail
        ? workspace?.name || "워크스페이스"
        : "워크스페이스"
      : section === "models"
        ? detail
          ? "모델 상세"
          : "모델 목록 및 관리"
        : section === "reconstruction"
          ? "데이터 재구성"
          : section === "training"
            ? "모델 학습"
            : section === "evaluation"
              ? "모델 평가"
              : detail === "drift"
                ? "드리프트 탐지"
                : "학습 진행 상태";
  const subtitle =
    section === "workspaces"
      ? "레이블이 있는 데이터로 속성추출 작업을 시작하세요."
      : section === "reconstruction"
        ? "원본 분할을 유지하며 학습 데이터셋을 새 버전으로 구성합니다."
        : section === "training"
          ? "데이터셋 버전을 선택하고 Qwen 모델의 LoRA 학습을 실행합니다."
          : section === "evaluation"
            ? "검증·테스트 데이터에서 실제 생성 결과와 속성별 일치도를 확인합니다."
            : section === "models"
              ? "기본 모델과 학습된 모델의 버전, 데이터 출처를 관리합니다."
              : "실행 상태와 실제 계산 결과를 확인합니다.";
  const usableModels = models.filter(
    (m) =>
      m.status === "ready" &&
      m.available &&
      (m.kind === "base" ||
        (m.schema_id || "visual-v1") ===
          (currentDataset?.schema_id || "visual-v1")),
  );
  const selectedModel =
    usableModels.find((m) => m.id === modelId) ||
    (!detail ? usableModels[0] : undefined);
  const modelOptions = models
    .filter(
      (m) =>
        m.status === "ready" &&
        (m.kind === "base" ||
          (m.schema_id || "visual-v1") ===
            (currentDataset?.schema_id || "visual-v1")),
    )
    .map((m) => (
      <option key={m.id} value={m.id} disabled={!m.available}>
        {m.name}
        {!m.available ? " (파일 없음)" : ""}
      </option>
    ));
  const datasetOptions = datasets.map((d) => (
    <option key={d.id} value={d.id}>
      {d.name} · {num(d.count)}개 ·{" "}
      {d.schema_id && d.schema_id !== "visual-v1" ? "비케이브" : "기존 기준"}
    </option>
  ));
  const runKind =
    section === "evaluation"
      ? "evaluation"
      : section === "monitoring" && detail === "drift"
        ? "drift"
        : "training";
  const visibleRuns = runs.filter(
    (r) =>
      r.request.kind === runKind ||
      (runKind === "training" && r.request.kind === "labeling"),
  );
  const activeRun =
    visibleRuns.find((r) => r.id === selectedRun) || visibleRuns[0];
  useEffect(() => {
    if (!activeRun) return;
    let alive = true;
    api<{ text: string }>(`/jobs/${activeRun.id}/logs`)
      .then((v) => {
        if (alive) setLogs(v.text);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [activeRun?.id, activeRun?.progress?.step, activeRun?.status]);
  useEffect(() => {
    const originals = datasets.filter((d) => d.kind === "import");
    const relabeled = originals.map((original) =>
      datasets.find(
        (d) =>
          d.kind === "ai_relabel" &&
          d.workspace_id === original.workspace_id &&
          d.count === original.count,
      ),
    );
    if (datasets.length)
      setParentIds((ids) =>
        ids.length
          ? ids
          : originals.length > 0 && relabeled.every(Boolean)
            ? relabeled.map((d) => d!.id)
            : datasets
                .filter(
                  (d) =>
                    d.schema_id &&
                    d.kind === "taxonomy_migration" &&
                    d.parent_ids.some(
                      (id) =>
                        datasets.find((p) => p.id === id)?.kind === "import",
                    ),
                )
                .map((d) => d.id)
                .concat(
                  datasets.some(
                    (d) => !!d.schema_id && d.schema_id !== "visual-v1",
                  )
                    ? []
                    : datasets
                        .filter((d) => d.kind === "import")
                        .map((d) => d.id),
                ),
      );
  }, [datasets.length]);
  const bodyRecon = () => ({
    workspace_id: workspaceId || workspaces[0]?.id,
    name: name || "속성추출 재구성 v1",
    dataset_ids: parentIds,
    train_budget: budget,
    method,
    seed,
  });
  async function submit(kind: string) {
    await act(async () => {
      if (kind !== "drift" && !selectedModel)
        throw new Error("사용 가능한 모델을 선택하세요.");
      const j = await api<Run>("/jobs", {
        kind,
        dataset_id: currentDataset?.id,
        model_id: kind === "drift" ? undefined : selectedModel?.id,
        reference_id:
          kind === "drift"
            ? reference || datasets.find((d) => d.id !== currentDataset?.id)?.id
            : undefined,
        max_steps: steps,
        learning_rate: lr,
        sample_limit: limit,
        split: evalSplit,
        threshold,
        seed,
      });
      setSelectedRun(j.id);
      if (kind === "training") router.push("/ko/monitoring/training");
    }, "작업을 등록했습니다. 실행 상태가 자동으로 갱신됩니다.");
  }
  function runList() {
    return (
      <Panel
        title="실행 이력"
        action={<span className="muted">{visibleRuns.length}개</span>}
      >
        {!visibleRuns.length ? (
          <Empty>아직 실행한 작업이 없습니다.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>작업</th>
                  <th>데이터셋</th>
                  <th>생성 시각 (KST)</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {visibleRuns.map((j) => (
                  <tr
                    key={j.id}
                    className={activeRun?.id === j.id ? "selected" : ""}
                  >
                    <td>
                      <button
                        className="text-button"
                        onClick={() => setSelectedRun(j.id)}
                      >
                        {j.request.kind === "labeling" ? "AI 레이블 · " : ""}
                        {j.id.slice(0, 8)}
                      </button>
                    </td>
                    <td>
                      {datasets.find((d) => d.id === j.request.dataset_id)
                        ?.name || j.request.dataset_id}
                    </td>
                    <td>{date(j.created_at)}</td>
                    <td>
                      <Badge status={j.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    );
  }
  function runHeader() {
    return (
      activeRun && (
        <div className="run-head">
          <div>
            <strong>실행 {activeRun.id.slice(0, 8)}</strong>{" "}
            <Badge status={activeRun.status} />
            <p className="muted">
              {activeRun.request.kind === "labeling"
                ? "Gemma-4-12B · AI 재레이블링"
                : models.find((m) => m.id === activeRun.request.model_id)
                    ?.name}{" "}
              · {date(activeRun.created_at)}
            </p>
          </div>
          {["queued", "running"].includes(activeRun.status) && (
            <button
              className="button secondary"
              disabled={busy}
              onClick={() =>
                act(
                  () => api(`/jobs/${activeRun.id}/cancel`, {}),
                  "취소 요청을 보냈습니다.",
                )
              }
            >
              실행 취소
            </button>
          )}
        </div>
      )
    );
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/ko/workspaces" className="brand">
          <span className="brand-symbol">
            <Layers size={22} />
          </span>
          DataDrift
        </Link>
        <nav>
          {nav.map((group) => (
            <div className="nav-group" key={group.group}>
              <div className="nav-label">{group.group}</div>
              {group.items.map(([url, label, Icon]) => (
                <Link
                  className={`nav-item ${route === url ? "active" : ""}`}
                  key={url}
                  href={"/ko/" + url}
                >
                  <Icon size={18} />
                  {label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="live-dot" /> 속성추출 전용<span>v0.2</span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span>프로젝트</span>
          <ChevronRight size={14} />
          <strong>데이터 드리프트</strong>
          <div className="top-right">
            <span className="live-dot" />{" "}
            {error ? "연결 확인 필요" : "서비스 연결됨"}
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                DATA DRIFT / {section.toUpperCase()}
              </div>
              <h1>{title}</h1>
              <p>{subtitle}</p>
            </div>
            <button
              className="button secondary"
              aria-label="새로고침"
              onClick={() => act(refresh, "새로고침했습니다.")}
              disabled={busy}
            >
              <RefreshCw size={16} />
              새로고침
            </button>
          </div>
          {error && (
            <div role="alert" className="alert error">
              {error}
              <button onClick={() => setError("")} aria-label="오류 닫기">
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div role="status" className="alert success">
              {notice}
              <button onClick={() => setNotice("")} aria-label="알림 닫기">
                <X size={16} />
              </button>
            </div>
          )}
          {loading ? (
            <div className="loading">데이터를 불러오는 중입니다…</div>
          ) : (
            <>
              {section === "workspaces" && !detail && (
                <>
                  <div className="stats">
                    <Stat label="워크스페이스" value={workspaces.length} />
                    <Stat
                      label="원본 레이블 데이터"
                      value={num(
                        datasets
                          .filter((d) => d.kind === "import")
                          .reduce((n, d) => n + d.count, 0),
                      )}
                      sub="중복 재구성 버전 제외"
                    />
                    <Stat label="데이터셋 버전" value={datasets.length} />
                    <Stat
                      label="작업 유형"
                      value="속성추출"
                      sub="AI 레이블 출처 보존"
                    />
                  </div>
                  <div className="toolbar">
                    <div className="search">
                      <Search size={17} />
                      <input
                        placeholder="워크스페이스 검색"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                    <div className="actions">
                      <button
                        className="button secondary"
                        disabled={busy}
                        onClick={() =>
                          act(
                            () => api("/imports/labeled", {}),
                            "레이블 데이터 가져오기를 완료했습니다.",
                          )
                        }
                      >
                        레이블 데이터 가져오기
                      </button>
                      <button
                        className="button"
                        onClick={() => {
                          setEditWorkspaceId("");
                          setName("");
                          setDescription("");
                          setNewWorkspace(true);
                        }}
                      >
                        <Plus size={17} />
                        워크스페이스 만들기
                      </button>
                    </div>
                  </div>
                  <div className="workspace-grid">
                    {workspaces
                      .filter((w) => w.name.includes(search))
                      .map((w) => (
                        <Link
                          href={"/ko/workspaces/" + w.id}
                          key={w.id}
                          className="workspace-card"
                        >
                          <div className="card-top">
                            <div className="folder-icon">
                              <Database size={24} />
                            </div>
                            <ArrowUpRight size={18} />
                          </div>
                          <h2>{w.name}</h2>
                          <p>{w.description || "속성추출 데이터 작업 공간"}</p>
                          <Badge>속성추출</Badge>
                          <div className="card-bottom">
                            <span>
                              데이터셋 <strong>{w.datasets.length}</strong>
                            </span>
                            <span>
                              원본{" "}
                              <strong>
                                {num(
                                  w.datasets
                                    .filter((d) => d.kind === "import")
                                    .reduce((n, d) => n + d.count, 0),
                                )}
                              </strong>
                              개
                            </span>
                          </div>
                        </Link>
                      ))}
                  </div>
                  {!workspaces.length && (
                    <Empty>
                      워크스페이스를 만들거나 레이블 데이터를 가져오세요.
                    </Empty>
                  )}
                </>
              )}
              {section === "workspaces" && detail && (
                <>
                  <Link className="back" href="/ko/workspaces">
                    <ArrowLeft size={16} />
                    전체 워크스페이스
                  </Link>
                  {workspace && (
                    <button
                      className="button secondary"
                      style={{ marginLeft: 16 }}
                      onClick={() => {
                        setEditWorkspaceId(workspace.id);
                        setName(workspace.name);
                        setDescription(workspace.description);
                        setNewWorkspace(true);
                      }}
                    >
                      워크스페이스 수정
                    </button>
                  )}
                  {!workspace ? (
                    <Empty>워크스페이스를 찾을 수 없습니다.</Empty>
                  ) : (
                    <>
                      <div className="stats">
                        <Stat
                          label="전체 데이터"
                          value={num(currentDataset?.count)}
                        />
                        <Stat
                          label="학습"
                          value={num(currentDataset?.splits.train)}
                        />
                        <Stat
                          label="검증"
                          value={num(currentDataset?.splits.validation)}
                        />
                        <Stat
                          label="테스트"
                          value={num(currentDataset?.splits.test)}
                        />
                      </div>
                      <div className="toolbar">
                        <select
                          aria-label="데이터셋 버전"
                          value={currentDataset?.id || ""}
                          onChange={(e) => {
                            setDatasetId(e.target.value);
                            setOffset(0);
                          }}
                        >
                          {workspaceDatasets.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                        <div className="actions">
                          <button
                            className="button secondary"
                            disabled={
                              busy ||
                              !currentDataset?.schema_id?.startsWith(
                                "bkave-",
                              ) ||
                              runs.some(
                                (r) =>
                                  r.request.kind === "labeling" &&
                                  r.request.dataset_id === currentDataset?.id &&
                                  ["queued", "running"].includes(r.status),
                              )
                            }
                            onClick={() =>
                              act(async () => {
                                const job = await api<Run>("/jobs", {
                                  kind: "labeling",
                                  dataset_id: currentDataset!.id,
                                });
                                setSelectedRun(job.id);
                                router.push("/ko/monitoring/training");
                              }, "AI 재레이블링을 접수했습니다. 원본은 유지됩니다.")
                            }
                          >
                            AI 재레이블링
                          </button>
                          <button
                            className="button"
                            disabled={
                              samplesLoading ||
                              !currentDataset ||
                              !samples.items.length
                            }
                            onClick={() => setSample(samples.items[0])}
                          >
                            레이블 검토
                          </button>
                          <Link
                            className="button secondary"
                            href="/ko/reconstruction"
                          >
                            <Layers size={16} />
                            재구성
                          </Link>
                          {currentDataset && (
                            <a
                              className="button secondary"
                              href={`/api/datasets/${currentDataset.id}/export`}
                            >
                              <Download size={16} />
                              레이블 내보내기
                            </a>
                          )}
                        </div>
                      </div>
                      {currentDataset ? (
                        <>
                          <div className="tabs">
                            <button
                              className={!split ? "chosen" : ""}
                              onClick={() => {
                                setSplit("");
                                setOffset(0);
                              }}
                            >
                              전체
                            </button>
                            {[
                              ["train", "학습"],
                              ["validation", "검증"],
                              ["test", "테스트"],
                            ].map(([v, l]) => (
                              <button
                                key={v}
                                className={split === v ? "chosen" : ""}
                                onClick={() => {
                                  setSplit(v);
                                  setOffset(0);
                                }}
                              >
                                {l}
                              </button>
                            ))}
                            <span className="muted">
                              {currentDataset.provenance} · 원본 분할 유지
                            </span>
                          </div>
                          <div className="toolbar">
                            <div className="search">
                              <Search size={17} />
                              <input
                                placeholder="상품 ID 또는 속성 검색"
                                value={search}
                                onChange={(e) => {
                                  setSearch(e.target.value);
                                  setOffset(0);
                                }}
                              />
                            </div>
                            <span className="muted">
                              {num(samples.total)}개 검색됨
                            </span>
                          </div>
                          {samplesLoading ? (
                            <div className="loading">
                              이미지 목록을 불러오는 중입니다…
                            </div>
                          ) : (
                            <div className="sample-grid">
                              {samples.items.map((r) => (
                                <button
                                  className="sample-card"
                                  key={r.id}
                                  onClick={() => setSample(r)}
                                >
                                  <img
                                    src={`/api/datasets/${currentDataset.id}/images/${r.id}`}
                                    alt={r.product_id}
                                    loading="lazy"
                                  />
                                  <div>
                                    <strong>{r.product_id}</strong>
                                    <p>
                                      {String(r.target.pattern)} ·{" "}
                                      {String(r.target.fit)}
                                    </p>
                                    <Badge>{r.split}</Badge>{" "}
                                    <Badge>
                                      {r.human_verified
                                        ? "사람 검증"
                                        : r.label_history?.some(
                                              (h) =>
                                                h.channel ===
                                                "manual_web_or_api",
                                            )
                                          ? "수동 수정"
                                          : "AI 레이블"}
                                    </Badge>
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                          {!samplesLoading && !samples.total && (
                            <Empty>검색 조건에 맞는 데이터가 없습니다.</Empty>
                          )}
                          <div className="pagination">
                            <button
                              className="button secondary"
                              disabled={offset === 0}
                              onClick={() =>
                                setOffset(Math.max(0, offset - 24))
                              }
                            >
                              이전
                            </button>
                            <span>
                              {Math.floor(offset / 24) + 1} /{" "}
                              {Math.max(1, Math.ceil(samples.total / 24))}
                            </span>
                            <button
                              className="button secondary"
                              disabled={offset + 24 >= samples.total}
                              onClick={() => setOffset(offset + 24)}
                            >
                              다음
                            </button>
                          </div>
                        </>
                      ) : (
                        <Empty>
                          이 워크스페이스에 데이터셋이 없습니다. 재구성 결과를
                          이곳에 저장할 수 있습니다.
                        </Empty>
                      )}
                    </>
                  )}
                </>
              )}
              {section === "reconstruction" && (
                <div className="two-col">
                  <Panel title="재구성 설정">
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        act(async () => {
                          const d = await api<Dataset>(
                            "/reconstructions",
                            bodyRecon(),
                          );
                          setPreview(d);
                        }, "새 데이터셋 버전을 저장했습니다.");
                      }}
                    >
                      <Select
                        label="저장할 워크스페이스"
                        value={workspaceId || workspaces[0]?.id || ""}
                        onChange={setWorkspaceId}
                      >
                        {workspaces.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name}
                          </option>
                        ))}
                      </Select>
                      <label className="field">
                        버전 이름
                        <Input
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="속성추출 재구성 v1"
                        />
                      </label>
                      <fieldset>
                        <legend>원본 데이터셋</legend>
                        {datasets.map((d) => (
                          <label className="check-row" key={d.id}>
                            <input
                              type="checkbox"
                              checked={parentIds.includes(d.id)}
                              onChange={(e) => {
                                const ids = parentIds;
                                setParentIds(
                                  e.target.checked
                                    ? [...ids, d.id]
                                    : ids.filter((id) => id !== d.id),
                                );
                                setPreview(null);
                              }}
                            />
                            {d.name}
                            <small>학습 {num(d.splits.train)}</small>
                          </label>
                        ))}
                      </fieldset>
                      <Select
                        label="선별 방식"
                        value={method}
                        onChange={(v) => {
                          setMethod(v);
                          setPreview(null);
                        }}
                      >
                        <option value="source_balanced">출처 균형 선별</option>
                        <option value="random">무작위 선별</option>
                      </Select>
                      <div className="form-grid">
                        <label className="field">
                          학습 데이터 수
                          <input
                            type="number"
                            min="1"
                            max="100000"
                            value={budget}
                            onChange={(e) => {
                              setBudget(+e.target.value);
                              setPreview(null);
                            }}
                          />
                        </label>
                        <label className="field">
                          시드
                          <input
                            type="number"
                            min="0"
                            value={seed}
                            onChange={(e) => {
                              setSeed(+e.target.value);
                              setPreview(null);
                            }}
                          />
                        </label>
                      </div>
                      <div className="actions">
                        <button
                          type="button"
                          className="button secondary"
                          disabled={busy || !datasets.length}
                          onClick={() =>
                            act(
                              async () =>
                                setPreview(
                                  await api<Dataset>(
                                    "/reconstructions/preview",
                                    bodyRecon(),
                                  ),
                                ),
                              "미리보기를 계산했습니다.",
                            )
                          }
                        >
                          미리보기
                        </button>
                        <button
                          className="button"
                          disabled={busy || !datasets.length}
                        >
                          새 버전 저장
                        </button>
                      </div>
                    </form>
                  </Panel>
                  <Panel title="재구성 미리보기">
                    <div className="callout">
                      검증·테스트 데이터는 원본 그대로 유지됩니다. 학습 데이터만
                      지정한 수만큼 선별합니다.
                    </div>
                    {preview ? (
                      <>
                        <div className="stats compact">
                          <Stat label="학습" value={preview.splits.train} />
                          <Stat
                            label="검증"
                            value={preview.splits.validation}
                          />
                          <Stat label="테스트" value={preview.splits.test} />
                        </div>
                        <p>{preview.name}</p>
                        <p className="muted">
                          전체 {num(preview.count)}개 · 원본 버전{" "}
                          {preview.parent_ids.length}개
                        </p>
                        <code className="hash">{preview.fingerprint}</code>
                      </>
                    ) : (
                      <Empty>설정을 선택하고 미리보기를 실행하세요.</Empty>
                    )}
                  </Panel>
                </div>
              )}
              {section === "models" && !detail && (
                <>
                  <div className="stats">
                    <Stat label="전체 모델" value={models.length} />
                    <Stat
                      label="기본 모델"
                      value={models.filter((m) => m.kind === "base").length}
                    />
                    <Stat
                      label="학습된 모델"
                      value={models.filter((m) => m.kind === "lora").length}
                    />
                    <Stat label="사용 가능" value={usableModels.length} />
                  </div>
                  <div className="toolbar">
                    <div className="search">
                      <Search size={17} />
                      <input
                        placeholder="모델 이름 검색"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                    <Link className="button" href="/ko/training">
                      <Plus size={17} />
                      모델 학습
                    </Link>
                  </div>
                  <Panel title="모델 레지스트리">
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>모델</th>
                            <th>유형</th>
                            <th>작업</th>
                            <th>상태</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {models
                            .filter((m) =>
                              m.name
                                .toLowerCase()
                                .includes(search.toLowerCase()),
                            )
                            .map((m) => (
                              <tr key={m.id}>
                                <td>
                                  <Link
                                    className="text-button"
                                    href={"/ko/models/" + m.id}
                                  >
                                    {m.name}
                                  </Link>
                                  <small className="block muted">
                                    {m.family}
                                  </small>
                                </td>
                                <td>
                                  {m.kind === "base"
                                    ? "기본 모델"
                                    : "LoRA 어댑터"}
                                </td>
                                <td>
                                  <Badge>속성추출</Badge>
                                </td>
                                <td>
                                  <Badge status={m.status} />
                                </td>
                                <td>
                                  <Link href={"/ko/models/" + m.id}>
                                    <ChevronRight size={18} />
                                  </Link>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </Panel>
                </>
              )}
              {section === "models" &&
                detail &&
                (() => {
                  const m = models.find((x) => x.id === detail);
                  if (!m) return <Empty>모델을 찾을 수 없습니다.</Empty>;
                  return (
                    <>
                      <Link className="back" href="/ko/models">
                        <ArrowLeft size={16} />
                        모델 목록
                      </Link>
                      <div className="two-col">
                        <Panel title={m.name}>
                          <div className="details">
                            <span>모델 계열</span>
                            <strong>{m.family}</strong>
                            <span>유형</span>
                            <strong>
                              {m.kind === "base" ? "기본 모델" : "LoRA 어댑터"}
                            </strong>
                            <span>작업</span>
                            <strong>속성추출</strong>
                            <span>상태</span>
                            <Badge status={m.status} />
                            <span>데이터셋</span>
                            <strong>
                              {datasets.find((d) => d.id === m.dataset_id)
                                ?.name || "사전학습 모델"}
                            </strong>
                            <span>원본 모델</span>
                            <strong>
                              {models.find((x) => x.id === m.parent_id)?.name ||
                                "—"}
                            </strong>
                            <span>학습 작업</span>
                            <strong>
                              {m.training_job_id?.slice(0, 8) || "—"}
                            </strong>
                          </div>
                          <div className="actions">
                            <Link
                              className="button"
                              href={"/ko/training/" + m.id}
                            >
                              이 모델로 학습
                            </Link>
                            <Link
                              className="button secondary"
                              href={"/ko/evaluation/" + m.id}
                            >
                              평가
                            </Link>
                          </div>
                        </Panel>
                        <Panel title="모델 관리">
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              act(() =>
                                api(
                                  "/models/" + m.id,
                                  { name: name || m.name, status: m.status },
                                  "PATCH",
                                ),
                              );
                            }}
                          >
                            <label className="field">
                              모델 이름
                              <Input
                                placeholder={m.name}
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                maxLength={100}
                              />
                            </label>
                            <button className="button" disabled={busy}>
                              이름 저장
                            </button>
                          </form>
                          <hr />
                          <p className="muted">
                            보관한 모델은 새 학습·평가의 선택 목록에서
                            제외됩니다. 기존 결과는 보존됩니다.
                          </p>
                          <button
                            className="button secondary"
                            disabled={busy}
                            onClick={() =>
                              act(() =>
                                api(
                                  "/models/" + m.id,
                                  {
                                    name: m.name,
                                    status:
                                      m.status === "archived"
                                        ? "ready"
                                        : "archived",
                                  },
                                  "PATCH",
                                ),
                              )
                            }
                          >
                            {m.status === "archived"
                              ? "사용 상태로 복원"
                              : "모델 보관"}
                          </button>
                        </Panel>
                      </div>
                    </>
                  );
                })()}
              {section === "training" && (
                <div className="two-col">
                  <Panel title="학습 설정">
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        submit("training");
                      }}
                    >
                      <Select
                        label="시작 모델"
                        value={selectedModel?.id || ""}
                        onChange={setModelId}
                      >
                        {!selectedModel && (
                          <option value="" disabled>
                            사용 가능한 모델을 선택하세요
                          </option>
                        )}
                        {modelOptions}
                      </Select>
                      <Select
                        label="학습 데이터셋"
                        value={currentDataset?.id || ""}
                        onChange={setDatasetId}
                      >
                        {datasetOptions}
                      </Select>
                      <div className="callout">
                        학습 분할 {num(currentDataset?.splits.train)}개만
                        사용합니다. 검증·테스트 데이터는 학습에 포함하지
                        않습니다.
                      </div>
                      <div className="form-grid">
                        <label className="field">
                          학습 스텝
                          <input
                            type="number"
                            min="1"
                            max="10000"
                            value={steps}
                            onChange={(e) => setSteps(+e.target.value)}
                          />
                        </label>
                        <label className="field">
                          학습률
                          <input
                            type="number"
                            min="0.000001"
                            max="0.01"
                            step="0.000001"
                            value={lr}
                            onChange={(e) => setLr(+e.target.value)}
                          />
                        </label>
                      </div>
                      <label className="field">
                        재현성 시드
                        <input
                          type="number"
                          min="0"
                          value={seed}
                          onChange={(e) => setSeed(+e.target.value)}
                        />
                      </label>
                      <button
                        className="button"
                        disabled={busy || !currentDataset || !selectedModel}
                      >
                        학습 시작
                      </button>
                    </form>
                  </Panel>
                  <Panel title="실행 요약">
                    <div className="details">
                      <span>학습 방식</span>
                      <strong>SFT + LoRA</strong>
                      <span>LoRA rank / alpha</span>
                      <strong>8 / 8</strong>
                      <span>배치 크기</span>
                      <strong>1</strong>
                      <span>실행 스텝</span>
                      <strong>{steps}</strong>
                      <span>정밀도</span>
                      <strong>BF16</strong>
                      <span>모델 생성</span>
                      <strong>완료 시 새 버전 등록</strong>
                    </div>
                    <div className="callout">
                      소규모 연결 검증은 1~2스텝으로 시작하세요. 학습 스텝 수는
                      전체 데이터 1회 학습과 다릅니다.
                    </div>
                    <p className="muted">
                      동시에 등록한 GPU 작업은 순서대로 실행됩니다. 진행
                      상태에서 손실값과 로그를 확인하고 취소할 수 있습니다.
                    </p>
                  </Panel>
                </div>
              )}
              {section === "evaluation" && (
                <>
                  <Panel title="평가 실행">
                    <form
                      className="horizontal-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        submit("evaluation");
                      }}
                    >
                      <Select
                        label="모델"
                        value={selectedModel?.id || ""}
                        onChange={setModelId}
                      >
                        {!selectedModel && (
                          <option value="" disabled>
                            사용 가능한 모델을 선택하세요
                          </option>
                        )}
                        {modelOptions}
                      </Select>
                      <Select
                        label="데이터셋"
                        value={currentDataset?.id || ""}
                        onChange={setDatasetId}
                      >
                        {datasetOptions}
                      </Select>
                      <Select
                        label="평가 분할"
                        value={evalSplit}
                        onChange={setEvalSplit}
                      >
                        <option value="validation">검증</option>
                        <option value="test">테스트</option>
                      </Select>
                      <label className="field">
                        최대 샘플 수
                        <input
                          type="number"
                          min="1"
                          max="10000"
                          value={limit}
                          onChange={(e) => setLimit(+e.target.value)}
                        />
                      </label>
                      <button
                        className="button"
                        disabled={busy || !currentDataset || !selectedModel}
                      >
                        평가 시작
                      </button>
                    </form>
                  </Panel>
                  {runHeader()}
                  {activeRun?.result?.count ? (
                    <>
                      <div className="stats">
                        <Stat
                          label="평가 샘플"
                          value={activeRun.result.count}
                        />
                        <Stat
                          label="속성 평균 일치도"
                          value={pct(activeRun.result.macro_attribute_accuracy)}
                        />
                        <Stat
                          label="전체 속성 일치"
                          value={pct(activeRun.result.exact_match)}
                        />
                        <Stat
                          label="출력 형식 오류"
                          value={activeRun.result.schema_failures}
                          sub={`JSON 파싱 실패 ${activeRun.result.parse_failures ?? 0}개 포함`}
                        />
                      </div>
                      <div className="callout">{activeRun.result.note}</div>
                      <Panel title="속성별 평가">
                        {Object.entries(activeRun.result.fields || {}).map(
                          ([key, value]) => (
                            <div className="metric-row" key={key}>
                              <span>{names[key] || key}</span>
                              <div className="bar">
                                <i style={{ width: pct(value.accuracy) }} />
                              </div>
                              <strong>{pct(value.accuracy)}</strong>
                              <small>{value.count}개</small>
                            </div>
                          ),
                        )}
                      </Panel>
                      <Panel title="실제 생성 결과">
                        {activeRun.result.predictions?.map((p) => (
                          <details key={p.sample_id}>
                            <summary>
                              {p.sample_id}{" "}
                              <Badge>
                                {p.prediction
                                  ? p.schema_valid
                                    ? "형식 정상"
                                    : "형식 오류"
                                  : "파싱 실패"}
                              </Badge>
                            </summary>
                            <div className="prediction">
                              <div>
                                <h3>레이블</h3>
                                <pre>{JSON.stringify(p.target, null, 2)}</pre>
                              </div>
                              <div>
                                <h3>모델 응답</h3>
                                <pre>{p.raw}</pre>
                              </div>
                            </div>
                          </details>
                        ))}
                      </Panel>
                    </>
                  ) : (
                    activeRun && (
                      <Panel title="평가 상태">
                        <p>{activeRun.error || states[activeRun.status]}</p>
                        <progress
                          value={activeRun.progress.step || 0}
                          max={activeRun.progress.total || 1}
                        />
                        <p className="muted">
                          {activeRun.progress.step || 0} /{" "}
                          {activeRun.progress.total || "—"}개
                        </p>
                      </Panel>
                    )
                  )}
                  {runList()}
                </>
              )}
              {section === "monitoring" && detail === "training" && (
                <>
                  <div className="stats">
                    <Stat
                      label="진행 중"
                      value={
                        visibleRuns.filter((j) => j.status === "running").length
                      }
                    />
                    <Stat
                      label="대기 중"
                      value={
                        visibleRuns.filter((j) => j.status === "queued").length
                      }
                    />
                    <Stat
                      label="완료"
                      value={
                        visibleRuns.filter((j) => j.status === "succeeded")
                          .length
                      }
                    />
                    <Stat
                      label="실패 / 취소"
                      value={
                        visibleRuns.filter((j) =>
                          ["failed", "cancelled"].includes(j.status),
                        ).length
                      }
                    />
                  </div>
                  {runHeader()}
                  {activeRun && (
                    <>
                      <div className="two-col">
                        <Panel
                          title={
                            activeRun.request.kind === "labeling"
                              ? "AI 레이블링 진행"
                              : "학습 진행"
                          }
                        >
                          <progress
                            value={activeRun.progress.step || 0}
                            max={
                              activeRun.progress.total ||
                              activeRun.request.max_steps
                            }
                          />
                          <p>
                            {activeRun.progress.step || 0} /{" "}
                            {activeRun.progress.total ||
                              activeRun.request.max_steps}{" "}
                            {activeRun.request.kind === "labeling"
                              ? "이미지"
                              : "스텝"}
                          </p>
                          <div className="details">
                            <span>현재 손실</span>
                            <strong>
                              {activeRun.progress.loss?.toFixed(4) || "—"}
                            </strong>
                            <span>경과 시간</span>
                            <strong>
                              {num(activeRun.progress.elapsed_seconds)}초
                            </strong>
                            <span>실행 단계</span>
                            <strong>
                              {activeRun.progress.phase || "queued"}
                            </strong>
                          </div>
                          {activeRun.error && (
                            <p className="error-text">{activeRun.error}</p>
                          )}
                          {activeRun.result?.model_id && (
                            <Link
                              className="button"
                              href={"/ko/models/" + activeRun.result.model_id}
                            >
                              완료된 모델 보기
                              <ArrowUpRight size={16} />
                            </Link>
                          )}
                          {activeRun.result?.dataset_id && (
                            <Link
                              className="button"
                              href={
                                "/ko/workspaces/" +
                                datasets.find(
                                  (d) => d.id === activeRun.result?.dataset_id,
                                )?.workspace_id
                              }
                            >
                              재레이블링 결과 보기
                            </Link>
                          )}
                        </Panel>
                        <Panel title="학습 손실">
                          <Chart points={activeRun.progress.history || []} />
                        </Panel>
                      </div>
                      <Panel title="실행 로그">
                        <pre className="logs">
                          {logs || "아직 기록된 로그가 없습니다."}
                        </pre>
                      </Panel>
                    </>
                  )}
                  {runList()}
                </>
              )}
              {section === "monitoring" && detail === "drift" && (
                <>
                  <RelabelReport />
                  <Panel title="분포 비교 실행">
                    <form
                      className="horizontal-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        submit("drift");
                      }}
                    >
                      <Select
                        label="기준 데이터셋"
                        value={
                          reference ||
                          datasets.find((d) => d.id !== currentDataset?.id)
                            ?.id ||
                          ""
                        }
                        onChange={setReference}
                      >
                        {datasetOptions}
                      </Select>
                      <Select
                        label="비교 데이터셋"
                        value={currentDataset?.id || ""}
                        onChange={setDatasetId}
                      >
                        {datasetOptions}
                      </Select>
                      <label className="field">
                        JS 임계값
                        <input
                          type="number"
                          min="0.001"
                          max="1"
                          step="0.001"
                          value={threshold}
                          onChange={(e) => setThreshold(+e.target.value)}
                        />
                      </label>
                      <button
                        className="button"
                        disabled={busy || datasets.length < 2}
                      >
                        탐지 실행
                      </button>
                    </form>
                  </Panel>
                  {runHeader()}
                  {activeRun?.result && (
                    <>
                      <div className="stats">
                        <Stat
                          label="탐지 결과"
                          value={
                            activeRun.result.detected
                              ? "차이 감지"
                              : "임계값 미만"
                          }
                        />
                        <Stat
                          label="기준 / 비교"
                          value={`${num(activeRun.result.reference_count)} / ${num(activeRun.result.current_count)}`}
                        />
                        <Stat
                          label="이미지 색상 분포 JS"
                          value={activeRun.result.image_histogram_js?.toFixed(
                            4,
                          )}
                        />
                        <Stat
                          label="판정 임계값"
                          value={activeRun.result.threshold}
                        />
                      </div>
                      <div className="callout">
                        {(activeRun.result.fields as DriftField[])?.some(
                          (f) => f.q_value !== undefined,
                        )
                          ? "차이 감지는 JS 임계값 판정입니다. 각 속성을 누르면 유효 레이블 수·보정 q·카테고리 내 비교를 볼 수 있습니다. AI 레이블 오류와 제외율 차이가 영향을 줄 수 있으며 시간 경과에 따른 성능 저하를 확정하지 않습니다."
                          : activeRun.result.note}
                      </div>
                      <Panel title="속성 분포 차이 · 항목을 눌러 상세 보기">
                        {((activeRun.result.fields as DriftField[]) || []).map(
                          (f) => (
                            <details key={f.field}>
                              <summary className="metric-row">
                                <span>{names[f.field]}</span>
                                <div className="bar">
                                  <i
                                    className={f.detected ? "warning" : ""}
                                    style={{ width: pct(f.js_divergence) }}
                                  />
                                </div>
                                <strong>{f.js_divergence.toFixed(4)}</strong>
                                <Badge status={f.detected ? "failed" : "ready"}>
                                  {f.detected ? "감지" : "임계값 미만"}
                                </Badge>
                              </summary>
                              {f.q_value !== undefined && (
                                <p className="muted">
                                  유효 레이블 {f.reference_scored} /{" "}
                                  {f.current_scored} · 보정 q=
                                  {f.q_value.toFixed(3)}
                                  {f.category_adjusted_js !== undefined &&
                                    ` · 카테고리 내 JS ${f.category_adjusted_js.toFixed(4)} / q=${f.category_adjusted_q?.toFixed(3)}`}
                                  {
                                    " · 999회 순열 검정, 다중비교 보정. 시계열 성능 저하 판정은 아닙니다."
                                  }
                                </p>
                              )}
                              <div className="prediction">
                                <pre>
                                  기준{JSON.stringify(f.reference, null, 2)}
                                </pre>
                                <pre>
                                  비교{JSON.stringify(f.current, null, 2)}
                                </pre>
                              </div>
                            </details>
                          ),
                        )}
                      </Panel>
                      <Link className="button" href="/ko/reconstruction">
                        데이터 재구성으로 이동
                        <ChevronRight size={16} />
                      </Link>
                    </>
                  )}
                  {activeRun?.error && (
                    <div className="alert error">{activeRun.error}</div>
                  )}
                  {runList()}
                </>
              )}
            </>
          )}
        </main>
        <footer>
          DataDrift · 속성추출 데이터 운영{" "}
          <span>실제 데이터와 실행 기록 기반</span>
        </footer>
      </div>
      {newWorkspace && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={
              editWorkspaceId ? "워크스페이스 수정" : "워크스페이스 만들기"
            }
          >
            <div className="panel-heading">
              <h2>
                {editWorkspaceId ? "워크스페이스 수정" : "워크스페이스 만들기"}
              </h2>
              <button aria-label="닫기" onClick={() => setNewWorkspace(false)}>
                <X size={20} />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                act(async () => {
                  await api(
                    "/workspaces" +
                      (editWorkspaceId ? "/" + editWorkspaceId : ""),
                    {
                      name,
                      description,
                      task: "attribute_extraction",
                    },
                    editWorkspaceId ? "PATCH" : "POST",
                  );
                  setNewWorkspace(false);
                  setName("");
                  setDescription("");
                });
              }}
            >
              <label className="field">
                이름
                <Input
                  autoFocus
                  required
                  maxLength={100}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className="field">
                설명
                <textarea
                  value={description}
                  maxLength={1000}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
              <label className="field">
                작업 유형
                <div>
                  <Badge>속성추출</Badge>
                </div>
              </label>
              <button className="button" disabled={busy}>
                {editWorkspaceId ? "수정 저장" : "만들기"}
              </button>
            </form>
          </section>
        </div>
      )}
      {sample && currentDataset && (
        <LabelEditor
          key={currentDataset.id + ":" + sample.id}
          sample={sample}
          dataset={currentDataset}
          position={samples.items.findIndex((row) => row.id === sample.id)}
          total={samples.items.length}
          onClose={() => setSample(null)}
          onMove={(direction) => {
            const index = samples.items.findIndex(
              (row) => row.id === sample.id,
            );
            if (samples.items[index + direction])
              setSample(samples.items[index + direction]);
          }}
          onSaved={(version, updated) => {
            setDatasets((current) => [version, ...current]);
            setDatasetId(version.id);
            setSample(updated);
            setNotice("레이블 수정본을 새 버전으로 저장했습니다.");
          }}
        />
      )}
    </div>
  );
}
