import { Chip } from "@heroui/react/chip";
import { Effect } from "effect";
import type { JSX } from "react";
import { useEffect, useState } from "react";
import type {
  CodeReviewProvider,
  PullRequestSummary,
  ReviewSignal,
  ReviewSignalKind,
} from "../providers/contracts";

export interface OverviewProps {
  readonly provider: CodeReviewProvider;
  readonly pullRequest: PullRequestSummary;
  readonly currentUserId: string;
}

type Decision = "approved" | "changes_requested" | "none";

const decisionChip: Record<
  Decision,
  { readonly label: string; readonly color: "success" | "danger" | "default" }
> = {
  approved: { label: "Approved", color: "success" },
  changes_requested: { label: "Changes requested", color: "danger" },
  none: { label: "No decision yet", color: "default" },
};

const activityLabel: Record<ReviewSignalKind, string> = {
  approved: "approved",
  changes_requested: "requested changes",
  commented: "commented",
  requested: "was requested to review",
  mentioned: "was mentioned",
  updated: "updated the pull request",
  other: "acted",
};

const byCreatedAtAsc = (a: ReviewSignal, b: ReviewSignal): number =>
  a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;

const latestDecision = (signals: ReadonlyArray<ReviewSignal>, reviewerId: string): Decision => {
  const decisions = signals
    .filter(
      (signal) =>
        signal.actorId === reviewerId &&
        (signal.kind === "approved" || signal.kind === "changes_requested"),
    )
    .sort(byCreatedAtAsc);
  const latest = decisions.at(-1);
  return latest ? (latest.kind as Decision) : "none";
};

const formatTime = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString();
};

export function Overview({ provider, pullRequest, currentUserId }: OverviewProps): JSX.Element {
  const [signals, setSignals] = useState<ReadonlyArray<ReviewSignal> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setSignals(null);
    setError(null);
    void Effect.runPromise(provider.getReviewSignals(pullRequest.ref))
      .then((next) => {
        if (active) setSignals(next);
      })
      .catch(() => {
        if (active) setError("Unable to load review activity.");
      });
    return () => {
      active = false;
    };
  }, [provider, pullRequest]);

  if (error !== null) {
    return (
      <section className="overview">
        <p className="overview-status" role="alert">
          {error}
        </p>
      </section>
    );
  }

  if (signals === null) {
    return (
      <section className="overview">
        <p className="overview-status" role="status">
          Loading review activity…
        </p>
      </section>
    );
  }

  const activity = [...signals].sort(byCreatedAtAsc);

  return (
    <section className="overview">
      <div className="overview-description">
        {pullRequest.description.trim() === "" ? (
          <p className="overview-empty">No description provided.</p>
        ) : (
          <p>{pullRequest.description}</p>
        )}
      </div>

      <p className="overview-branches">
        {pullRequest.sourceBranch} → {pullRequest.targetBranch}
      </p>

      <ul className="overview-reviewers" aria-label="Reviewers">
        {pullRequest.reviewerIds.map((reviewerId) => {
          const chip = decisionChip[latestDecision(signals, reviewerId)];
          return (
            <li key={reviewerId} className="overview-reviewer">
              <span className="overview-reviewer-name">
                {reviewerId}
                {reviewerId === currentUserId ? " (you)" : ""}
              </span>
              <Chip size="sm" color={chip.color} variant="soft">
                {chip.label}
              </Chip>
            </li>
          );
        })}
      </ul>

      {activity.length === 0 ? (
        <p className="overview-empty">No activity yet.</p>
      ) : (
        <ul className="overview-activity" aria-label="Activity">
          {activity.map((signal) => (
            <li key={signal.id} className="overview-activity-item">
              <span className="overview-activity-actor">{signal.actorId ?? "Someone"}</span>{" "}
              <span className="overview-activity-kind">{activityLabel[signal.kind]}</span>
              <time dateTime={signal.createdAt}>{formatTime(signal.createdAt)}</time>
              {signal.text ? <p className="overview-activity-text">{signal.text}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
