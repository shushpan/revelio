import { describe, expect, it } from "vitest";
import type { ProviderUser, PullRequestSummary } from "../providers/contracts";
import { matchesQuery, parseQuery, pullRequestKey, toggleTerm } from "./query";

const author: ProviderUser = { id: "author-id", displayName: "Jane Doe", nickname: "jdoe" };

const pr = (overrides: Partial<PullRequestSummary> = {}): PullRequestSummary => ({
  ref: { repository: { workspace: "acme", slug: "web" }, id: 7 },
  title: "Fix login redirect",
  description: "",
  state: "OPEN",
  updatedAt: "2026-08-29T10:00:00Z",
  sourceBranch: "feature/login",
  targetBranch: "main",
  sourceCommit: "abc123",
  author,
  reviewerIds: ["me-id", "other-id"],
  ...overrides,
});

const ctx = (over: Partial<{ currentUserId: string; reviewed: ReadonlySet<string> }> = {}) => ({
  currentUserId: "me-id",
  reviewed: new Set<string>(),
  ...over,
});

const match = (input: string, pullRequest: PullRequestSummary, context = ctx()): boolean =>
  matchesQuery(pullRequest, parseQuery(input), context);

describe("parseQuery", () => {
  it("splits terms on spaces and parses qualifier key/value", () => {
    const parsed = parseQuery("author:jane reviewer:me-id");
    expect(parsed.terms).toEqual([
      { negated: false, key: "author", value: "jane" },
      { negated: false, key: "reviewer", value: "me-id" },
    ]);
  });

  it("marks leading dash terms as negated", () => {
    const parsed = parseQuery("-author:jane");
    expect(parsed.terms).toEqual([{ negated: true, key: "author", value: "jane" }]);
  });

  it("treats bare words as free-text terms with empty key", () => {
    const parsed = parseQuery("login redirect");
    expect(parsed.terms).toEqual([
      { negated: false, key: "", value: "login" },
      { negated: false, key: "", value: "redirect" },
    ]);
  });

  it("keeps quoted values intact including spaces", () => {
    const parsed = parseQuery('author:"Jane Doe" "fix bug"');
    expect(parsed.terms).toEqual([
      { negated: false, key: "author", value: "Jane Doe" },
      { negated: false, key: "", value: "fix bug" },
    ]);
  });
});

describe("matchesQuery identity qualifiers", () => {
  it("author: matches by id, display name, or nickname (case-insensitive)", () => {
    expect(match("author:author-id", pr())).toBe(true);
    expect(match("author:jane doe", pr())).toBe(false); // space would split; quoted below
    expect(match('author:"jane doe"', pr())).toBe(true);
    expect(match("author:jdoe", pr())).toBe(true);
    expect(match("author:someone", pr())).toBe(false);
  });

  it("author:@me resolves to the current user id", () => {
    expect(match("author:@me", pr({ author: { id: "me-id", displayName: "Me" } }))).toBe(true);
    expect(match("author:@me", pr())).toBe(false);
  });

  it("reviewer: matches a reviewer id", () => {
    expect(match("reviewer:me-id", pr())).toBe(true);
    expect(match("reviewer:@me", pr())).toBe(true);
    expect(match("reviewer:nobody", pr())).toBe(false);
  });

  it("review-requested: matches requested reviewers (same field as reviewer)", () => {
    expect(match("review-requested:@me", pr())).toBe(true);
    expect(match("review-requested:@me", pr({ reviewerIds: ["other-id"] }))).toBe(false);
  });

  it("involves: matches author or reviewer", () => {
    expect(match("involves:@me", pr())).toBe(true); // reviewer
    expect(match("involves:author-id", pr())).toBe(true); // author
    expect(
      match("involves:@me", pr({ reviewerIds: [], author: { id: "x", displayName: "X" } })),
    ).toBe(false);
  });
});

describe("matchesQuery location qualifiers", () => {
  it("repo: matches slug or workspace/slug", () => {
    expect(match("repo:web", pr())).toBe(true);
    expect(match("repo:acme/web", pr())).toBe(true);
    expect(match("repo:api", pr())).toBe(false);
  });

  it("workspace: matches the workspace", () => {
    expect(match("workspace:acme", pr())).toBe(true);
    expect(match("workspace:other", pr())).toBe(false);
  });
});

describe("matchesQuery review state", () => {
  it("is:reviewed / is:unreviewed reflect the reviewed set", () => {
    const key = pullRequestKey(pr());
    const reviewed = new Set([key]);
    expect(match("is:reviewed", pr(), ctx({ reviewed }))).toBe(true);
    expect(match("is:unreviewed", pr(), ctx({ reviewed }))).toBe(false);
    expect(match("is:reviewed", pr())).toBe(false);
    expect(match("is:unreviewed", pr())).toBe(true);
  });
});

describe("matchesQuery free text and combinators", () => {
  it("free text matches a title substring case-insensitively", () => {
    expect(match("login", pr())).toBe(true);
    expect(match("LOGIN", pr())).toBe(true);
    expect(match("logout", pr())).toBe(false);
  });

  it("space means AND across different qualifiers", () => {
    expect(match("workspace:acme repo:web", pr())).toBe(true);
    expect(match("workspace:acme repo:api", pr())).toBe(false);
  });

  it("leading dash excludes matches", () => {
    expect(match("-repo:web", pr())).toBe(false);
    expect(match("-repo:api", pr())).toBe(true);
    expect(match("workspace:acme -author:@me", pr())).toBe(true);
  });

  it("repeated compatible qualifiers express OR", () => {
    expect(match("repo:web repo:api", pr())).toBe(true);
    expect(match("repo:foo repo:api", pr())).toBe(false);
  });
});

describe("toggleTerm", () => {
  it("appends a term when absent and removes it when present", () => {
    expect(toggleTerm("", "reviewer:@me")).toBe("reviewer:@me");
    expect(toggleTerm("is:unreviewed", "reviewer:@me")).toBe("is:unreviewed reviewer:@me");
    expect(toggleTerm("reviewer:@me is:unreviewed", "reviewer:@me")).toBe("is:unreviewed");
  });
});
