import { PaginatedContent } from "@/components/paginated-content";
import { RunElapsed } from "@/components/run-elapsed";
import {
  ATTRIBUTE_LABELS as names,
  pct,
  runState,
} from "@/lib/platform-display";
import type { Run } from "@/lib/platform-types";
import { Badge, Panel, Stat } from "./primitives";

export function EvaluationResults({ activeRun }: { activeRun?: Run }) {
  return (
    <>
      {activeRun?.result?.count ? (
        <>
          <div className="stats">
            <Stat label="평가 샘플" value={activeRun.result.count} />
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

          <Panel title="속성별 평가">
            {Object.entries(activeRun.result.fields || {}).map(
              ([key, value]) => (
                <div className="metric-row" key={key}>
                  <span>{names[key] || key}</span>
                  <div className="bar">
                    <i
                      style={{
                        width:
                          value.accuracy == null ? "0%" : pct(value.accuracy),
                      }}
                    />
                  </div>
                  <strong>{pct(value.accuracy)}</strong>
                  <small>{value.count}개</small>
                </div>
              ),
            )}
          </Panel>
          <details className="evaluation-results panel">
            <summary>
              이미지별 결과{" "}
              <span>{activeRun.result.predictions?.length || 0}개</span>
            </summary>
            <PaginatedContent
              key={activeRun.id}
              items={activeRun.result.predictions || []}
              label="평가 결과"
              layout="results"
            >
              {(pagePredictions, offset) => (
                <div className="evaluation-results-list">
                  {pagePredictions.map((p, index) => (
                    <details key={p.sample_id}>
                      <summary>
                        <span>이미지 {offset + index + 1}</span>{" "}
                        <Badge>
                          {p.prediction
                            ? p.schema_valid
                              ? "형식 정상"
                              : "형식 오류"
                            : "파싱 실패"}
                        </Badge>
                      </summary>
                      <div className="prediction evaluation-prediction">
                        <a
                          className="prediction-image"
                          href={`/api/datasets/${activeRun.request.dataset_id}/images/${encodeURIComponent(p.sample_id)}`}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`평가 이미지 ${offset + index + 1} 크게 보기`}
                        >
                          <img
                            src={`/api/datasets/${activeRun.request.dataset_id}/images/${encodeURIComponent(p.sample_id)}`}
                            alt={`평가 이미지 ${offset + index + 1}`}
                            loading="lazy"
                          />
                          <span>이미지 크게 보기</span>
                        </a>
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
                </div>
              )}
            </PaginatedContent>
          </details>
        </>
      ) : (
        activeRun && (
          <Panel title="평가 상태">
            <p role="status" data-testid="evaluation-phase">
              {activeRun.error || runState(activeRun)}
            </p>
            <progress
              aria-label="평가 진행률"
              value={
                activeRun.status === "running" &&
                !["evaluating", "completed"].includes(
                  activeRun.progress.phase || "",
                )
                  ? undefined
                  : activeRun.progress.step || 0
              }
              max={activeRun.progress.total || 1}
            />
            <p className="muted">
              {activeRun.progress.step || 0} / {activeRun.progress.total || "—"}
              개
            </p>
            <div className="details">
              {activeRun.progress.batch_size && (
                <>
                  <span>배치 크기</span>
                  <strong>{activeRun.progress.batch_size}장</strong>
                </>
              )}
              <span>경과 시간</span>
              <strong>
                <RunElapsed
                  key={activeRun.id}
                  status={activeRun.status}
                  startedAt={activeRun.started_at}
                  finishedAt={activeRun.finished_at}
                  elapsedSeconds={activeRun.progress.elapsed_seconds}
                />
              </strong>
            </div>
          </Panel>
        )
      )}
    </>
  );
}
