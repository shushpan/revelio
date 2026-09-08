import { Effect } from "effect";
import type { JSX } from "react";
import { useEffect, useMemo, useState } from "react";
import { pullRequestKey } from "../inbox/InboxScreen";
import { reviewList } from "../inbox/review-list";
import type { Checkpoint } from "../inbox/checkpoint";
import type { InboxLoadSnapshot } from "../inbox/load-inbox";
import type {
  CodeReviewProvider,
  InlineCommentAnchor,
  PullRequestSummary,
} from "../providers/contracts";
import { DropdownMenuItem } from "../ui/DropdownMenu";
import type { ThemeChoice } from "../ui/ThemeControl";
import { shouldUseDiffsWorkerPool } from "../workers/diffs-worker-gate";
import { type DiffIndicatorsOption, type DiffLayout, DiffReview } from "./DiffReview";
import { FinishReviewDialog } from "./FinishReviewDialog";
import type { PreparedPatchFile } from "./patch";
import { ReviewToolbar } from "./ReviewToolbar";
import { Sidebar } from "./sidebar/Sidebar";
import {
  FinishReviewError,
  type FinishReviewOutcome,
  type FinishReviewReceipt,
  type PendingReviewComment,
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
  readonly inbox: InboxLoadSnapshot;
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
  inbox,
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [workerPoolEnabled, setWorkerPoolEnabled] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [finishAttempt, setFinishAttempt] = useState<FinishAttempt | undefined>();
  const [drafts, setDrafts] = useState<ReadonlyArray<PendingReviewComment>>([]);
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
    setComment("");
    setInlineIntent(null);
    setDrafts([]);
    setFinishOpen(false);
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

  // Escape returns to the inbox, but only when nothing else already owns it:
  // the Finish Review dialog and the mobile sidebar sheet both render with
  // `aria-modal="true"` while open, and Radix's dropdown menu content only
  // exists in the DOM (`role="menu"`) while open - checking the real DOM
  // beats threading each descendant's open state up through props.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      if (finishOpen || isActionInFlight) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      if (document.querySelector('[role="menu"]')) return;
      onBack();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [finishOpen, isActionInFlight, onBack]);

  const upcomingReviews = useMemo(
    () => reviewList(inbox, currentUserId, pullRequest),
    [inbox, currentUserId, pullRequest],
  );

  const advanceAfterCheckpoint = (): void => {
    const currentIndex = upcomingReviews.findIndex(
      (candidate) => pullRequestKey(candidate) === currentPullRequestKey,
    );
    const next = currentIndex < 0 ? undefined : upcomingReviews.slice(currentIndex + 1)[0];
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
    setAction("Finish Review");
    setNotice(null);
    const previousReceipt: FinishReviewReceipt | undefined =
      finishAttempt?.pullRequestKey !== currentPullRequestKey
        ? undefined
        : finishAttempt.outcome === outcome
          ? finishAttempt.receipt
          : { sentCommentIds: finishAttempt.receipt.sentCommentIds, decisionApplied: false };
    void finishReview(
      {
        pullRequestKey: currentPullRequestKey,
        reviewedHeadCommit: pullRequest.sourceCommit,
        comments: drafts,
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
        sendComment: async (draftComment) => {
          const operation = draftComment.anchor
            ? provider.addInlineComment(pullRequest.ref, draftComment.text, draftComment.anchor)
            : provider.addGeneralComment(pullRequest.ref, draftComment.text);
          await Effect.runPromise(operation);
        },
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
        setDrafts([]);
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

  const isSameAnchor = (a: InlineCommentAnchor | null, b: InlineCommentAnchor | null): boolean => {
    if (a === null || b === null) return a === b;
    return a.path === b.path && a.line === b.line && a.side === b.side;
  };

  const setComposerContext = (nextIntent: InlineCommentAnchor | null): void => {
    if (!isSameAnchor(inlineIntent, nextIntent)) setComment("");
    setInlineIntent(nextIntent);
  };

  const addDraft = (): void => {
    const text = comment.trim();
    if (text === "") return;
    const anchor = inlineIntent ?? undefined;
    setDrafts((current) => [
      ...current,
      { id: crypto.randomUUID(), text, ...(anchor ? { anchor } : {}) },
    ]);
    setComment("");
    setInlineIntent(null);
  };

  const sendDraftNow = (draft: PendingReviewComment): void => {
    setAction("Send comment");
    setNotice(null);
    const operation = draft.anchor
      ? provider.addInlineComment(pullRequest.ref, draft.text, draft.anchor)
      : provider.addGeneralComment(pullRequest.ref, draft.text);
    void Effect.runPromise(operation)
      .then(() => {
        setAction(null);
        setNotice(draft.anchor ? "Inline comment sent." : "Comment sent.");
        setDrafts((current) => current.filter((item) => item.id !== draft.id));
      })
      .catch(() => {
        setAction(null);
        setNotice("Comment could not be sent.");
      });
  };

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
        sidebarCollapsed={sidebarCollapsed}
        busy={isActionInFlight}
        onBack={onBack}
        onToggleSidebar={() => setSidebarCollapsed((value) => !value)}
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
        collapsedAll={collapsedAll}
        displayOptions={displayOptions}
      />
      <div className="review-body">
        {patch !== null ? (
          <div className="review-main" data-sidebar-collapsed={sidebarCollapsed}>
            <Sidebar
              files={files}
              selectedPath={selectedPath}
              onSelectPath={setSelectedPath}
              pullRequest={pullRequest}
              currentUserId={currentUserId}
              provider={provider}
              themeType={themeType}
              inbox={inbox}
              onSelectPullRequest={onSelectPullRequest}
              busy={isActionInFlight}
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
              onInlineComment={(intent) => {
                setComposerContext({
                  ...intent,
                  side: intent.side === "additions" ? "new" : "old",
                });
                setFinishOpen(true);
              }}
            />
          </div>
        ) : (
          <p className="review-status" role="status">
            {loadingError ?? "Loading pull request diff…"}
          </p>
        )}
      </div>
      <FinishReviewDialog
        isOpen={finishOpen}
        onClose={() => setFinishOpen(false)}
        canWriteReviews={provider.capabilities.canWriteReviews}
        busy={isActionInFlight}
        drafts={drafts}
        comment={comment}
        onCommentChange={setComment}
        inlineIntent={inlineIntent}
        onSwitchToGeneral={() => setComposerContext(null)}
        onAddDraft={addDraft}
        onSendDraftNow={sendDraftNow}
        onFinish={finish}
        notice={notice}
      />
    </main>
  );
}
