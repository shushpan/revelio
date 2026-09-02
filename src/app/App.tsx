import "../styles.css";
import { useTheme } from "@heroui/react";
import type { JSX } from "react";
import { lazy, Suspense, useRef, useState } from "react";
import { ConnectScreen } from "../connection/ConnectScreen";
import { InboxScreen, pullRequestKey } from "../inbox/InboxScreen";
import type { InboxLoadSnapshot } from "../inbox/load-inbox";
import type {
  CodeReviewProvider,
  ProviderUser,
  PullRequestSummary,
  RepositoryRef,
} from "../providers/contracts";
import type { RepositoryScope } from "../scope/repository-scope";
import { type ThemeChoice, ThemeControl } from "../ui/ThemeControl";

const ReviewScreen = lazy(() =>
  import("../review/ReviewScreen").then(({ ReviewScreen: screen }) => ({ default: screen })),
);
const RepositorySelectionScreen = lazy(() =>
  import("../scope/RepositorySelectionScreen").then(({ RepositorySelectionScreen: screen }) => ({
    default: screen,
  })),
);

interface Session {
  readonly provider: CodeReviewProvider;
  readonly user: ProviderUser;
}

interface DiscoveryProgress {
  readonly completed: number;
  readonly total: number;
  readonly isComplete: boolean;
}

type AppState =
  | { readonly screen: "connect" }
  | ({
      readonly screen: "select-sources";
      readonly mode: "first-run" | "manage";
      readonly workspaces: ReadonlyArray<string>;
      readonly repositories: ReadonlyArray<RepositoryRef>;
      readonly initialScope: RepositoryScope;
      readonly discovery: DiscoveryProgress;
    } & Session)
  | ({
      readonly screen: "inbox";
      readonly scope: RepositoryScope;
      readonly inbox: InboxLoadSnapshot;
      readonly refreshError?: string;
    } & Session)
  | ({
      readonly screen: "review";
      readonly scope: RepositoryScope;
      readonly pullRequest: PullRequestSummary;
      readonly inbox: InboxLoadSnapshot;
    } & Session);

const reviewedStorageKey = "revelio.reviewed";
const emptyScope: RepositoryScope = { selectedWorkspaces: [], selectedRepositories: [] };
const emptyDiscovery: DiscoveryProgress = { completed: 0, total: 0, isComplete: false };
const pendingInbox = (totalRepositories: number): InboxLoadSnapshot => ({
  pullRequests: [],
  failures: [],
  totalRepositories,
  completedRepositories: 0,
  isComplete: totalRepositories === 0,
});

const loadEngine = () =>
  Promise.all([
    import("effect/Effect"),
    import("../inbox/load-inbox"),
    import("../scope/repository-scope"),
    import("../persistence/indexed-db"),
  ]).then(([Effect, inbox, scope, persistence]) => ({
    Effect,
    loadInbox: inbox.loadInbox,
    makeScopeStore: scope.makeScopeStore,
    resolveRepositories: scope.resolveRepositories,
    makeIndexedDbKeyValueStore: persistence.makeIndexedDbKeyValueStore,
  }));

const repositoryKey = (repository: RepositoryRef): string =>
  [repository.workspace, repository.slug].join(String.fromCodePoint(0));

const mergeSnapshotWithPrevious = (
  previous: InboxLoadSnapshot,
  next: InboxLoadSnapshot,
): InboxLoadSnapshot => {
  if (next.isComplete) return next;
  const resolvedRepositoryKeys = new Set<string>();
  for (const pullRequest of next.pullRequests) {
    resolvedRepositoryKeys.add(repositoryKey(pullRequest.ref.repository));
  }
  for (const failure of next.failures) {
    resolvedRepositoryKeys.add(repositoryKey(failure.repository));
  }
  const staleFromPrevious = previous.pullRequests.filter(
    (pullRequest) => !resolvedRepositoryKeys.has(repositoryKey(pullRequest.ref.repository)),
  );
  return {
    ...next,
    pullRequests: [...next.pullRequests, ...staleFromPrevious].sort((a, b) =>
      a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0,
    ),
  };
};

const discoverRepositoriesForWorkspaces = async (
  provider: CodeReviewProvider,
  workspaces: ReadonlyArray<string>,
  onProgress: (completed: number, repositories: ReadonlyArray<RepositoryRef>) => void,
  signal?: AbortSignal,
): Promise<ReadonlyArray<RepositoryRef>> => {
  const { Effect } = await loadEngine();
  const repositories: RepositoryRef[] = [];
  let completed = 0;
  const workerCount = Math.min(4, workspaces.length);
  let nextIndex = 0;
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (!signal?.aborted) {
        const index = nextIndex++;
        if (index >= workspaces.length) return;
        const result = await Effect.runPromise(
          Effect.either(provider.listRepositories(workspaces[index])),
        );
        if (result._tag === "Right") repositories.push(...result.right);
        completed += 1;
        onProgress(completed, [...repositories]);
      }
    }),
  );
  return repositories;
};

