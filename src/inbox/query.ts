import type { ProviderUser, PullRequestSummary } from "../providers/contracts";

export interface QueryTerm {
  readonly negated: boolean;
  /** Qualifier name (e.g. "author"), or "" for free-text terms. */
  readonly key: string;
  readonly value: string;
}

export interface ParsedQuery {
  readonly terms: ReadonlyArray<QueryTerm>;
}

export interface QueryContext {
  readonly currentUserId: string;
  /** Keys of pull requests the current user has reviewed at their current source commit. */
  readonly reviewed: ReadonlySet<string>;
}

export interface QueryValidationIssue {
  readonly token: string;
  readonly reason: "unsupported-qualifier" | "unsupported-value" | "unterminated-quote";
}

export const pullRequestKey = (pullRequest: PullRequestSummary): string =>
  `${pullRequest.ref.repository.workspace}/${pullRequest.ref.repository.slug}#${pullRequest.ref.id}`;

const TOKEN = /(-?)([\w-]+:)?("[^"]*"|\S+)/g;
const VALUELESS_QUALIFIER = /(?:^|\s)(-?)([\w-]+:)(?=\s|$)/g;

const SUPPORTED_QUALIFIERS = new Set([
  "author",
  "reviewer",
  "review-requested",
  "involves",
  "repo",
  "workspace",
  "is",
]);

const SUPPORTED_VALUES: Readonly<Record<string, ReadonlySet<string>>> = {
  is: new Set(["reviewed", "unreviewed", "open"]),
};

export const parseQuery = (input: string): ParsedQuery => {
  const terms: QueryTerm[] = [];
  for (const groups of input.matchAll(TOKEN)) {
    const [, dash, rawKey, rawValue] = groups;
    const key = rawKey ? rawKey.slice(0, -1).toLowerCase() : "";
    const value = rawValue.startsWith('"') ? rawValue.slice(1, -1) : rawValue;
    if (key === "" && value === "") continue;
    terms.push({ negated: dash === "-", key, value });
  }
  return { terms };
};

export const validateQuery = (input: string): ReadonlyArray<QueryValidationIssue> => {
  const quotes = [...input].filter((character) => character === '"').length;
  if (quotes % 2 !== 0) {
    const start = input.lastIndexOf(" ", input.lastIndexOf('"')) + 1;
    return [{ token: input.slice(start).trim(), reason: "unterminated-quote" }];
  }

  const issues: Array<QueryValidationIssue & { readonly index: number }> = [];
  for (const groups of input.matchAll(VALUELESS_QUALIFIER)) {
    const [match, , rawKey] = groups;
    const key = rawKey.slice(0, -1).toLowerCase();
    issues.push({
      token: rawKey,
      reason: SUPPORTED_QUALIFIERS.has(key) ? "unsupported-value" : "unsupported-qualifier",
      index: (groups.index ?? 0) + match.lastIndexOf(rawKey),
    });
  }
  for (const groups of input.matchAll(TOKEN)) {
    const [token, , rawKey, rawValue] = groups;
    if (!rawKey) continue;

    const key = rawKey.slice(0, -1).toLowerCase();
    if (!SUPPORTED_QUALIFIERS.has(key)) {
      issues.push({ token, reason: "unsupported-qualifier", index: groups.index ?? 0 });
      continue;
    }

    const supportedValues = SUPPORTED_VALUES[key];
    const value = rawValue.startsWith('"') ? rawValue.slice(1, -1) : rawValue;
    if (supportedValues && !supportedValues.has(value.toLowerCase())) {
      issues.push({ token, reason: "unsupported-value", index: groups.index ?? 0 });
    }
  }
  return issues
    .sort((left, right) => left.index - right.index)
    .map(({ token, reason }) => ({ token, reason }));
};

const resolve = (value: string, ctx: QueryContext): string =>
  value === "@me" ? ctx.currentUserId : value;

const matchesUser = (user: ProviderUser, value: string, ctx: QueryContext): boolean => {
  const resolved = resolve(value, ctx).toLowerCase();
  return (
    user.id.toLowerCase() === resolved ||
    user.displayName.toLowerCase() === resolved ||
    (user.nickname?.toLowerCase() ?? "") === resolved
  );
};

const matchesReviewer = (pr: PullRequestSummary, value: string, ctx: QueryContext): boolean => {
  const resolved = resolve(value, ctx).toLowerCase();
  return pr.reviewerIds.some((id) => id.toLowerCase() === resolved);
};

const matchesTerm = (pr: PullRequestSummary, term: QueryTerm, ctx: QueryContext): boolean => {
  const value = term.value;
  switch (term.key) {
    case "":
      return pr.title.toLowerCase().includes(value.toLowerCase());
    case "author":
      return matchesUser(pr.author, value, ctx);
    case "reviewer":
    case "review-requested":
      return matchesReviewer(pr, value, ctx);
    case "involves":
      return matchesUser(pr.author, value, ctx) || matchesReviewer(pr, value, ctx);
    case "repo": {
      const v = value.toLowerCase();
      const { workspace, slug } = pr.ref.repository;
      return slug.toLowerCase() === v || `${workspace}/${slug}`.toLowerCase() === v;
    }
    case "workspace":
      return pr.ref.repository.workspace.toLowerCase() === value.toLowerCase();
    case "is": {
      const reviewed = ctx.reviewed.has(pullRequestKey(pr));
      switch (value.toLowerCase()) {
        case "reviewed":
          return reviewed;
        case "unreviewed":
          return !reviewed;
        case "open":
          return pr.state === "OPEN";
        default:
          return false;
      }
    }
    default:
      return false;
  }
};

export const matchesQuery = (
  pr: PullRequestSummary,
  query: ParsedQuery,
  ctx: QueryContext,
): boolean => {
  const groups = new Map<string, QueryTerm[]>();
  for (const term of query.terms) {
    if (term.negated) {
      if (matchesTerm(pr, term, ctx)) return false;
      continue;
    }
    const bucket = groups.get(term.key);
    if (bucket) bucket.push(term);
    else groups.set(term.key, [term]);
  }
  for (const bucket of groups.values()) {
    if (!bucket.some((term) => matchesTerm(pr, term, ctx))) return false;
  }
  return true;
};

const termToken = (term: string): string => term.trim();

export const toggleTerm = (input: string, term: string): string => {
  const target = termToken(term);
  const tokens = input.split(/\s+/).filter((t) => t.length > 0);
  const next = tokens.includes(target) ? tokens.filter((t) => t !== target) : [...tokens, target];
  return next.join(" ");
};

export const hasTerm = (input: string, term: string): boolean =>
  input.split(/\s+/).includes(termToken(term));
