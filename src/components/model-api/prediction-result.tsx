import { labels, states } from "@/lib/model-api-display";
import type { Prediction } from "@/lib/model-api-types";
export function PredictionResult({ result }: { result: Prediction }) {
  return (
    <section
      className="panel api-content prediction-result"
      aria-label="요청 결과"
      aria-live="polite"
    >
      <h3>요청 결과</h3>
      <h4>
        {result.progress?.phase === "loading" && result.status === "running"
          ? "모델 불러오는 중"
          : states[result.status]}
      </h4>
      <p className="muted">
        요청 {result.id}
        {result.status === "queued" && result.queue_position
          ? ` / 대기열 ${result.queue_position}번째`
          : ""}
      </p>
      {result.error && <p role="alert">{result.error}</p>}
      {result.result && (
        <>
          <p>
            상품 카테고리:{" "}
            {result.result.category ?? result.category ?? "판별하지 못함"}
          </p>
          <p>
            처리 시간 {result.result.processing_seconds.toFixed(1)}초 (모델 로딩
            포함, 큐 대기 제외)
          </p>
          {(!result.result.schema_valid || !result.result.parse_valid) && (
            <p role="alert">
              출력 형식이 올바르지 않아 결과 검토가 필요합니다.
            </p>
          )}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>속성</th>
                  <th>결과</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(result.result.attributes).map(([k, v]) => (
                  <tr key={k}>
                    <td>{labels[k] || k}</td>
                    <td>
                      {result.result!.excluded_attributes.includes(k)
                        ? "판정 제외"
                        : Array.isArray(v)
                          ? v.join(", ")
                          : v}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details className="help-details">
            <summary>JSON 응답</summary>
            <pre className="api-code">{JSON.stringify(result, null, 2)}</pre>
          </details>
        </>
      )}
    </section>
  );
}
