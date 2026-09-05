import type { JSX } from "react";
import type { PullRequestSummary, ReviewSignal } from "../../providers/contracts";
import { Button } from "../../ui/Button";
import { Chip } from "../../ui/Chip";
import type { ActivityState } from "./ActivityTab";

export interface DescriptionTabProps {
  readonly pullRequest: PullRequestSummary;
  readonly currentUserId: string;
  /** Owned by Sidebar and shared with ActivityTab (fix round item 3): reviewer
   * decisions must never render as "No decision yet" merely because the shared
   * signals load hasn't completed yet — that would misrepresent missing data as
   * an actual decision. */
  readonly signalsState: ActivityState | undefined;
  readonly onRetry: () => void;
}

type Decision = "approved" | "changes_requested" | "none";

const decisionChip: Record<
  Decision,
  { readonly label: string; readonly variant: "success" | "danger" | "neutral" }
> = {
  approved: { label: "Approved", variant: "success" },
  changes_requested: { label: "Changes requested", variant: "danger" },
  none: { label: "No decision yet", variant: "neutral" },
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
    .slice()
    .sort(byCreatedAtAsc);
  const latest = decisions.at(-1);
  return latest ? (latest.kind as Decision) : "none";
};

export function DescriptionTab({
  pullRequest,
  currentUserId,
  signalsState,
  onRetry,
}: DescriptionTabProps): JSX.Element {
  const paragraphs = pullRequest.description.split(/\n{2,}/).filter((part) => part.trim() !== "");

  const reviewers = (): JSX.Element | null => {
    if (pullRequest.reviewerIds.length === 0) return null;
    if (signalsState === undefined || signalsState.status === "loading") {
      return (
        <p className="description-status" role="status">
          Loading reviewer decisions…
        </p>
      );
    }
    if (signalsState.status === "error") {
      return (
        <div className="description-status" role="alert">
          <p>{signalsState.error}</p>
          <Button variant="secondary" onClick={onRetry}>
            Retry
          </Button>
        </div>
      );
    }
    const signals = signalsState.signals ?? [];
    return (
      <ul className="description-reviewers" aria-label="Reviewers">
        {pullRequest.reviewerIds.map((reviewerId) => {
          const chip = decisionChip[latestDecision(signals, reviewerId)];
          return (
            <li key={reviewerId} className="description-reviewer">
              <span>
                {reviewerId}
                {reviewerId === currentUserId ? " (you)" : ""}
              </span>
              <Chip variant={chip.variant}>{chip.label}</Chip>
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <section className="description-tab" aria-label="Description">
      <dl className="description-metadata">
        <dt>Repository</dt>
        <dd>
          {pullRequest.ref.repository.workspace}/{pullRequest.ref.repository.slug}
        </dd>
        <dt>Branches</dt>
        <dd>
          {pullRequest.sourceBranch} → {pullRequest.targetBranch}
        </dd>
        <dt>Author</dt>
        <dd>{pullRequest.author.displayName}</dd>
      </dl>
      {reviewers()}
      <div className="description-body">
        {paragraphs.length === 0 ? (
          <p className="description-empty">No description provided.</p>
        ) : (
          paragraphs.map((paragraph, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static, non-reorderable split of one description string.
            <p key={index}>{paragraph}</p>
          ))
        )}
      </div>
    </section>
  );
}
