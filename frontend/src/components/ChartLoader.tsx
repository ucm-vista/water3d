import { useEffect, useState } from "react";
import { TomatoLoader } from "./TomatoLoader";

// After this long a fetch, we stop pretending to know how far along we are and
// switch to an indeterminate "still loading" state so a slow provider reads as
// working, not broken. Emery asked for a determinate bar that flips to
// indeterminate around 10–12s.
const DETERMINATE_MS = 11_000;
// The determinate bar eases toward this ceiling but never claims 100% — we
// can't know the real completion, only that it hasn't finished yet.
const DETERMINATE_CEILING = 0.92;

interface ChartLoaderProps {
  active: boolean;
  label?: string;
}

export function ChartLoader({ active, label = "Loading crop metrics" }: ChartLoaderProps) {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!active) {
      setElapsedMs(0);
      return;
    }
    const startedAt = Date.now();
    const id = window.setInterval(() => setElapsedMs(Date.now() - startedAt), 150);
    return () => window.clearInterval(id);
  }, [active]);

  if (!active) return null;

  const stillLoading = elapsedMs >= DETERMINATE_MS;
  const progress = stillLoading ? 1 : Math.min(DETERMINATE_CEILING, elapsedMs / DETERMINATE_MS);
  const percent = Math.round(progress * 100);

  return (
    <div className="chart-loading-overlay" role="status" aria-live="polite">
      <div className="chart-skeleton" aria-hidden="true" />
      <div className="chart-loader-stack">
        <TomatoLoader size={200} label={label} />
        {stillLoading ? (
          <>
            <div className="chart-progress chart-progress-indeterminate" aria-hidden="true">
              <span />
            </div>
            <span className="chart-loading-label">Still loading — fetching multi-year weather…</span>
          </>
        ) : (
          <>
            <div className="chart-progress" aria-hidden="true">
              <span style={{ width: `${percent}%` }} />
            </div>
            <span className="chart-loading-label">
              {label}… {percent}%
            </span>
          </>
        )}
      </div>
    </div>
  );
}
