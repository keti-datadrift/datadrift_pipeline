"use client";
import { AutoLabelDialog } from "@/components/auto-label-dialog";
import { DriftWorkspace } from "@/components/dashboard/drift-workspace";
import { EvaluationResults } from "@/components/dashboard/evaluation-results";
import { ModelList } from "@/components/dashboard/model-list";
import { ReconstructionWorkspace } from "@/components/dashboard/reconstruction-workspace";
import { TrainingMonitor } from "@/components/dashboard/training-monitor";
import { WorkspaceList } from "@/components/dashboard/workspace-list";
import { DeleteDialog, type DeleteTarget } from "@/components/data-deletion";
import { ImageUpload } from "@/components/image-upload";
import { LabelEditor, type LabelSample } from "@/components/label-editor";
import { LabelStatus } from "@/components/label-status";
import { ModelApi } from "@/components/model-api";
import { ModelDatasetName } from "@/components/model-dataset-name";
import { ModelPicker } from "@/components/model-picker";
import { PaginatedContent } from "@/components/paginated-content";
import { SelectionCard } from "@/components/selection-card";
import { Input } from "@/components/ui/input";
import { displayName } from "@/lib/utils";
import {
  Activity,
  ArrowLeft,
  Boxes,
  ChevronDown,
  CircleCheck,
  Database,
  Download,
  FlaskConical,
  Layers,
  Pencil,
  Play,
  Plus,
  Radar,
  RefreshCw,
  Search,
  Settings2,
  Upload,
  WandSparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Badge, Empty, Panel, Select } from "@/components/dashboard/primitives";
import { usePlatformCatalog } from "@/hooks/use-platform-catalog";
import { api } from "@/lib/api-client";
import {
  date,
  ATTRIBUTE_LABELS as names,
  num,
  reconstructionCount,
  reconstructionDefaultCount,
  runState,
  STATUS_LABELS as states,
} from "@/lib/platform-display";
import type { Dataset, Model, Run } from "@/lib/platform-types";

