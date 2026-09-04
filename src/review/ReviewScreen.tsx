import { Button } from "@heroui/react/button";
import { Effect } from "effect";
import type { JSX } from "react";
import { useEffect, useState } from "react";
import { pullRequestKey } from "../inbox/InboxScreen";
import type { Checkpoint } from "../inbox/checkpoint";
import type {
  CodeReviewProvider,
  InlineCommentAnchor,
  PullRequestSummary,
} from "../providers/contracts";
import { shouldUseDiffsWorkerPool } from "../workers/diffs-worker-gate";
import { DiffReview } from "./DiffReview";
import { FileTree } from "./FileTree";
import { Overview } from "./Overview";
import type { PreparedPatchFile } from "./patch";
import { QueueDrawer } from "./QueueDrawer";
import {
  FinishReviewError,
  type FinishReviewOutcome,
  type FinishReviewReceipt,
  finishReview,
} from "./finish-review";

export interface ReviewScreenProps {
  readonly provider: CodeReviewProvider;
  readonly pullRequest: PullRequestSummary;
  readonly themeType: "light" | "dark";
  readonly currentUserId: string;
  readonly queue: ReadonlyArray<PullRequestSummary>;
  readonly onBack: () => void;
  readonly onSelectPullRequest: (pullRequest: PullRequestSummary) => void;
  /** Resolves only after the generated checkpoint is durable. */
  readonly saveCheckpoint: (checkpoint: Checkpoint) => Promise<void>;
}

type Tab = "changes" | "overview";

interface FinishAttempt {
  readonly pullRequestKey: string;
  readonly outcome: FinishReviewOutcome;
  readonly receipt: FinishReviewReceipt;
}

