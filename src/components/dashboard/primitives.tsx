import { Card, CardContent } from "@/components/ui/card";
import { STATUS_LABELS } from "@/lib/platform-display";
import type { ReactNode } from "react";

export function Badge({
  status,
  children,
}: {
  status?: string;
  children?: ReactNode;
}) {
  return (
    <span className={`badge ${status || ""}`}>
      {children || STATUS_LABELS[status || ""] || status}
    </span>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="empty">
      <p>{children}</p>
    </div>
  );
}
export function Panel({
  title,
  children,
  action,
}: {
  title?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Card className="panel">
      {(title || action) && (
        <div className="panel-heading">
          {title && <h2>{title}</h2>}
          {action}
        </div>
      )}
      <CardContent>{children}</CardContent>
    </Card>
  );
}
export function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
}) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
      {sub && <small>{sub}</small>}
    </div>
  );
}
export function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="field">
      {label}
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
    </label>
  );
}
export function Chart({
  points,
}: {
  points: { step: number; loss: number }[];
}) {
  if (!points.length) return <Empty>첫 학습 스텝을 기다리고 있습니다.</Empty>;
  const min = Math.min(...points.map((p) => p.loss)) * 0.9,
    max = Math.max(...points.map((p) => p.loss)) * 1.1;
  const xy = points.map(
    (p, i) =>
      `${40 + (i / (points.length - 1 || 1)) * 640},${160 - ((p.loss - min) / (max - min || 1)) * 130}`,
  );
  return (
    <svg
      role="img"
      aria-label="학습 손실 곡선"
      viewBox="0 0 720 200"
      className="chart"
    >
      <line x1="40" y1="170" x2="700" y2="170" stroke="#dce3ec" />
      <line x1="40" y1="20" x2="40" y2="170" stroke="#dce3ec" />
      <text x="5" y="25">
        {max.toFixed(2)}
      </text>
      <text x="5" y="165">
        {min.toFixed(2)}
      </text>
      <polyline
        points={xy.join(" ")}
        fill="none"
        stroke="#3478ee"
        strokeWidth="3"
      />
      {points.map((_point, i) => (
        <circle
          key={i}
          cx={xy[i].split(",")[0]}
          cy={xy[i].split(",")[1]}
          r="3"
          fill="#3478ee"
        />
      ))}
      <text x="40" y="193">
        step 1
      </text>
      <text x="630" y="193">
        step {points.at(-1)?.step}
      </text>
    </svg>
  );
}