const resolveScopeRepositories = async (
  provider: CodeReviewProvider,
  scope: RepositoryScope,
  signal?: AbortSignal,
): Promise<ReadonlyArray<RepositoryRef>> => {
  const { resolveRepositories } = await loadEngine();
  const discovered = await discoverRepositoriesForWorkspaces(
    provider,
    scope.selectedWorkspaces,
    () => {},
    signal,
  );
  return resolveRepositories(scope, discovered);
};

const loadSavedScope = async (
  provider: CodeReviewProvider,
  user: ProviderUser,
): Promise<RepositoryScope | undefined> => {
  try {
    const { makeScopeStore, makeIndexedDbKeyValueStore } = await loadEngine();
    return await makeScopeStore(makeIndexedDbKeyValueStore()).load(provider.id, user.id);
  } catch {
    return undefined;
  }
};

const saveScopeToStore = async (
  provider: CodeReviewProvider,
  user: ProviderUser,
  scope: RepositoryScope,
): Promise<void> => {
  try {
    const { makeScopeStore, makeIndexedDbKeyValueStore } = await loadEngine();
    await makeScopeStore(makeIndexedDbKeyValueStore()).save(provider.id, user.id, scope);
  } catch {
    // Best effort: the selected scope still drives this session even if it cannot persist.
  }
};

