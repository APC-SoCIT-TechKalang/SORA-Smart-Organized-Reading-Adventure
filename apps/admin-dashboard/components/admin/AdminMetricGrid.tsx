import type { LucideIcon } from "lucide-react";

type Metric = readonly [label: string, value: number | string, icon: LucideIcon];

export function AdminMetricGrid({ metrics, className = "" }: {
  metrics: readonly Metric[];
  className?: string;
}) {
  return (
    <dl className={`admin-metric-grid ${className}`} data-columns={metrics.length}>
      {metrics.map(([label, value, Icon], index) => (
        <div key={label} className="admin-metric" data-featured={index === 0}>
          <dt className="admin-metric-label">
            <span>{label}</span>
            <span className="admin-metric-icon" aria-hidden="true"><Icon size={18} strokeWidth={1.8} /></span>
          </dt>
          <dd className="admin-metric-value font-serif">{typeof value === "number" ? value.toLocaleString() : value}</dd>
        </div>
      ))}
    </dl>
  );
}
