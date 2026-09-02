import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CodeReviewProvider, ProviderUser, RepositoryRef } from "../providers/contracts";
import { App } from "./App";

interface FakeScope {
  readonly selectedWorkspaces: ReadonlyArray<string>;
  readonly selectedRepositories: ReadonlyArray<RepositoryRef>;
}

interface FakeSelectionProps {
  readonly workspaces: ReadonlyArray<string>;
  readonly repositories: ReadonlyArray<RepositoryRef>;
  readonly initialScope: FakeScope;
  readonly discovery: {
    readonly completed: number;
    readonly total: number;
    readonly isComplete: boolean;
  };
  readonly onSave: (scope: FakeScope) => void;
  readonly onCancel?: () => void;
}

vi.mock("../scope/RepositorySelectionScreen", () => ({
  RepositorySelectionScreen: ({
    workspaces,
    repositories,
    discovery,
    onSave,
    onCancel,
  }: FakeSelectionProps) => (
    <div>
      <p>select-sources-screen</p>
      <p>workspaces:{workspaces.join(",")}</p>
      <p>repositories:{repositories.length}</p>
      <p>
        discovery:{discovery.completed}/{discovery.total}/
        {discovery.isComplete ? "complete" : "pending"}
      </p>
      <button
        type="button"
        onClick={() => onSave({ selectedWorkspaces: ["alpha"], selectedRepositories: [] })}
      >
        Save selection
      </button>
      {onCancel ? (
        <button type="button" onClick={onCancel}>
          Cancel selection
        </button>
      ) : null}
    </div>
  ),
}));

let activeProvider: CodeReviewProvider | null = null;

vi.mock("../providers/bitbucket-cloud/client", () => ({
  makeBitbucketClient: () => {
    if (!activeProvider) throw new Error("no active provider configured for this test");
    return activeProvider;
  },
}));

const database: Record<"settings" | "vault", Map<IDBValidKey, unknown>> = {
  settings: new Map(),
  vault: new Map(),
};

vi.mock("../persistence/indexed-db", () => ({
  makeIndexedDbKeyValueStore: () => ({
    get: async (store: "settings" | "vault", key: IDBValidKey) => database[store].get(key),
    put: async (store: "settings" | "vault", value: unknown, key: IDBValidKey) => {
      database[store].set(key, value);
    },
    delete: async (store: "settings" | "vault", key: IDBValidKey) => {
      database[store].delete(key);
    },
  }),
}));

const localStorageMock = {
  clear: vi.fn(),
  getItem: vi.fn(() => null),
  key: vi.fn(() => null),
  length: 0,
  removeItem: vi.fn(),
  setItem: vi.fn(),
} as unknown as Storage;

const user: ProviderUser = { id: "reviewer", displayName: "Reviewer" };

interface Deferred<A> {
  readonly promise: Promise<A>;
  resolve(value: A): void;
}

