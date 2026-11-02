import { DriftResults } from "@/components/drift-results";
import { RelabelReport } from "@/components/relabel-report";
import type { DriftField } from "@/lib/drift-types";
import { ATTRIBUTE_LABELS as names } from "@/lib/platform-display";
import type { Dataset, Run } from "@/lib/platform-types";
import { displayName } from "@/lib/utils";
import type { ReactNode } from "react";
import { Select } from "./primitives";

type Props = {
  datasets: Dataset[];
  currentDataset?: Dataset;
  activeRun?: Run;
  reference: string;
  threshold: number;
  busy: boolean;
  setReference: (value: string) => void;
  setDatasetId: (value: string) => void;
  setThreshold: (value: number) => void;
  submit: (kind: string) => Promise<void>;
  datasetOptions: ReactNode;
  header: ReactNode;
  history: ReactNode;
};
export function DriftWorkspace({
  datasets,
  currentDataset,
  activeRun,
  reference,
  threshold,
  busy,
  setReference,
  setDatasetId,
  setThreshold,
  submit,
  datasetOptions,
  header,
  history,
}: Props) {
  return (
    <>
      {!activeRun?.result && header}
      {activeRun?.result && (
        <DriftResults
          analysis={activeRun.result}
          fields={(activeRun.result.fields as DriftField[]) || []}
          threshold={activeRun.result.threshold}
          referenceCount={activeRun.result.reference_count}
          currentCount={activeRun.result.current_count}
          imageJs={activeRun.result.image_histogram_js}
          names={names}
          currentWorkspace={activeRun.dataset_workspace_id}
          referenceWorkspace={activeRun.reference_workspace_id}
          referenceName={displayName(
            activeRun.reference_name ||
              datasets.find((d) => d.id === activeRun.request.reference_id)
                ?.name ||
              "기준 데이터",
          )}
          currentName={displayName(
            activeRun.dataset_name ||
              datasets.find((d) => d.id === activeRun.request.dataset_id)
                ?.name ||
              "비교 데이터",
          )}
          analyzedAt={
            activeRun.finished_at ||
            activeRun.started_at ||
            activeRun.created_at
          }
          runId={activeRun.id}
        />
      )}
      {activeRun?.error && <div className="alert error">{activeRun.error}</div>}
      <details
        className="drift-settings-section"
        key={activeRun?.id || "new-comparison"}
        open={!activeRun?.result}
      >
        <summary>{activeRun?.result ? "새 비교 실행" : "비교 설정"}</summary>
        <form
          className="drift-comparison-form"
          onSubmit={(e) => {
            e.preventDefault();
            submit("drift");
          }}
        >
          <Select
            label="기준 데이터셋"
            value={
              reference ||
              datasets.find((d) => d.id !== currentDataset?.id)?.id ||
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
          <button className="button" disabled={busy || datasets.length < 2}>
            탐지 실행
          </button>
          <details className="drift-advanced-options">
            <summary>분석 옵션</summary>
            <label className="field">
              속성 변화 기준 (JS)
              <input
                type="number"
                min="0.001"
                max="1"
                step="0.001"
                value={threshold}
                onChange={(e) => setThreshold(+e.target.value)}
              />
            </label>
            <p className="field-hint">
              속성과 카테고리 분포, 이미지 특징을 함께 비교합니다.
            </p>
          </details>
        </form>
      </details>
      <details className="drift-history-section">
        <summary>이전 분석 보기</summary>
        {history}
      </details>
      <RelabelReport />
    </>
  );
}