type Sample = LabelSample;
export default function Dashboard({ path }: { path: string[] }) {
  const router = useRouter();
  const query = useSearchParams();
  const attribute = query.get("attribute") || "";
  const attributeValue = query.get("value") || "";
  const [review, setReview] = useState("");
  const section = path[0] || "workspaces";
  const detail = path[1];
  const needsWorkspaces =
    section === "workspaces" || section === "reconstruction";
  const needsModels = [
    "models",
    "training",
    "evaluation",
    "monitoring",
  ].includes(section);
  const needsRuns =
    section === "evaluation" ||
    section === "monitoring" ||
    (section === "workspaces" && !!detail);
  const showsRun = section === "evaluation" || section === "monitoring";
  const {
    workspaces,
    datasets,
    models,
    runs,
    loading,
    error,
    setError,
    setDatasets,
    refresh,
  } = usePlatformCatalog({ needsWorkspaces, needsModels, needsRuns });
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
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
  const [editingDataset, setEditingDataset] = useState<Dataset | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [selectedSamples, setSelectedSamples] = useState<string[]>([]);
  const [moveSplit, setMoveSplit] = useState("validation");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [workspaceLabelModel, setWorkspaceLabelModel] = useState("");
  const [labelModels, setLabelModels] = useState<Model[]>([]);
  const [labelModelsLoading, setLabelModelsLoading] = useState(false);
  const [labelModelsError, setLabelModelsError] = useState("");
  const [labelingDataset, setLabelingDataset] = useState<Dataset | null>(null);
  const [newWorkspace, setNewWorkspace] = useState(false),
    [name, setName] = useState(""),
    [description, setDescription] = useState("");
  const [editWorkspaceId, setEditWorkspaceId] = useState("");
  const [budget, setBudget] = useState(200),
    [method, setMethod] = useState("balanced_mix"),
    [seed, setSeed] = useState(42),
    [parentIds, setParentIds] = useState<string[]>([]),
    [preview, setPreview] = useState<Dataset | null>(null);
  const [reconstructionReference, setReconstructionReference] = useState("");
  const [mixWeights, setMixWeights] = useState<Record<string, number>>({});
  const [steps, setSteps] = useState(20),
    [lr, setLr] = useState(0.00002),
    [evalSplit, setEvalSplit] = useState("test"),
    [reference, setReference] = useState(""),
    [threshold, setThreshold] = useState(0.1),
    [selectedRun, setSelectedRun] = useState(""),
    [logs, setLogs] = useState("");
  const [runDetail, setRunDetail] = useState<Run | null>(null);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setNewWorkspace(false);
      }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, []);
  useEffect(() => {
    if (!newWorkspace) return;
    let alive = true;
    setLabelModelsLoading(true);
    setLabelModelsError("");
    const data = datasets.find((d) => d.workspace_id === editWorkspaceId);
    api<Model[]>(
      "/labeling-models" +
        (data
          ? `?schema_id=${encodeURIComponent(data.schema_id || "visual-v1")}`
          : ""),
    )
      .then((items) => {
        if (alive) setLabelModels(items);
      })
      .catch((e) => {
        if (alive) setLabelModelsError(e.message);
      })
      .finally(() => {
        if (alive) setLabelModelsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [newWorkspace, editWorkspaceId, datasets]);
  useEffect(() => {
    if ((section === "training" || section === "evaluation") && detail)
      setModelId(detail);
  }, [section, detail]);
  useEffect(() => {
    setSearch("");
    setReview("");
    setSplit("");
    setOffset(0);
    setSample(null);
    setSelectedRun("");
    setPreview(null);
  }, [section, detail]);
  const sourceWorkspaces = query.get("sources") || "";
  const appliedSources = useRef("");
  useEffect(() => {
    if (section !== "reconstruction" || !sourceWorkspaces) {
      appliedSources.current = "";
      return;
    }
    if (datasets.length && appliedSources.current !== sourceWorkspaces) {
      appliedSources.current = sourceWorkspaces;
      const wanted = sourceWorkspaces.split(",");
      const sources = datasets.filter(
        (d) => wanted.includes(d.workspace_id) && reconstructionCount(d) > 0,
      );
      setParentIds(sources.map((d) => d.id));
      setBudget(reconstructionDefaultCount(sources));
      setMixWeights({});
    }
  }, [section, sourceWorkspaces, datasets]);
  const workspace = workspaces.find((w) => w.id === detail);
  const workspaceDatasets = datasets
    .filter((d) => d.workspace_id === detail)
    .sort(
      (a, b) =>
        (b.created_at || "").localeCompare(a.created_at || "") ||
        b.id.localeCompare(a.id),
    );
  const latestDataset = workspaceDatasets[0];
  const currentDataset =
    section === "workspaces" && detail
      ? (sample ? editingDataset : undefined) || latestDataset
      : datasets.find((d) => d.id === datasetId) || datasets[0];
  const [editorIds, setEditorIds] = useState<string[]>([]);
  const [editorLoading, setEditorLoading] = useState(false);
  const [editorError, setEditorError] = useState("");
  const editorRequest = useRef(0);
  const editorMoving = useRef(false);
  function closeSample() {
    editorRequest.current += 1;
    editorMoving.current = false;
    setSample(null);
    setEditorLoading(false);
  }
  async function openSample(row: Sample) {
    if (!currentDataset) return;
    const request = ++editorRequest.current;
    setDatasetId(currentDataset.id);
    setEditingDataset(currentDataset);
    setSample(row);
    setEditorIds([]);
    setEditorError("");
    setEditorLoading(true);
    try {
      const result = await api<{ ids: string[] }>(
        `/datasets/${currentDataset.id}/samples?ids_only=true&q=${encodeURIComponent(search)}${split ? "&split=" + split : ""}${review ? "&review=" + review : ""}${attribute ? "&attribute=" + encodeURIComponent(attribute) + "&value=" + encodeURIComponent(attributeValue) : ""}`,
      );
      if (editorRequest.current === request) setEditorIds(result.ids);
    } catch (e) {
      if (editorRequest.current === request)
        setEditorError((e as Error).message);
    } finally {
      if (editorRequest.current === request) setEditorLoading(false);
    }
  }
  async function moveSample(direction: number) {
    if (!sample || !currentDataset || editorMoving.current || editorLoading)
      return;
    const index = editorIds.indexOf(sample.id);
    const id = index >= 0 ? editorIds[index + direction] : undefined;
    if (!id) return;
    const request = ++editorRequest.current;
    editorMoving.current = true;
    setEditorLoading(true);
    setEditorError("");
    try {
      const row = await api<Sample>(
        `/datasets/${currentDataset.id}/samples/${encodeURIComponent(id)}`,
      );
      if (editorRequest.current === request) setSample(row);
    } catch (e) {
      if (editorRequest.current === request)
        setEditorError((e as Error).message);
    } finally {
      if (editorRequest.current === request) {
        setEditorLoading(false);
        editorMoving.current = false;
      }
    }
  }
  useEffect(() => {
    if (section !== "workspaces" || !detail || !currentDataset) return;
    let alive = true;
    setSamplesLoading(true);
    api<{ total: number; items: Sample[] }>(
      `/datasets/${currentDataset.id}/samples?limit=24&offset=${offset}&q=${encodeURIComponent(search)}${split ? "&split=" + split : ""}${review ? "&review=" + review : ""}${attribute ? "&attribute=" + encodeURIComponent(attribute) + "&value=" + encodeURIComponent(attributeValue) : ""}`,
    )
      .then((v) => {
        if (alive) {
          setSamples(v);
          if (offset > 0 && offset >= v.total)
            setOffset(Math.max(0, Math.floor((v.total - 1) / 24) * 24));
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => {
        if (alive) setSamplesLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [
    section,
    detail,
    currentDataset?.id,
    offset,
    search,
    split,
    review,
    attribute,
    attributeValue,
  ]);
  useEffect(() => {
    setSelectedSamples([]);
  }, [currentDataset?.id, search, split, review, attribute, attributeValue]);
  const labelingRun = runs.find(
    (r) =>
      r.request.kind === "labeling" &&
      r.request.dataset_id === currentDataset?.id,
  );
  const labelingResult = datasets.find(
    (d) => d.labeling_job_id === labelingRun?.id && d.labeling_job_id,
  );
  const labelingBusy =
    !!labelingRun && ["queued", "running"].includes(labelingRun.status);
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
  const trainingSettingsRef = useRef<HTMLDialogElement>(null);
  const [workspaceStatus, setWorkspaceStatus] = useState("all");
  const [workspaceSort, setWorkspaceSort] = useState("default");
  const modelSearch = query.get("q") || "";
  const modelKind = ["base", "lora"].includes(query.get("type") || "")
    ? query.get("type")!
    : "all";
  const requestedModelPage = Number(query.get("page") || "1");
  const modelPage =
    Number.isSafeInteger(requestedModelPage) && requestedModelPage > 0
      ? requestedModelPage - 1
      : 0;
  const modelListParams = new URLSearchParams();
  if (modelSearch) modelListParams.set("q", modelSearch);
  if (modelKind !== "all") modelListParams.set("type", modelKind);
  if (modelPage) modelListParams.set("page", String(modelPage + 1));
  const modelListSuffix = modelListParams.size
    ? "?" + modelListParams.toString()
    : "";
  function changeModelList(change: {
    search?: string;
    kind?: string;
    page?: number;
  }) {
    const params = new URLSearchParams(modelListParams);
    if (change.search !== undefined) {
      if (change.search) params.set("q", change.search);
      else params.delete("q");
    }
    if (change.kind !== undefined) {
      if (change.kind !== "all") params.set("type", change.kind);
      else params.delete("type");
    }
    const page = change.page ?? 0;
    if (page) params.set("page", String(page + 1));
    else params.delete("page");
    window.history.replaceState(
      null,
      "",
      "/ko/models" + (params.size ? "?" + params.toString() : ""),
    );
  }
  const [draftTraining, setDraftTraining] = useState({
    steps: 20,
    lr: 0.00002,
    seed: 42,
  });
  function openTrainingSettings() {
    setDraftTraining({ steps, lr, seed });
    trainingSettingsRef.current?.showModal();
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
        ["models", "모델 목록", Boxes],
        ["training", "학습", FlaskConical],
        ["evaluation", "모델 평가", CircleCheck],
        ["model-api", "모델 API", Boxes],
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
    section === "model-api"
      ? "모델 API"
      : section === "workspaces"
        ? detail
          ? displayName(workspace?.name) || "워크스페이스"
          : "워크스페이스"
        : section === "models"
          ? detail
            ? "모델 상세"
            : "모델 목록"
          : section === "reconstruction"
            ? "데이터 재구성"
            : section === "training"
              ? "모델 학습"
              : section === "evaluation"
                ? "모델 평가"
                : detail === "drift"
                  ? "드리프트 탐지"
                  : "학습 진행 상태";
  const usableModels = models.filter(
    (m) => m.status === "ready" && m.available,
  );
  const modelMatchesDataset = (model: Model) =>
    model.kind === "base" ||
    (model.schema_id || "visual-v1") ===
      (currentDataset?.schema_id || "visual-v1");
  const selectedModel =
    usableModels.find((m) => m.id === modelId) ||
    (!detail
      ? usableModels.find(modelMatchesDataset) || usableModels[0]
      : undefined);
  const modelOptions = models
    .filter((m) => m.status === "ready")
    .map((m) => ({
      id: m.id,
      name: displayName(m.name),
      disabled: !m.available,
    }));
  const modelDatasetMismatch =
    !!selectedModel && !!currentDataset && !modelMatchesDataset(selectedModel);
  const modelDatasetNotice = modelDatasetMismatch && (
    <p className="model-dataset-notice" role="status">
      선택한 데이터의 속성 형식을 확인하세요.
    </p>
  );
  const datasetOptions = datasets.map((d) => (
    <option key={d.id} value={d.id}>
      {displayName(d.name)} ({num(d.count)}개)
      {section === "evaluation"
        ? ` / ${evalSplit === "test" ? "테스트" : "검증"} ${num(d.splits[evalSplit] || 0)}개`
        : ""}
      {d.unlabeled_count ? ` / 미레이블 ${d.unlabeled_count}개` : ""}
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
  const runSummary =
    visibleRuns.find((r) => r.id === selectedRun) || visibleRuns[0];
  const activeRun =
    runDetail &&
    runSummary &&
    runDetail.id === runSummary.id &&
    runDetail.status === runSummary.status
      ? {
          ...runDetail,
          progress: { ...runDetail.progress, ...runSummary.progress },
        }
      : runSummary;
  useEffect(() => {
    if (!showsRun || !runSummary) return;
    let alive = true;
    api<Run>(`/jobs/${runSummary.id}`)
      .then((v) => {
        if (alive) setRunDetail(v);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    if (section === "monitoring" && detail === "training") {
      setLogs("");
      api<{ text: string }>(`/jobs/${runSummary.id}/logs`)
        .then((v) => {
          if (alive) setLogs(v.text);
        })
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, [
    showsRun,
    section,
    detail,
    runSummary?.id,
    runSummary?.progress?.step,
    runSummary?.progress?.phase,
    runSummary?.status,
  ]);
  const reconstructionInitialized = useRef(false);
  useEffect(() => {
    if (section !== "reconstruction") {
      reconstructionInitialized.current = false;
      return;
    }
    if (
      !datasets.length ||
      sourceWorkspaces ||
      reconstructionInitialized.current
    )
      return;
    reconstructionInitialized.current = true;
    const eligible = datasets.filter(
      (d) => !d.unlabeled_count && reconstructionCount(d) > 0,
    );
    const schema =
      eligible.find((d) => d.schema_id?.startsWith("bkave-"))?.schema_id ||
      eligible[0]?.schema_id;
    const sources = eligible.filter((d) => d.schema_id === schema);
    setParentIds(sources.map((d) => d.id));
    setBudget(reconstructionDefaultCount(sources));
    setMixWeights({});
  }, [section, datasets, sourceWorkspaces]);
  const reconstructionSources = datasets.filter((d) =>
    parentIds.includes(d.id),
  );
  const reconstructionAvailable = reconstructionSources.reduce(
    (sum, d) => sum + reconstructionCount(d),
    0,
  );
  const reconstructionReferenceId =
    reconstructionSources.find((d) => d.id === reconstructionReference)?.id ||
    reconstructionSources[0]?.id ||
    "";
  const reconstructionName = (d: { workspace_id: string; name: string }) =>
    displayName(
      workspaces.find((w) => w.id === d.workspace_id)?.name || d.name,
    );
  const rawMixWeights = reconstructionSources.map((d) => mixWeights[d.id] ?? 1);
  const mixTotal = rawMixWeights.reduce((sum, w) => sum + w, 0) || 1;
  const exactUnits = rawMixWeights.map((w) => (10000 * w) / mixTotal);
  const mixUnits = exactUnits.map(Math.floor);
  const remainderOrder = exactUnits
    .map((_, i) => i)
    .sort(
      (a, b) => exactUnits[b] - mixUnits[b] - (exactUnits[a] - mixUnits[a]),
    );
  for (const i of remainderOrder.slice(
    0,
    10000 - mixUnits.reduce((sum, n) => sum + n, 0),
  ))
    mixUnits[i]++;
  const reconstructionWeights = Object.fromEntries(
    reconstructionSources.map((d, i) => [d.id, mixUnits[i] / 100]),
  );
  function changeMixWeight(id: string, value: number) {
    const percent = Number.isFinite(value)
      ? Math.max(0, Math.min(100, value))
      : 0;
    const others = reconstructionSources.filter((d) => d.id !== id);
    const total = others.reduce(
      (sum, d) => sum + reconstructionWeights[d.id],
      0,
    );
    setMixWeights(
      Object.fromEntries(
        reconstructionSources.map((d) => [
          d.id,
          d.id === id
            ? percent
            : (100 - percent) *
              (total ? reconstructionWeights[d.id] / total : 1 / others.length),
        ]),
      ),
    );
    setPreview(null);
  }
  const bodyRecon = () => ({
    name: name.trim(),
    dataset_ids: parentIds,
    data_count: method === "merge" ? undefined : budget,
    reference_id:
      method === "distribution" ? reconstructionReferenceId : undefined,
    dataset_weights:
      method === "balanced_mix" ? reconstructionWeights : undefined,
    method,
    seed,
  });
  async function submit(kind: string) {
    await act(async () => {
      if (kind !== "drift" && !selectedModel)
        throw new Error("사용 가능한 모델을 선택하세요.");
      if (kind !== "drift" && modelDatasetMismatch)
        throw new Error("선택한 데이터의 속성 형식을 확인하세요.");
      if (kind === "evaluation" && !currentDataset?.splits[evalSplit])
        throw new Error("평가할 데이터가 없습니다.");
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
        split: evalSplit,
        threshold,
        seed,
      });
      setSelectedRun(j.id);
      if (kind === "training") router.push("/ko/monitoring/training");
    }, "작업을 시작했습니다.");
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
          <PaginatedContent key={route} items={visibleRuns} label="실행 이력">
            {(pageRuns) => (
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
                    {pageRuns.map((j) => (
                      <tr
                        key={j.id}
                        className={activeRun?.id === j.id ? "selected" : ""}
                      >
                        <td>
                          <button
                            className="text-button"
                            onClick={() => setSelectedRun(j.id)}
                          >
                            {j.request.kind === "labeling" ? "레이블링 " : ""}
                            {j.id.slice(0, 8)}
                          </button>
                        </td>
                        <td>
                          {displayName(
                            datasets.find((d) => d.id === j.request.dataset_id)
                              ?.name,
                          ) ||
                            displayName(j.dataset_name) ||
                            "삭제된 데이터"}
                        </td>
                        <td>{date(j.created_at)}</td>
                        <td>
                          <Badge status={j.status}>{runState(j)}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </PaginatedContent>
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
            <Badge status={activeRun.status}>{runState(activeRun)}</Badge>
            <div className="run-meta">
              {activeRun.request.kind === "drift" ? (
                <span>
                  {displayName(
                    datasets.find(
                      (d) => d.id === activeRun.request.reference_id,
                    )?.name || activeRun.reference_name,
                  )}{" "}
                  →{" "}
                  {displayName(
                    datasets.find((d) => d.id === activeRun.request.dataset_id)
                      ?.name || activeRun.dataset_name,
                  )}
                </span>
              ) : (
                <span>
                  {activeRun.request.kind === "labeling"
                    ? `${displayName(models.find((m) => m.id === activeRun.request.model_id)?.name) || "Gemma-4-12B"} 자동 레이블링`
                    : displayName(
                        models.find((m) => m.id === activeRun.request.model_id)
                          ?.name,
                      )}
                </span>
              )}
              <time>{date(activeRun.created_at)}</time>
            </div>
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
            <details className="nav-group" key={group.group} open>
              <summary className="nav-label">
                {group.group === "데이터" ? (
                  <Database size={18} />
                ) : group.group === "모델" ? (
                  <Boxes size={18} />
                ) : (
                  <Activity size={18} />
                )}
                <span>{group.group}</span>
                <ChevronDown size={16} />
              </summary>
              <div className="nav-children">
                {group.items.map(([url, label]) => (
                  <Link
                    className={`nav-item ${route === url ? "active" : ""}`}
                    key={url}
                    href={
                      url === "models" && section === "models"
                        ? "/ko/models" + modelListSuffix
                        : "/ko/" + url
                    }
                  >
                    {label}
                  </Link>
                ))}
              </div>
            </details>
          ))}
        </nav>
      </aside>
      <div className="main-shell">
        <main
          className={`page-${section} ${detail ? "detail-page" : "list-page"}`}
        >
          {section === "workspaces" && detail && (
            <Link className="back" href="/ko/workspaces">
              <ArrowLeft size={16} />
              전체 워크스페이스
            </Link>
          )}
          <div className="page-heading">
            <div>
              <h1>{title}</h1>
            </div>
            <div
              className={`page-actions ${section === "workspaces" && detail ? "dataset-current" : ""}`}
              data-dataset-id={
                section === "workspaces" && detail
                  ? currentDataset?.id || ""
                  : undefined
              }
            >
              {section === "workspaces" && !detail && (
                <div className="actions">
                  <button
                    className="button secondary"
                    disabled={!workspaces.length}
                    onClick={() => setUploadOpen(true)}
                  >
                    이미지 업로드
                  </button>
                  <button
                    className="button"
                    onClick={() => {
                      setWorkspaceLabelModel("");
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
              )}
              {section === "models" && !detail && (
                <Link className="button" href="/ko/training">
                  <Plus size={16} />
                  모델 학습
                </Link>
              )}
              {section === "training" && (
                <>
                  <button
                    className="button secondary"
                    onClick={openTrainingSettings}
                    disabled={loading}
                  >
                    <Settings2 size={16} />
                    학습 설정
                  </button>
                  <button
                    className="button"
                    form="training-form"
                    type="submit"
                    disabled={
                      busy ||
                      !currentDataset ||
                      !selectedModel ||
                      modelDatasetMismatch
                    }
                  >
                    <Play size={16} />
                    학습 시작
                  </button>
                </>
              )}

              {section === "workspaces" && detail && workspace && (
                <button
                  className="button secondary"
                  onClick={() => setUploadOpen(true)}
                >
                  <Upload size={16} />
                  이미지 업로드
                </button>
              )}
              {section === "workspaces" && detail && workspace && (
                <button
                  className="button secondary"
                  onClick={() => {
                    setWorkspaceLabelModel(workspace.labeling_model_id || "");
                    setEditWorkspaceId(workspace.id);
                    setName(workspace.name);
                    setDescription(workspace.description);
                    setNewWorkspace(true);
                  }}
                >
                  <Pencil size={16} />
                  워크스페이스 수정
                </button>
              )}
              {section === "workspaces" && detail && workspace && (
                <>
                  <button
                    className="button secondary"
                    disabled={busy || !currentDataset?.count || labelingBusy}
                    title={
                      !currentDataset?.count
                        ? "이미지를 업로드하세요."
                        : labelingBusy
                          ? "자동 레이블링이 진행 중입니다."
                          : undefined
                    }
                    onClick={() =>
                      currentDataset && setLabelingDataset(currentDataset)
                    }
                  >
                    <WandSparkles size={16} />
                    자동 레이블링
                  </button>
                  <details
                    className="action-menu"
                    onBlur={(e) => {
                      if (
                        !e.currentTarget.contains(
                          e.relatedTarget as Node | null,
                        )
                      )
                        e.currentTarget.open = false;
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        e.currentTarget.open = false;
                        e.currentTarget.querySelector("summary")?.focus();
                      }
                    }}
                  >
                    <summary className="button secondary">
                      데이터 작업
                      <ChevronDown size={16} />
                    </summary>
                    <div className="action-menu-items">
                      <button
                        className="button secondary"
                        disabled={
                          samplesLoading ||
                          !currentDataset ||
                          !samples.items.length
                        }
                        onClick={(e) => {
                          e.currentTarget
                            .closest("details")
                            ?.removeAttribute("open");
                          openSample(samples.items[0]);
                        }}
                      >
                        <CircleCheck size={16} />
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
                      <hr />
                      {currentDataset && (
                        <button
                          className="button secondary danger-text"
                          onClick={(e) => {
                            e.currentTarget
                              .closest("details")
                              ?.removeAttribute("open");
                            setDeleteTarget({
                              kind: "dataset",
                              id: currentDataset.id,
                            });
                          }}
                        >
                          전체 데이터 삭제
                        </button>
                      )}
                      <button
                        className="button secondary danger-text"
                        onClick={(e) => {
                          e.currentTarget
                            .closest("details")
                            ?.removeAttribute("open");
                          setDeleteTarget({
                            kind: "workspace",
                            id: workspace.id,
                          });
                        }}
                      >
                        워크스페이스 삭제
                      </button>
                    </div>
                  </details>
                </>
              )}
              <button
                className="button secondary"
                aria-label="새로고침"
                onClick={() => act(async () => {}, "새로고침했습니다.")}
                disabled={busy}
              >
                <RefreshCw size={16} />
                새로고침
              </button>
            </div>
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
                <WorkspaceList
                  workspaces={workspaces}
                  search={search}
                  setSearch={setSearch}
                  workspaceStatus={workspaceStatus}
                  setWorkspaceStatus={setWorkspaceStatus}
                  workspaceSort={workspaceSort}
                  setWorkspaceSort={setWorkspaceSort}
                />
              )}
              {section === "workspaces" && detail && (
                <>
                  {!workspace ? (
                    <Empty>워크스페이스를 찾을 수 없습니다.</Empty>
                  ) : (
                    <>
                      {currentDataset && labelingRun && (
                        <div className="workspace-label-status">
                          {labelingRun && (
                            <span>
                              자동 레이블링 {states[labelingRun.status]}
                              {labelingRun.status === "running"
                                ? ["loading", "loading_teacher"].includes(
                                    labelingRun.progress.phase || "loading",
                                  )
                                  ? " (모델 불러오는 중)"
                                  : ` ${labelingRun.progress.step || 0} / ${labelingRun.progress.total || currentDataset.count}`
                                : ""}
                            </span>
                          )}
                          {labelingBusy && (
                            <Link
                              className="text-button"
                              href="/ko/monitoring/training"
                            >
                              진행 상태 보기
                            </Link>
                          )}
                          {labelingRun?.status === "failed" && (
                            <Link
                              className="text-button"
                              href="/ko/monitoring/training"
                            >
                              실행 로그 확인
                            </Link>
                          )}
                          {labelingResult && (
                            <button
                              className="text-button"
                              onClick={() => {
                                setDatasetId(labelingResult.id);
                                setOffset(0);
                                setSplit("");
                                setSearch("");
                              }}
                            >
                              레이블 결과 보기
                            </button>
                          )}
                        </div>
                      )}
                      {currentDataset ? (
                        <>
                          <div className="tabs">
                            <button
                              aria-label="전체"
                              className={!split ? "chosen" : ""}
                              onClick={() => {
                                setSplit("");
                                setOffset(0);
                              }}
                            >
                              전체 <span>{num(currentDataset.count)}</span>
                            </button>
                            {[
                              ...(currentDataset.splits.unassigned ||
                              split === "unassigned"
                                ? [["unassigned", "미지정"]]
                                : []),
                              ["train", "학습"],
                              ["validation", "검증"],
                              ["test", "테스트"],
                            ].map(([v, l]) => (
                              <button
                                key={v}
                                aria-label={l}
                                className={split === v ? "chosen" : ""}
                                onClick={() => {
                                  setSplit(v);
                                  setOffset(0);
                                }}
                              >
                                {l}{" "}
                                <span>
                                  {num(currentDataset.splits[v] || 0)}
                                </span>
                              </button>
                            ))}
                          </div>
                          {attribute && (
                            <p className="filter-summary">
                              {names[attribute] || attribute}: {attributeValue}{" "}
                              <Link href={`/ko/workspaces/${detail}`}>
                                필터 해제
                              </Link>
                            </p>
                          )}
                          <div className="toolbar">
                            <select
                              className="review-filter"
                              aria-label="레이블 검토 상태"
                              value={review}
                              onChange={(e) => {
                                setReview(e.target.value);
                                setOffset(0);
                              }}
                            >
                              <option value="">전체 검토 상태</option>
                              <option value="pending">
                                검토 대기 (
                                {num(
                                  (currentDataset.labeled_count || 0) -
                                    (currentDataset.reviewed_count || 0),
                                )}
                                )
                              </option>
                              <option value="verified">
                                검토 완료 (
                                {num(currentDataset.reviewed_count || 0)})
                              </option>
                              <option value="unlabeled">
                                레이블 없음 (
                                {num(currentDataset.unlabeled_count || 0)})
                              </option>
                            </select>
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
                            <div className="actions">
                              <span className="muted">
                                {num(samples.total)}개 검색됨
                              </span>
                            </div>
                          </div>
                          <div className="selection-toolbar">
                            <label>
                              <input
                                type="checkbox"
                                disabled={
                                  busy ||
                                  samplesLoading ||
                                  !samples.items.length
                                }
                                checked={
                                  !!samples.items.length &&
                                  samples.items.every((r) =>
                                    selectedSamples.includes(r.id),
                                  )
                                }
                                onChange={(e) =>
                                  setSelectedSamples((ids) =>
                                    e.target.checked
                                      ? [
                                          ...new Set([
                                            ...ids,
                                            ...samples.items.map((r) => r.id),
                                          ]),
                                        ]
                                      : ids.filter(
                                          (id) =>
                                            !samples.items.some(
                                              (r) => r.id === id,
                                            ),
                                        ),
                                  )
                                }
                              />
                              현재 페이지 전체 선택
                            </label>
                            <span>{selectedSamples.length}개 선택</span>
                            <button
                              className={`button secondary selection-clear ${!selectedSamples.length ? "is-inactive" : ""}`}
                              aria-hidden={!selectedSamples.length}
                              disabled={busy || !selectedSamples.length}
                              onClick={() => setSelectedSamples([])}
                            >
                              선택 해제
                            </button>
                            <div
                              className={`actions selection-actions ${!selectedSamples.length ? "is-inactive" : ""}`}
                              aria-hidden={!selectedSamples.length}
                            >
                              <select
                                aria-label="이동할 데이터 구분"
                                value={moveSplit}
                                disabled={busy}
                                onChange={(e) => setMoveSplit(e.target.value)}
                              >
                                <option value="unassigned">
                                  미지정 데이터
                                </option>
                                <option value="train">학습 데이터</option>
                                <option value="validation">검증 데이터</option>
                                <option value="test">테스트 데이터</option>
                              </select>
                              <button
                                className="button secondary"
                                disabled={
                                  busy ||
                                  samplesLoading ||
                                  !selectedSamples.length
                                }
                                onClick={() =>
                                  void act(async () => {
                                    const result = await api<{
                                      dataset: Dataset;
                                      changed_count: number;
                                    }>(
                                      `/datasets/${currentDataset.id}/samples/split`,
                                      {
                                        sample_ids: selectedSamples,
                                        split: moveSplit,
                                      },
                                    );
                                    setDatasetId(result.dataset.id);
                                    setDatasets((items) => [
                                      result.dataset,
                                      ...items.filter(
                                        (d) =>
                                          d.workspace_id !==
                                          result.dataset.workspace_id,
                                      ),
                                    ]);
                                    setSelectedSamples([]);
                                    setOffset(0);
                                  }, "데이터 구분을 변경했습니다.")
                                }
                              >
                                선택 이동
                              </button>
                              <button
                                className="button secondary danger-text"
                                disabled={
                                  busy ||
                                  samplesLoading ||
                                  !selectedSamples.length
                                }
                                onClick={() =>
                                  setDeleteTarget({
                                    kind: "samples",
                                    id: currentDataset.id,
                                    sample_ids: selectedSamples,
                                  })
                                }
                              >
                                선택 삭제
                              </button>
                            </div>
                          </div>
                          <div
                            className="sample-page"
                            aria-busy={samplesLoading}
                          >
                            {samplesLoading && (
                              <span className="page-loading" role="status">
                                이미지를 불러오는 중…
                              </span>
                            )}
                            <div className="sample-grid">
                              {samples.items.map((r) => (
                                <div
                                  className={`sample-item ${selectedSamples.includes(r.id) ? "is-selected" : ""}`}
                                  key={r.id}
                                >
                                  <div className="sample-card">
                                    <label className="sample-select">
                                      <input
                                        className="sample-checkbox"
                                        type="checkbox"
                                        aria-label={`${r.filename || r.product_id} 선택`}
                                        checked={selectedSamples.includes(r.id)}
                                        disabled={busy || samplesLoading}
                                        onChange={(e) =>
                                          setSelectedSamples((ids) =>
                                            e.target.checked
                                              ? [...new Set([...ids, r.id])]
                                              : ids.filter((id) => id !== r.id),
                                          )
                                        }
                                      />
                                      <img
                                        src={`/api/datasets/${currentDataset.id}/images/${r.id}`}
                                        alt={r.filename || r.product_id}
                                        loading="lazy"
                                      />
                                    </label>
                                    <button
                                      className="sample-review"
                                      disabled={busy || samplesLoading}
                                      aria-label={`${r.filename || r.product_id} 레이블 검토`}
                                      onClick={() => openSample(r)}
                                    >
                                      <LabelStatus sample={r} />
                                    </button>
                                  </div>
                                </div>
                              ))}
                              {Array.from(
                                {
                                  length: Math.max(
                                    0,
                                    Math.min(
                                      24,
                                      samples.total ||
                                        (samplesLoading ? 24 : 0),
                                    ) - samples.items.length,
                                  ),
                                },
                                (_, index) => (
                                  <div
                                    key={`empty-${index}`}
                                    className="sample-placeholder"
                                    aria-hidden="true"
                                  />
                                ),
                              )}
                            </div>
                            {!samplesLoading && !samples.total && (
                              <Empty>검색 조건에 맞는 데이터가 없습니다.</Empty>
                            )}
                          </div>
                          <div className="pagination">
                            <button
                              className="button secondary"
                              disabled={samplesLoading || offset === 0}
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
                              disabled={
                                samplesLoading || offset + 24 >= samples.total
                              }
                              onClick={() => setOffset(offset + 24)}
                            >
                              다음
                            </button>
                          </div>
                        </>
                      ) : (
                        <Empty>
                          이미지 업로드로 데이터를 추가하세요. 업로드 후 자동
                          레이블링하거나 직접 레이블을 작성할 수 있습니다.
                        </Empty>
                      )}
                    </>
                  )}
                </>
              )}
              {section === "reconstruction" && (
                <ReconstructionWorkspace
                  act={act}
                  bodyRecon={bodyRecon}
                  name={name}
                  setName={setName}
                  preview={preview}
                  setPreview={setPreview}
                  datasets={datasets}
                  parentIds={parentIds}
                  setParentIds={setParentIds}
                  setMixWeights={setMixWeights}
                  reconstructionName={reconstructionName}
                  method={method}
                  setMethod={setMethod}
                  reconstructionSources={reconstructionSources}
                  busy={busy}
                  reconstructionWeights={reconstructionWeights}
                  changeMixWeight={changeMixWeight}
                  reconstructionReferenceId={reconstructionReferenceId}
                  setReconstructionReference={setReconstructionReference}
                  reconstructionAvailable={reconstructionAvailable}
                  budget={budget}
                  setBudget={setBudget}
                  seed={seed}
                  setSeed={setSeed}
                />
              )}
              {section === "models" && !detail && (
                <ModelList
                  models={models}
                  modelSearch={modelSearch}
                  modelKind={modelKind}
                  modelPage={modelPage}
                  modelListSuffix={modelListSuffix}
                  changeModelList={changeModelList}
                />
              )}
              {section === "models" &&
                detail &&
                (() => {
                  const m = models.find((x) => x.id === detail);
                  if (!m) return <Empty>모델을 찾을 수 없습니다.</Empty>;
                  return (
                    <>
                      <Link
                        className="back"
                        href={"/ko/models" + modelListSuffix}
                      >
                        <ArrowLeft size={16} />
                        모델 목록
                      </Link>
                      <div className="two-col">
                        <Panel title={displayName(m.name)}>
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
                            <Badge
                              status={
                                m.status === "ready" && !m.available
                                  ? "unavailable"
                                  : m.status
                              }
                            />
                            <span>데이터셋</span>
                            <strong>
                              <ModelDatasetName
                                datasetId={m.dataset_id}
                                currentName={
                                  datasets.find((d) => d.id === m.dataset_id)
                                    ?.name
                                }
                                kind={m.kind}
                              />
                            </strong>
                            <span>원본 모델</span>
                            <strong>
                              {displayName(
                                models.find((x) => x.id === m.parent_id)?.name,
                              ) || "—"}
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
                                placeholder={displayName(m.name)}
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
                            보관한 모델은 새 학습과 평가 목록에서 제외됩니다.
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
                <div className="training-workbench">
                  <form
                    id="training-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      submit("training");
                    }}
                  >
                    <p className="training-task">
                      <span>작업 유형</span>
                      <strong>패션 속성 추출</strong>
                    </p>
                    <div className="training-stages">
                      <SelectionCard title="데이터">
                        <Select
                          label="학습 데이터셋"
                          value={currentDataset?.id || ""}
                          onChange={setDatasetId}
                        >
                          {datasetOptions}
                        </Select>
                        <div className="callout">
                          학습 데이터 {num(currentDataset?.splits.train || 0)}개
                        </div>
                      </SelectionCard>
                      <SelectionCard title="모델">
                        <ModelPicker
                          label="시작 모델"
                          value={selectedModel?.id || ""}
                          onChange={setModelId}
                          options={modelOptions}
                        />
                        {modelDatasetNotice}
                        <label className="field">
                          학습 유형
                          <select defaultValue="lora">
                            <option value="lora">LoRA</option>
                            <option value="full" disabled>
                              Full Finetuning
                            </option>
                            <option value="grpo" disabled>
                              GRPO
                            </option>
                          </select>
                        </label>
                      </SelectionCard>
                    </div>
                  </form>
                  <dialog
                    ref={trainingSettingsRef}
                    className="workspace-dialog training-settings"
                    aria-labelledby="training-settings-title"
                  >
                    <header>
                      <h2 id="training-settings-title">학습 설정</h2>
                      <button
                        type="button"
                        aria-label="학습 설정 닫기"
                        onClick={() => trainingSettingsRef.current?.close()}
                      >
                        <X size={20} />
                      </button>
                    </header>
                    <form
                      className="settings-body"
                      onSubmit={(event) => {
                        event.preventDefault();
                        setSteps(draftTraining.steps);
                        setLr(draftTraining.lr);
                        setSeed(draftTraining.seed);
                        trainingSettingsRef.current?.close();
                      }}
                    >
                      <div className="form-grid">
                        <label className="field">
                          학습 스텝
                          <input
                            type="number"
                            min="1"
                            max="10000"
                            required
                            value={draftTraining.steps}
                            onChange={(e) =>
                              setDraftTraining((v) => ({
                                ...v,
                                steps: +e.target.value,
                              }))
                            }
                          />
                        </label>
                        <label className="field">
                          학습률
                          <input
                            type="number"
                            min="0.000001"
                            max="0.01"
                            step="0.000001"
                            required
                            value={draftTraining.lr}
                            onChange={(e) =>
                              setDraftTraining((v) => ({
                                ...v,
                                lr: +e.target.value,
                              }))
                            }
                          />
                        </label>
                      </div>
                      <label className="field">
                        재현성 시드
                        <input
                          type="number"
                          min="0"
                          required
                          value={draftTraining.seed}
                          onChange={(e) =>
                            setDraftTraining((v) => ({
                              ...v,
                              seed: +e.target.value,
                            }))
                          }
                        />
                      </label>
                      <footer>
                        <button
                          type="button"
                          className="button secondary"
                          onClick={() => trainingSettingsRef.current?.close()}
                        >
                          취소
                        </button>
                        <button className="button">적용</button>
                      </footer>
                    </form>
                  </dialog>
                </div>
              )}
              {section === "model-api" && <ModelApi refreshToken={datasets} />}
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
                      <ModelPicker
                        label="모델"
                        value={selectedModel?.id || ""}
                        onChange={setModelId}
                        options={modelOptions}
                      />
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
                      <button
                        className="button"
                        disabled={
                          busy ||
                          !currentDataset ||
                          !selectedModel ||
                          modelDatasetMismatch ||
                          !currentDataset.splits[evalSplit]
                        }
                      >
                        평가 시작
                      </button>
                    </form>
                    {modelDatasetNotice}
                    <p className="field-hint">
                      {modelDatasetMismatch
                        ? "평가 데이터의 속성 형식을 확인하세요."
                        : `${evalSplit === "test" ? "테스트" : "검증"} 데이터 ${num(currentDataset?.splits[evalSplit] || 0)}개 전체를 평가합니다. 학습 분할은 평가에 사용하지 않습니다.`}
                    </p>
                  </Panel>
                  {runHeader()}
                  <EvaluationResults activeRun={activeRun} />
                  {runList()}
                </>
              )}
              {section === "monitoring" && detail === "training" && (
                <TrainingMonitor
                  visibleRuns={visibleRuns}
                  datasets={datasets}
                  activeRun={activeRun}
                  logs={logs}
                  header={runHeader()}
                  history={runList()}
                />
              )}
              {section === "monitoring" && detail === "drift" && (
                <DriftWorkspace
                  datasets={datasets}
                  currentDataset={currentDataset}
                  activeRun={activeRun}
                  reference={reference}
                  threshold={threshold}
                  busy={busy}
                  setReference={setReference}
                  setDatasetId={setDatasetId}
                  setThreshold={setThreshold}
                  submit={submit}
                  datasetOptions={datasetOptions}
                  header={runHeader()}
                  history={runList()}
                />
              )}
            </>
          )}
        </main>
      </div>
      {uploadOpen && (
        <ImageUpload
          workspaces={workspaces}
          workspaceId={section === "workspaces" ? workspace?.id : undefined}
          onClose={() => setUploadOpen(false)}
          onComplete={(result) => {
            setUploadOpen(false);
            setDatasetId(result.dataset.id);
            setOffset(0);
            setSplit("");
            setSearch("");
            setNotice(
              result.duplicate
                ? "이미 등록된 이미지입니다."
                : `${result.added_count ?? result.dataset.count}개 이미지를 추가했습니다.${result.skipped_duplicates ? ` 중복 이미지 ${result.skipped_duplicates}개는 제외했습니다.` : ""} 자동 레이블링에서 모델을 선택하세요.`,
            );
            void refresh().catch(() =>
              setError(
                "업로드는 완료됐으나 목록 갱신에 실패했습니다. 새로고침하세요.",
              ),
            );
            router.push("/ko/workspaces/" + result.dataset.workspace_id);
          }}
        />
      )}
      {labelingDataset && (
        <AutoLabelDialog
          dataset={labelingDataset}
          initialModelId={
            workspaces.find((w) => w.id === labelingDataset.workspace_id)
              ?.labeling_model_id || ""
          }
          onClose={() => setLabelingDataset(null)}
          onStarted={(jobId) => {
            setLabelingDataset(null);
            setSelectedRun(jobId);
            setNotice(
              "자동 레이블링을 접수했습니다. 완료 후 레이블 결과 보기에서 확인하세요.",
            );
            void refresh().catch(() =>
              setError("작업은 접수됐으나 목록 갱신에 실패했습니다."),
            );
          }}
        />
      )}
      {deleteTarget && (
        <DeleteDialog
          target={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={(result) => {
            const wasWorkspace = deleteTarget.kind === "workspace";
            setDeleteTarget(null);
            setSelectedSamples([]);
            setSample(null);
            setOffset(0);
            setDatasetId(result.dataset?.id || "");
            void act(async () => {}, "삭제했습니다.");
            if (wasWorkspace) router.push("/ko/workspaces");
          }}
        />
      )}
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
                      labeling_model_id: workspaceLabelModel || null,
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
                레이블링 모델
                <select
                  value={workspaceLabelModel}
                  onChange={(e) => setWorkspaceLabelModel(e.target.value)}
                  disabled={labelModelsLoading}
                >
                  <option value="">
                    {labelModelsLoading ? "모델 불러오는 중" : "미설정"}
                  </option>
                  {workspaceLabelModel &&
                    !labelModels.some((m) => m.id === workspaceLabelModel) && (
                      <option value={workspaceLabelModel}>
                        {workspaces.find((w) => w.id === editWorkspaceId)
                          ?.labeling_model_name || workspaceLabelModel}{" "}
                        (현재 설정)
                      </option>
                    )}
                  {labelModels.map((m) => (
                    <option
                      key={m.id}
                      value={m.id}
                      disabled={!m.available || m.status !== "ready"}
                    >
                      {displayName(m.name)}
                      {!m.available
                        ? " / 파일 없음"
                        : m.status !== "ready"
                          ? " / 보관됨"
                          : ""}
                    </option>
                  ))}
                </select>
              </label>
              {labelModelsError && (
                <p role="alert" className="error-text">
                  {labelModelsError}
                </p>
              )}
              <label className="field">
                작업 유형
                <div>
                  <Badge>속성추출</Badge>
                </div>
              </label>
              <button className="button" disabled={busy || labelModelsLoading}>
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
          position={Math.max(0, editorIds.indexOf(sample.id))}
          total={editorIds.length || samples.total}
          navigationBusy={editorLoading}
          navigationError={editorError}
          onClose={closeSample}
          onMove={moveSample}
          onSaved={(version, updated, message) => {
            setDatasets((current) => [
              version,
              ...current.filter((d) => d.workspace_id !== version.workspace_id),
            ]);
            setEditingDataset(version);
            setDatasetId(version.id);
            setSample(updated);
            setNotice(message || "레이블을 저장했습니다.");
          }}
        />
      )}
    </div>
  );
}
