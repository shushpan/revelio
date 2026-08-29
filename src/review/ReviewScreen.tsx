import { Button } from "@heroui/react/button";
import { Effect } from "effect";
import type { JSX } from "react";
import { useEffect, useState } from "react";
import type {
  CodeReviewProvider,
  InlineCommentAnchor,
  PullRequestSummary,
} from "../providers/contracts";
import { DiffReview } from "./DiffReview";

export interface ReviewScreenProps {
  readonly provider: CodeReviewProvider;
  readonly pullRequest: PullRequestSummary;
  readonly themeType: "light" | "dark";
  readonly onBack: () => void;
  readonly onMarkReviewed: (pullRequest: PullRequestSummary) => void;
}

export function ReviewScreen({
  provider,
  pullRequest,
  themeType,
  onBack,
  onMarkReviewed,
}: ReviewScreenProps): JSX.Element {
  const [patch, setPatch] = useState<string | null>(null);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [inlineIntent, setInlineIntent] = useState<InlineCommentAnchor | null>(null);
  const [action, setAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setPatch(null);
    setLoadingError(null);
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

  const runAction = (
    name: string,
    operation: Effect.Effect<void, unknown>,
    checkpoint = false,
    onSuccess?: () => void,
  ): void => {
    setAction(name);
    setNotice(null);
    void Effect.runPromise(operation)
      .then(() => {
        setAction(null);
        setNotice(`${name} sent.`);
        if (checkpoint) onMarkReviewed(pullRequest);
        onSuccess?.();
      })
      .catch(() => {
        setAction(null);
        setNotice(`${name} could not be sent.`);
      });
  };

  const submitComment = (): void => {
    const text = comment.trim();
    if (text === "") return;
    if (inlineIntent) {
      runAction(
        "Inline comment",
        provider.addInlineComment(pullRequest.ref, text, inlineIntent),
        false,
        () => {
          setComment("");
          setInlineIntent(null);
        },
      );
    } else {
      runAction("Comment", provider.addGeneralComment(pullRequest.ref, text), false, () => {
        setComment("");
        setInlineIntent(null);
      });
    }
  };

  return (
    <main className="app-shell review-page">
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
            onPress={() => onMarkReviewed(pullRequest)}
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
        <DiffReview
          patch={patch}
          themeType={themeType}
          onInlineComment={(intent) =>
            setInlineIntent({ ...intent, side: intent.side === "additions" ? "new" : "old" })
          }
        />
      ) : (
        <p className="review-status" role="status">
          {loadingError ?? "Loading pull request diff…"}
        </p>
      )}
    </main>
  );
}
