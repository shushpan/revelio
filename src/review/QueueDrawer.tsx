import * as DialogPrimitive from "@radix-ui/react-dialog";
import { type JSX, useEffect, useRef } from "react";
import type { PullRequestSummary } from "../providers/contracts";
import { pullRequestKey } from "../inbox/InboxScreen";
import { Button } from "../ui/Button";

export interface QueueDrawerProps {
  readonly queue: ReadonlyArray<PullRequestSummary>;
  readonly currentIndex: number;
  readonly isOpen: boolean;
  readonly busy?: boolean;
  readonly onSelect: (pullRequest: PullRequestSummary) => void;
  readonly onClose: () => void;
}

export function QueueDrawer({
  queue,
  currentIndex,
  isOpen,
  busy = false,
  onSelect,
  onClose,
}: QueueDrawerProps): JSX.Element {
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
  }, [isOpen]);

  return (
    <DialogPrimitive.Root
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="queue-drawer-overlay"
          data-testid="queue-drawer-overlay"
        />
        <DialogPrimitive.Content
          className="queue-drawer"
          onCloseAutoFocus={(event) => {
            // See FinishReviewDialog.tsx: Radix's default restore-focus races the
            // `aria-hidden` cleanup on the background, so defer one tick.
            event.preventDefault();
            const target = previouslyFocusedRef.current;
            window.setTimeout(() => target?.focus(), 0);
          }}
        >
          <DialogPrimitive.Title className="queue-drawer-title">Review queue</DialogPrimitive.Title>
          <ol className="queue-drawer-list">
            {queue.map((pullRequest, index) => {
              const isCurrent = index === currentIndex;
              return (
                <li key={pullRequestKey(pullRequest)}>
                  <button
                    type="button"
                    className="queue-drawer-row"
                    aria-current={isCurrent ? "true" : undefined}
                    disabled={busy}
                    onClick={() => onSelect(pullRequest)}
                  >
                    <span className="queue-drawer-repository">
                      {pullRequest.ref.repository.workspace}/{pullRequest.ref.repository.slug} #
                      {pullRequest.ref.id}
                    </span>
                    <strong>{pullRequest.title}</strong>
                    <span className="queue-drawer-author">{pullRequest.author.displayName}</span>
                  </button>
                </li>
              );
            })}
          </ol>
          <DialogPrimitive.Close asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Close review queue"
              disabled={busy}
            >
              Close
            </Button>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
