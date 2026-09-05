import { Effect } from "effect";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CodeReviewProvider, PullRequestSummary } from "../providers/contracts";
import { ReviewScreen } from "./ReviewScreen";

vi.mock("./DiffReview", () => ({
  DiffReview: ({
    onInlineComment,
    onActivePathChange,
    activePath,
    layout,
    collapsedAll,
  }: {
    onInlineComment?: (intent: { path: string; line: number; side: "additions" }) => void;
    onActivePathChange?: (path: string) => void;
    activePath?: string | null;
    layout?: string;
    collapsedAll?: boolean;
  }) => (
    <div
      data-testid="diff-review-mock"
      data-active-path={activePath ?? ""}
      data-layout={layout}
      data-collapsed-all={collapsedAll}
    >
      <button
        type="button"
        onClick={() => onInlineComment?.({ path: "src/a.ts", line: 3, side: "additions" })}
      >
        Choose inline line
      </button>
      <button type="button" onClick={() => onActivePathChange?.("src/diff-origin.ts")}>
        Simulate diff-originated selection
      </button>
    </div>
  ),
}));

vi.mock("./sidebar/Sidebar", () => ({
  Sidebar: ({
    selectedPath,
    onSelectPath,
  }: {
    selectedPath: string | null;
    onSelectPath: (path: string) => void;
  }) => (
    <div data-testid="sidebar-mock" data-selected-path={selectedPath ?? ""}>
      <button type="button" onClick={() => onSelectPath("src/tree-origin.ts")}>
        Select tree file
      </button>
    </div>
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
  overrides: Partial<CodeReviewProvider> = {},
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
  ...overrides,
});

function clickFinish(): void {
  fireEvent.click(screen.getAllByRole("button", { name: "Finish Review" })[0]);
}

describe("ReviewScreen", () => {
  afterEach(() => cleanup());

  it("advances from a middle queue item to the following item", async () => {
    const first = { ...pullRequest, ref: { ...pullRequest.ref, id: 6 }, title: "First" };
    const last = { ...pullRequest, ref: { ...pullRequest.ref, id: 8 }, title: "Last" };
    const onSelectPullRequest = vi.fn();
    render(
      <ReviewScreen
        provider={provider(() => Effect.succeed(undefined), {
          listOpenPullRequests: () => Effect.succeed([pullRequest]),
        })}
        pullRequest={pullRequest}
        themeType="light"
        theme="system"
        onThemeChange={vi.fn()}
        currentUserId="reviewer"
        queue={[first, pullRequest, last]}
        onBack={vi.fn()}
        onSelectPullRequest={onSelectPullRequest}
        saveCheckpoint={() => Promise.resolve()}
      />,
    );

    clickFinish();
    fireEvent.click(screen.getByRole("button", { name: "Reviewed" }));

    await waitFor(() => expect(onSelectPullRequest).toHaveBeenCalledWith(last));
  });

  it("does not reuse a failed decision receipt after changing pull requests", async () => {
    const nextPullRequest = { ...pullRequest, ref: { ...pullRequest.ref, id: 8 }, title: "Next" };
    const approvePullRequest = vi.fn(() => Effect.succeed(undefined));
    const saveCheckpoint = vi.fn(() => Promise.reject(new Error("storage failed")));
    const reviewProvider = provider(() => Effect.succeed(undefined), {
      approvePullRequest,
      listOpenPullRequests: () => Effect.succeed([pullRequest, nextPullRequest]),
    });
    const view = render(
      <ReviewScreen
        provider={reviewProvider}
        pullRequest={pullRequest}
        themeType="light"
        theme="system"
        onThemeChange={vi.fn()}
        currentUserId="reviewer"
        queue={[pullRequest, nextPullRequest]}
        onBack={vi.fn()}
        onSelectPullRequest={vi.fn()}
        saveCheckpoint={saveCheckpoint}
      />,
    );

    clickFinish();
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(approvePullRequest).toHaveBeenCalledTimes(1));

    view.rerender(
      <ReviewScreen
        provider={reviewProvider}
        pullRequest={nextPullRequest}
        themeType="light"
        theme="system"
        onThemeChange={vi.fn()}
        currentUserId="reviewer"
        queue={[pullRequest, nextPullRequest]}
        onBack={vi.fn()}
        onSelectPullRequest={vi.fn()}
        saveCheckpoint={saveCheckpoint}
      />,
    );
    clickFinish();
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() => expect(approvePullRequest).toHaveBeenCalledTimes(2));
  });

  it("does not reuse an approved receipt when the chosen outcome changes", async () => {
    const approvePullRequest = vi.fn(() => Effect.succeed(undefined));
    const requestChanges = vi.fn(() => Effect.succeed(undefined));
    const saveCheckpoint = vi.fn(() => Promise.reject(new Error("storage failed")));
    render(
      <ReviewScreen
        provider={provider(() => Effect.succeed(undefined), {
          approvePullRequest,
          requestChanges,
          listOpenPullRequests: () => Effect.succeed([pullRequest]),
        })}
        pullRequest={pullRequest}
        themeType="light"
        theme="system"
        onThemeChange={vi.fn()}
        currentUserId="reviewer"
        queue={[pullRequest]}
        onBack={vi.fn()}
        onSelectPullRequest={vi.fn()}
        saveCheckpoint={saveCheckpoint}
      />,
    );

    clickFinish();
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(approvePullRequest).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Request changes" }));

    await waitFor(() => expect(requestChanges).toHaveBeenCalledTimes(1));
  });

  it("persists a reviewed checkpoint before advancing to the next captured queue item", async () => {
    const saveCheckpoint = vi.fn(() => Promise.resolve());
    const onSelectPullRequest = vi.fn();
    const nextPullRequest = {
      ...pullRequest,
      ref: { ...pullRequest.ref, id: 8 },
      title: "Next review",
    };
    render(
      <ReviewScreen
        provider={provider(() => Effect.succeed(undefined), {
          listOpenPullRequests: () => Effect.succeed([pullRequest]),
        })}
        pullRequest={pullRequest}
        themeType="light"
        theme="system"
        onThemeChange={vi.fn()}
        currentUserId="reviewer"
        queue={[pullRequest, nextPullRequest]}
        onBack={vi.fn()}
        onSelectPullRequest={onSelectPullRequest}
        saveCheckpoint={saveCheckpoint}
      />,
    );

    clickFinish();
    fireEvent.click(screen.getByRole("button", { name: "Reviewed" }));

    await waitFor(() => expect(saveCheckpoint).toHaveBeenCalledOnce());
    expect(onSelectPullRequest).toHaveBeenCalledWith(nextPullRequest);
  });

  it("locks review navigation until a finishing checkpoint is durable", async () => {
    let completeCheckpoint = (): void => undefined;
    const saveCheckpoint = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          completeCheckpoint = resolve;
        }),
    );
    const onBack = vi.fn();
    const onSelectPullRequest = vi.fn();
    const nextPullRequest = {
      ...pullRequest,
      ref: { ...pullRequest.ref, id: 8 },
      title: "Next review",
    };
    render(
      <ReviewScreen
        provider={provider(() => Effect.succeed(undefined), {
          listOpenPullRequests: () => Effect.succeed([pullRequest]),
        })}
        pullRequest={pullRequest}
        themeType="light"
        theme="system"
        onThemeChange={vi.fn()}
        currentUserId="reviewer"
        queue={[pullRequest, nextPullRequest]}
        onBack={onBack}
        onSelectPullRequest={onSelectPullRequest}
        saveCheckpoint={saveCheckpoint}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Queue (2)" }));
    expect(screen.getByRole("dialog", { name: "Review queue" })).toBeInTheDocument();

    clickFinish();
    fireEvent.click(screen.getByRole("button", { name: "Reviewed" }));

    await waitFor(() => expect(saveCheckpoint).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: "Back to inbox" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Queue (2)" })).toBeDisabled();
    expect(screen.queryByRole("dialog", { name: "Review queue" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to inbox" }));
    fireEvent.click(screen.getByRole("button", { name: "Queue (2)" }));
    expect(onBack).not.toHaveBeenCalled();
    expect(onSelectPullRequest).not.toHaveBeenCalled();

    completeCheckpoint();

    await waitFor(() => expect(onSelectPullRequest).toHaveBeenCalledWith(nextPullRequest));
  });

  it("offers only local completion when review decisions are unavailable", async () => {
    const approvePullRequest = vi.fn(() => Effect.succeed(undefined));
    const requestChanges = vi.fn(() => Effect.succeed(undefined));
    let completeCheckpoint = (): void => undefined;
    const saveCheckpoint = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          completeCheckpoint = resolve;
        }),
    );
    const nextPullRequest = {
      ...pullRequest,
      ref: { ...pullRequest.ref, id: 8 },
      title: "Next review",
    };
    const onSelectPullRequest = vi.fn();
    render(
      <ReviewScreen
        provider={provider(() => Effect.succeed(undefined), {
          capabilities: {
            canReadPullRequests: true,
            canReadReviewSignals: false,
            canWriteReviews: false,
          },
          approvePullRequest,
          requestChanges,
          listOpenPullRequests: () => Effect.succeed([pullRequest]),
        })}
        pullRequest={pullRequest}
        themeType="light"
        theme="system"
        onThemeChange={vi.fn()}
        currentUserId="reviewer"
        queue={[pullRequest, nextPullRequest]}
        onBack={vi.fn()}
        onSelectPullRequest={onSelectPullRequest}
        saveCheckpoint={saveCheckpoint}
      />,
    );

    clickFinish();

    expect(
      screen.getByText("Remote review decisions are unavailable for this connection."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Request changes" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reviewed" }));

    await waitFor(() => expect(saveCheckpoint).toHaveBeenCalledOnce());
    expect(approvePullRequest).not.toHaveBeenCalled();
    expect(requestChanges).not.toHaveBeenCalled();
    expect(onSelectPullRequest).not.toHaveBeenCalled();

    completeCheckpoint();

    await waitFor(() => expect(onSelectPullRequest).toHaveBeenCalledWith(nextPullRequest));
  });

  it("keeps a failed general comment in place without checkpointing", async () => {
    const saveCheckpoint = vi.fn(() => Promise.resolve());
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
        theme="system"
        onThemeChange={vi.fn()}
        currentUserId="reviewer"
        queue={[pullRequest]}
        onBack={vi.fn()}
        onSelectPullRequest={vi.fn()}
        saveCheckpoint={saveCheckpoint}
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
    expect(saveCheckpoint).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("could not be sent");
  });

  it("keeps a failed inline comment and its selected line in place", async () => {
    const saveCheckpoint = vi.fn(() => Promise.resolve());
    render(
      <ReviewScreen
        provider={provider(() => Effect.succeed(undefined))}
        pullRequest={pullRequest}
        themeType="light"
        theme="system"
        onThemeChange={vi.fn()}
        currentUserId="reviewer"
        queue={[pullRequest]}
        onBack={vi.fn()}
        onSelectPullRequest={vi.fn()}
        saveCheckpoint={saveCheckpoint}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Choose inline line" }));
    const comment = screen.getByRole("textbox", { name: "Inline comment" });
    fireEvent.change(comment, { target: { value: "Inline text" } });
    fireEvent.click(screen.getByRole("button", { name: "Send inline comment" }));

    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Inline comment" })).toHaveValue("Inline text"),
    );
    expect(screen.getByText("Commenting on src/a.ts:3")).toBeInTheDocument();
    expect(saveCheckpoint).not.toHaveBeenCalled();
  });

  it("wires a tree-originated selection into the diff canvas and a diff-originated selection into the tree, without looping", async () => {
    render(
      <ReviewScreen
        provider={provider(() => Effect.succeed(undefined))}
        pullRequest={pullRequest}
        themeType="light"
        theme="system"
        onThemeChange={vi.fn()}
        currentUserId="reviewer"
        queue={[pullRequest]}
        onBack={vi.fn()}
        onSelectPullRequest={vi.fn()}
        saveCheckpoint={() => Promise.resolve()}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Select tree file" }));
    expect(screen.getByTestId("diff-review-mock")).toHaveAttribute(
      "data-active-path",
      "src/tree-origin.ts",
    );

    fireEvent.click(screen.getByRole("button", { name: "Simulate diff-originated selection" }));
    expect(screen.getByTestId("sidebar-mock")).toHaveAttribute(
      "data-selected-path",
      "src/diff-origin.ts",
    );
    expect(screen.getByTestId("diff-review-mock")).toHaveAttribute(
      "data-active-path",
      "src/diff-origin.ts",
    );
  });

  it("defaults the diff layout from the desktop breakpoint and lets the toolbar toggle it", async () => {
    const matchMedia = vi.fn().mockReturnValue({ matches: true } as MediaQueryList);
    vi.stubGlobal("matchMedia", matchMedia);
    const setItem = vi.fn();
    const localStorageMock = {
      clear: vi.fn(),
      getItem: vi.fn(() => null),
      key: vi.fn(() => null),
      length: 0,
      removeItem: vi.fn(),
      setItem,
    } as unknown as Storage;
    vi.stubGlobal("localStorage", localStorageMock);
    render(
      <ReviewScreen
        provider={provider(() => Effect.succeed(undefined))}
        pullRequest={pullRequest}
        themeType="light"
        theme="system"
        onThemeChange={vi.fn()}
        currentUserId="reviewer"
        queue={[pullRequest]}
        onBack={vi.fn()}
        onSelectPullRequest={vi.fn()}
        saveCheckpoint={() => Promise.resolve()}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId("diff-review-mock")).toHaveAttribute("data-layout", "split"),
    );

    fireEvent.click(screen.getByRole("button", { name: "Unified view" }));

    expect(screen.getByTestId("diff-review-mock")).toHaveAttribute("data-layout", "unified");
    expect(setItem).toHaveBeenCalledWith("revelio.review.diffLayout", "unified");
    vi.unstubAllGlobals();
  });

  it("toggles collapse-all for every file from the toolbar", async () => {
    render(
      <ReviewScreen
        provider={provider(() => Effect.succeed(undefined))}
        pullRequest={pullRequest}
        themeType="light"
        theme="system"
        onThemeChange={vi.fn()}
        currentUserId="reviewer"
        queue={[pullRequest]}
        onBack={vi.fn()}
        onSelectPullRequest={vi.fn()}
        saveCheckpoint={() => Promise.resolve()}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId("diff-review-mock")).toHaveAttribute("data-collapsed-all", "false"),
    );

    fireEvent.click(screen.getByRole("button", { name: "Collapse all files" }));

    expect(screen.getByTestId("diff-review-mock")).toHaveAttribute("data-collapsed-all", "true");
  });
});