export function ReviewScreen({
  provider,
  pullRequest,
  themeType,
  currentUserId,
  queue,
  onBack,
  onSelectPullRequest,
  saveCheckpoint,
}: ReviewScreenProps): JSX.Element {
  const [patch, setPatch] = useState<string | null>(null);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [inlineIntent, setInlineIntent] = useState<InlineCommentAnchor | null>(null);
  const [action, setAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("changes");
  const [files, setFiles] = useState<ReadonlyArray<PreparedPatchFile>>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [queueOpen, setQueueOpen] = useState(false);
  const [workerPoolEnabled, setWorkerPoolEnabled] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [finishAttempt, setFinishAttempt] = useState<FinishAttempt | undefined>();
  const currentPullRequestKey = pullRequestKey(pullRequest);
  const isActionInFlight = action !== null;

  useEffect(() => {
    let active = true;
    setPatch(null);
    setLoadingError(null);
    setTab("changes");
    setFiles([]);
    setSelectedPath(null);
    setQueueOpen(false);
    void Effect.runPromise(provider.getPullRequestDiff(pullRequest.ref))
      .then((nextPatch) => {
        if (active) setPatch(nextPatch);
      })
      .catch(() => {
        if (active) setLoadingError("Unable to load this pull request diff.");
      });
    return () => {
      active = false;
    };
  }, [provider, pullRequest]);

  useEffect(() => {
    void shouldUseDiffsWorkerPool().then((enabled) => setWorkerPoolEnabled(enabled));
  }, []);

  const advanceAfterCheckpoint = (): void => {
    const currentIndex = queue.findIndex(
      (candidate) => pullRequestKey(candidate) === currentPullRequestKey,
    );
    const next = currentIndex < 0 ? undefined : queue.slice(currentIndex + 1)[0];
    if (next) onSelectPullRequest(next);
    else onBack();
  };

  const finishFailureCopy = (stage: FinishReviewError["stage"]): string => {
    switch (stage) {
      case "head-before":
        return "This pull request changed before finishing. Refresh and review it again.";
      case "head-after":
        return "This pull request changed while finishing. The review remains open.";
      case "comment":
        return "A review comment could not be sent. Try Finish Review again.";
      case "decision":
        return "The review decision could not be sent. Try Finish Review again.";
      case "checkpoint":
        return "The review was sent but could not be saved locally. Retry Finish Review to complete it.";
    }
  };

  const finish = (outcome: FinishReviewOutcome): void => {
    if (outcome !== "reviewed" && !provider.capabilities.canWriteReviews) return;
    setQueueOpen(false);
    setAction("Finish Review");
    setNotice(null);
    const previousReceipt =
      finishAttempt?.pullRequestKey === currentPullRequestKey && finishAttempt.outcome === outcome
        ? finishAttempt.receipt
        : undefined;
    void finishReview(
      {
        pullRequestKey: currentPullRequestKey,
        reviewedHeadCommit: pullRequest.sourceCommit,
        comments: [],
        outcome,
        previousReceipt,
      },
      {
        loadHead: async () => {
          const pullRequests = await Effect.runPromise(
            provider.listOpenPullRequests(pullRequest.ref.repository),
          );
          const current = pullRequests.find((candidate) => candidate.ref.id === pullRequest.ref.id);
          if (!current) throw new Error("Pull request is no longer open.");
          return current.sourceCommit;
        },
        sendComment: async () => undefined,
        applyDecision: async (decision) => {
          if (decision === "approved") {
            await Effect.runPromise(provider.approvePullRequest(pullRequest.ref));
          } else if (decision === "changes_requested") {
            await Effect.runPromise(provider.requestChanges(pullRequest.ref));
          }
        },
        saveCheckpoint,
        now: () => new Date().toISOString(),
      },
    )
      .then(() => {
        setAction(null);
        setFinishOpen(false);
        setFinishAttempt(undefined);
        advanceAfterCheckpoint();
      })
      .catch((error: unknown) => {
        setAction(null);
        if (error instanceof FinishReviewError) {
          setFinishAttempt({
            pullRequestKey: currentPullRequestKey,
            outcome,
            receipt: error.receipt,
          });
          setNotice(finishFailureCopy(error.stage));
        } else {
          setNotice("Finish Review could not be completed. Try again.");
        }
      });
  };

  const submitComment = (): void => {
    const text = comment.trim();
    if (text === "") return;
    setAction("Comment");
    setNotice(null);
    const operation = inlineIntent
      ? provider.addInlineComment(pullRequest.ref, text, inlineIntent)
      : provider.addGeneralComment(pullRequest.ref, text);
    void Effect.runPromise(operation)
      .then(() => {
        setAction(null);
        setNotice(inlineIntent ? "Inline comment sent." : "Comment sent.");
        setComment("");
        setInlineIntent(null);
      })
      .catch(() => {
        setAction(null);
        setNotice("Comment could not be sent.");
      });
  };

  const queueIndex = queue.findIndex(
    (candidate) => pullRequestKey(candidate) === pullRequestKey(pullRequest),
  );

  return (
    <main className="review-page">
      <header className="review-toolbar">
        <Button variant="secondary" isDisabled={isActionInFlight} onPress={onBack}>
          Back
        </Button>
        <div className="review-title">
          <span className="inbox-repository">
            {pullRequest.ref.repository.workspace}/{pullRequest.ref.repository.slug}
          </span>
          <h2>{pullRequest.title}</h2>
          <span className="inbox-branches">
            {pullRequest.sourceBranch} → {pullRequest.targetBranch}
          </span>
        </div>
        <div className="review-actions">
          <Button
            variant="secondary"
            isDisabled={isActionInFlight}
            onPress={() => setQueueOpen(true)}
          >
            Queue ({queue.length})
          </Button>
          <Button
            variant="primary"
            isDisabled={action !== null}
            onPress={() => setFinishOpen(true)}
          >
            Finish Review
          </Button>
        </div>
      </header>
      {finishOpen ? (
        <section className="review-finish" role="dialog" aria-label="Finish Review">
          <p>Choose how to finish this review.</p>
          {provider.capabilities.canWriteReviews ? (
            <>
              <Button
                variant="secondary"
                isDisabled={action !== null}
                onPress={() => finish("approved")}
              >
                Approve
              </Button>
              <Button
                variant="secondary"
                isDisabled={action !== null}
                onPress={() => finish("changes_requested")}
              >
                Request changes
              </Button>
            </>
          ) : (
            <p>Remote review decisions are unavailable for this connection.</p>
          )}
          <Button variant="primary" isDisabled={action !== null} onPress={() => finish("reviewed")}>
            Reviewed
          </Button>
        </section>
      ) : null}
      {notice ? (
        <p className="review-notice" role="status">
          {notice}
        </p>
      ) : null}
      <div className="review-tabs" role="tablist">
        <button
          type="button"
          className={tab === "changes" ? "review-tab review-tab-active" : "review-tab"}
          aria-selected={tab === "changes"}
          role="tab"
          onClick={() => setTab("changes")}
        >
          Changes
        </button>
        <button
          type="button"
          className={tab === "overview" ? "review-tab review-tab-active" : "review-tab"}
          aria-selected={tab === "overview"}
          role="tab"
          onClick={() => setTab("overview")}
        >
          Overview
        </button>
      </div>
      {tab === "overview" ? (
        <Overview provider={provider} pullRequest={pullRequest} currentUserId={currentUserId} />
      ) : (
        <>
          <section className="review-comment-box" aria-label="Review comment">
            {inlineIntent ? (
              <p className="inline-comment-context">
                Commenting on {inlineIntent.path}:{inlineIntent.line}
              </p>
            ) : null}
            <textarea
              aria-label={inlineIntent ? "Inline comment" : "General comment"}
              placeholder={inlineIntent ? "Leave an inline comment" : "Leave a general comment"}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              rows={2}
            />
            <Button
              variant="secondary"
              isDisabled={action !== null || comment.trim() === ""}
              onPress={submitComment}
            >
              {inlineIntent ? "Send inline comment" : "Send comment"}
            </Button>
          </section>
          {patch !== null ? (
            <div className="review-workspace">
              <div className="review-filetree-column">
                <FileTree files={files} selected={selectedPath} onSelect={setSelectedPath} />
              </div>
              <div className="review-content-column">
                <DiffReview
                  patch={patch}
                  themeType={themeType}
                  hideFileNav
                  disableWorkerPool={!workerPoolEnabled}
                  activePath={selectedPath}
                  onActivePathChange={setSelectedPath}
                  onFilesChange={setFiles}
                  onInlineComment={(intent) =>
                    setInlineIntent({
                      ...intent,
                      side: intent.side === "additions" ? "new" : "old",
                    })
                  }
                />
              </div>
            </div>
          ) : (
            <p className="review-status" role="status">
              {loadingError ?? "Loading pull request diff…"}
            </p>
          )}
        </>
      )}
      <QueueDrawer
        queue={queue}
        currentIndex={queueIndex}
        isOpen={queueOpen}
        onSelect={(next) => {
          if (isActionInFlight) return;
          setQueueOpen(false);
          onSelectPullRequest(next);
        }}
        onClose={() => setQueueOpen(false)}
      />
    </main>
  );
}
