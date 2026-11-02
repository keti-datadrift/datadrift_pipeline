"use client";

import { api } from "@/lib/api-client";
import type { Dataset, Model, Run, Workspace } from "@/lib/platform-types";
import { useCallback, useEffect, useState } from "react";

type CatalogNeeds = {
  needsWorkspaces: boolean;
  needsModels: boolean;
  needsRuns: boolean;
};

export function usePlatformCatalog({
  needsWorkspaces,
  needsModels,
  needsRuns,
}: CatalogNeeds) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    const [w, d, m, j] = await Promise.all([
      needsWorkspaces ? api<Workspace[]>("/workspaces") : Promise.resolve(null),
      api<Dataset[]>("/datasets?current=true"),
      needsModels
        ? api<Model[]>("/models?summary=true")
        : Promise.resolve(null),
      needsRuns ? api<Run[]>("/jobs?summary=true") : Promise.resolve(null),
    ]);
    if (w) setWorkspaces(w);
    setDatasets(d);
    if (m) setModels(m);
    if (j) setRuns(j);
    setLoading(false);
  }, [needsWorkspaces, needsModels, needsRuns]);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    let inFlight = false;
    const go = async () => {
      if (inFlight) return;
      clearTimeout(timer);
      inFlight = true;
      try {
        if (!document.hidden) await refresh();
      } catch (e) {
        if (alive) {
          setError(
            e instanceof Error ? e.message : "목록 조회에 실패했습니다.",
          );
          setLoading(false);
        }
      } finally {
        inFlight = false;
        if (alive) timer = setTimeout(go, needsRuns ? 4000 : 30000);
      }
    };
    const onVisible = () => {
      if (!document.hidden) void go();
    };
    document.addEventListener("visibilitychange", onVisible);
    go();
    return () => {
      alive = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh, needsRuns]);
  return {
    workspaces,
    datasets,
    models,
    runs,
    loading,
    error,
    setError,
    setDatasets,
    refresh,
  };
}
