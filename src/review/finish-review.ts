import type { Checkpoint } from "../inbox/checkpoint";
import type { InlineCommentAnchor } from "../providers/contracts";

export interface PendingReviewComment {
  readonly id: string;
  readonly text: string;
  readonly anchor?: InlineCommentAnchor;
}

export type FinishReviewOutcome = "approved" | "changes_requested" | "reviewed";

export interface FinishReviewReceipt {
  readonly sentCommentIds: ReadonlyArray<string>;
  readonly decisionApplied: boolean;
}

export interface FinishReviewDependencies {
  readonly loadHead: () => Promise<string>;
  readonly sendComment: (comment: PendingReviewComment) => Promise<void>;
  readonly applyDecision: (outcome: FinishReviewOutcome) => Promise<void>;
  readonly saveCheckpoint: (checkpoint: Checkpoint) => Promise<void>;
  readonly now: () => string;
}

export type FinishReviewStage =
  | "head-before"
  | "comment"
  | "decision"
  | "head-after"
  | "checkpoint";

export class FinishReviewError extends Error {
  readonly _tag = "FinishReviewError";

  constructor(
    readonly stage: FinishReviewStage,
    readonly receipt: FinishReviewReceipt,
  ) {
    super("Finish Review could not be completed.");
    this.name = "FinishReviewError";
  }
}

const createReceipt = (
  sentCommentIds: ReadonlyArray<string>,
  decisionApplied: boolean,
): FinishReviewReceipt =>
  Object.freeze({
    sentCommentIds: Object.freeze([...sentCommentIds]),
    decisionApplied,
  });

export const finishReview = async (
  input: {
    pullRequestKey: string;
    reviewedHeadCommit: string;
    comments: ReadonlyArray<PendingReviewComment>;
    outcome: FinishReviewOutcome;
    previousReceipt?: FinishReviewReceipt;
  },
  deps: FinishReviewDependencies,
): Promise<FinishReviewReceipt> => {
  let receipt = createReceipt(
    input.previousReceipt?.sentCommentIds ?? [],
    input.outcome !== "reviewed" && (input.previousReceipt?.decisionApplied ?? false),
  );

  let initialHead: string;
  try {
    initialHead = await deps.loadHead();
  } catch {
    throw new FinishReviewError("head-before", receipt);
  }
  if (initialHead !== input.reviewedHeadCommit) {
    throw new FinishReviewError("head-before", receipt);
  }

  for (const comment of input.comments) {
    if (!receipt.sentCommentIds.includes(comment.id)) {
      try {
        await deps.sendComment(comment);
      } catch {
        throw new FinishReviewError("comment", receipt);
      }
      receipt = createReceipt([...receipt.sentCommentIds, comment.id], receipt.decisionApplied);
    }
  }

  if (input.outcome !== "reviewed" && !receipt.decisionApplied) {
    try {
      await deps.applyDecision(input.outcome);
    } catch {
      throw new FinishReviewError("decision", receipt);
    }
    receipt = createReceipt(receipt.sentCommentIds, true);
  }

  let finalHead: string;
  try {
    finalHead = await deps.loadHead();
  } catch {
    throw new FinishReviewError("head-after", receipt);
  }
  if (finalHead !== input.reviewedHeadCommit) {
    throw new FinishReviewError("head-after", receipt);
  }

  const finishedAt = deps.now();
  const checkpoint: Checkpoint = {
    pullRequestKey: input.pullRequestKey,
    reviewedHeadCommit: input.reviewedHeadCommit,
    watermark: finishedAt,
    outcome: input.outcome,
    finishedAt,
  };
  try {
    await deps.saveCheckpoint(checkpoint);
  } catch {
    throw new FinishReviewError("checkpoint", receipt);
  }

  return receipt;
};
