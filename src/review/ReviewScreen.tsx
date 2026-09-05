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
import { DropdownMenuItem } from "../ui/DropdownMenu";
import type { ThemeChoice } from "../ui/ThemeControl";
import { shouldUseDiffsWorkerPool } from "../workers/diffs-worker-gate";
import { type DiffIndicatorsOption, type DiffLayout, DiffReview } from "./DiffReview";
import type { PreparedPatchFile } from "./patch";
import { QueueDrawer } from "./QueueDrawer";
import { ReviewToolbar } from "./ReviewToolbar";
import { Sidebar } from "./sidebar/Sidebar";
import {
  FinishReviewError,
  type FinishReviewOutcome,
  type FinishReviewReceipt,
  finishReview,
} from "./finish-review";

const diffLayoutStorageKey = "revelio.review.diffLayout";

function readStoredDiffLayout(): DiffLayout | null {
  try {
    const value = window.localStorage.getItem(diffLayoutStorageKey);
    return value === "split" || value === "unified" ? value : null;
  } catch {
    return null;
  }
}

function writeStoredDiffLayout(value: DiffLayout): void {
  try {
    window.localStorage.setItem(diffLayoutStorageKey, value);
  } catch {
    // Best effort: the layout choice simply resets to the breakpoint default next time.
  }
}

function defaultDiffLayout(): DiffLayout {
  try {
    return window.matchMedia("(min-width: 768px)").matches ? "split" : "unified";
  } catch {
    return "unified";
  }
}

export interface ReviewScreenProps {
  readonly provider: CodeReviewProvider;
  readonly pullRequest: PullRequestSummary;
  readonly themeType: "light" | "dark";
  readonly theme: ThemeChoice;
  readonly onThemeChange: (theme: ThemeChoice) => void;
  readonly currentUserId: string;
  readonly queue: ReadonlyArray<PullRequestSummary>;
  readonly onBack: () => void;
  readonly onSelectPullRequest: (pullRequest: PullRequestSummary) => void;
  /** Resolves only after the generated checkpoint is durable. */
  readonly saveCheckpoint: (checkpoint: Checkpoint) => Promise<void>;
}

interface FinishAttempt {
  readonly pullRequestKey: string;
  readonly outcome: FinishReviewOutcome;
  readonly receipt: FinishReviewReceipt;
}

export function ReviewScreen({
  provider,
  pullRequest,
  themeType,
  theme,
  onThemeChange,
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
  const [files, setFiles] = useState<ReadonlyArray<PreparedPatchFile>>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [queueOpen, setQueueOpen] = useState(false);
  const [workerPoolEnabled, setWorkerPoolEnabled] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [finishAttempt, setFinishAttempt] = useState<FinishAttempt | undefined>();
  const [layout, setLayout] = useState<DiffLayout>(
    () => readStoredDiffLayout() ?? defaultDiffLayout(),
  );
  const [collapsedAll, setCollapsedAll] = useState(false);
  const [lineNumbers, setLineNumbers] = useState(true);
  const [wrapLines, setWrapLines] = useState(false);
  const [diffIndicators, setDiffIndicators] = useState<DiffIndicatorsOption>("classic");
  const currentPullRequestKey = pullRequestKey(pullRequest);
  const isActionInFlight = action !== null;

  useEffect(() => {
    let active = true;
    setPatch(null);
    setLoadingError(null);
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

  const displayOptions = (
    <>
      <DropdownMenuItem
        onSelect={(event) => {
          event.preventDefault();
          setLineNumbers((value) => !value);
        }}
      >
        {lineNumbers ? "✓ Line numbers" : "Line numbers"}
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={(event) => {
          event.preventDefault();
          setWrapLines((value) => !value);
        }}
      >
        {wrapLines ? "✓ Wrap long lines" : "Wrap long lines"}
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={(event) => {
          event.preventDefault();
          setDiffIndicators((value) => (value === "classic" ? "none" : "classic"));
        }}
      >
        {diffIndicators === "classic" ? "✓ Diff indicators" : "Diff indicators"}
      </DropdownMenuItem>
    </>
  );

  return (
    <main className="review-page">
      <ReviewToolbar
        pullRequest={pullRequest}
        queueCount={queue.length}
        busy={isActionInFlight}
        onBack={onBack}
        onQueue={() => setQueueOpen(true)}
        onFinish={() => setFinishOpen(true)}
        theme={theme}
        resolvedTheme={themeType}
        onThemeChange={onThemeChange}
        onSplitView={() => {
          setLayout("split");
          writeStoredDiffLayout("split");
        }}
        onUnifiedView={() => {
          setLayout("unified");
          writeStoredDiffLayout("unified");
        }}
        onCollapseAll={() => setCollapsedAll((value) => !value)}
        displayOptions={displayOptions}
      />
      <div className="review-body">
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
            <Button
              variant="primary"
              isDisabled={action !== null}
              onPress={() => finish("reviewed")}
            >
              Reviewed
            </Button>
          </section>
        ) : null}
        {notice ? (
          <p className="review-notice" role="status">
            {notice}
          </p>
        ) : null}
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
          <div className="review-main">
            <Sidebar
              files={files}
              selectedPath={selectedPath}
              onSelectPath={setSelectedPath}
              pullRequest={pullRequest}
              currentUserId={currentUserId}
              provider={provider}
            />
            <DiffReview
              patch={patch}
              themeType={themeType}
              layout={layout}
              collapsedAll={collapsedAll}
              lineNumbers={lineNumbers}
              wrapLines={wrapLines}
              diffIndicators={diffIndicators}
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
        ) : (
          <p className="review-status" role="status">
            {loadingError ?? "Loading pull request diff…"}
          </p>
        )}
      </div>
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