export function App(): JSX.Element {
  const [appState, setAppState] = useState<AppState>({ screen: "connect" });
  const [reviewed, setReviewed] = useState<Record<string, string>>(readReviewed);
  const { theme, resolvedTheme, setTheme } = useTheme("system");
  const selectedTheme: ThemeChoice = theme === "light" || theme === "dark" ? theme : "system";
  const diffTheme = resolvedTheme === "dark" ? "dark" : "light";

  const runIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const manageOriginRef = useRef<(AppState & { readonly screen: "inbox" }) | null>(null);

  const beginRun = (): { runId: number; signal: AbortSignal } => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    return { runId: ++runIdRef.current, signal: controller.signal };
  };

  const startSync = (
    provider: CodeReviewProvider,
    user: ProviderUser,
    scope: RepositoryScope,
    repositories: ReadonlyArray<RepositoryRef>,
    run: { runId: number; signal: AbortSignal },
    previousInbox?: InboxLoadSnapshot,
  ): void => {
    setAppState({
      screen: "inbox",
      provider,
      user,
      scope,
      inbox: previousInbox
        ? {
            ...previousInbox,
            totalRepositories: repositories.length,
            completedRepositories: 0,
            isComplete: repositories.length === 0,
          }
        : pendingInbox(repositories.length),
    });
    void loadEngine().then(({ Effect, loadInbox }) =>
      Effect.runPromise(
        loadInbox(provider, repositories, {
          concurrency: 4,
          signal: run.signal,
          onSnapshot: (snapshot) => {
            if (run.runId !== runIdRef.current) return;
            const inbox = previousInbox
              ? mergeSnapshotWithPrevious(previousInbox, snapshot)
              : snapshot;
            setAppState((current) =>
              current.screen === "inbox" ? { ...current, inbox } : current,
            );
          },
        }),
      ),
    );
  };

  const connect = (provider: CodeReviewProvider, user: ProviderUser): void => {
    const run = beginRun();
    void loadSavedScope(provider, user).then(async (scope) => {
      if (run.runId !== runIdRef.current) return;
      if (scope) {
        const repositories = await resolveScopeRepositories(provider, scope, run.signal);
        if (run.runId !== runIdRef.current) return;
        startSync(provider, user, scope, repositories, run);
        return;
      }
      setAppState({
        screen: "select-sources",
        mode: "first-run",
        provider,
        user,
        workspaces: [],
        repositories: [],
        initialScope: emptyScope,
        discovery: emptyDiscovery,
      });
      runFullDiscovery(provider, run);
    });
  };

  const runFullDiscovery = (
    provider: CodeReviewProvider,
    run: { runId: number; signal: AbortSignal },
  ): void => {
    void loadEngine().then(async ({ Effect }) => {
      const workspacesResult = await Effect.runPromise(Effect.either(provider.listWorkspaces()));
      if (run.runId !== runIdRef.current) return;
      const workspaces = workspacesResult._tag === "Right" ? workspacesResult.right : [];
      setAppState((current) =>
        current.screen === "select-sources"
          ? {
              ...current,
              workspaces,
              discovery: {
                completed: 0,
                total: workspaces.length,
                isComplete: workspaces.length === 0,
              },
            }
          : current,
      );
      await discoverRepositoriesForWorkspaces(
        provider,
        workspaces,
        (completed, repositories) => {
          if (run.runId !== runIdRef.current) return;
          setAppState((current) =>
            current.screen === "select-sources"
              ? {
                  ...current,
                  repositories,
                  discovery: {
                    completed,
                    total: workspaces.length,
                    isComplete: completed === workspaces.length,
                  },
                }
              : current,
          );
        },
        run.signal,
      );
    });
  };

  const saveScope = (scope: RepositoryScope): void => {
    if (appState.screen !== "select-sources") return;
    const { provider, user, mode } = appState;
    const previousInbox = mode === "manage" ? manageOriginRef.current?.inbox : undefined;
    manageOriginRef.current = null;
    const run = beginRun();
    void saveScopeToStore(provider, user, scope).then(async () => {
      if (run.runId !== runIdRef.current) return;
      const repositories = await resolveScopeRepositories(provider, scope, run.signal);
      if (run.runId !== runIdRef.current) return;
      startSync(provider, user, scope, repositories, run, previousInbox);
    });
  };

  const manage = (): void => {
    if (appState.screen !== "inbox") return;
    manageOriginRef.current = appState;
    const run = beginRun();
    const { provider, user, scope } = appState;
    setAppState({
      screen: "select-sources",
      mode: "manage",
      provider,
      user,
      workspaces: [],
      repositories: [],
      initialScope: scope,
      discovery: emptyDiscovery,
    });
    runFullDiscovery(provider, run);
  };

  const cancelManage = (): void => {
    const origin = manageOriginRef.current;
    if (!origin) return;
    beginRun();
    manageOriginRef.current = null;
    setAppState(origin);
  };

  const lock = (): void => {
    beginRun();
    manageOriginRef.current = null;
    setAppState({ screen: "connect" });
  };

  const markReviewed = (pullRequest: PullRequestSummary): void => {
    const next = { ...reviewed, [pullRequestKey(pullRequest)]: pullRequest.sourceCommit };
    setReviewed(next);
    window.localStorage.setItem(reviewedStorageKey, JSON.stringify(next));
    setAppState((current) =>
      current.screen === "review"
        ? {
            screen: "inbox",
            provider: current.provider,
            user: current.user,
            scope: current.scope,
            inbox: current.inbox,
          }
        : current,
    );
  };

  const refresh = (): void => {
    if (appState.screen !== "inbox") return;
    const { provider, user, scope, inbox } = appState;
    const run = beginRun();
    void resolveScopeRepositories(provider, scope, run.signal).then((repositories) => {
      if (run.runId !== runIdRef.current) return;
      startSync(provider, user, scope, repositories, run, inbox);
    });
  };

  return (
    <>
      <header className="app-shell app-header">
        <div>
          <p className="eyebrow">Personal review workspace</p>
          <h1>Revelio</h1>
        </div>
        <ThemeControl theme={selectedTheme} resolvedTheme={diffTheme} onThemeChange={setTheme} />
      </header>
      {appState.screen === "connect" ? <ConnectScreen onConnected={connect} /> : null}
      {appState.screen === "select-sources" ? (
        <Suspense
          fallback={
            <p className="app-shell inbox-copy" role="status">
              Loading repository selection…
            </p>
          }
        >
          <RepositorySelectionScreen
            workspaces={appState.workspaces}
            repositories={appState.repositories}
            initialScope={appState.initialScope}
            discovery={appState.discovery}
            onSave={saveScope}
            onCancel={appState.mode === "manage" ? cancelManage : undefined}
          />
        </Suspense>
      ) : null}
      {appState.screen === "inbox" ? (
        <InboxScreen
          user={appState.user}
          inbox={appState.inbox}
          refreshError={appState.refreshError}
          reviewed={reviewed}
          onSelect={(pullRequest) =>
            setAppState({ ...appState, screen: "review", pullRequest, inbox: appState.inbox })
          }
          onRefresh={refresh}
          onManageRepositories={manage}
          onLock={lock}
        />
      ) : null}
      {appState.screen === "review" ? (
        <Suspense
          fallback={
            <p className="app-shell review-status" role="status">
              Loading review…
            </p>
          }
        >
          <ReviewScreen
            provider={appState.provider}
            pullRequest={appState.pullRequest}
            themeType={diffTheme}
            onBack={() => setAppState({ ...appState, screen: "inbox" })}
            onMarkReviewed={markReviewed}
          />
        </Suspense>
      ) : null}
    </>
  );
}

function readReviewed(): Record<string, string> {
  try {
    const value = window.localStorage.getItem(reviewedStorageKey);
    if (!value) return {};
    const parsed: unknown = JSON.parse(value);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  } catch {
    return {};
  }
}
