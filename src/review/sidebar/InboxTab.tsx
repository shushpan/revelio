import type { JSX } from "react";
import type { InboxLoadSnapshot } from "../../inbox/load-inbox";
import { pullRequestKey } from "../../inbox/query";
import { reviewList } from "../../inbox/review-list";
import type { PullRequestSummary } from "../../providers/contracts";

export interface InboxTabProps {
  readonly inbox: InboxLoadSnapshot;
  readonly currentUserId: string;
  readonly currentPullRequest: PullRequestSummary;
  readonly onSelectPullRequest: (pullRequest: PullRequestSummary) => void;
  readonly busy?: boolean;
}

export function InboxTab({
  inbox,
  currentUserId,
  currentPullRequest,
  onSelectPullRequest,
  busy = false,
}: InboxTabProps): JSX.Element {
  const entries = reviewList(inbox, currentUserId, currentPullRequest);
  const currentKey = pullRequestKey(currentPullRequest);

  return (
    <div className="sidebar-inbox">
      {!inbox.isComplete ? (
        <p className="sidebar-inbox-status" role="status">
          Loaded {inbox.completedRepositories} of {inbox.totalRepositories} repositories…
        </p>
      ) : null}
      {inbox.failures.length > 0 ? (
        <p className="sidebar-inbox-warning" role="status">
          {inbox.failures.length} repositories could not be loaded.
        </p>
      ) : null}
      <ol className="sidebar-inbox-list">
        {entries.map((pullRequest) => {
          const isCurrent = pullRequestKey(pullRequest) === currentKey;
          return (
            <li key={pullRequestKey(pullRequest)}>
              <button
                type="button"
                className="sidebar-inbox-row"
                aria-current={isCurrent ? "true" : undefined}
                disabled={busy}
                onClick={() => onSelectPullRequest(pullRequest)}
              >
                <span className="sidebar-inbox-repository">
                  {pullRequest.ref.repository.workspace}/{pullRequest.ref.repository.slug} #
                  {pullRequest.ref.id}
                </span>
                <strong>{pullRequest.title}</strong>
                <span className="sidebar-inbox-author">{pullRequest.author.displayName}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
