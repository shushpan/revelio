import type { JSX } from "react";
import { useEffect } from "react";
import type { PullRequestSummary } from "../providers/contracts";
import { pullRequestKey } from "../inbox/InboxScreen";

export interface QueueDrawerProps {
  readonly queue: ReadonlyArray<PullRequestSummary>;
  readonly currentIndex: number;
  readonly isOpen: boolean;
  readonly onSelect: (pullRequest: PullRequestSummary) => void;
  readonly onClose: () => void;
}

export function QueueDrawer({
  queue,
  currentIndex,
  isOpen,
  onSelect,
  onClose,
}: QueueDrawerProps): JSX.Element | null {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="queue-drawer-overlay" style={overlayStyle}>
      <button
        type="button"
        className="queue-drawer-backdrop"
        aria-label="Close review queue"
        style={backdropStyle}
        onClick={onClose}
      />
      <aside role="dialog" aria-label="Review queue" className="queue-drawer" style={panelStyle}>
        <header className="queue-drawer-header">
          <h2>Review queue</h2>
        </header>
        <ol className="queue-drawer-list">
          {queue.map((pullRequest, index) => {
            const isCurrent = index === currentIndex;
            return (
              <li key={pullRequestKey(pullRequest)}>
                <button
                  type="button"
                  className="queue-drawer-row"
                  aria-current={isCurrent ? "true" : undefined}
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
      </aside>
    </div>
  );
}

const overlayStyle = {
  position: "fixed",
  inset: 0,
  display: "flex",
  justifyContent: "flex-end",
  zIndex: 50,
} as const;

const backdropStyle = {
  position: "absolute",
  inset: 0,
  border: "none",
  padding: 0,
  background: "rgba(0, 0, 0, 0.4)",
  cursor: "pointer",
} as const;

const panelStyle = {
  position: "relative",
  width: "min(22rem, 90vw)",
  height: "100%",
  overflowY: "auto",
  background: "var(--surface, #fff)",
  boxShadow: "-8px 0 24px rgba(0, 0, 0, 0.2)",
} as const;
