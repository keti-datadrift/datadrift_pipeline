import { runtimeLabel } from "@/lib/model-api-display";
import type { Endpoint, Model } from "@/lib/model-api-types";
import { displayName } from "@/lib/utils";
type Props = {
  endpoints: Endpoint[];
  models: Model[];
  selectedId?: string;
  loading: boolean;
  busy: boolean;
  creating: boolean;
  setCreating: (fn: (value: boolean) => boolean) => void;
  name: string;
  setName: (value: string) => void;
  model: string;
  setModel: (value: string) => void;
  onCreate: () => Promise<void>;
  onToggle: (endpoint: Endpoint) => Promise<void>;
  onSelect: (id: string) => void;
};
export function EndpointRegistry({
  endpoints,
  models,
  selectedId,
  loading,
  busy,
  creating,
  setCreating,
  name,
  setName,
  model,
  setModel,
  onCreate,
  onToggle,
  onSelect,
}: Props) {
  return (
    <section
      className="api-registration"
      aria-labelledby="registered-api-heading"
    >
      <div className="panel-heading">
        <h2 id="registered-api-heading">등록된 API</h2>
        <button className="button" onClick={() => setCreating((v) => !v)}>
          {creating ? "닫기" : "API 등록"}
        </button>
      </div>
      {creating && (
        <form
          className="api-create"
          onSubmit={(e) => {
            e.preventDefault();
            void onCreate();
          }}
        >
          <label className="field">
            API 이름
            <input
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 상품 속성 추출"
            />
          </label>
          <label className="field">
            모델
            <select
              value={model || models[0]?.id || ""}
              onChange={(e) => setModel(e.target.value)}
              required
            >
              {!models.length && (
                <option value="">사용 가능한 모델 없음</option>
              )}
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {displayName(m.name)}
                </option>
              ))}
            </select>
          </label>
          <button className="button" disabled={busy || !models.length}>
            등록
          </button>
        </form>
      )}
      {!endpoints.length && (
        <p className="empty">
          {loading ? "불러오는 중" : "등록된 API가 없습니다."}
        </p>
      )}
      <div role="group" aria-label="API 모델 선택" className="endpoint-grid">
        {endpoints.map((e) => (
          <article
            key={e.id}
            className={`endpoint-card ${selectedId === e.id ? "selected" : ""}`}
          >
            <button
              type="button"
              className="endpoint-select"
              aria-pressed={selectedId === e.id}
              onClick={() => {
                onSelect(e.id);
              }}
            >
              <strong>{e.name}</strong>
              <span>{displayName(e.model_name)}</span>
              {e.runtime && <small>{runtimeLabel(e)}</small>}
              <small className="endpoint-selection">
                {selectedId === e.id ? "선택됨" : "선택"}
              </small>
            </button>
            <footer>
              <span>
                {!e.available
                  ? "모델 파일 확인 필요"
                  : e.enabled
                    ? "신규 접수 중"
                    : "신규 접수 중지"}
              </span>
              <button
                className="button secondary"
                disabled={busy || (!e.enabled && !e.available)}
                onClick={() => onToggle(e)}
              >
                {e.enabled ? "접수 중지" : "접수 시작"}
              </button>
            </footer>
          </article>
        ))}
      </div>
    </section>
  );
}
