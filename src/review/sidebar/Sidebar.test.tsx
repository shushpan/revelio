import { Effect } from "effect";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  CodeReviewProvider,
  PullRequestSummary,
  ReviewSignal,
} from "../../providers/contracts";
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

function makeProvider(
  getReviewSignals: CodeReviewProvider["getReviewSignals"] = () => Effect.succeed([]),
): CodeReviewProvider {
  return {
    id: "test",
    capabilities: { canReadPullRequests: true, canReadReviewSignals: true, canWriteReviews: true },
    getCurrentUser: Effect.succeed({ id: "reviewer", displayName: "Reviewer" }),
    discoverRepositories: () => Effect.succeed({ workspaces: [], repositories: [], failures: [] }),
    listWorkspaces: () => Effect.succeed([]),
    listRepositories: () => Effect.succeed([]),
    listOpenPullRequests: () => Effect.succeed([]),
    getReviewSignals,
    getPullRequestDiff: () => Effect.succeed(""),
    approvePullRequest: () => Effect.succeed(undefined),
    requestChanges: () => Effect.succeed(undefined),
    addGeneralComment: () => Effect.succeed(undefined),
    addInlineComment: () => Effect.succeed(undefined),
  };
}

const provider = makeProvider();

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

  it("gives the open sheet dialog semantics and moves initial focus inside it", async () => {
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

    fireEvent.click(screen.getByRole("button", { name: "Open sidebar" }));

    const sheet = screen.getByRole("dialog", { name: "Review sidebar" });
    expect(sheet).toHaveAttribute("aria-modal", "true");
    await waitFor(() => expect(sheet.contains(document.activeElement)).toBe(true));
    expect(screen.getByRole("tab", { name: "Tree" })).toHaveFocus();
  });

  it("returns focus to the Open sidebar trigger when the sheet closes via Escape", async () => {
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

    fireEvent.click(screen.getByRole("button", { name: "Open sidebar" }));
    await waitFor(() => expect(screen.getByRole("tab", { name: "Tree" })).toHaveFocus());

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(screen.getByRole("button", { name: "Open sidebar" })).toHaveFocus());
  });

  it("traps focus in the open sheet by recapturing it if it ever lands outside", async () => {
    render(
      <div>
        <button type="button" data-testid="outside-button">
          Outside
        </button>
        <Sidebar
          files={[]}
          selectedPath={null}
          onSelectPath={vi.fn()}
          pullRequest={pullRequest}
          currentUserId="reviewer"
          provider={provider}
        />
      </div>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open sidebar" }));
    const treeTab = screen.getByRole("tab", { name: "Tree" });
    await waitFor(() => expect(treeTab).toHaveFocus());

    screen.getByTestId("outside-button").focus();

    await waitFor(() => expect(treeTab).toHaveFocus());
  });

  it("suppresses background interaction while the sheet is open and releases it on close", () => {
    render(
      <div>
        <button type="button" data-testid="outside-button">
          Outside
        </button>
        <Sidebar
          files={[]}
          selectedPath={null}
          onSelectPath={vi.fn()}
          pullRequest={pullRequest}
          currentUserId="reviewer"
          provider={provider}
        />
      </div>,
    );

    const outside = screen.getByTestId("outside-button");
    expect(outside).not.toHaveAttribute("inert");

    fireEvent.click(screen.getByRole("button", { name: "Open sidebar" }));
    expect(outside).toHaveAttribute("inert");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(outside).not.toHaveAttribute("inert");
  });

  it("never renders more than one tree/tab instance, open or closed", () => {
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

    expect(screen.getAllByTestId("tree-tab-stub")).toHaveLength(1);
    expect(document.querySelectorAll('[role="tablist"]')).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Open sidebar" }));

    expect(screen.getAllByTestId("tree-tab-stub")).toHaveLength(1);
    expect(document.querySelectorAll('[role="tablist"]')).toHaveLength(1);
  });

  it("gives each sidebar tab trigger an icon, an accessible name, and a distinct tooltip", () => {
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

    const cases: ReadonlyArray<readonly [string, string]> = [
      ["Tree", "Browse changed files"],
      ["Description", "Pull request description and reviewers"],
      ["Activity", "Review activity timeline"],
    ];

    for (const [name, tooltip] of cases) {
      const trigger = screen.getByRole("tab", { name });
      expect(trigger.querySelector("svg")).toBeInTheDocument();
      expect(tooltip).not.toBe(name);
      expect(trigger).toHaveAttribute("title", tooltip);
    }
  });

  it("loads review signals once when Description opens first, and Activity reuses the result", async () => {
    const signals: ReviewSignal[] = [
      { id: "1", kind: "approved", actorId: "reviewer", createdAt: "2026-08-29T09:00:00Z" },
    ];
    const getReviewSignals = vi.fn(() => Effect.succeed(signals));
    render(
      <Sidebar
        files={[]}
        selectedPath={null}
        onSelectPath={vi.fn()}
        pullRequest={{ ...pullRequest, reviewerIds: ["reviewer"] }}
        currentUserId="reviewer"
        provider={makeProvider(getReviewSignals)}
      />,
    );

    expect(getReviewSignals).not.toHaveBeenCalled();

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Description" }), { button: 0 });
    await waitFor(() => expect(getReviewSignals).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Approved")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Activity" }), { button: 0 });
    expect(await screen.findAllByText("approved")).not.toHaveLength(0);
    expect(getReviewSignals).toHaveBeenCalledTimes(1);
  });

  it("loads review signals once when Activity opens first, and Description reuses the result", async () => {
    const signals: ReviewSignal[] = [
      {
        id: "1",
        kind: "changes_requested",
        actorId: "reviewer",
        createdAt: "2026-08-29T09:00:00Z",
      },
    ];
    const getReviewSignals = vi.fn(() => Effect.succeed(signals));
    render(
      <Sidebar
        files={[]}
        selectedPath={null}
        onSelectPath={vi.fn()}
        pullRequest={{ ...pullRequest, reviewerIds: ["reviewer"] }}
        currentUserId="reviewer"
        provider={makeProvider(getReviewSignals)}
      />,
    );

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Activity" }), { button: 0 });
    await waitFor(() => expect(getReviewSignals).toHaveBeenCalledTimes(1));
    expect(await screen.findAllByText("requested changes")).not.toHaveLength(0);

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Description" }), { button: 0 });
    expect(await screen.findByText("Changes requested")).toBeInTheDocument();
    expect(getReviewSignals).toHaveBeenCalledTimes(1);
  });
});
