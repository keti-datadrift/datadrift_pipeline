import { Pagination, StablePage } from "@/components/paginated-content";
import { active, states } from "@/lib/model-api-display";
import type { Prediction } from "@/lib/model-api-types";
type Props = {
  history: Prediction[];
  historyTotal: number;
  historyLoading: boolean;
  historyShownPage: number;
  historyPage: number;
  historyError: string;
  busy: boolean;
  onSelect: (value: Prediction) => void;
  onCancel: (value: Prediction) => Promise<void>;
  changeHistoryPage: (value: number) => void;
};
export function PredictionHistory({
  history,
  historyTotal,
  historyLoading,
  historyShownPage,
  historyPage,
  historyError,
  busy,
  onSelect,
  onCancel,
  changeHistoryPage,
}: Props) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h3>요청 이력</h3>
      </div>
      <StablePage
        rows={Math.min(10, historyTotal)}
        loading={historyLoading}
        pageKey={historyShownPage}
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>요청 ID</th>
                <th>접수 시각</th>
                <th>상태</th>
                <th>처리 시간</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {!historyLoading && !history.length && (
                <tr>
                  <td colSpan={5}>요청 이력이 없습니다.</td>
                </tr>
              )}
              {history.map((p) => (
                <tr key={p.id}>
                  <td>
                    <button
                      className="text-button"
                      disabled={historyLoading}
                      onClick={() => onSelect(p)}
                    >
                      {p.id.slice(0, 8)}
                    </button>
                  </td>
                  <td>
                    {new Date(p.created_at).toLocaleString("ko-KR", {
                      timeZone: "Asia/Seoul",
                    })}
                  </td>
                  <td>{states[p.status]}</td>
                  <td>
                    {p.result
                      ? `${p.result.processing_seconds.toFixed(1)}초`
                      : "—"}
                  </td>
                  <td>
                    {active(p) && (
                      <button
                        className="button secondary"
                        disabled={busy || historyLoading}
                        onClick={() => onCancel(p)}
                      >
                        취소
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {historyError && !historyLoading && (
          <div role="alert" className="page-load-error">
            <span>{historyError}</span>
            <button
              className="button secondary"
              type="button"
              onClick={() => changeHistoryPage(historyPage)}
            >
              다시 시도
            </button>
          </div>
        )}
      </StablePage>
      <Pagination
        total={historyTotal}
        page={historyShownPage}
        label="API 요청"
        onPageChange={changeHistoryPage}
        disabled={historyLoading}
      />
    </section>
  );
}
