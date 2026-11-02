import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import { num, reconstructionCount } from "@/lib/platform-display";
import type { Dataset } from "@/lib/platform-types";
import { displayName } from "@/lib/utils";
import { useRouter } from "next/navigation";
import type { Dispatch, SetStateAction } from "react";
import { Empty, Panel, Select, Stat } from "./primitives";

type Setter<T> = Dispatch<SetStateAction<T>>;
type Request = {
  name: string;
  dataset_ids: string[];
  data_count?: number;
  reference_id?: string;
  dataset_weights?: Record<string, number>;
  method: string;
  seed: number;
};
type Props = {
  act: (fn: () => Promise<unknown>, message?: string) => Promise<void>;
  bodyRecon: () => Request;
  name: string;
  setName: Setter<string>;
  preview: Dataset | null;
  setPreview: Setter<Dataset | null>;
  datasets: Dataset[];
  parentIds: string[];
  setParentIds: Setter<string[]>;
  setMixWeights: Setter<Record<string, number>>;
  reconstructionName: (data: { workspace_id: string; name: string }) => string;
  method: string;
  setMethod: Setter<string>;
  reconstructionSources: Dataset[];
  busy: boolean;
  reconstructionWeights: Record<string, number>;
  changeMixWeight: (id: string, value: number) => void;
  reconstructionReferenceId: string;
  setReconstructionReference: Setter<string>;
  reconstructionAvailable: number;
  budget: number;
  setBudget: Setter<number>;
  seed: number;
  setSeed: Setter<number>;
};

