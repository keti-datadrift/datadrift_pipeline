"use client";
import { EndpointRegistry } from "@/components/model-api/endpoint-registry";
import { PredictionHistory } from "@/components/model-api/prediction-history";
import { PredictionResult } from "@/components/model-api/prediction-result";
import { jsonRequest as json, requestJson as request } from "@/lib/api-client";
import { active, runtimeLabel } from "@/lib/model-api-display";
import type { Endpoint, Model, Prediction } from "@/lib/model-api-types";
import { displayName } from "@/lib/utils";
import { useCallback, useEffect, useRef, useState } from "react";

export function ModelApi({ refreshToken }: { refreshToken?: unknown }) {
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [selected, setSelected] = useState("");
  const [model, setModel] = useState("");
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [draggingImage, setDraggingImage] = useState(false);
  const [history, setHistory] = useState<Prediction[]>([]);
  const [historyPage, setHistoryPage] = useState(0);
  const [historyShownPage, setHistoryShownPage] = useState(0);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [historyError, setHistoryError] = useState("");
  function changeHistoryPage(page: number) {
    setHistoryPage(page);
    setHistoryRefresh((n) => n + 1);
  }
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [result, setResult] = useState<Prediction | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [origin, setOrigin] = useState("");
  const endpoint = endpoints.find((e) => e.id === selected) || endpoints[0];
  const reload = useCallback(async () => {
    const [e, m] = await Promise.all([
      request<Endpoint[]>("/api/model-endpoints"),
      request<Model[]>("/api/models"),
    ]);
    setEndpoints(e);
    setModels(
      m.filter(
        (v) =>
          v.available &&
          v.status === "ready" &&
          (v.kind === "base" || v.schema_id?.startsWith("bkave-")),
      ),
    );
  }, []);
  useEffect(() => {
    setOrigin(window.location.origin);
    reload()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [reload, refreshToken]);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const values = await request<Endpoint[]>("/api/model-endpoints");
        if (alive) setEndpoints(values);
      } catch {
        // The next poll retries; initial load and user actions report errors.
      }
      if (alive) timer = setTimeout(poll, 2000);
    }
    timer = setTimeout(poll, 2000);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);
  useEffect(() => {
    setResult(null);
    setHistory([]);
    setFile(null);
    setDraggingImage(false);
    setHistoryPage(0);
    setHistoryShownPage(0);
    setHistoryError("");
    setHistoryTotal(0);
  }, [endpoint?.id]);
  useEffect(() => {
    if (!endpoint) return;
    setHistoryLoading(true);
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const page = await request<{ items: Prediction[]; total: number }>(
          `/api/model-endpoints/${endpoint!.id}/predictions?paginated=true&offset=${historyPage * 10}&limit=10`,
        );
        if (alive) {
          if (historyPage * 10 >= page.total && historyPage > 0) {
            setHistoryPage(Math.max(0, Math.ceil(page.total / 10) - 1));
            return;
          }
          const values = page.items;
          setHistory(values);
          setHistoryShownPage(historyPage);
          setHistoryError("");
          setHistoryTotal(page.total);
          setHistoryLoading(false);
          setResult((current) =>
            current ? values.find((v) => v.id === current.id) || current : null,
          );
        }
      } catch (e) {
        if (alive) {
          setHistoryError((e as Error).message);
          setHistoryLoading(false);
        }
      }
      if (alive) timer = setTimeout(poll, 2500);
    }
    poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [endpoint?.id, historyPage, historyRefresh]);
  useEffect(() => {
    if (!result || !active(result)) return;
    let alive = true;
    const timer = setInterval(() => {
      request<Prediction>(result.result_url)
        .then((updated) => {
          if (alive) setResult(updated);
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    }, 2500);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [result?.id, result?.status]);
  async function perform(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function chooseImage(files: FileList | null) {
    if (!files?.length || busy) return;
    if (files.length !== 1) {
      setError("이미지를 한 장만 선택하세요.");
      return;
    }
    const image = files[0];
    if (!/\.(jpe?g|png|webp)$/i.test(image.name)) {
      setError("JPEG, PNG, WebP 이미지를 선택하세요.");
      return;
    }
    if (image.size > 20 * 1024 * 1024) {
      setError("이미지는 20MB 이내로 선택하세요.");
      return;
    }
    setFile(image);
    setError("");
  }
  async function createEndpoint() {
    await perform(async () => {
      const created = await request<Endpoint>(
        "/api/model-endpoints",
        json("POST", { name, model_id: model || models[0]?.id }),
      );
      await reload();
      setSelected(created.id);
      setCreating(false);
      setName("");
    });
  }
  async function toggleEndpoint(value: Endpoint) {
    await perform(async () => {
      await request(
        `/api/model-endpoints/${value.id}`,
        json("PATCH", { enabled: !value.enabled }),
      );
      await reload();
    });
  }
  async function cancelPrediction(value: Prediction) {
    await perform(async () => {
      await request(`/api/jobs/${value.id}/cancel`, { method: "POST" });
      const updated = await request<Prediction>(value.result_url);
      setHistory((items) =>
        items.map((item) => (item.id === value.id ? updated : item)),
      );
      setResult((item) => (item?.id === value.id ? updated : item));
    });
  }
  const url = origin + (endpoint?.path || "");
  const statusUrl =
    origin +
    (endpoint?.status_url || `/api/model-endpoints/${endpoint?.id}/status`);
  return (
    <div className="model-api">
      {error && (
        <div role="alert" className="alert error">
          {error}
        </div>
      )}
      <EndpointRegistry
        endpoints={endpoints}
        models={models}
        selectedId={endpoint?.id}
        loading={loading}
        busy={busy}
        creating={creating}
        setCreating={setCreating}
        name={name}
        setName={setName}
        model={model}
        setModel={setModel}
        onCreate={createEndpoint}
        onToggle={toggleEndpoint}
        onSelect={(id) => {
          setSelected(id);
          setError("");
        }}
      />
      {endpoint && (
        <section
          className="api-workspace"
          aria-labelledby="selected-api-heading"
        >
          <header className="api-workspace-heading">
            <div>
              <p className="api-section-label">선택한 API</p>
              <h2 id="selected-api-heading">{endpoint.name}</h2>
              <p className="muted">{displayName(endpoint.model_name)}</p>
            </div>
            <p className="api-reception-state">
              {!endpoint.available
                ? "모델 파일 확인 필요"
                : endpoint.enabled
                  ? "신규 요청 접수 중"
                  : "신규 요청 접수 중지"}
            </p>
          </header>
          {endpoint.runtime && (
            <div className="api-runtime-state" role="status" aria-live="polite">
              <p>{runtimeLabel(endpoint)}</p>
              {endpoint.runtime.shared && (
                <p className="muted">
                  같은 기본 모델을 쓰는 다른 API가 접수 중이어서 서버를
                  유지합니다.
                </p>
              )}
              {endpoint.runtime.state === "starting" && (
                <p className="muted">
                  서버 준비가 끝나면 대기 중인 요청을 처리합니다. 첫 기동에는 수
                  분이 걸릴 수 있습니다.
                </p>
              )}
              {endpoint.runtime.state === "waiting" && (
                <p className="muted">
                  서버 종료 또는 다른 모델의 로딩이 끝나면 시작합니다.
                </p>
              )}
              {endpoint.runtime.error && (
                <p role="alert">{endpoint.runtime.error}</p>
              )}
            </div>
          )}
          <div className="api-detail-grid">
            <section className="panel api-content">
              <h3>연결 정보</h3>
              {!endpoint.available && (
                <p role="alert">{endpoint.unavailable_reason}</p>
              )}
              <label className="field">
                요청 주소
                <input
                  readOnly
                  value={url}
                  onFocus={(e) => e.target.select()}
                />
              </label>
              <details className="help-details">
                <summary>호출 방법</summary>
                <div className="api-help-heading">
                  <a href="/api/docs" target="_blank" rel="noopener noreferrer">
                    전체 API 문서 보기 ↗
                  </a>
                </div>
                <ol className="api-call-steps">
                  <li>
                    <p>상태 확인</p>
                    <pre className="api-code">{`curl '${statusUrl}'`}</pre>
                    <p className="muted">
                      <code>accepting_requests</code>: 접수 여부 /{" "}
                      <code>ready</code>: 준비 여부
                    </p>
                  </li>
                  <li>
                    <p>이미지 전송 및 결과 받기</p>
                    <pre className="api-code">{`curl '${url}?wait=true' -F 'file=@product.jpg'`}</pre>
                    <p className="muted">
                      완료되면 <code>result</code>를 받습니다. 2분을 넘으면
                      응답의 <code>result_url</code>로 조회하세요.
                    </p>
                  </li>
                </ol>
              </details>
            </section>
            <section className="panel api-content">
              <h3>요청 테스트</h3>
              <form
                className="api-create"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!file) return;
                  perform(async () => {
                    const body = new FormData();
                    body.append("file", file);
                    const prediction = await request<Prediction>(
                      endpoint.path,
                      { method: "POST", body },
                    );
                    setResult(prediction);
                    setHistoryPage(0);
                    setHistoryShownPage(0);
                    setHistoryTotal((n) => n + 1);
                    setHistory((h) =>
                      historyPage === 0
                        ? [
                            prediction,
                            ...h.filter((v) => v.id !== prediction.id),
                          ].slice(0, 10)
                        : [prediction],
                    );
                  });
                }}
              >
                <div className="field">
                  <span>이미지</span>
                  <div>
                    <button
                      type="button"
                      className={`api-image-dropzone${draggingImage ? " is-dragging" : ""}`}
                      aria-label="이미지 선택"
                      aria-describedby="api-image-selection"
                      disabled={busy}
                      onClick={() => fileInput.current?.click()}
                      onDragOver={(event) => {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "copy";
                        if (!busy) setDraggingImage(true);
                      }}
                      onDragLeave={(event) => {
                        if (
                          !event.currentTarget.contains(
                            event.relatedTarget as Node,
                          )
                        )
                          setDraggingImage(false);
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        setDraggingImage(false);
                        chooseImage(event.dataTransfer.files);
                      }}
                    >
                      <span id="api-image-selection">
                        {file?.name || "이미지를 놓거나 클릭해서 선택"}
                      </span>
                      <small>
                        {file
                          ? "클릭하거나 새 이미지로 변경"
                          : "JPEG / PNG / WebP, 최대 20MB"}
                      </small>
                    </button>
                    <input
                      ref={fileInput}
                      id="api-image"
                      aria-label="이미지"
                      hidden
                      key={endpoint.id}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => {
                        chooseImage(e.target.files);
                        e.currentTarget.value = "";
                      }}
                    />
                  </div>
                </div>
                <button
                  className="button"
                  disabled={
                    busy || !file || !endpoint.enabled || !endpoint.available
                  }
                >
                  요청 보내기
                </button>
              </form>
            </section>
          </div>
          {result && <PredictionResult result={result} />}
          <PredictionHistory
            history={history}
            historyTotal={historyTotal}
            historyLoading={historyLoading}
            historyShownPage={historyShownPage}
            historyPage={historyPage}
            historyError={historyError}
            busy={busy}
            onSelect={setResult}
            onCancel={cancelPrediction}
            changeHistoryPage={changeHistoryPage}
          />
        </section>
      )}
    </div>
  );
}
