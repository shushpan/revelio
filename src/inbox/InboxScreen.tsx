import { Button } from "@heroui/react/button";
import { Chip } from "@heroui/react/chip";
import type { JSX } from "react";
import { useMemo, useState } from "react";
import type { PullRequestSummary, ProviderUser } from "../providers/contracts";
import type { InboxLoadFailure } from "./load-inbox";

export interface InboxScreenProps {
  readonly user: ProviderUser;
  readonly pullRequests: ReadonlyArray<PullRequestSummary>;
  readonly failures: ReadonlyArray<InboxLoadFailure>;
  readonly reviewed: Readonly<Record<string, string>>;
  readonly onSelect: (pullRequest: PullRequestSummary) => void;
  readonly onRefresh: () => void;
  readonly onLock: () => void;
}

export const pullRequestKey = (pullRequest: PullRequestSummary): string =>
  `${pullRequest.ref.repository.workspace}/${pullRequest.ref.repository.slug}#${pullRequest.ref.id}`;

export function InboxScreen({
  user,
  pullRequests,
  failures,
  reviewed,
  onSelect,
  onRefresh,
  onLock,
}: InboxScreenProps): JSX.Element {
  const [filter, setFilter] = useState<"needs-review" | "all-open">("needs-review");
  const visiblePullRequests = useMemo(
    () =>
      pullRequests.filter(
        (pullRequest) =>
          filter === "all-open" ||
          (pullRequest.reviewerIds.includes(user.id) &&
            reviewed[pullRequestKey(pullRequest)] !== pullRequest.sourceCommit),
      ),
    [filter, pullRequests, reviewed, user.id],
  );

  return (
    <main className="app-shell inbox-page">
      <div className="inbox-toolbar">
        <div>
          <p className="eyebrow">Review inbox</p>
          <h2>Open pull requests</h2>
          <p className="inbox-copy">Signed in as {user.displayName}</p>
        </div>
        <div className="inbox-actions">
          <Button variant="secondary" onPress={onRefresh}>
            Refresh
          </Button>
          <Button variant="secondary" onPress={onLock}>
            Lock
          </Button>
        </div>
      </div>
      <fieldset className="inbox-filters">
        <legend className="sr-only">Pull request filter</legend>
        <Button
          variant={filter === "needs-review" ? "primary" : "secondary"}
          aria-pressed={filter === "needs-review"}
          onPress={() => setFilter("needs-review")}
        >
          Needs my review
        </Button>
        <Button
          variant={filter === "all-open" ? "primary" : "secondary"}
          aria-pressed={filter === "all-open"}
          onPress={() => setFilter("all-open")}
        >
          All open
        </Button>
      </fieldset>
      {failures.length > 0 ? (
        <p className="inbox-warning" role="status">
          Some repositories could not be loaded. Successful repositories remain available.
        </p>
      ) : null}
      <ul className="inbox-list">
        {visiblePullRequests.map((pullRequest) => {
          const isReviewer = pullRequest.reviewerIds.includes(user.id);
          return (
            <li key={pullRequestKey(pullRequest)}>
              <button className="inbox-row" type="button" onClick={() => onSelect(pullRequest)}>
                <span className="inbox-row-main">
                  <span className="inbox-repository">
                    {pullRequest.ref.repository.workspace}/{pullRequest.ref.repository.slug}
                  </span>
                  <strong>{pullRequest.title}</strong>
                  <span className="inbox-branches">
                    {pullRequest.sourceBranch} → {pullRequest.targetBranch}
                  </span>
                </span>
                <span className="inbox-row-meta">
                  {isReviewer ? (
                    <Chip color="accent" variant="soft">
                      Needs my review
                    </Chip>
                  ) : null}
                  <span>{pullRequest.author.displayName}</span>
                  <time dateTime={pullRequest.updatedAt}>
                    {formatUpdatedAt(pullRequest.updatedAt)}
                  </time>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {visiblePullRequests.length === 0 ? (
        <p className="inbox-empty" role="status">
          No pull requests in this view.
        </p>
      ) : null}
    </main>
  );
}

const formatUpdatedAt = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleDateString();
};
