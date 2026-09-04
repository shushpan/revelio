import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CodeReviewProvider, ProviderUser, RepositoryRef } from "../providers/contracts";
import type { ProviderError } from "../providers/errors";
import { App } from "./App";

interface FakeScope {
  readonly selectedWorkspaces: ReadonlyArray<string>;
  readonly selectedRepositories: ReadonlyArray<RepositoryRef>;
}

type FakeVaultMode = "setup" | "unlock";

interface FakeSelectionProps {
  readonly workspaces: ReadonlyArray<string>;
  readonly repositories: ReadonlyArray<RepositoryRef>;
  readonly initialScope: FakeScope;
  readonly discovery: {
    readonly completed: number;
    readonly total: number;
    readonly repositoryCount: number;
    readonly failures: number;
    readonly isComplete: boolean;
  };
  readonly onSave: (scope: FakeScope) => void;
  readonly onCancel?: () => void;
}

interface FakeVaultScreenProps {
  readonly mode: FakeVaultMode;
  readonly status: "idle" | "loading" | "error";
  readonly error?: string;
  readonly onPasskey: () => void;
  readonly onPassphrase: (passphrase: string) => void;
  readonly onSessionOnly?: () => void;
  readonly onReconnect?: () => void;
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
        discovery:{discovery.completed}/{discovery.total}/{discovery.repositoryCount}/
        {discovery.failures}/{discovery.isComplete ? "complete" : "pending"}
      </p>
      <button type="button" onClick={() => onSave(nextSavedScope)}>
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

vi.mock("../vault/VaultScreen", () => ({
  VaultScreen: ({
    mode,
    status,
    error,
    onPasskey,
    onPassphrase,
    onSessionOnly,
    onReconnect,
  }: FakeVaultScreenProps) => (
    <div>
      <p>{mode === "setup" ? "vault-setup-screen" : "unlock-revelio-screen"}</p>
      <p>vault-status:{status}</p>
      {error ? <p role="alert">{error}</p> : null}
      <button type="button" onClick={onPasskey}>
        {mode === "setup" ? "Use passkey" : "Unlock with passkey"}
      </button>
      <button type="button" onClick={() => onPassphrase("secret passphrase")}>
        {mode === "setup" ? "Use passphrase" : "Unlock with passphrase"}
      </button>
      {onSessionOnly ? (
        <button type="button" onClick={onSessionOnly}>
          This session only
        </button>
      ) : null}
      {onReconnect ? (
        <button type="button" onClick={onReconnect}>
          Use token instead
        </button>
      ) : null}
    </div>
  ),
}));

let activeProvider: CodeReviewProvider | null = null;
let activeVault: {
  enrollPasskey: ReturnType<typeof vi.fn>;
  enrollPassphrase: ReturnType<typeof vi.fn>;
  unlockPasskey: ReturnType<typeof vi.fn>;
  unlockPassphrase: ReturnType<typeof vi.fn>;
  resumeTrustedBrowser: ReturnType<typeof vi.fn>;
  clearTrustedBrowser: ReturnType<typeof vi.fn>;
  hasVault: ReturnType<typeof vi.fn>;
} | null = null;
let nextSavedScope: FakeScope = { selectedWorkspaces: ["alpha"], selectedRepositories: [] };

vi.mock("../providers/bitbucket-cloud/client", () => ({
  makeBitbucketClient: (
    _credentials: unknown,
    _fetchImplementation?: unknown,
    options?: { readonly signal?: AbortSignal },
  ) => {
    if (!activeProvider) throw new Error("no active provider configured for this test");
    const provider = activeProvider;
    const failWhenAborted = <A,>(effect: Effect.Effect<A, ProviderError>) =>
      options?.signal?.aborted
        ? Effect.fail({
            _tag: "NetworkError" as const,
            message: "Provider could not be reached",
            operation: "aborted test request",
            endpoint: "/test",
          })
        : effect;
    return {
      ...provider,
      listRepositories: (workspace: string) =>
        failWhenAborted(provider.listRepositories(workspace)),
      listOpenPullRequests: (repository: RepositoryRef) =>
        failWhenAborted(provider.listOpenPullRequests(repository)),
    };
  },
}));

vi.mock("../vault/store", () => ({
  makeVaultService: () => {
    if (!activeVault) throw new Error("no active vault configured for this test");
    return activeVault;
  },
}));

vi.mock("../vault/webauthn", () => ({
  createNavigatorCredentialPort: () => undefined,
  makeWebAuthnPrfPort: () => ({}),
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
const credentials = {
  provider: "bitbucket-cloud" as const,
  payload: { email: "reviewer@example.com", apiToken: "token" },
};

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

const buildVault = () => {
  let hasVault = false;
  return {
    enrollPasskey: vi.fn(() => {
      hasVault = true;
      return Promise.resolve();
    }),
    enrollPassphrase: vi.fn(() => {
      hasVault = true;
      return Promise.resolve();
    }),
    unlockPasskey: vi.fn(() => Promise.resolve(credentials)),
    unlockPassphrase: vi.fn(() => Promise.resolve(credentials)),
    resumeTrustedBrowser: vi.fn(() => Promise.resolve(undefined)),
    clearTrustedBrowser: vi.fn(() => Promise.resolve()),
    hasVault: vi.fn(() => Promise.resolve(hasVault)),
  };
};

const connectWith = async (provider: CodeReviewProvider): Promise<void> => {
  activeProvider = provider;
  fireEvent.change(await screen.findByLabelText("Atlassian email"), {
    target: { value: "reviewer@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Bitbucket API token"), {
    target: { value: "token" },
  });
  fireEvent.click(await screen.findByRole("button", { name: "Connect" }));
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
    activeVault = buildVault();
    nextSavedScope = { selectedWorkspaces: ["alpha"], selectedRepositories: [] };
    (localStorageMock.getItem as ReturnType<typeof vi.fn>).mockImplementation(() => null);
    (localStorageMock.removeItem as ReturnType<typeof vi.fn>).mockClear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it("starts with the connection screen and no diagnostics harness", async () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Revelio" })).toBeInTheDocument();
    expect(screen.queryByText(/fast\s+review/i)).not.toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "Connect to Bitbucket Cloud" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/phase\s*0/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/diagnostics/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/open diff demo/i)).not.toBeInTheDocument();
  });

  it("shows repository selection after first sign-in, then opens the inbox with the saved scope", async () => {
    render(<App />);
    await connectWith(buildProvider());

    await waitFor(() => expect(screen.getByText("select-sources-screen")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("workspaces:alpha")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("discovery:1/1/1/0/complete")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Save selection" }));
    await waitFor(() => expect(screen.getByText("vault-setup-screen")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Use passphrase" }));

    await waitFor(() => expect(screen.getByText("Signed in as Reviewer")).toBeInTheDocument());
    expect(screen.queryByText("select-sources-screen")).not.toBeInTheDocument();
    expect(activeVault?.enrollPassphrase).toHaveBeenCalledWith(credentials, "secret passphrase");
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
    fireEvent.click(await screen.findByRole("button", { name: "Use passphrase" }));
    await waitFor(() => expect(screen.getByText("Existing PR")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Lock" }));
    cleanup();
    activeVault = buildVault();
    render(<App />);
    await connectWith(buildProvider());
    fireEvent.click(await screen.findByRole("button", { name: "Use passphrase" }));

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
    fireEvent.click(await screen.findByRole("button", { name: "Use passphrase" }));
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
    fireEvent.click(await screen.findByRole("button", { name: "Use passphrase" }));
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
    fireEvent.click(await screen.findByRole("button", { name: "Use passphrase" }));
    await waitFor(() => expect(screen.getByText("Row to remove")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(screen.queryByText("Row to remove")).not.toBeInTheDocument());
  });

  it("keeps a checkpointed row reviewed while its repository is unresolved during refresh", async () => {
    const previouslyCheckpointed = {
      ref: { repository: { workspace: "alpha", slug: "one" }, id: 1 },
      title: "Previously checkpointed",
      description: "",
      state: "OPEN" as const,
      updatedAt: "2026-08-29T10:00:00Z",
      sourceBranch: "feature/checkpointed",
      targetBranch: "main",
      sourceCommit: "checkpointed-head",
      author: { id: "author", displayName: "Author" },
      reviewerIds: ["reviewer"],
    };
    const freshPullRequest = {
      ref: { repository: { workspace: "beta", slug: "two" }, id: 2 },
      title: "Fresh beta review",
      description: "",
      state: "OPEN" as const,
      updatedAt: "2026-08-29T11:00:00Z",
      sourceBranch: "feature/fresh",
      targetBranch: "main",
      sourceCommit: "fresh-head",
      author: { id: "author", displayName: "Author" },
      reviewerIds: ["reviewer"],
    };
    const unresolvedAlpha = defer<ReadonlyArray<typeof previouslyCheckpointed>>();
    let alphaCalls = 0;
    let betaCalls = 0;
    database.settings.set("checkpoints:bitbucket-cloud:reviewer", {
      version: 1,
      checkpoints: [
        {
          pullRequestKey: "alpha/one#1",
          reviewedHeadCommit: "checkpointed-head",
          watermark: "2026-08-28T10:00:00Z",
          outcome: "reviewed",
          finishedAt: "2026-08-28T10:00:00Z",
        },
      ],
    });
    nextSavedScope = { selectedWorkspaces: ["alpha", "beta"], selectedRepositories: [] };
    render(<App />);
    await connectWith(
      buildProvider({
        listWorkspaces: () => Effect.succeed(["alpha", "beta"]),
        listRepositories: (workspace) =>
          Effect.succeed(
            workspace === "alpha"
              ? [{ workspace: "alpha", slug: "one" }]
              : [{ workspace: "beta", slug: "two" }],
          ),
        listOpenPullRequests: (repository) => {
          if (repository.workspace === "alpha") {
            alphaCalls += 1;
            return alphaCalls === 1
              ? Effect.succeed([previouslyCheckpointed])
              : Effect.promise(() => unresolvedAlpha.promise);
          }
          betaCalls += 1;
          return Effect.succeed(betaCalls === 1 ? [] : [freshPullRequest]);
        },
        getReviewSignals: () => Effect.succeed([]),
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Save selection" }));
    fireEvent.click(await screen.findByRole("button", { name: "Use passphrase" }));
    await waitFor(() => expect(screen.getByText("Signed in as Reviewer")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => expect(screen.getByText("Fresh beta review")).toBeInTheDocument());
    expect(screen.queryByText("Previously checkpointed")).not.toBeInTheDocument();

    unresolvedAlpha.resolve([]);
    await waitFor(() =>
      expect(screen.queryByText("Previously checkpointed")).not.toBeInTheDocument(),
    );
  });

  it("drops a checkpointed row when its repository resolves empty before another repository", async () => {
    const previouslyCheckpointed = {
      ref: { repository: { workspace: "alpha", slug: "one" }, id: 1 },
      title: "Resolved empty checkpoint",
      description: "",
      state: "OPEN" as const,
      updatedAt: "2026-08-29T10:00:00Z",
      sourceBranch: "feature/checkpointed",
      targetBranch: "main",
      sourceCommit: "checkpointed-head",
      author: { id: "author", displayName: "Author" },
      reviewerIds: ["reviewer"],
    };
    const unresolvedBeta = defer<ReadonlyArray<never>>();
    let alphaCalls = 0;
    let betaCalls = 0;
    database.settings.set("checkpoints:bitbucket-cloud:reviewer", {
      version: 1,
      checkpoints: [
        {
          pullRequestKey: "alpha/one#1",
          reviewedHeadCommit: "checkpointed-head",
          watermark: "2026-08-28T10:00:00Z",
          outcome: "reviewed",
          finishedAt: "2026-08-28T10:00:00Z",
        },
      ],
    });
    nextSavedScope = { selectedWorkspaces: ["alpha", "beta"], selectedRepositories: [] };
    render(<App />);
    await connectWith(
      buildProvider({
        listWorkspaces: () => Effect.succeed(["alpha", "beta"]),
        listRepositories: (workspace) =>
          Effect.succeed(
            workspace === "alpha"
              ? [{ workspace: "alpha", slug: "one" }]
              : [{ workspace: "beta", slug: "two" }],
          ),
        listOpenPullRequests: (repository) => {
          if (repository.workspace === "alpha") {
            alphaCalls += 1;
            return alphaCalls === 1 ? Effect.succeed([previouslyCheckpointed]) : Effect.succeed([]);
          }
          betaCalls += 1;
          return betaCalls === 1
            ? Effect.succeed([])
            : Effect.promise(() => unresolvedBeta.promise);
        },
        getReviewSignals: () => Effect.succeed([]),
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Save selection" }));
    fireEvent.click(await screen.findByRole("button", { name: "Use passphrase" }));
    await waitFor(() => expect(screen.getByText("Signed in as Reviewer")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => expect(screen.getByText(/Loaded 1 of 2 repositories/)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Filter pull requests"), {
      target: { value: "is:open" },
    });
    expect(screen.queryByText("Resolved empty checkpoint")).not.toBeInTheDocument();

    unresolvedBeta.resolve([]);
  });

  it("reviews a manually selected unrelated pull request without queuing unrelated rows", async () => {
    const requestedPullRequest = {
      ref: { repository: { workspace: "alpha", slug: "one" }, id: 1 },
      title: "Requested review",
      description: "",
      state: "OPEN" as const,
      updatedAt: "2026-08-29T10:00:00Z",
      sourceBranch: "feature/requested",
      targetBranch: "main",
      sourceCommit: "requested-head",
      author: { id: "author", displayName: "Author" },
      reviewerIds: ["reviewer"],
    };
    const selectedUnrelatedPullRequest = {
      ref: { repository: { workspace: "alpha", slug: "one" }, id: 2 },
      title: "Standalone manual review",
      description: "",
      state: "OPEN" as const,
      updatedAt: "2026-08-29T09:00:00Z",
      sourceBranch: "feature/standalone",
      targetBranch: "main",
      sourceCommit: "standalone-head",
      author: { id: "author", displayName: "Author" },
      reviewerIds: [],
    };
    const otherUnrelatedPullRequest = {
      ref: { repository: { workspace: "alpha", slug: "one" }, id: 3 },
      title: "Other unrelated review",
      description: "",
      state: "OPEN" as const,
      updatedAt: "2026-08-29T08:00:00Z",
      sourceBranch: "feature/other",
      targetBranch: "main",
      sourceCommit: "other-head",
      author: { id: "author", displayName: "Author" },
      reviewerIds: [],
    };
    render(<App />);
    await connectWith(
      buildProvider({
        listOpenPullRequests: () =>
          Effect.succeed([
            requestedPullRequest,
            selectedUnrelatedPullRequest,
            otherUnrelatedPullRequest,
          ]),
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Save selection" }));
    fireEvent.click(await screen.findByRole("button", { name: "Use passphrase" }));
    await waitFor(() => expect(screen.getByText("Requested review")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Requested" }));
    fireEvent.click(await screen.findByText("Standalone manual review"));

    expect(await screen.findByRole("button", { name: "Queue (1)" })).toBeInTheDocument();
  });

  it("resumes from the trusted browser vault on reload before the seven-day expiry", async () => {
    activeProvider = buildProvider();
    activeVault = buildVault();
    activeVault.hasVault.mockResolvedValue(true);
    activeVault.resumeTrustedBrowser.mockResolvedValue(credentials);
    database.settings.set("scope:bitbucket-cloud:reviewer", {
      selectedWorkspaces: ["alpha"],
      selectedRepositories: [],
    });

    render(<App />);

    await waitFor(() => expect(screen.getByText("Signed in as Reviewer")).toBeInTheDocument());
    expect(screen.queryByText("Connect to Bitbucket Cloud")).not.toBeInTheDocument();
    expect(activeVault.resumeTrustedBrowser).toHaveBeenCalledWith(expect.any(Number));
  });

  it("keeps refreshed providers usable after a trusted vault resume", async () => {
    let callCount = 0;
    activeProvider = buildProvider({
      listOpenPullRequests: () => {
        callCount += 1;
        return Effect.succeed([
          {
            ref: { repository: { workspace: "alpha", slug: "one" }, id: callCount },
            title: callCount === 1 ? "Restored row" : "Refresh after restore",
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
    });
    activeVault = buildVault();
    activeVault.hasVault.mockResolvedValue(true);
    activeVault.resumeTrustedBrowser.mockResolvedValue(credentials);
    database.settings.set("scope:bitbucket-cloud:reviewer", {
      selectedWorkspaces: ["alpha"],
      selectedRepositories: [],
    });

    render(<App />);
    await waitFor(() => expect(screen.getByText("Restored row")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => expect(screen.getByText("Refresh after restore")).toBeInTheDocument());
  });

  it("shows Unlock Revelio when a saved vault exists but the trusted browser window has expired", async () => {
    activeVault = buildVault();
    activeVault.hasVault.mockResolvedValue(true);
    activeVault.resumeTrustedBrowser.mockResolvedValue(undefined);

    render(<App />);

    await waitFor(() => expect(screen.getByText("unlock-revelio-screen")).toBeInTheDocument());
    expect(screen.queryByText("Connect to Bitbucket Cloud")).not.toBeInTheDocument();
  });

  it("clears the trusted browser record and shows Unlock Revelio when locked", async () => {
    render(<App />);
    await connectWith(buildProvider());
    fireEvent.click(await screen.findByRole("button", { name: "Save selection" }));
    fireEvent.click(await screen.findByRole("button", { name: "Use passphrase" }));
    await waitFor(() => expect(screen.getByText("Signed in as Reviewer")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Lock" }));

    await waitFor(() => expect(activeVault?.clearTrustedBrowser).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText("unlock-revelio-screen")).toBeInTheDocument());
  });

  it("clears sensitive screen state immediately and fails closed when Lock cannot clear storage", async () => {
    render(<App />);
    await connectWith(buildProvider());
    fireEvent.click(await screen.findByRole("button", { name: "Save selection" }));
    fireEvent.click(await screen.findByRole("button", { name: "Use passphrase" }));
    await waitFor(() => expect(screen.getByText("Signed in as Reviewer")).toBeInTheDocument());
    activeVault?.clearTrustedBrowser.mockRejectedValue(new Error("indexeddb failed"));
    activeVault?.hasVault.mockResolvedValue(true);

    fireEvent.click(screen.getByRole("button", { name: "Lock" }));

    expect(screen.queryByText("Signed in as Reviewer")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByText("The local vault could not be locked. Try Lock again."),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("unlock-revelio-screen")).toBeInTheDocument();
  });

  it("does not keep old pull requests visible after switching to an empty workspace scope", async () => {
    const provider = buildProvider({
      listWorkspaces: () => Effect.succeed(["alpha", "beta"]),
      listRepositories: (workspace) =>
        Effect.succeed(workspace === "alpha" ? [{ workspace: "alpha", slug: "one" }] : []),
      listOpenPullRequests: () =>
        Effect.succeed([
          {
            ref: { repository: { workspace: "alpha", slug: "one" }, id: 1 },
            title: "Old selected PR",
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
    });
    render(<App />);
    await connectWith(provider);
    fireEvent.click(await screen.findByRole("button", { name: "Save selection" }));
    fireEvent.click(await screen.findByRole("button", { name: "Use passphrase" }));
    await waitFor(() => expect(screen.getByText("Old selected PR")).toBeInTheDocument());

    nextSavedScope = { selectedWorkspaces: ["beta"], selectedRepositories: [] };
    fireEvent.click(screen.getByRole("button", { name: "Manage repositories" }));
    fireEvent.click(await screen.findByRole("button", { name: "Save selection" }));

    await waitFor(() => expect(screen.queryByText("Old selected PR")).not.toBeInTheDocument());
    expect(
      screen.getByText("Loaded 0 of 0 repositories - 0 pull requests found."),
    ).toBeInTheDocument();
  });

  it("allows reconnecting with a token when local vault unlock is unavailable", async () => {
    activeVault = buildVault();
    activeVault.hasVault.mockResolvedValue(true);
    activeVault.resumeTrustedBrowser.mockResolvedValue(undefined);
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Use token instead" }));

    expect(
      await screen.findByRole("heading", { name: "Connect to Bitbucket Cloud" }),
    ).toBeInTheDocument();
  });

  it("does not show empty copy when selected workspace discovery fails", async () => {
    database.settings.set("scope:bitbucket-cloud:reviewer", {
      selectedWorkspaces: ["alpha"],
      selectedRepositories: [],
    });
    render(<App />);
    await connectWith(
      buildProvider({
        listRepositories: () =>
          Effect.fail({
            _tag: "NetworkError" as const,
            message: "Provider could not be reached",
            operation: "repository discovery",
            endpoint: "/repositories/{workspace}",
          }),
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "This session only" }));

    await waitFor(() =>
      expect(
        screen.getByText(
          "Some selected workspaces could not be loaded. Results may be incomplete.",
        ),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText("No pull requests in this view.")).not.toBeInTheDocument();
  });

  it("migrates a legacy current-head review into this identity's checkpoint store", async () => {
    (localStorageMock.getItem as ReturnType<typeof vi.fn>).mockImplementation((key: string) =>
      key === "revelio.reviewed" ? JSON.stringify({ "alpha/one#1": "abc123" }) : null,
    );
    render(<App />);
    await connectWith(
      buildProvider({
        listOpenPullRequests: () =>
          Effect.succeed([
            {
              ref: { repository: { workspace: "alpha", slug: "one" }, id: 1 },
              title: "Legacy review",
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
    fireEvent.click(await screen.findByRole("button", { name: "Use passphrase" }));

    await waitFor(() =>
      expect(localStorageMock.removeItem).toHaveBeenCalledWith("revelio.reviewed"),
    );
    expect(database.settings.get("checkpoints:bitbucket-cloud:reviewer")).toEqual({
      version: 1,
      checkpoints: [
        expect.objectContaining({
          pullRequestKey: "alpha/one#1",
          reviewedHeadCommit: "abc123",
          outcome: "reviewed",
        }),
      ],
    });
  });

  it("migrates every matching legacy entry before removing the legacy key", async () => {
    (localStorageMock.getItem as ReturnType<typeof vi.fn>).mockImplementation((key: string) =>
      key === "revelio.reviewed"
        ? JSON.stringify({ "alpha/one#1": "one", "alpha/one#2": "two" })
        : null,
    );
    render(<App />);
    await connectWith(
      buildProvider({
        listOpenPullRequests: () =>
          Effect.succeed([
            {
              ref: { repository: { workspace: "alpha", slug: "one" }, id: 1 },
              title: "First legacy review",
              description: "",
              state: "OPEN" as const,
              updatedAt: "2026-08-29T10:00:00Z",
              sourceBranch: "feature/one",
              targetBranch: "main",
              sourceCommit: "one",
              author: { id: "author", displayName: "Author" },
              reviewerIds: ["reviewer"],
            },
            {
              ref: { repository: { workspace: "alpha", slug: "one" }, id: 2 },
              title: "Second legacy review",
              description: "",
              state: "OPEN" as const,
              updatedAt: "2026-08-28T10:00:00Z",
              sourceBranch: "feature/two",
              targetBranch: "main",
              sourceCommit: "two",
              author: { id: "author", displayName: "Author" },
              reviewerIds: ["reviewer"],
            },
          ]),
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Save selection" }));
    fireEvent.click(await screen.findByRole("button", { name: "Use passphrase" }));

    await waitFor(() =>
      expect(database.settings.get("checkpoints:bitbucket-cloud:reviewer")).toEqual({
        version: 1,
        checkpoints: [
          expect.objectContaining({ pullRequestKey: "alpha/one#1" }),
          expect.objectContaining({ pullRequestKey: "alpha/one#2" }),
        ],
      }),
    );
    expect(localStorageMock.removeItem).toHaveBeenCalledWith("revelio.reviewed");
  });

  it("keeps a finished review hidden when returning immediately to the inbox", async () => {
    const finishedPullRequest = {
      ref: { repository: { workspace: "alpha", slug: "one" }, id: 1 },
      title: "Finish without reopening",
      description: "",
      state: "OPEN" as const,
      updatedAt: "2026-08-29T10:00:00Z",
      sourceBranch: "feature/review",
      targetBranch: "main",
      sourceCommit: "abc123",
      author: { id: "author", displayName: "Author" },
      reviewerIds: ["reviewer"],
    };
    render(<App />);
    await connectWith(
      buildProvider({ listOpenPullRequests: () => Effect.succeed([finishedPullRequest]) }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Save selection" }));
    fireEvent.click(await screen.findByRole("button", { name: "Use passphrase" }));
    fireEvent.click(await screen.findByText("Finish without reopening"));
    fireEvent.click(await screen.findByRole("button", { name: "Finish Review" }));
    fireEvent.click(await screen.findByRole("button", { name: "Reviewed" }));

    await waitFor(() =>
      expect(screen.queryByText("Finish without reopening")).not.toBeInTheDocument(),
    );
  });

  it("does not load one user's checkpoint for another identity", async () => {
    database.settings.set("checkpoints:bitbucket-cloud:reviewer", {
      version: 1,
      checkpoints: [
        {
          pullRequestKey: "alpha/one#1",
          reviewedHeadCommit: "abc123",
          watermark: "2026-08-28T10:00:00Z",
          outcome: "reviewed",
          finishedAt: "2026-08-28T10:00:00Z",
        },
      ],
    });
    const otherUser: ProviderUser = { id: "other-reviewer", displayName: "Other reviewer" };
    render(<App />);
    await connectWith(
      buildProvider({
        getCurrentUser: Effect.succeed(otherUser),
        listOpenPullRequests: () =>
          Effect.succeed([
            {
              ref: { repository: { workspace: "alpha", slug: "one" }, id: 1 },
              title: "Other user's actionable review",
              description: "",
              state: "OPEN" as const,
              updatedAt: "2026-08-29T10:00:00Z",
              sourceBranch: "feature/review",
              targetBranch: "main",
              sourceCommit: "abc123",
              author: { id: "author", displayName: "Author" },
              reviewerIds: ["other-reviewer"],
            },
          ]),
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Save selection" }));
    fireEvent.click(await screen.findByRole("button", { name: "Use passphrase" }));

    expect(await screen.findByText("Other user's actionable review")).toBeInTheDocument();
  });
});
