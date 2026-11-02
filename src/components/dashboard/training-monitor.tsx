import { RunElapsed } from "@/components/run-elapsed";
import { JOB_PHASE_LABELS as phases } from "@/lib/platform-display";
import type { Dataset, Run } from "@/lib/platform-types";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Chart, Panel, Stat } from "./primitives";

type Props = {
  datasets: Dataset[];
  visibleRuns: Run[];
  activeRun?: Run;
  logs: string;
  header: ReactNode;
  history: ReactNode;
};
export function TrainingMonitor({
  datasets,
  visibleRuns,
  activeRun,
  logs,
  header,
  history,
}: Props) {
  return (
    <>
      <div className="stats">
        <Stat
          label="진행 중"
          value={visibleRuns.filter((j) => j.status === "running").length}
        />
        <Stat
          label="대기 중"
          value={visibleRuns.filter((j) => j.status === "queued").length}
        />
        <Stat
          label="완료"
          value={visibleRuns.filter((j) => j.status === "succeeded").length}
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
      {header}
      {activeRun && (
        <>
          <div className="two-col">
            <Panel
              title={
                activeRun.request.kind === "labeling"
                  ? "자동 레이블링"
                  : "학습 진행"
              }
            >
              <progress
                value={activeRun.progress.step || 0}
                max={activeRun.progress.total || activeRun.request.max_steps}
              />
              <p>
                {activeRun.progress.step || 0} /{" "}
                {activeRun.progress.total || activeRun.request.max_steps}{" "}
                {activeRun.request.kind === "labeling" ? "이미지" : "스텝"}
              </p>
              <div className="details">
                <span>현재 손실</span>
                <strong>{activeRun.progress.loss?.toFixed(4) || "—"}</strong>
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
                <span>실행 단계</span>
                <strong>
                  {phases[activeRun.progress.phase || "queued"] ||
                    activeRun.progress.phase}
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
                    datasets.find((d) => d.id === activeRun.result?.dataset_id)
                      ?.workspace_id
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
          <details className="help-details">
            <summary>실행 로그</summary>
            <pre className="logs">{logs || "아직 기록된 로그가 없습니다."}</pre>
          </details>
        </>
      )}
      {history}
    </>
  );
}
