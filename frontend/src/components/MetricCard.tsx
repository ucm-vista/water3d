import { Info } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface MetricCardProps {
  label: string;
  value: string;
  detail: string;
  badge?: string;
  icon: LucideIcon;
  tone?: "neutral" | "success" | "warning";
  info?: string;
}

export function MetricCard({ label, value, detail, badge, icon: Icon, tone = "neutral", info }: MetricCardProps) {
  return (
    <section className={`metric-card metric-${tone}`}>
      <div className="metric-header">
        <span>{label}</span>
        <div className="metric-actions">
          {info ? (
            <span className="metric-info" tabIndex={0} aria-label={info}>
              <Info size={16} />
              <span className="metric-info-tooltip">{info}</span>
            </span>
          ) : null}
          <Icon size={22} />
        </div>
      </div>
      {badge ? <span className="metric-badge">{badge}</span> : null}
      <div className="metric-value">{value}</div>
      <p>{detail}</p>
    </section>
  );
}
