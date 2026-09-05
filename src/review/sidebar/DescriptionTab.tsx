import type { JSX } from "react";
import type { PullRequestSummary, ReviewSignal } from "../../providers/contracts";
import { Chip } from "../../ui/Chip";

export interface DescriptionTabProps {
  readonly pullRequest: PullRequestSummary;
  readonly currentUserId: string;
  readonly signals: ReadonlyArray<ReviewSignal>;
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
  signals,
}: DescriptionTabProps): JSX.Element {
  const paragraphs = pullRequest.description.split(/\n{2,}/).filter((part) => part.trim() !== "");

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
