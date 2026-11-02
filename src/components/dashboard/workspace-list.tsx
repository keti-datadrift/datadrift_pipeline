import { num } from "@/lib/platform-display";
import type { Workspace } from "@/lib/platform-types";
import { displayName } from "@/lib/utils";
import { ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import { Empty } from "./primitives";

type Props = {
  workspaces: Workspace[];
  search: string;
  setSearch: (value: string) => void;
  workspaceStatus: string;
  setWorkspaceStatus: (value: string) => void;
  workspaceSort: string;
  setWorkspaceSort: (value: string) => void;
};
export function WorkspaceList({
  workspaces,
  search,
  setSearch,
  workspaceStatus,
  setWorkspaceStatus,
  workspaceSort,
  setWorkspaceSort,
}: Props) {
  return (
    <>
      <div className="toolbar">
        <div className="search">
          <Search size={17} />
          <input
            placeholder="워크스페이스 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <select
          aria-label="워크스페이스 상태"
          value={workspaceStatus}
          onChange={(e) => setWorkspaceStatus(e.target.value)}
        >
          <option value="all">상태: 전체</option>
          <option value="incomplete">레이블 진행 중</option>
          <option value="complete">레이블 완료</option>
          <option value="empty">이미지 없음</option>
        </select>
        <label>
          정렬{" "}
          <select
            aria-label="워크스페이스 정렬"
            value={workspaceSort}
            onChange={(e) => setWorkspaceSort(e.target.value)}
          >
            <option value="default">기본 순서</option>
            <option value="name">이름순</option>
            <option value="progress">레이블 진행률순</option>
          </select>
        </label>
      </div>
      <div className="workspace-grid">
        {workspaces
          .filter((w) => {
            const d = w.datasets[0];
            return (
              workspaceStatus === "all" ||
              (workspaceStatus === "empty"
                ? !d?.count
                : workspaceStatus === "complete"
                  ? !!d?.count && (d.labeled_count || 0) >= d.count
                  : !!d?.count && (d.labeled_count || 0) < d.count)
            );
          })
          .filter((w) => w.name.toLowerCase().includes(search.toLowerCase()))
          .sort((a, b) =>
            workspaceSort === "name"
              ? a.name.localeCompare(b.name)
              : workspaceSort === "progress"
                ? (b.datasets[0]?.labeled_count || 0) /
                    (b.datasets[0]?.count || 1) -
                  (a.datasets[0]?.labeled_count || 0) /
                    (a.datasets[0]?.count || 1)
                : 0,
          )
          .map((w) => (
            <Link
              href={"/ko/workspaces/" + w.id}
              key={w.id}
              className="workspace-card"
            >
              <h2>{displayName(w.name)}</h2>
              {w.description && <p>{displayName(w.description)}</p>}
              <div className="workspace-model">
                레이블링 모델{" "}
                <strong>
                  {displayName(w.labeling_model_name || "미설정")}
                </strong>
                <ChevronRight size={16} />
              </div>
              <div className="workspace-progress">
                <div>
                  <span>레이블 진행률</span>
                  <strong>
                    {num(w.datasets[0]?.labeled_count || 0)} /{" "}
                    {num(w.datasets[0]?.count || 0)}
                  </strong>
                </div>
                <progress
                  aria-label={`${w.name} 레이블 진행률`}
                  value={w.datasets[0]?.labeled_count || 0}
                  max={w.datasets[0]?.count || 1}
                />
              </div>
            </Link>
          ))}
      </div>
      {!workspaces.length && (
        <Empty>워크스페이스를 만들거나 레이블 데이터를 가져오세요.</Empty>
      )}
    </>
  );
}
