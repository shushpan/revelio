import { Effect } from "effect";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CodeReviewProvider, PullRequestSummary } from "../providers/contracts";
import { ReviewScreen } from "./ReviewScreen";

vi.mock("./DiffReview", () => ({
  DiffReview: ({
    onInlineComment,
  }: {
    onInlineComment?: (intent: { path: string; line: number; side: "additions" }) => void;
  }) => (
    <button
      type="button"
      onClick={() => onInlineComment?.({ path: "src/a.ts", line: 3, side: "additions" })}
    >
      Choose inline line
    </button>
  ),
}));

const pullRequest: PullRequestSummary = {
  ref: { repository: { workspace: "acme", slug: "review" }, id: 7 },
  title: "Review this change",
  description: "",
  state: "OPEN",
  updatedAt: "2026-08-29T10:00:00Z",
  sourceBranch: "feature/review",
  targetBranch: "main",
  sourceCommit: "abc123",
  author: { id: "author", displayName: "Author" },
  reviewerIds: ["reviewer"],
};

const provider = (
  addGeneralComment: CodeReviewProvider["addGeneralComment"],
): CodeReviewProvider => ({
  id: "test",
  capabilities: { canReadPullRequests: true, canReadReviewSignals: false, canWriteReviews: true },
  getCurrentUser: Effect.succeed({ id: "reviewer", displayName: "Reviewer" }),
  discoverRepositories: () => Effect.succeed({ workspaces: [], repositories: [], failures: [] }),
  listWorkspaces: () => Effect.succeed([]),
  listRepositories: () => Effect.succeed([]),
  listOpenPullRequests: () => Effect.succeed([]),
  getReviewSignals: () => Effect.succeed([]),
  getPullRequestDiff: () => Effect.succeed("diff --git a/a.ts b/a.ts"),
  approvePullRequest: () => Effect.succeed(undefined),
  requestChanges: () => Effect.succeed(undefined),
  addGeneralComment,
  addInlineComment: () =>
    Effect.fail({
      _tag: "Forbidden",
      message: "Provider denied the requested permission",
      operation: "inline comment",
      status: 403,
    }),
});

describe("ReviewScreen", () => {
  it("keeps a failed general comment in place without checkpointing", async () => {
    const onMarkReviewed = vi.fn();
    render(
      <ReviewScreen
        provider={provider(() =>
          Effect.fail({
            _tag: "Forbidden",
            message: "Provider denied the requested permission",
            operation: "general comment",
            status: 403,
          }),
        )}
        pullRequest={pullRequest}
        themeType="light"
        currentUserId="reviewer"
        queue={[pullRequest]}
        reviewed={{}}
        onBack={vi.fn()}
        onMarkReviewed={onMarkReviewed}
        onSelectPullRequest={vi.fn()}
      />,
    );

    const comment = screen.getByRole("textbox", { name: "General comment" });
    fireEvent.change(comment, { target: { value: "Keep this text" } });
    fireEvent.click(screen.getByRole("button", { name: "Send comment" }));

    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "General comment" })).toHaveValue(
        "Keep this text",
      ),
    );
    expect(onMarkReviewed).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("could not be sent");
  });

  it("keeps a failed inline comment and its selected line in place", async () => {
    const onMarkReviewed = vi.fn();
    render(
      <ReviewScreen
        provider={provider(() => Effect.succeed(undefined))}
        pullRequest={pullRequest}
        themeType="light"
        currentUserId="reviewer"
        queue={[pullRequest]}
        reviewed={{}}
        onBack={vi.fn()}
        onMarkReviewed={onMarkReviewed}
        onSelectPullRequest={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Choose inline line" }));
    const comment = screen.getByRole("textbox", { name: "Inline comment" });
    fireEvent.change(comment, { target: { value: "Inline text" } });
    fireEvent.click(screen.getByRole("button", { name: "Send inline comment" }));

    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Inline comment" })).toHaveValue("Inline text"),
    );
    expect(screen.getByText("Commenting on src/a.ts:3")).toBeInTheDocument();
    expect(onMarkReviewed).not.toHaveBeenCalled();
  });
});
