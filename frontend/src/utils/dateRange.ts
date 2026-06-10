export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function getCurrentYearStartDate(date = new Date()): string {
  return toIsoDate(new Date(Date.UTC(date.getFullYear(), 0, 1)));
}

export function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function getRollingDateRange(days: number, endDate = new Date()): { startDate: string; endDate: string } {
  const end = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate()));
  const start = addUtcDays(end, -(days - 1));

  return {
    startDate: toIsoDate(start),
    endDate: toIsoDate(end),
  };
}
