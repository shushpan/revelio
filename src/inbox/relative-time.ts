const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const MONTH_MS = 30 * DAY_MS;

/** A short, human relative age (e.g. "3h ago"), falling back to a locale date
 * beyond a month so distant history stays legible rather than "1234d ago". */
export const formatRelativeAge = (value: string, now: number = Date.now()): string => {
  const then = new Date(value);
  if (Number.isNaN(then.valueOf())) return value;
  const diffMs = Math.max(0, now - then.valueOf());
  if (diffMs < MINUTE_MS) return "just now";
  if (diffMs < HOUR_MS) return `${Math.floor(diffMs / MINUTE_MS)}m ago`;
  if (diffMs < DAY_MS) return `${Math.floor(diffMs / HOUR_MS)}h ago`;
  if (diffMs < MONTH_MS) return `${Math.floor(diffMs / DAY_MS)}d ago`;
  return then.toLocaleDateString();
};