const defer = <A,>(): Deferred<A> => {
  let resolve!: (value: A) => void;
  const promise = new Promise<A>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

const buildProvider = (overrides: Partial<CodeReviewProvider> = {}): CodeReviewProvider => ({
  id: "bitbucket-cloud",
  capabilities: { canReadPullRequests: true, canReadReviewSignals: false, canWriteReviews: false },
  getCurrentUser: Effect.succeed(user),
  discoverRepositories: () => Effect.succeed({ workspaces: [], repositories: [], failures: [] }),
  listWorkspaces: () => Effect.succeed(["alpha"]),
  listRepositories: () => Effect.succeed([{ workspace: "alpha", slug: "one" }]),
  listOpenPullRequests: () => Effect.succeed([]),
  getReviewSignals: () => Effect.succeed([]),
  getPullRequestDiff: () => Effect.succeed(""),
  approvePullRequest: () => Effect.void,
  requestChanges: () => Effect.void,
  addGeneralComment: () => Effect.void,
  addInlineComment: () => Effect.void,
  ...overrides,
});

const connectWith = async (provider: CodeReviewProvider): Promise<void> => {
  activeProvider = provider;
  fireEvent.change(screen.getByLabelText("Atlassian email"), {
    target: { value: "reviewer@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Bitbucket API token"), {
    target: { value: "token" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Connect" }));
};

describe("Revelio shell", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", localStorageMock);
    vi.stubGlobal("matchMedia", () => ({
      addEventListener: vi.fn(),
      matches: false,
      removeEventListener: vi.fn(),
    }));
    database.settings.clear();
    database.vault.clear();
    activeProvider = null;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it("starts with the connection screen and no diagnostics harness", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Revelio" })).toBeInTheDocument();
    expect(screen.queryByText(/fast\s+review/i)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Connect to Bitbucket Cloud" })).toBeInTheDocument();
    expect(screen.queryByText(/phase\s*0/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/diagnostics/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/open diff demo/i)).not.toBeInTheDocument();
  });

  it("shows repository selection after first sign-in, then opens the inbox with the saved scope", async () => {
    render(<App />);
    await connectWith(buildProvider());

    await waitFor(() => expect(screen.getByText("select-sources-screen")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("workspaces:alpha")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("discovery:1/1/complete")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Save selection" }));

    await waitFor(() => expect(screen.getByText("Signed in as Reviewer")).toBeInTheDocument());
    expect(screen.queryByText("select-sources-screen")).not.toBeInTheDocument();
  });

  it("resumes directly to the inbox when a saved scope already exists for this identity", async () => {
    render(<App />);
    await connectWith(
      buildProvider({
        listOpenPullRequests: () =>
          Effect.succeed([
            {
              ref: { repository: { workspace: "alpha", slug: "one" }, id: 1 },
              title: "Existing PR",
              description: "",
              state: "OPEN" as const,
              updatedAt: "2026-08-29T10:00:00Z",
              sourceBranch: "feature/review",
              targetBranch: "main",
              sourceCommit: "abc123",
              author: { id: "author", displayName: "Author" },
              reviewerIds: ["reviewer"],
            },
          ]),
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Save selection" }));
    await waitFor(() => expect(screen.getByText("Existing PR")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Lock" }));
    cleanup();
    render(<App />);
    await connectWith(buildProvider());

    expect(screen.queryByText("select-sources-screen")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Signed in as Reviewer")).toBeInTheDocument());
  });

  it("preserves current inbox rows when Manage repositories is canceled", async () => {
    render(<App />);
    await connectWith(
      buildProvider({
        listOpenPullRequests: () =>
          Effect.succeed([
            {
              ref: { repository: { workspace: "alpha", slug: "one" }, id: 1 },
              title: "Row to keep",
              description: "",
              state: "OPEN" as const,
              updatedAt: "2026-08-29T10:00:00Z",
              sourceBranch: "feature/review",
              targetBranch: "main",
              sourceCommit: "abc123",
              author: { id: "author", displayName: "Author" },
              reviewerIds: ["reviewer"],
            },
          ]),
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Save selection" }));
    await waitFor(() => expect(screen.getByText("Row to keep")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Manage repositories" }));
    await waitFor(() => expect(screen.getByText("select-sources-screen")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Cancel selection" }));

    expect(screen.queryByText("select-sources-screen")).not.toBeInTheDocument();
    expect(screen.getByText("Row to keep")).toBeInTheDocument();
  });

  it("ignores a stale sync snapshot once a newer refresh has started", async () => {
    const staleCall = defer<ReadonlyArray<unknown>>();
    let callCount = 0;
    render(<App />);
    await connectWith(
      buildProvider({
        listOpenPullRequests: () => {
          callCount += 1;
          if (callCount === 1) {
            return Effect.promise(() => staleCall.promise as Promise<never[]>);
          }
          return Effect.succeed([
            {
              ref: { repository: { workspace: "alpha", slug: "one" }, id: 2 },
              title: "Refreshed row",
              description: "",
              state: "OPEN" as const,
              updatedAt: "2026-08-29T10:00:00Z",
              sourceBranch: "feature/review",
              targetBranch: "main",
              sourceCommit: "abc123",
              author: { id: "author", displayName: "Author" },
              reviewerIds: ["reviewer"],
            },
          ]);
        },
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Save selection" }));
    await waitFor(() =>
      expect(
        screen.getByText("Loaded 0 of 1 repositories - 0 pull requests found."),
      ).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(screen.getByText("Refreshed row")).toBeInTheDocument());

    staleCall.resolve([]);
    await Promise.resolve();
    expect(screen.getByText("Refreshed row")).toBeInTheDocument();
  });

  it("removes a stale pull request once a completed refresh finds none", async () => {
    let callCount = 0;
    render(<App />);
    await connectWith(
      buildProvider({
        listOpenPullRequests: () => {
          callCount += 1;
          if (callCount === 1) {
            return Effect.succeed([
              {
                ref: { repository: { workspace: "alpha", slug: "one" }, id: 1 },
                title: "Row to remove",
                description: "",
                state: "OPEN" as const,
                updatedAt: "2026-08-29T10:00:00Z",
                sourceBranch: "feature/review",
                targetBranch: "main",
                sourceCommit: "abc123",
                author: { id: "author", displayName: "Author" },
                reviewerIds: ["reviewer"],
              },
            ]);
          }
          return Effect.succeed([]);
        },
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Save selection" }));
    await waitFor(() => expect(screen.getByText("Row to remove")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(screen.queryByText("Row to remove")).not.toBeInTheDocument());
  });
});
