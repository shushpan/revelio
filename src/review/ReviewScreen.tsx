import { Button } from "@heroui/react/button";
import { Effect } from "effect";
import type { JSX } from "react";
import { useEffect, useState } from "react";
import { pullRequestKey } from "../inbox/InboxScreen";
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

export interface ReviewScreenProps {
  readonly provider: CodeReviewProvider;
  readonly pullRequest: PullRequestSummary;
  readonly themeType: "light" | "dark";
  readonly currentUserId: string;
  readonly queue: ReadonlyArray<PullRequestSummary>;
  readonly reviewed: Readonly<Record<string, string>>;
  readonly onBack: () => void;
  readonly onMarkReviewed: (pullRequest: PullRequestSummary) => void;
  readonly onSelectPullRequest: (pullRequest: PullRequestSummary) => void;
}

type Tab = "changes" | "overview";

export function ReviewScreen({
  provider,
  pullRequest,
  themeType,
  currentUserId,
  queue,
  reviewed,
  onBack,
  onMarkReviewed,
  onSelectPullRequest,
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
    const doneKey = pullRequestKey(pullRequest);
    const next = queue.find((candidate) => {
      const key = pullRequestKey(candidate);
      if (key === doneKey) return false;
      return reviewed[key] !== candidate.sourceCommit;
    });
    if (next) onSelectPullRequest(next);
    else onBack();
  };

  const runAction = (
    name: string,
    operation: Effect.Effect<void, unknown>,
    checkpoint = false,
  ): void => {
    setAction(name);
    setNotice(null);
    void Effect.runPromise(operation)
      .then(() => {
        setAction(null);
        setNotice(`${name} sent.`);
        if (checkpoint) {
          onMarkReviewed(pullRequest);
          advanceAfterCheckpoint();
        }
      })
      .catch(() => {
        setAction(null);
        setNotice(`${name} could not be sent.`);
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
        <Button variant="secondary" onPress={onBack}>
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
          <Button variant="secondary" onPress={() => setQueueOpen(true)}>
            Queue ({queue.length})
          </Button>
          <Button
            variant="secondary"
            isDisabled={action !== null}
            onPress={() => runAction("Approve", provider.approvePullRequest(pullRequest.ref), true)}
          >
            Approve
          </Button>
          <Button
            variant="secondary"
            isDisabled={action !== null}
            onPress={() =>
              runAction("Request changes", provider.requestChanges(pullRequest.ref), true)
            }
          >
            Request changes
          </Button>
          <Button
            variant="primary"
            isDisabled={action !== null}
            onPress={() => {
              onMarkReviewed(pullRequest);
              advanceAfterCheckpoint();
            }}
          >
            Mark reviewed
          </Button>
        </div>
      </header>
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
          setQueueOpen(false);
          onSelectPullRequest(next);
        }}
        onClose={() => setQueueOpen(false)}
      />
    </main>
  );
}
