"use client";
import { CardContent } from "@/components/ui/card";
import { displayName } from "@/lib/utils";
import Link from "next/link";
import { useEffect, useState } from "react";

type Report = {
  status: string;
  error?: string;
  note?: string;
  active_job?: { key: string; progress: { step?: number; total?: number } };
  labeling?: { count: number; parse_failures: number; schema_failures: number };
  assessment?: {
    raw_candidate_names: string[];
    within_category_candidate_names: string[];
    same_source_control_candidates: Record<string, string[]>;
  };
  comparisons?: {
    key: string;
    name: string;
    model_id: string;
    count: number;
    macro_attribute_accuracy: number;
    schema_failures: number;
    by_source: Record<string, { macro_attribute_accuracy: number }>;
  }[];
};
const percent = (n: number | undefined) =>
  n == null ? "—" : (n * 100).toFixed(1) + "%";
const jobNames: Record<string, string> = {
  labeling: "전체 이미지 AI 재레이블링",
  qwen35_2b_before: "기존 2B 평가",
  qwen35_4b_before: "기존 4B 평가",
  qwen35_2b_mixed_train: "2B 혼합 데이터 재학습",
  qwen35_4b_mixed_train: "4B 혼합 데이터 재학습",
  qwen35_4b_source_train: "4B 무신사 대조군 학습",
  qwen35_2b_mixed_after: "재학습 2B 평가",
  qwen35_4b_mixed_after: "재학습 4B 평가",
  qwen35_4b_source_after: "4B 무신사 대조군 평가",
  drift: "출처 간 드리프트 분석",
};
export function RelabelReport() {
  const [report, setReport] = useState<Report | null>(null);
  useEffect(() => {
    let live = true;
    const load = () =>
      fetch("/api/experiments/relabel-drift")
        .then((r) => (r.ok ? r.json() : null))
        .then((r) => {
          if (live) setReport(r);
        })
        .catch(() => {});
    load();
    const timer = setInterval(load, 10000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);
  if (!report || report.status === "not_started") return null;
  return (
    <details className="panel secondary-report" data-testid="relabel-report">
      <summary className="panel-heading">
        <h2>재학습 비교</h2>
        <span className="muted">
          {report.status === "succeeded"
            ? "완료"
            : report.status === "failed"
              ? "실패"
              : "진행 중"}
        </span>
      </summary>
      <CardContent>
        {report.active_job && (
          <p>
            현재 작업:{" "}
            {jobNames[report.active_job.key] || report.active_job.key}:{" "}
            {report.active_job.progress.step || 0} /{" "}
            {report.active_job.progress.total || "—"}
          </p>
        )}
        {report.labeling && (
          <dl className="analysis-facts">
            <div>
              <dt>재레이블링</dt>
              <dd>{report.labeling.count.toLocaleString()}개</dd>
            </div>
            <div>
              <dt>응답 형식 오류</dt>
              <dd>{report.labeling.parse_failures}개</dd>
            </div>
            <div>
              <dt>허용값 위반</dt>
              <dd>{report.labeling.schema_failures}개</dd>
            </div>
          </dl>
        )}
        {report.error && <p className="error-text">{report.error}</p>}
        {!!report.comparisons?.length && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>모델 / 학습 데이터</th>
                  <th>속성 평균 일치도</th>
                  <th>무신사</th>
                  <th>GS SHOP</th>
                  <th>허용값 위반</th>
                </tr>
              </thead>
              <tbody>
                {report.comparisons.map((r) => (
                  <tr key={r.key}>
                    <td>
                      <Link href={"/ko/models/" + r.model_id}>
                        {displayName(r.name)}
                      </Link>
                    </td>
                    <td>{percent(r.macro_attribute_accuracy)}</td>
                    <td>
                      {percent(r.by_source.musinsa?.macro_attribute_accuracy)}
                    </td>
                    <td>
                      {percent(r.by_source.gsshop?.macro_attribute_accuracy)}
                    </td>
                    <td>
                      {r.schema_failures} / {r.count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <details className="help-details">
          <summary>실험 조건과 보정 결과</summary>
          <p>
            Gemma-4-12B로 재레이블링한 뒤 같은 검증 이미지로 모델을
            비교했습니다. 재레이블링 중 허용값을 벗어난 속성은 정답에서
            제외했습니다.
          </p>
          {report.assessment && (
            <div className="experiment-notes">
              <p>
                출처 간 분포 차이 후보:{" "}
                {report.assessment.raw_candidate_names.join(", ") ||
                  "기준 초과 없음"}
              </p>
              <p>
                카테고리 보정 후 후보:{" "}
                {report.assessment.within_category_candidate_names.join(", ") ||
                  "기준 초과 없음"}
              </p>
              <p>
                기준: JS ≥ 0.1 및 보정 q &lt; 0.05. 같은 출처를 나눈 대조군의
                후보 수: 무신사{" "}
                {report.assessment.same_source_control_candidates.musinsa
                  ?.length || 0}
                개, GS SHOP{" "}
                {report.assessment.same_source_control_candidates.gsshop
                  ?.length || 0}
                개.
              </p>
            </div>
          )}
          {report.note && <p>{displayName(report.note)}</p>}
        </details>
      </CardContent>
    </details>
  );
}
