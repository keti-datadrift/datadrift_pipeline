"use client";
import { CompositeSummary, LegacySummary } from "@/components/drift/summary";
import { count, decimal, percent } from "@/lib/drift-display";

import { Card, CardContent } from "@/components/ui/card";
import { ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";

import type { DriftComposite, DriftField } from "@/lib/drift-types";
export type { DriftComposite, DriftField } from "@/lib/drift-types";

export function DriftResults({
  fields,
  threshold,
  referenceCount,
  currentCount,
  imageJs,
  names,
  currentWorkspace,
  referenceWorkspace,
  analysis,
  referenceName,
  currentName,
  analyzedAt,
  runId,
}: {
  fields: DriftField[];
  threshold?: number;
  referenceCount?: number;
  currentCount?: number;
  imageJs?: number;
  names: Record<string, string>;
  currentWorkspace?: string;
  referenceWorkspace?: string;
  analysis?: DriftComposite;
  referenceName?: string;
  currentName?: string;
  analyzedAt?: string;
  runId?: string;
}) {
  const sorted = [...fields].sort((a, b) => b.js_divergence - a.js_divergence);
  const detected = sorted.filter((field) => field.detected);
  const scale = Math.max(
    0.1,
    Math.ceil(
      Math.max(threshold ?? 0, ...fields.map((field) => field.js_divergence)) *
        10,
    ) / 10,
  );
  const label = (field: string) => names[field] || field;
  const composite = analysis?.method_version === "composite-v1";
  const tested = composite
    ? fields.filter((field) => field.status === "tested")
    : fields;
  return (
    <>
      {composite ? (
        <CompositeSummary
          analysis={analysis}
          threshold={threshold}
          fields={fields}
          names={names}
          context={{
            referenceName,
            currentName,
            referenceCount,
            currentCount,
            analyzedAt,
            runId,
          }}
        />
      ) : (
        <LegacySummary
          analysis={analysis}
          fields={fields}
          imageJs={imageJs}
          threshold={threshold}
          context={{
            referenceName,
            currentName,
            referenceCount,
            currentCount,
            analyzedAt,
            runId,
          }}
        />
      )}
      <details className="drift-results-details drift-distribution-details">
        <summary>속성별 분포 자세히 보기</summary>
        <Card className="panel drift-distributions">
          <div className="panel-heading">
            <h2>속성별 분포</h2>
            <Link
              className="button secondary"
              href={`/ko/reconstruction?sources=${encodeURIComponent([referenceWorkspace, currentWorkspace].filter(Boolean).join(","))}`}
            >
              데이터 재구성
              <ChevronRight size={16} />
            </Link>
          </div>
          <CardContent>
            <section className="drift-overview" aria-label="탐지 결과 요약">
              <div className="drift-verdict">
                <h3>
                  {tested.length
                    ? `${tested.length}개 속성 중 ${detected.length}개 차이 감지`
                    : "비교할 속성이 부족합니다"}
                </h3>
                <p>
                  {detected.length
                    ? detected.map((field) => label(field.field)).join(", ")
                    : composite && !tested.length
                      ? "속성마다 유효 레이블이 각 20개 이상 필요합니다."
                      : fields.length
                        ? composite
                          ? "변화량과 통계검정 기준을 함께 충족한 속성이 없습니다."
                          : "모든 속성이 임계값 미만입니다."
                        : "레이블이 있는 데이터를 선택해 주세요."}
                </p>
              </div>
              <dl className="drift-summary-facts">
                <div>
                  <dt>기준 데이터</dt>
                  <dd>
                    {count(referenceCount)}
                    <small>개</small>
                  </dd>
                </div>
                <div>
                  <dt>비교 데이터</dt>
                  <dd>
                    {count(currentCount)}
                    <small>개</small>
                  </dd>
                </div>
                <div>
                  <dt>판정 임계값</dt>
                  <dd>
                    {threshold ?? "—"}
                    <small>JS</small>
                  </dd>
                </div>
              </dl>
            </section>

            <div className="drift-chart-caption">
              <p>값이 클수록 두 데이터셋의 분포 차이가 큽니다.</p>
              <span>속성을 선택하면 상세 비교</span>
            </div>
            <div className="drift-column-head" aria-hidden="true">
              <span>속성</span>
              <span>분포 차이 (JS)</span>
              <span>JS 값</span>
              <span>판정</span>
              <span />
            </div>
            <div className="drift-scale" aria-hidden="true">
              <span />
              <div>
                <span>0</span>
                <span>임계값 {threshold ?? "—"}</span>
                <span>{scale.toFixed(1)}</span>
              </div>
              <span />
              <span />
              <span />
            </div>
            <div className="drift-field-list">
              {sorted.map((field) => {
                const referenceTotal = Object.values(field.reference).reduce(
                  (sum, value) => sum + value,
                  0,
                );
                const currentTotal = Object.values(field.current).reduce(
                  (sum, value) => sum + value,
                  0,
                );
                const values = Array.from(
                  new Set([
                    ...Object.keys(field.reference),
                    ...Object.keys(field.current),
                  ]),
                );
                values.sort(
                  (a, b) =>
                    Math.abs(
                      percent(field.current[b] || 0, currentTotal) -
                        percent(field.reference[b] || 0, referenceTotal),
                    ) -
                    Math.abs(
                      percent(field.current[a] || 0, currentTotal) -
                        percent(field.reference[a] || 0, referenceTotal),
                    ),
                );
                return (
                  <details
                    key={field.field}
                    className="drift-field"
                    data-field={field.field}
                  >
                    <summary className="metric-row drift-metric-row">
                      <span className="drift-field-name">
                        {label(field.field)}
                      </span>
                      <div className="drift-track" aria-hidden="true">
                        <i
                          className={field.detected ? "detected" : ""}
                          style={{
                            width: `${(field.js_divergence / scale) * 100}%`,
                          }}
                        />
                        {threshold !== undefined && (
                          <b
                            className="drift-threshold"
                            style={{ left: `${(threshold / scale) * 100}%` }}
                          />
                        )}
                      </div>
                      <strong>{field.js_divergence.toFixed(4)}</strong>
                      <span
                        className={`drift-status ${field.detected ? "detected" : ""}`}
                      >
                        {field.status === "insufficient"
                          ? "표본 부족"
                          : field.detected
                            ? "차이 감지"
                            : composite &&
                                field.js_divergence >= (threshold ?? 0)
                              ? "유의성 미충족"
                              : "임계값 미만"}
                      </span>
                      <ChevronDown
                        className="drift-chevron"
                        size={18}
                        aria-hidden="true"
                      />
                    </summary>
                    <div className="distribution-detail">
                      <div className="drift-detail-heading">
                        <h3>{label(field.field)} 상세 비교</h3>
                        <span>
                          유효 레이블: 기준{" "}
                          {count(field.reference_scored ?? referenceTotal)} /{" "}
                          {count(
                            analysis?.analysis_reference_count ??
                              referenceCount,
                          )}
                          개, 비교 {count(field.current_scored ?? currentTotal)}{" "}
                          /{" "}
                          {count(
                            analysis?.analysis_current_count ?? currentCount,
                          )}
                          개
                        </span>
                      </div>
                      <p className="drift-distribution-note">
                        구성비는 각 데이터셋의 속성값 집계 합계 기준입니다. 복수
                        선택 속성은 선택한 값의 조합으로 집계합니다. 이미지
                        확인은 현재 레이블 기준입니다.
                      </p>
                      {values.length ? (
                        <div className="table-wrap">
                          <table className="drift-value-table">
                            <thead>
                              <tr>
                                <th>속성값</th>
                                <th>기준 (건)</th>
                                <th>비교 (건)</th>
                                <th>
                                  <span className="drift-legend reference">
                                    기준
                                  </span>{" "}
                                  /{" "}
                                  <span className="drift-legend current">
                                    비교
                                  </span>{" "}
                                  구성비
                                </th>
                                <th>차이 (%p)</th>
                                {currentWorkspace && <th>이미지</th>}
                              </tr>
                            </thead>
                            <tbody>
                              {values.map((value) => {
                                const reference = percent(
                                  field.reference[value] || 0,
                                  referenceTotal,
                                );
                                const current = percent(
                                  field.current[value] || 0,
                                  currentTotal,
                                );
                                const delta = current - reference;
                                return (
                                  <tr key={value}>
                                    <td>{value}</td>
                                    <td>
                                      {count(field.reference[value] || 0)}
                                    </td>
                                    <td>{count(field.current[value] || 0)}</td>
                                    <td>
                                      <div
                                        className="drift-share"
                                        aria-label={`기준 ${reference.toFixed(1)}%, 비교 ${current.toFixed(1)}%`}
                                      >
                                        <div>
                                          <span>
                                            <i
                                              style={{ width: `${reference}%` }}
                                            />
                                          </span>
                                          <b>{reference.toFixed(1)}%</b>
                                        </div>
                                        <div>
                                          <span>
                                            <i
                                              style={{ width: `${current}%` }}
                                            />
                                          </span>
                                          <b>{current.toFixed(1)}%</b>
                                        </div>
                                      </div>
                                    </td>
                                    <td className="drift-delta">
                                      {delta > 0 ? "+" : ""}
                                      {delta.toFixed(1)}
                                    </td>
                                    {currentWorkspace && (
                                      <td>
                                        {field.current[value] ? (
                                          <Link
                                            className="text-button"
                                            href={`/ko/workspaces/${currentWorkspace}?attribute=${encodeURIComponent(field.field)}&value=${encodeURIComponent(value)}`}
                                          >
                                            현재 이미지 확인
                                          </Link>
                                        ) : (
                                          "—"
                                        )}
                                      </td>
                                    )}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p>집계된 속성값이 없습니다.</p>
                      )}
                      {(field.q_value !== undefined ||
                        field.adjusted_p_value !== undefined) && (
                        <dl className="analysis-facts">
                          {field.adjusted_p_value !== undefined && (
                            <div>
                              <dt>종합 판정 보정 p</dt>
                              <dd>{decimal(field.adjusted_p_value)}</dd>
                            </div>
                          )}
                          {field.category_adjusted_p_value !== undefined && (
                            <div>
                              <dt>카테고리 내 보정 p</dt>
                              <dd>
                                {decimal(field.category_adjusted_p_value)}
                                {field.category_detected
                                  ? " / 변화 감지"
                                  : " / 변화 미감지"}
                              </dd>
                            </div>
                          )}
                          <div>
                            <dt>유효 레이블 (기준 / 비교)</dt>
                            <dd>
                              {count(field.reference_scored)} /{" "}
                              {count(field.current_scored)}
                            </dd>
                          </div>
                          <div>
                            <dt>
                              {composite ? "속성군 보정 q (참고)" : "보정 q"}
                            </dt>
                            <dd>{field.q_value?.toFixed(3) ?? "—"}</dd>
                          </div>
                          {field.category_adjusted_js !== undefined && (
                            <div>
                              <dt>카테고리 내 JS</dt>
                              <dd>{field.category_adjusted_js.toFixed(4)}</dd>
                            </div>
                          )}
                          {field.category_adjusted_q !== undefined && (
                            <div>
                              <dt>카테고리 내 보정 q</dt>
                              <dd>{field.category_adjusted_q.toFixed(3)}</dd>
                            </div>
                          )}
                        </dl>
                      )}
                    </div>
                  </details>
                );
              })}
            </div>
            <div className="drift-result-footer">
              <span>
                이미지 색상 분포 JS{" "}
                <strong>{imageJs?.toFixed(4) ?? "—"}</strong>
              </span>
              <span>
                {composite
                  ? "참고값이며 종합 판정에는 사용하지 않습니다."
                  : "속성별 판정과 별도 지표"}
              </span>
            </div>
            <details className="help-details">
              <summary>분석 기준</summary>
              <p>
                JS 값이 {threshold ?? "설정한 임계값"} 이상
                {composite
                  ? `이고 종합 판정 보정 p가 ${analysis?.alpha} 이하일 때`
                  : "이면"}{" "}
                차이로 표시합니다. 점선은 판정 임계값이며, 모든 속성 그래프는
                0부터 {scale.toFixed(1)}까지 같은 눈금을 사용합니다.
              </p>
              <p>
                두 데이터셋의 분포 차이이며 모델 성능 저하를 의미하지는
                않습니다. 보정 q는 여러 속성을 함께 검정한 결과입니다.
              </p>
            </details>
          </CardContent>
        </Card>
      </details>
    </>
  );
}
