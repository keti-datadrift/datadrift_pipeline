import { count, decimal, signalNames } from "@/lib/drift-display";
import type {
  DriftComposite,
  DriftField,
  DriftSignal,
} from "@/lib/drift-types";

type ResultContext = {
  runId?: string;
  referenceName?: string;
  currentName?: string;
  referenceCount?: number;
  currentCount?: number;
  analyzedAt?: string;
};

function VerdictHeader({
  decision,
  description,
  context,
}: {
  decision: string;
  description: string;
  context: ResultContext;
}) {
  const title =
    decision === "detected"
      ? "드리프트 감지됨"
      : decision === "not_detected"
        ? "드리프트 감지되지 않음"
        : "드리프트 판정 보류";
  return (
    <header className="drift-decision-header" data-run-id={context.runId}>
      <div className="drift-result-context">
        <span>분석 결과</span>
        {context.analyzedAt && (
          <time dateTime={context.analyzedAt}>
            {new Date(context.analyzedAt).toLocaleString("ko-KR", {
              timeZone: "Asia/Seoul",
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </time>
        )}
      </div>
      <h2
        className="drift-composite-verdict"
        data-decision={decision}
        role="status"
      >
        {title}
      </h2>
      <p className="drift-decision-explanation">{description}</p>
      <dl className="drift-result-datasets">
        <div>
          <dt>기준</dt>
          <dd>
            {context.referenceName || "기준 데이터"}
            {context.referenceCount !== undefined &&
              ` (${count(context.referenceCount)}개)`}
          </dd>
        </div>
        <div>
          <dt>비교</dt>
          <dd>
            {context.currentName || "비교 데이터"}
            {context.currentCount !== undefined &&
              ` (${count(context.currentCount)}개)`}
          </dd>
        </div>
      </dl>
    </header>
  );
}

export function CompositeSummary({
  analysis,
  threshold,
  fields,
  names,
  context,
}: {
  analysis: DriftComposite;
  threshold?: number;
  fields: DriftField[];
  names: Record<string, string>;
  context: ResultContext;
}) {
  const image = analysis.image_embeddings;
  const detected = analysis.signals?.filter((signal) => signal.detected) || [];
  const reasons = detected.map((signal) => signalNames[signal.kind]).join(", ");
  const description =
    analysis.decision === "detected"
      ? `${reasons || "분석 항목"}의 변화가 확인되어 드리프트로 판정했습니다.`
      : analysis.decision === "not_detected"
        ? "분석한 항목에서 감지 기준을 넘는 변화가 확인되지 않았습니다."
        : "판정 가능한 비교 데이터가 부족해 드리프트 여부를 판단할 수 없습니다.";
  const reason = (signal: DriftSignal) => {
    if (signal.status === "insufficient")
      return "비교할 유효 데이터가 부족합니다.";
    if (signal.kind === "image_embeddings")
      return image?.status === "identical"
        ? "동일한 이미지로 구성된 데이터입니다."
        : signal.detected
          ? "이미지에서 추출한 시각적 특징이 달라졌습니다."
          : "이미지 특징에서 감지 기준을 넘는 차이가 없었습니다.";
    if (signal.kind === "category_mix")
      return signal.detected
        ? "카테고리 구성 비율이 달라졌습니다."
        : "카테고리 비율은 감지 기준을 넘지 않았습니다.";
    const changed = fields
      .filter((field) =>
        signal.kind === "attribute" ? field.detected : field.category_detected,
      )
      .map((field) => names[field.field] || field.field);
    return changed.length
      ? `${changed.join(", ")}${signal.kind === "within_category" ? ": 같은 카테고리 안에서도 차이가 확인됐습니다." : "의 분포가 달라졌습니다."}`
      : "감지 기준을 넘는 속성 차이가 없었습니다.";
  };
  return (
    <section
      className="drift-decision drift-composite"
      aria-label="드리프트 판정"
    >
      <VerdictHeader
        decision={analysis.decision || "insufficient"}
        description={description}
        context={context}
      />
      {!analysis.complete && analysis.decision === "detected" && (
        <p className="drift-partial-note">
          일부 항목은 데이터가 부족해 판정하지 않았습니다. 아래 결과를 함께
          확인하세요.
        </p>
      )}
      <div className="table-wrap">
        <table className="drift-signal-summary">
          <thead>
            <tr>
              <th>비교 항목</th>
              <th>결과</th>
              <th>확인된 내용</th>
            </tr>
          </thead>
          <tbody>
            {analysis.signals?.map((signal) => (
              <tr key={signal.kind} data-signal={signal.kind}>
                <td>{signalNames[signal.kind]}</td>
                <td>
                  <strong className={signal.detected ? "drift-found" : ""}>
                    {signal.status === "insufficient"
                      ? "판정 불가"
                      : signal.detected
                        ? "감지됨"
                        : "미감지"}
                  </strong>
                </td>
                <td>{reason(signal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details className="drift-numbers drift-results-details">
        <summary>분석 수치 및 판정 기준</summary>
        <div className="table-wrap">
          <table className="drift-signal-table">
            <thead>
              <tr>
                <th>항목</th>
                <th>분석 수치</th>
              </tr>
            </thead>
            <tbody>
              {analysis.signals?.map((signal) => (
                <tr key={signal.kind}>
                  <td>{signalNames[signal.kind]}</td>
                  <td>
                    {signal.status === "insufficient" ? (
                      "판정에 필요한 표본이 부족합니다."
                    ) : signal.kind === "image_embeddings" ? (
                      image?.status === "identical" ? (
                        "동일한 이미지"
                      ) : (
                        <>
                          MMD² {decimal(image?.statistic)} / 보정 p{" "}
                          {decimal(image?.adjusted_p_value)}
                          <br />
                          기준 {count(image?.reference_count)}장, 비교{" "}
                          {count(image?.current_count)}장
                        </>
                      )
                    ) : signal.kind === "category_mix" ? (
                      <>
                        JS {decimal(analysis.category_mix?.js_divergence)} /
                        보정 p{" "}
                        {decimal(analysis.category_mix?.adjusted_p_value)}
                      </>
                    ) : (
                      `${signal.tested_count}개 속성 검정, ${signal.detected_count}개 감지`
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="drift-analysis-note">
          검정 입력: 기준 {count(analysis.analysis_reference_count)}개 / 비교{" "}
          {count(analysis.analysis_current_count)}개
        </p>
        {!!analysis.quality?.shared_images && (
          <p className="drift-analysis-note">
            공유 이미지 {count(analysis.quality.shared_images)}개
            {analysis.quality.identical_inputs
              ? ": 이미지와 레이블이 동일합니다."
              : "를 독립 표본 검정에서 제외했습니다."}
          </p>
        )}
        {!!(
          (analysis.quality?.reference_duplicates || 0) +
          (analysis.quality?.current_duplicates || 0)
        ) && (
          <p className="drift-analysis-note">
            각 데이터 내부의 중복 이미지를 제외했습니다.
          </p>
        )}
        <p className="drift-analysis-note">
          속성과 카테고리는 JS {threshold} 이상이면서 보정 p가 {analysis.alpha}{" "}
          이하일 때, 이미지 특징은 보정 p가 {analysis.alpha} 이하일 때
          감지합니다. 전체 검정에 Holm 보정을 적용하며 한 항목이라도 기준을
          충족하면 드리프트로 판정합니다.
        </p>
        <p className="drift-analysis-note">
          이미지 특징은 고정 ResNet18 모델로 최대 256장씩 CPU에서 추출하고 MMD
          순열 검정으로 비교합니다. 분포 변화가 모델 성능 저하를 뜻하지는
          않습니다.
        </p>
      </details>
    </section>
  );
}

export function LegacySummary({
  analysis,
  fields,
  imageJs,
  threshold,
  context,
}: {
  analysis?: DriftComposite;
  fields: DriftField[];
  imageJs?: number;
  threshold?: number;
  context: ResultContext;
}) {
  const detected =
    analysis?.detected ??
    (fields.some((field) => field.detected) ||
      (imageJs !== undefined &&
        threshold !== undefined &&
        imageJs >= threshold));
  const decision = detected
    ? "detected"
    : !fields.length && imageJs === undefined
      ? "insufficient"
      : "not_detected";
  return (
    <section
      className="drift-decision drift-legacy-summary"
      aria-label="드리프트 판정"
    >
      <VerdictHeader
        decision={decision}
        context={context}
        description={
          detected
            ? "이전 JS 기준에서 감지 기준을 넘는 분포 차이가 확인됐습니다."
            : decision === "not_detected"
              ? "이전 JS 기준에서 감지 기준을 넘는 변화가 확인되지 않았습니다."
              : "이 결과에는 판정에 필요한 정보가 없습니다."
        }
      />
      <p className="drift-analysis-note">
        이전 JS 기준의 결과입니다. 새로 실행하면 속성과 이미지 특징을 함께
        분석합니다.
      </p>
    </section>
  );
}
