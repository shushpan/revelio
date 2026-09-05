import type { JSX } from "react";
import type { ReviewSignal, ReviewSignalKind } from "../../providers/contracts";
import { Button } from "../../ui/Button";

export type ActivityStatus = "loading" | "loaded" | "error";

export interface ActivityState {
  readonly status: ActivityStatus;
  readonly signals?: ReadonlyArray<ReviewSignal>;
  readonly error?: string;
}

export interface ActivityTabProps {
  /** Owned by Sidebar and shared with DescriptionTab (fix round item 3): whichever
   * tab activates first starts the one request this open review makes. */
  readonly state: ActivityState | undefined;
  readonly onRetry: () => void;
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

export function ActivityTab({ state, onRetry }: ActivityTabProps): JSX.Element {
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
        <Button variant="secondary" onClick={onRetry}>
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
