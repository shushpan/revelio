import { Effect } from "effect";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CodeReviewProvider, PullRequestSummary } from "../../providers/contracts";
import { Sidebar } from "./Sidebar";

vi.mock("./TreeTab", () => ({
  TreeTab: () => <div data-testid="tree-tab-stub" />,
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
  reviewerIds: [],
};

const provider: CodeReviewProvider = {
  id: "test",
  capabilities: { canReadPullRequests: true, canReadReviewSignals: true, canWriteReviews: true },
  getCurrentUser: Effect.succeed({ id: "reviewer", displayName: "Reviewer" }),
  discoverRepositories: () => Effect.succeed({ workspaces: [], repositories: [], failures: [] }),
  listWorkspaces: () => Effect.succeed([]),
  listRepositories: () => Effect.succeed([]),
  listOpenPullRequests: () => Effect.succeed([]),
  getReviewSignals: () => Effect.succeed([]),
  getPullRequestDiff: () => Effect.succeed(""),
  approvePullRequest: () => Effect.succeed(undefined),
  requestChanges: () => Effect.succeed(undefined),
  addGeneralComment: () => Effect.succeed(undefined),
  addInlineComment: () => Effect.succeed(undefined),
};

describe("Sidebar", () => {
  afterEach(() => cleanup());

  it("keeps every tab panel mounted while switching the active tab", async () => {
    render(
      <Sidebar
        files={[]}
        selectedPath={null}
        onSelectPath={vi.fn()}
        pullRequest={pullRequest}
        currentUserId="reviewer"
        provider={provider}
      />,
    );

    expect(await screen.findByTestId("tree-tab-stub")).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Description" }), { button: 0 });
    expect(screen.getByTestId("tree-tab-stub")).toBeInTheDocument();
    const treePanel = document.querySelector('[id*="-content-tree"]');
    expect(treePanel).toHaveAttribute("data-state", "inactive");
  });

  it("opens and closes the narrow bottom sheet from its own trigger, via Escape or the backdrop", () => {
    render(
      <Sidebar
        files={[]}
        selectedPath={null}
        onSelectPath={vi.fn()}
        pullRequest={pullRequest}
        currentUserId="reviewer"
        provider={provider}
      />,
    );

    expect(screen.queryByLabelText("Close sidebar")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open sidebar" }));
    expect(screen.getByLabelText("Close sidebar")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByLabelText("Close sidebar")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open sidebar" }));
    fireEvent.click(screen.getByLabelText("Close sidebar"));
    expect(screen.queryByLabelText("Close sidebar")).not.toBeInTheDocument();
  });
});
