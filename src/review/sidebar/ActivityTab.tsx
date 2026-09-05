import { Effect } from "effect";
import type { JSX } from "react";
import { useEffect, useState } from "react";
import { pullRequestKey } from "../../inbox/InboxScreen";
import type {
  CodeReviewProvider,
  PullRequestSummary,
  ReviewSignal,
  ReviewSignalKind,
} from "../../providers/contracts";
import { Button } from "../../ui/Button";

export type ActivityStatus = "loading" | "loaded" | "error";

export interface ActivityState {
  readonly status: ActivityStatus;
  readonly signals?: ReadonlyArray<ReviewSignal>;
  readonly error?: string;
}

export interface ActivityTabProps {
  readonly provider: CodeReviewProvider;
  readonly pullRequest: PullRequestSummary;
  /** Whether the Activity tab is the currently visible sidebar tab. */
  readonly active: boolean;
  /** Owned by ReviewScreen; persists for the lifetime of the open review. */
  readonly cache: Map<string, ActivityState>;
  /** Notifies the owner (e.g. Sidebar) after the cache entry changes. */
  readonly onStateChange?: (state: ActivityState) => void;
}

const activityLabel: Record<ReviewSignalKind, string> = {
  approved: "approved",
  changes_requested: "requested changes",
  commented: "commented",
  requested: "was requested to review",
  mentioned: "was mentioned",
  updated: "updated the pull request",
  other: "acted",
};

const byCreatedAtDesc = (a: ReviewSignal, b: ReviewSignal): number =>
  a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;

const formatTime = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString();
};

export function ActivityTab({
  provider,
  pullRequest,
  active,
  cache,
  onStateChange,
}: ActivityTabProps): JSX.Element {
  const key = pullRequestKey(pullRequest);
  const [state, setState] = useState<ActivityState | undefined>(() => cache.get(key));

  const load = (): void => {
    setState({ status: "loading" });
    void Effect.runPromise(provider.getReviewSignals(pullRequest.ref))
      .then((signals) => {
        const next: ActivityState = { status: "loaded", signals };
        cache.set(key, next);
        setState(next);
        onStateChange?.(next);
      })
      .catch(() => {
        const next: ActivityState = { status: "error", error: "Unable to load review activity." };
        cache.set(key, next);
        setState(next);
        onStateChange?.(next);
      });
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-runs only on tab (re)activation or PR change, not on every cache/load identity change (§11.3).
  useEffect(() => {
    if (!active) return;
    const cached = cache.get(key);
    if (cached) {
      setState(cached);
      return;
    }
    load();
  }, [active, key]);

  if (state === undefined || state.status === "loading") {
    return (
      <section className="activity-tab" aria-label="Activity">
        <p className="activity-status" role="status">
          Loading review activity…
        </p>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section className="activity-tab" aria-label="Activity">
        <p className="activity-status" role="alert">
          {state.error}
        </p>
        <Button variant="secondary" onClick={load}>
          Retry
        </Button>
      </section>
    );
  }

  const activity = [...(state.signals ?? [])].sort(byCreatedAtDesc);

  return (
    <section className="activity-tab" aria-label="Activity">
      {activity.length === 0 ? (
        <p className="activity-empty">No activity yet.</p>
      ) : (
        <ul className="activity-list" aria-label="Activity">
          {activity.map((signal) => (
            <li key={signal.id} className="activity-item">
              <span className="activity-actor">{signal.actorId ?? "Someone"}</span>{" "}
              <span className="activity-kind">{activityLabel[signal.kind]}</span>
              <time dateTime={signal.createdAt}>{formatTime(signal.createdAt)}</time>
              {signal.text ? <p className="activity-text">{signal.text}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
