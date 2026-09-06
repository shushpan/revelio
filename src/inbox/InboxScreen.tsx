import type { JSX } from "react";
import { useMemo, useState } from "react";
import type { ProviderUser, PullRequestSummary } from "../providers/contracts";
import { Button } from "../ui/Button";
import { Chip } from "../ui/Chip";
import { type ThemeChoice, ThemeControl } from "../ui/ThemeControl";
import type { InboxLoadSnapshot } from "./load-inbox";
import {
  hasTerm,
  matchesQuery,
  parseQuery,
  pullRequestKey,
  toggleTerm,
  validateQuery,
} from "./query";

export { pullRequestKey };

const DEFAULT_QUERY = "reviewer:@me is:unreviewed";

const QUICK_FILTERS: ReadonlyArray<{ readonly label: string; readonly term: string }> = [
  { label: "Requested", term: "reviewer:@me" },
  { label: "Unreviewed", term: "is:unreviewed" },
  { label: "Reviewed", term: "is:reviewed" },
];

const REVIEW_STATE_TERMS = new Set(["is:reviewed", "is:unreviewed"]);

const normalizeReviewStateTerm = (term: string): string =>
  term.toLowerCase().replace(/^is:"([^"]*)"$/, "is:$1");

const isReviewStateTerm = (term: string): boolean =>
  REVIEW_STATE_TERMS.has(normalizeReviewStateTerm(term));

const toggleQuickFilter = (input: string, term: string): string => {
  if (!isReviewStateTerm(term)) return toggleTerm(input, term);

  const tokens = input.split(/\s+/).filter((token) => token.length > 0);
  const target = normalizeReviewStateTerm(term);
  const isActive = tokens.some((token) => normalizeReviewStateTerm(token) === target);
  const withoutReviewState = tokens.filter((token) => !isReviewStateTerm(token));
  return isActive ? withoutReviewState.join(" ") : [...withoutReviewState, term].join(" ");
};

const validationMessage = (issue: ReturnType<typeof validateQuery>[number]): string => {
  switch (issue.reason) {
    case "unsupported-qualifier":
      return `Unsupported filter: ${issue.token}.`;
    case "unsupported-value":
      return `Unsupported value: ${issue.token}.`;
    case "unterminated-quote":
      return `Finish the quote in ${issue.token}.`;
  }
};

export interface InboxScreenProps {
  readonly user: ProviderUser;
  readonly inbox: InboxLoadSnapshot;
  readonly refreshError?: string;
  readonly reviewed: Readonly<Record<string, string>>;
  readonly onSelect: (pullRequest: PullRequestSummary) => void;
  readonly onRefresh: () => void;
  readonly onManageRepositories: () => void;
  readonly onLock: () => void;
  readonly theme: ThemeChoice;
  readonly resolvedTheme: "light" | "dark";
  readonly onThemeChange: (theme: ThemeChoice) => void;
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
  theme,
  resolvedTheme,
  onThemeChange,
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
  const queryIssues = useMemo(() => validateQuery(query), [query]);
  const visiblePullRequests = useMemo(() => {
    if (queryIssues.length > 0) return pullRequests;
    const parsed = parseQuery(query);
    const ctx = { currentUserId: user.id, reviewed: reviewedKeys };
    return pullRequests.filter((pullRequest) => matchesQuery(pullRequest, parsed, ctx));
  }, [pullRequests, query, queryIssues.length, reviewedKeys, user.id]);
  const isNarrowed =
    queryIssues.length === 0 &&
    query.trim().length > 0 &&
    visiblePullRequests.length !== pullRequests.length;
  const canShowEmptyCopy =
    queryIssues.length === 0 && isComplete && failures.length === 0 && !refreshError;

  return (
    <main className="inbox-page">
      <header className="inbox-toolbar">
        <div className="inbox-toolbar-identity">
          <h2>Open pull requests</h2>
          <span className="inbox-toolbar-user">Signed in as {user.displayName}</span>
        </div>
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
            const active = isReviewStateTerm(term)
              ? query.split(/\s+/).some((token) => normalizeReviewStateTerm(token) === term)
              : hasTerm(query, term);
            return (
              <Button
                key={term}
                size="sm"
                variant={active ? "primary" : "secondary"}
                aria-pressed={active}
                onClick={() => setQuery((current) => toggleQuickFilter(current, term))}
              >
                {label}
              </Button>
            );
          })}
        </div>
        <div className="inbox-actions">
          <Button size="sm" variant="secondary" onClick={onManageRepositories}>
            Manage repositories
          </Button>
          <Button size="sm" variant="secondary" onClick={onRefresh}>
            Refresh
          </Button>
          <Button size="sm" variant="secondary" onClick={onLock}>
            Lock
          </Button>
        </div>
        <ThemeControl theme={theme} resolvedTheme={resolvedTheme} onThemeChange={onThemeChange} />
      </header>
      <div className="inbox-body">
        {queryIssues.map((issue) => (
          <p key={`${issue.reason}:${issue.token}`} className="inbox-warning" role="status">
            {validationMessage(issue)}
          </p>
        ))}
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
                    {isReviewer ? <Chip variant="accent">Needs my review</Chip> : null}
                    <Chip variant="neutral">{pullRequest.state}</Chip>
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
      </div>
    </main>
  );
}

const formatUpdatedAt = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleDateString();
};
