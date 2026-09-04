import type { PullRequestSummary, ReviewSignal } from "../providers/contracts";

export type ReviewOutcome = "approved" | "changes_requested" | "reviewed";

export interface Checkpoint {
  readonly pullRequestKey: string;
  readonly reviewedHeadCommit: string;
  readonly watermark: string;
  readonly outcome: ReviewOutcome;
  readonly finishedAt: string;
}

const isTerminal = (state: PullRequestSummary["state"]): boolean =>
  state === "MERGED" || state === "DECLINED";

const isAfter = (candidate: string, reference: string): boolean => {
  const a = Date.parse(candidate);
  const b = Date.parse(reference);
  return !Number.isNaN(a) && !Number.isNaN(b) && a > b;
};

const isReentrySignal = (signal: ReviewSignal, currentUserId: string): boolean => {
  switch (signal.kind) {
    // The user is requested as reviewer again, or explicitly mentioned. The Bitbucket
    // adapter never emits these kinds today, so in practice re-entry rides on "commented"
    // text scanning below; honoring them keeps the model correct for providers that do.
    case "requested":
    case "mentioned":
      return signal.actorId !== currentUserId;
    case "changes_requested":
      return signal.actorId === currentUserId;
    // ReviewSignal carries no thread/parent linkage, so "direct reply in a participated
    // thread" is indistinguishable from a generic comment. The one signal we can read is
    // an @-mention of the user in the comment body.
    case "commented":
      return (
        signal.actorId !== currentUserId &&
        signal.text !== undefined &&
        signal.text.includes(currentUserId)
      );
    default:
      return false;
  }
};

export const isCheckpointValid = (
  pr: PullRequestSummary,
  signals: ReadonlyArray<ReviewSignal>,
  checkpoint: Checkpoint,
  currentUserId: string,
): boolean => {
  if (isTerminal(pr.state)) return true;
  if (pr.sourceCommit !== checkpoint.reviewedHeadCommit) return false;
  return !signals.some(
    (signal) =>
      isAfter(signal.createdAt, checkpoint.watermark) && isReentrySignal(signal, currentUserId),
  );
};
