import * as DialogPrimitive from "@radix-ui/react-dialog";
import { type JSX, useEffect, useRef } from "react";
import type { InlineCommentAnchor } from "../providers/contracts";
import { Button } from "../ui/Button";
import type { FinishReviewOutcome, PendingReviewComment } from "./finish-review";

export interface FinishReviewDialogProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly canWriteReviews: boolean;
  readonly busy: boolean;
  readonly drafts: ReadonlyArray<PendingReviewComment>;
  readonly comment: string;
  readonly onCommentChange: (value: string) => void;
  readonly inlineIntent: InlineCommentAnchor | null;
  readonly onAddDraft: () => void;
  readonly onSendDraftNow: (draft: PendingReviewComment) => void;
  readonly onFinish: (outcome: FinishReviewOutcome) => void;
  readonly notice: string | null;
}

export function FinishReviewDialog({
  isOpen,
  onClose,
  canWriteReviews,
  busy,
  drafts,
  comment,
  onCommentChange,
  inlineIntent,
  onAddDraft,
  onSendDraftNow,
  onFinish,
  notice,
}: FinishReviewDialogProps): JSX.Element {
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
  }, [isOpen]);

  return (
    <DialogPrimitive.Root
      open={isOpen}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="finish-review-overlay" />
        <DialogPrimitive.Content
          className="finish-review-dialog"
          aria-modal="true"
          onEscapeKeyDown={(event) => {
            if (busy) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (busy) event.preventDefault();
          }}
          onCloseAutoFocus={(event) => {
            // Radix's own default restore-focus can race the `aria-hidden` cleanup
            // that un-hides the background: focusing an element that is still
            // `aria-hidden` gets silently redirected to `<body>` by the browser.
            // Deferring one tick lets that cleanup finish first (verified against
            // the sidebar sheet's own hand-rolled focus-restore in Sidebar.tsx,
            // which sidesteps this by not using Radix Dialog at all).
            event.preventDefault();
            const target = previouslyFocusedRef.current;
            window.setTimeout(() => target?.focus(), 0);
          }}
        >
          <DialogPrimitive.Title className="finish-review-title">
            Finish Review
          </DialogPrimitive.Title>
          {notice ? (
            <p className="review-notice" role="status">
              {notice}
            </p>
          ) : null}
          <section aria-label="Compose comment" className="finish-review-composer">
            {inlineIntent ? (
              <p className="inline-comment-context">
                Commenting on {inlineIntent.path}:{inlineIntent.line}
              </p>
            ) : null}
            <textarea
              aria-label={inlineIntent ? "Inline comment" : "General comment"}
              placeholder={inlineIntent ? "Leave an inline comment" : "Leave a general comment"}
              value={comment}
              onChange={(event) => onCommentChange(event.target.value)}
              rows={2}
            />
            <Button
              type="button"
              variant="secondary"
              disabled={busy || comment.trim() === ""}
              onClick={onAddDraft}
            >
              {inlineIntent ? "Add inline comment" : "Add comment"}
            </Button>
          </section>
          <section aria-label="Pending comments" className="finish-review-drafts">
            {drafts.length === 0 ? (
              <p className="finish-review-drafts-empty">No pending comments.</p>
            ) : (
              <ul className="finish-review-drafts-list">
                {drafts.map((draft) => (
                  <li key={draft.id} className="finish-review-draft">
                    <div className="finish-review-draft-body">
                      <span className="finish-review-draft-anchor">
                        {draft.anchor
                          ? `${draft.anchor.path}:${draft.anchor.line}`
                          : "General comment"}
                      </span>
                      <p className="finish-review-draft-text">{draft.text}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => onSendDraftNow(draft)}
                    >
                      Send now
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-label="Finish decision" className="finish-review-decision">
            {canWriteReviews ? (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => onFinish("approved")}
                >
                  Approve
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => onFinish("changes_requested")}
                >
                  Request changes
                </Button>
              </>
            ) : (
              <p>Remote review decisions are unavailable for this connection.</p>
            )}
            <Button
              type="button"
              variant="primary"
              disabled={busy}
              onClick={() => onFinish("reviewed")}
            >
              Reviewed
            </Button>
          </section>
          <DialogPrimitive.Close asChild>
            <Button type="button" variant="ghost" size="sm" disabled={busy}>
              Cancel
            </Button>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