export function ReconstructionWorkspace({
  act,
  bodyRecon,
  name,
  setName,
  preview,
  setPreview,
  datasets,
  parentIds,
  setParentIds,
  setMixWeights,
  reconstructionName,
  method,
  setMethod,
  reconstructionSources,
  busy,
  reconstructionWeights,
  changeMixWeight,
  reconstructionReferenceId,
  setReconstructionReference,
  reconstructionAvailable,
  budget,
  setBudget,
  seed,
  setSeed,
}: Props) {
  const router = useRouter();
  return (
    <div className="two-col">
      <Panel title="원본 및 저장 위치">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            act(async () => {
              const d = await api<Dataset>("/reconstructions", bodyRecon());
              router.push("/ko/workspaces/" + d.workspace_id);
            }, "새 워크스페이스에 데이터를 저장했습니다.");
          }}
        >
          <label className="field">
            저장할 워크스페이스 이름
            <Input
              required
              maxLength={100}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setPreview(null);
              }}
              placeholder="예: 패션 속성 학습 데이터"
            />
          </label>
          <fieldset>
            <legend>원본 워크스페이스</legend>
            <p className="field-hint">
              학습 데이터와 미지정 데이터를 사용하며, 검증 및 테스트는
              제외합니다.
            </p>
            {datasets.map((d) => (
              <label className="check-row" key={d.id}>
                <input
                  type="checkbox"
                  checked={parentIds.includes(d.id)}
                  disabled={!reconstructionCount(d)}
                  onChange={(e) => {
                    const ids = parentIds;
                    setParentIds(
                      e.target.checked
                        ? [...ids, d.id]
                        : ids.filter((id) => id !== d.id),
                    );
                    setMixWeights({});
                    setPreview(null);
                  }}
                />
                {reconstructionName(d)}
                <small>데이터 {num(reconstructionCount(d))}개</small>
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
            <option value="balanced_mix">균형 혼합</option>
            <option value="merge">전체 합치기</option>
            <option value="random">무작위 선별</option>
            <option value="source_balanced">출처 균형 선별</option>
            <option value="distribution">기준 분포 맞추기</option>
          </Select>
          {method === "balanced_mix" && reconstructionSources.length > 0 && (
            <fieldset className="mix-weights">
              <legend>혼합 비율</legend>
              <p className="field-hint">
                원본별 비율과 속성 분포를 함께 반영합니다.
              </p>
              {reconstructionSources.map((d) => (
                <label className="mix-weight" key={d.id}>
                  <span>{reconstructionName(d)}</span>
                  <span className="mix-weight-input">
                    <input
                      type="number"
                      aria-label={`${reconstructionName(d)} 혼합 비율`}
                      min="0"
                      max="100"
                      step="0.01"
                      disabled={busy || reconstructionSources.length === 1}
                      value={reconstructionWeights[d.id]}
                      onChange={(e) => changeMixWeight(d.id, +e.target.value)}
                    />
                    %
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          {method === "distribution" && (
            <Select
              label="분포 기준 워크스페이스"
              value={reconstructionReferenceId}
              onChange={(id) => {
                setReconstructionReference(id);
                setPreview(null);
              }}
            >
              {reconstructionSources.map((d) => (
                <option key={d.id} value={d.id}>
                  {displayName(d.name)}
                </option>
              ))}
            </Select>
          )}
          <div className="form-grid">
            <label className="field">
              데이터 수
              {method === "merge" ? (
                <input
                  readOnly
                  value={
                    preview
                      ? `${num(preview.count)}개`
                      : "전체 데이터 (중복 제외)"
                  }
                />
              ) : (
                <input
                  type="number"
                  required
                  min="1"
                  max={Math.min(100000, reconstructionAvailable)}
                  value={budget}
                  onChange={(e) => {
                    setBudget(+e.target.value);
                    setPreview(null);
                  }}
                />
              )}
            </label>
            <label className="field">
              시드
              <input
                type="number"
                min="0"
                max="2147483647"
                disabled={method === "merge"}
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
              disabled={busy || !parentIds.length || !name.trim()}
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
              disabled={busy || !parentIds.length || !name.trim()}
            >
              워크스페이스 생성
            </button>
          </div>
        </form>
      </Panel>
      <Panel title="미리보기">
        {preview ? (
          <>
            <div className="stats compact">
              <Stat label="데이터 수" value={num(preview.count)} />
              <Stat
                label="원본 워크스페이스"
                value={preview.parent_ids.length}
              />
              <Stat
                label="중복 제외"
                value={preview.selection?.duplicate_count || 0}
              />
            </div>
            {preview.selection?.mix ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>워크스페이스</th>
                      <th>목표 비율</th>
                      <th>실제 비율</th>
                      <th>데이터 수</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.selection.mix.map((m) => (
                      <tr key={m.dataset_id}>
                        <td>{reconstructionName(m)}</td>
                        <td>{(m.target_ratio * 100).toFixed(1)}%</td>
                        <td>{(m.actual_ratio * 100).toFixed(1)}%</td>
                        <td>{num(m.selected_count)}개</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              preview.selection?.by_source && (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>출처</th>
                        <th>데이터 수</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(preview.selection.by_source).map(
                        ([source, count]) => (
                          <tr key={source}>
                            <td>
                              {source === "musinsa"
                                ? "무신사"
                                : source === "gsshop"
                                  ? "GS SHOP"
                                  : displayName(
                                      datasets.find(
                                        (d) => d.workspace_id === source,
                                      )?.name,
                                    ) || source}
                            </td>
                            <td>{num(count)}개</td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
              )
            )}
            {preview.selection?.after_js != null && (
              <div className="reconstruction-distribution">
                <p>
                  {preview.selection.mix
                    ? "혼합 목표 분포"
                    : `분포 기준: ${displayName(preview.selection.reference_name)}`}
                </p>
                <dl className="details">
                  <span>선별 전 분포 차이</span>
                  <strong>{preview.selection.before_js?.toFixed(4)}</strong>
                  <span>선별 후 분포 차이</span>
                  <strong>{preview.selection.after_js.toFixed(4)}</strong>
                </dl>
              </div>
            )}
          </>
        ) : (
          <Empty>설정을 선택하고 미리보기를 실행하세요.</Empty>
        )}
      </Panel>
    </div>
  );
}
