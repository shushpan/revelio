import { Button } from "@heroui/react/button";
import { Chip } from "@heroui/react/chip";
import type { JSX } from "react";
import { useMemo, useState } from "react";
import type { ProviderUser, PullRequestSummary } from "../providers/contracts";
import type { InboxLoadSnapshot } from "./load-inbox";
import { hasTerm, matchesQuery, parseQuery, pullRequestKey, toggleTerm } from "./query";

export { pullRequestKey };

const DEFAULT_QUERY = "reviewer:@me is:unreviewed";

const QUICK_FILTERS: ReadonlyArray<{ readonly label: string; readonly term: string }> = [
  { label: "Requested", term: "reviewer:@me" },
  { label: "New commits", term: "is:unreviewed" },
];

export interface InboxScreenProps {
  readonly user: ProviderUser;
  readonly inbox: InboxLoadSnapshot;
  readonly refreshError?: string;
  readonly reviewed: Readonly<Record<string, string>>;
  readonly onSelect: (pullRequest: PullRequestSummary) => void;
  readonly onRefresh: () => void;
  readonly onManageRepositories: () => void;
  readonly onLock: () => void;
}

export function InboxScreen({
  user,
  inbox,
  refreshError,
  reviewed,
  onSelect,
  onRefresh,
  onManageRepositories,
  onLock,
}: InboxScreenProps): JSX.Element {
  const [query, setQuery] = useState(DEFAULT_QUERY);
  const { pullRequests, failures, totalRepositories, completedRepositories, isComplete } = inbox;
  const reviewedKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const pullRequest of pullRequests) {
      const key = pullRequestKey(pullRequest);
      if (reviewed[key] === pullRequest.sourceCommit) keys.add(key);
    }
    return keys;
  }, [pullRequests, reviewed]);
  const visiblePullRequests = useMemo(() => {
    const parsed = parseQuery(query);
    const ctx = { currentUserId: user.id, reviewed: reviewedKeys };
    return pullRequests.filter((pullRequest) => matchesQuery(pullRequest, parsed, ctx));
  }, [pullRequests, query, reviewedKeys, user.id]);
  const isNarrowed = query.trim().length > 0 && visiblePullRequests.length !== pullRequests.length;
  const canShowEmptyCopy = isComplete && failures.length === 0 && !refreshError;

  return (
    <main className="app-shell inbox-page">
      <div className="inbox-toolbar">
        <div>
          <p className="eyebrow">Review inbox</p>
          <h2>Open pull requests</h2>
          <p className="inbox-copy">Signed in as {user.displayName}</p>
        </div>
        <div className="inbox-actions">
          <Button variant="secondary" onPress={onManageRepositories}>
            Manage repositories
          </Button>
          <Button variant="secondary" onPress={onRefresh}>
            Refresh
          </Button>
          <Button variant="secondary" onPress={onLock}>
            Lock
          </Button>
        </div>
      </div>
      <div className="inbox-filters">
        <label className="inbox-search">
          <span className="sr-only">Filter pull requests</span>
          <input
            type="search"
            className="inbox-search-input"
            placeholder="Filter pull requests (e.g. reviewer:@me is:unreviewed)"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="inbox-quick-filters">
          {QUICK_FILTERS.map(({ label, term }) => {
            const active = hasTerm(query, term);
            return (
              <Button
                key={term}
                variant={active ? "primary" : "secondary"}
                aria-pressed={active}
                onPress={() => setQuery((current) => toggleTerm(current, term))}
              >
                {label}
              </Button>
            );
          })}
        </div>
      </div>
      <p className="inbox-copy" role="status">
        Loaded {completedRepositories} of {totalRepositories} repositories - {pullRequests.length}{" "}
        pull requests found.
        {isNarrowed
          ? ` Showing ${visiblePullRequests.length} of ${pullRequests.length} actionable.`
          : ""}
      </p>
      {refreshError ? (
        <p className="inbox-warning" role="alert">
          {refreshError}
        </p>
      ) : null}
      {failures.length > 0 ? (
        <p className="inbox-warning" role="status">
          Results are incomplete: {failures.length} repositories could not be loaded.
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
      {visiblePullRequests.length === 0 && canShowEmptyCopy ? (
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
