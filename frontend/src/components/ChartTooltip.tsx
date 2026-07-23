// Custom hover tooltip shared by the dashboard charts. Rows follow the
// tooltip hierarchy from the legend inverted: the reader already knows which
// series they care about and wants the number, so the VALUE is the strong
// element and the series name is secondary ink. Identity is carried by a short
// stroke of the series color (matching the legend swatch), never by coloring
// the text itself.

export interface ChartTooltipRow {
  key: string;
  label: string;
  value: string;
  color: string;
  /** Dashed key stroke, for forecast/projection series drawn dashed on the chart. */
  dashed?: boolean;
  /** Small muted line under the row (e.g. the ET − precip subtraction). */
  detail?: string;
  /** Hairline above the row — separates derived rows (Difference) from series rows. */
  divider?: boolean;
}

interface ChartHoverTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: unknown[];
  formatLabel?: (label: string | number | undefined) => string;
  resolveRows: (payload: unknown[]) => ChartTooltipRow[];
}

export function ChartHoverTooltip({ active, label, payload, formatLabel, resolveRows }: ChartHoverTooltipProps) {
  if (!active || !payload?.length) return null;
  const rows = resolveRows(payload);
  if (!rows.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-date">{formatLabel ? formatLabel(label) : label}</div>
      {rows.map((row) => (
        <div key={row.key} className={row.divider ? "chart-tooltip-group chart-tooltip-divider" : "chart-tooltip-group"}>
          <div className="chart-tooltip-row">
            <span
              className="chart-tooltip-key"
              style={{ borderTopColor: row.color, borderTopStyle: row.dashed ? "dashed" : "solid" }}
            />
            <span className="chart-tooltip-label">{row.label}</span>
            <span className="chart-tooltip-value">{row.value}</span>
          </div>
          {row.detail ? <div className="chart-tooltip-detail">{row.detail}</div> : null}
        </div>
      ))}
    </div>
  );
}
