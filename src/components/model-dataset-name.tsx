"use client";

import { displayName } from "@/lib/utils";
import { useEffect, useState } from "react";

export function ModelDatasetName({
  datasetId,
  currentName,
  kind,
}: {
  datasetId?: string;
  currentName?: string;
  kind: string;
}) {
  const [record, setRecord] = useState<{
    id: string;
    name?: string;
    error?: string;
  } | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!datasetId || currentName) return;
    const controller = new AbortController();
    setRecord(null);
    fetch(`/api/datasets/${encodeURIComponent(datasetId)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            response.status === 404
              ? "데이터를 찾을 수 없습니다."
              : "학습 데이터를 불러오지 못했습니다.",
          );
        return response.json();
      })
      .then((dataset) => setRecord({ id: datasetId, name: dataset.name }))
      .catch((error) => {
        if (error.name !== "AbortError")
          setRecord({ id: datasetId, error: error.message });
      });
    return () => controller.abort();
  }, [datasetId, currentName, retry]);
  if (!datasetId)
    return <>{kind === "base" ? "사전학습 모델" : "학습 데이터 미기록"}</>;
  if (currentName) return <>{displayName(currentName)}</>;
  if (record?.id !== datasetId) return <span role="status">불러오는 중…</span>;
  if (record.error)
    return (
      <span>
        {record.error}{" "}
        <button
          type="button"
          className="text-button"
          onClick={() => setRetry((n) => n + 1)}
        >
          다시 시도
        </button>
      </span>
    );
  return <>{displayName(record.name)}</>;
}
