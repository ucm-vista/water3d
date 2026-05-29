import type { LucideIcon } from "lucide-react";

interface MetricCardProps {
  label: string;
  value: string;
  detail: string;
  badge?: string;
  icon: LucideIcon;
  tone?: "neutral" | "success" | "warning";
}

export function MetricCard({ label, value, detail, badge, icon: Icon, tone = "neutral" }: MetricCardProps) {
  return (
    <section className={`metric-card metric-${tone}`}>
      <div className="metric-header">
        <span>{label}</span>
        <Icon size={22} />
      </div>
      {badge ? <span className="metric-badge">{badge}</span> : null}
      <div className="metric-value">{value}</div>
      <p>{detail}</p>
    </section>
  );
}
