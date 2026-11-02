import { PaginatedContent } from "@/components/paginated-content";
import type { Model } from "@/lib/platform-types";
import { displayName } from "@/lib/utils";
import { ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import { Badge, Panel } from "./primitives";

type Props = {
  models: Model[];
  modelSearch: string;
  modelKind: string;
  modelPage: number;
  modelListSuffix: string;
  changeModelList: (change: {
    search?: string;
    kind?: string;
    page?: number;
  }) => void;
};
export function ModelList({
  models,
  modelSearch,
  modelKind,
  modelPage,
  modelListSuffix,
  changeModelList,
}: Props) {
  return (
    <>
      <div className="toolbar">
        <div className="search">
          <Search size={17} />
          <input
            placeholder="모델 이름 검색"
            value={modelSearch}
            onChange={(e) => changeModelList({ search: e.target.value })}
          />
        </div>

        <label>
          유형{" "}
          <select
            aria-label="모델 유형"
            value={modelKind}
            onChange={(e) => changeModelList({ kind: e.target.value })}
          >
            <option value="all">전체 유형</option>
            <option value="base">기본 모델</option>
            <option value="lora">학습된 모델</option>
          </select>
        </label>
      </div>
      <Panel>
        <PaginatedContent
          key={`${modelKind}:${modelSearch}`}
          page={modelPage}
          onPageChange={(page) => changeModelList({ page })}
          items={models
            .filter((m) => modelKind === "all" || m.kind === modelKind)
            .filter((m) =>
              displayName(m.name)
                .toLowerCase()
                .includes(displayName(modelSearch).toLowerCase()),
            )}
          label="모델 목록"
        >
          {(pageModels) => (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>모델</th>
                    <th>유형</th>
                    <th>상태</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {pageModels.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <Link
                          className="model-name"
                          title={displayName(m.name)}
                          href={"/ko/models/" + m.id + modelListSuffix}
                        >
                          {displayName(m.name)}
                        </Link>
                      </td>
                      <td>{m.kind === "base" ? "기본 모델" : "LoRA 어댑터"}</td>
                      <td>
                        <Badge
                          status={
                            m.status === "ready" && !m.available
                              ? "unavailable"
                              : m.status
                          }
                        />
                      </td>
                      <td>
                        <Link
                          aria-label={`${displayName(m.name)} 상세`}
                          href={"/ko/models/" + m.id + modelListSuffix}
                        >
                          <ChevronRight size={18} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </PaginatedContent>
      </Panel>
    </>
  );
}
