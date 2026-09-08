import "../styles.css";
import type { JSX } from "react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { ConnectScreen } from "../connection/ConnectScreen";
import { InboxScreen, pullRequestKey } from "../inbox/InboxScreen";
import type { Checkpoint } from "../inbox/checkpoint";
import type { InboxLoadSnapshot } from "../inbox/load-inbox";
import type { BitbucketCredentials } from "../providers/bitbucket-cloud/auth";
import type {
  CodeReviewProvider,
  ProviderUser,
  PullRequestSummary,
  RepositoryRef,
} from "../providers/contracts";
import type { RepositoryScope } from "../scope/repository-scope";
import { type ThemeChoice, ThemeControl } from "../ui/ThemeControl";
import { useThemePreference } from "../ui/useThemePreference";

const ReviewScreen = lazy(() =>
  import("../review/ReviewScreen").then(({ ReviewScreen: screen }) => ({ default: screen })),
);
const RepositorySelectionScreen = lazy(() =>
  import("../scope/RepositorySelectionScreen").then(({ RepositorySelectionScreen: screen }) => ({
    default: screen,
  })),
);
const VaultScreen = lazy(() =>
  import("../vault/VaultScreen").then(({ VaultScreen: screen }) => ({ default: screen })),
);

interface Session {
  readonly provider: CodeReviewProvider;
  readonly user: ProviderUser;
}

interface DiscoveryProgress {
  readonly completed: number;
  readonly total: number;
  readonly repositoryCount: number;
  readonly failures: number;
  readonly isComplete: boolean;
}

type AppState =
  | { readonly screen: "restoring" }
  | { readonly screen: "connect" }
  | ({
      readonly screen: "setup-vault";
      readonly credentials: BitbucketCredentials;
      readonly scope: RepositoryScope;
      readonly repositories: ReadonlyArray<RepositoryRef>;
      readonly status: "idle" | "loading" | "error";
      readonly error?: string;
      readonly refreshError?: string;
      readonly previousInbox?: InboxLoadSnapshot;
    } & Session)
  | {
      readonly screen: "unlock";
      readonly status: "idle" | "loading" | "error";
      readonly error?: string;
    }
  | ({
      readonly screen: "select-sources";
      readonly mode: "first-run" | "manage";
      readonly credentials?: BitbucketCredentials;
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
const lockoutStorageKey = "revelio.locked";
const lockFailureMessage = "The local vault could not be locked. Try Lock again.";
/** Independent of the vault's 7-day trusted-browser resume window (`TRUSTED_BROWSER_TTL_MS`):
 * that window controls whether reopening the app still needs a passphrase/passkey, while this
 * timer locks an already-unlocked session after inactivity, regardless of how much of the 7
 * days remains. */
const INACTIVITY_LOCK_MS = 15 * 60 * 1000;
const AUTHENTICATED_SCREENS = new Set<AppState["screen"]>([
  "setup-vault",
  "select-sources",
  "inbox",
  "review",
]);
const isAuthenticatedScreen = (screen: AppState["screen"]): boolean =>
  AUTHENTICATED_SCREENS.has(screen);
const emptyScope: RepositoryScope = { selectedWorkspaces: [], selectedRepositories: [] };
const emptyDiscovery: DiscoveryProgress = {
  completed: 0,
  total: 0,
  repositoryCount: 0,
  failures: 0,
  isComplete: false,
};
const workspaceDiscoveryWarning =
  "Some selected workspaces could not be loaded. Results may be incomplete.";
const pendingInbox = (totalRepositories: number): InboxLoadSnapshot => ({
  pullRequests: [],
  validCheckpointKeys: [],
  resolvedRepositoryKeys: [],
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
    import("../persistence/checkpoint-store"),
  ]).then(([Effect, inbox, scope, persistence, checkpoints]) => ({
    Effect,
    loadInbox: inbox.loadInbox,
    makeScopeStore: scope.makeScopeStore,
    resolveRepositories: scope.resolveRepositories,
    makeIndexedDbKeyValueStore: persistence.makeIndexedDbKeyValueStore,
    makeCheckpointStore: checkpoints.makeCheckpointStore,
  }));

const loadBitbucketClient = () =>
  import("../providers/bitbucket-cloud/client").then(({ makeBitbucketClient }) => ({
    makeBitbucketClient,
  }));

const loadVaultEngine = () =>
  Promise.all([
    import("../vault/store"),
    import("../vault/webauthn"),
    import("../persistence/indexed-db"),
  ]).then(([store, webauthn, persistence]) => ({
    makeVaultService: store.makeVaultService,
    makeWebAuthnPrfPort: webauthn.makeWebAuthnPrfPort,
    createNavigatorCredentialPort: webauthn.createNavigatorCredentialPort,
    makeIndexedDbKeyValueStore: persistence.makeIndexedDbKeyValueStore,
  }));

const mergeSnapshotWithPrevious = (
  previous: InboxLoadSnapshot,
  next: InboxLoadSnapshot,
): InboxLoadSnapshot => {
  if (next.isComplete) return next;
  const resolvedRepositoryKeys = new Set(next.resolvedRepositoryKeys);
  const staleFromPrevious = previous.pullRequests.filter(
    (pullRequest) =>
      !resolvedRepositoryKeys.has(
        [pullRequest.ref.repository.workspace, pullRequest.ref.repository.slug].join(
          String.fromCodePoint(0),
        ),
      ),
  );
  const staleKeys = new Set(staleFromPrevious.map(pullRequestKey));
  const validCheckpointKeys = new Set(next.validCheckpointKeys ?? []);
  for (const key of previous.validCheckpointKeys ?? []) {
    if (staleKeys.has(key)) validCheckpointKeys.add(key);
  }
  return {
    ...next,
    pullRequests: [...next.pullRequests, ...staleFromPrevious].sort((a, b) =>
      a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0,
    ),
    validCheckpointKeys: [...validCheckpointKeys].sort(),
  };
};

const reviewedFromSnapshot = (snapshot: InboxLoadSnapshot): Record<string, string> => {
  const valid = new Set(snapshot.validCheckpointKeys ?? []);
  return Object.fromEntries(
    snapshot.pullRequests
      .filter((pullRequest) => valid.has(pullRequestKey(pullRequest)))
      .map((pullRequest) => [pullRequestKey(pullRequest), pullRequest.sourceCommit]),
  );
};

const discoverRepositoriesForWorkspaces = async (
  provider: CodeReviewProvider,
  workspaces: ReadonlyArray<string>,
  onProgress: (
    completed: number,
    repositories: ReadonlyArray<RepositoryRef>,
    failures: number,
  ) => void,
  signal?: AbortSignal,
): Promise<{ readonly repositories: ReadonlyArray<RepositoryRef>; readonly failures: number }> => {
  const { Effect } = await loadEngine();
  const repositories: RepositoryRef[] = [];
  let failures = 0;
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
        else failures += 1;
        completed += 1;
        onProgress(completed, [...repositories], failures);
      }
    }),
  );
  return { repositories, failures };
};

const resolveScopeRepositories = async (
  provider: CodeReviewProvider,
  scope: RepositoryScope,
  signal?: AbortSignal,
): Promise<{ readonly repositories: ReadonlyArray<RepositoryRef>; readonly failures: number }> => {
  const { resolveRepositories } = await loadEngine();
  const discovered = await discoverRepositoriesForWorkspaces(
    provider,
    scope.selectedWorkspaces,
    () => undefined,
    signal,
  );
  return {
    repositories: resolveRepositories(scope, discovered.repositories),
    failures: discovered.failures,
  };
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

const makeVaultServiceForUser = async (user?: ProviderUser, credentials?: BitbucketCredentials) => {
  const {
    makeVaultService,
    makeWebAuthnPrfPort,
    createNavigatorCredentialPort,
    makeIndexedDbKeyValueStore,
  } = await loadVaultEngine();
  const enrollmentOptions =
    user && credentials
      ? {
          rp: { name: "Revelio" },
          user: {
            id: new TextEncoder().encode(user.id).slice(0, 64),
            name: credentials.payload.email,
            displayName: user.displayName,
          },
        }
      : undefined;
  return makeVaultService(
    makeIndexedDbKeyValueStore(),
    makeWebAuthnPrfPort(createNavigatorCredentialPort(), enrollmentOptions),
  );
};

const validateCredentials = async (
  credentials: BitbucketCredentials,
  signal?: AbortSignal,
): Promise<Session> => {
  const { Effect } = await loadEngine();
  const { makeBitbucketClient } = await loadBitbucketClient();
  const validationProvider = makeBitbucketClient(credentials, undefined, { signal });
  const user = await Effect.runPromise(validationProvider.getCurrentUser);
  return { provider: makeBitbucketClient(credentials), user };
};

const rememberLockedOut = (): void => {
  try {
    window.localStorage.setItem(lockoutStorageKey, "1");
  } catch {
    // Best effort: the vault remains the source of truth when localStorage is unavailable.
  }
};

const forgetLockedOut = (): void => {
  try {
    window.localStorage.removeItem(lockoutStorageKey);
  } catch {
    // Best effort.
  }
};

const readLockedOut = (): boolean => {
  try {
    return window.localStorage.getItem(lockoutStorageKey) === "1";
  } catch {
    return true;
  }
};

export function App(): JSX.Element {
  const [appState, setAppState] = useState<AppState>({ screen: "restoring" });
  const { theme, resolvedTheme, setTheme } = useThemePreference();
  const selectedTheme: ThemeChoice = theme === "light" || theme === "dark" ? theme : "system";
  const diffTheme = resolvedTheme === "dark" ? "dark" : "light";

  const runIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const manageOriginRef = useRef<(AppState & { readonly screen: "inbox" }) | null>(null);
  const checkpointsRef = useRef<ReadonlyArray<Checkpoint>>([]);
  const legacyMigrationRef = useRef<string | null>(null);
  const activeCheckpointIdentityRef = useRef<string | null>(null);

  const beginRun = (): { runId: number; signal: AbortSignal } => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    return { runId: ++runIdRef.current, signal: controller.signal };
  };

  const checkpointIdentity = (provider: CodeReviewProvider, user: ProviderUser): string =>
    `${provider.id}:${user.id}`;

  const saveCheckpoint = async (
    provider: CodeReviewProvider,
    user: ProviderUser,
    checkpoint: Checkpoint,
  ): Promise<void> => {
    const identity = checkpointIdentity(provider, user);
    const { makeCheckpointStore, makeIndexedDbKeyValueStore } = await loadEngine();
    await makeCheckpointStore(makeIndexedDbKeyValueStore()).save(provider.id, user.id, checkpoint);
    if (activeCheckpointIdentityRef.current !== identity) return;
    const next = [
      ...checkpointsRef.current.filter(
        (current) => current.pullRequestKey !== checkpoint.pullRequestKey,
      ),
      checkpoint,
    ];
    checkpointsRef.current = next;
    setAppState((current) => {
      if (
        (current.screen !== "inbox" && current.screen !== "review") ||
        current.provider !== provider ||
        current.user.id !== user.id
      ) {
        return current;
      }
      const validCheckpointKeys = Array.from(
        new Set([...(current.inbox.validCheckpointKeys ?? []), checkpoint.pullRequestKey]),
      ).sort();
      return { ...current, inbox: { ...current.inbox, validCheckpointKeys } };
    });
  };

  const loadCheckpoints = async (
    provider: CodeReviewProvider,
    user: ProviderUser,
  ): Promise<ReadonlyArray<Checkpoint>> => {
    try {
      const { makeCheckpointStore, makeIndexedDbKeyValueStore } = await loadEngine();
      return await makeCheckpointStore(makeIndexedDbKeyValueStore()).load(provider.id, user.id);
    } catch {
      return [];
    }
  };

  const migrateLegacyCheckpoints = (
    snapshot: InboxLoadSnapshot,
    provider: CodeReviewProvider,
    user: ProviderUser,
    run: { runId: number },
  ): void => {
    const identity = checkpointIdentity(provider, user);
    if (!snapshot.isComplete || snapshot.failures.length > 0) return;
    if (activeCheckpointIdentityRef.current !== identity) return;
    if (legacyMigrationRef.current === identity) return;
    const legacy = readReviewed();
    if (Object.keys(legacy).length === 0) return;
    legacyMigrationRef.current = identity;
    const timestamp = new Date().toISOString();
    const known = new Set(checkpointsRef.current.map(({ pullRequestKey }) => pullRequestKey));
    const checkpoints = snapshot.pullRequests.flatMap((pullRequest) => {
      const key = pullRequestKey(pullRequest);
      if (known.has(key) || legacy[key] !== pullRequest.sourceCommit) return [];
      return [
        {
          pullRequestKey: key,
          reviewedHeadCommit: pullRequest.sourceCommit,
          watermark: timestamp,
          outcome: "reviewed" as const,
          finishedAt: timestamp,
        },
      ];
    });
    void (async () => {
      try {
        for (const checkpoint of checkpoints) {
          await saveCheckpoint(provider, user, checkpoint);
        }
        if (run.runId !== runIdRef.current || activeCheckpointIdentityRef.current !== identity)
          return;
        try {
          window.localStorage.removeItem(reviewedStorageKey);
        } catch {
          // The checkpoint store is authoritative even if this obsolete best-effort key remains.
        }
      } catch {
        if (legacyMigrationRef.current === identity) legacyMigrationRef.current = null;
      }
    })();
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: vault restore is a one-time app bootstrap.
  useEffect(() => {
    const run = beginRun();
    void makeVaultServiceForUser()
      .then(async (vault) => {
        const hasVault = await vault.hasVault();
        if (!hasVault) {
          forgetLockedOut();
          if (run.runId === runIdRef.current) setAppState({ screen: "connect" });
          return;
        }
        if (readLockedOut()) {
          if (run.runId === runIdRef.current) setAppState({ screen: "unlock", status: "idle" });
          return;
        }
        const credentials = await vault.resumeTrustedBrowser(Date.now());
        if (!credentials) {
          if (run.runId === runIdRef.current) setAppState({ screen: "unlock", status: "idle" });
          return;
        }
        const { provider, user } = await validateCredentials(credentials, run.signal);
        if (run.runId !== runIdRef.current) return;
        continueAuthenticated(credentials, provider, user, run, false);
      })
      .catch(() => {
        if (run.runId === runIdRef.current) setAppState({ screen: "connect" });
      });
  }, []);

  const startSync = (
    provider: CodeReviewProvider,
    user: ProviderUser,
    scope: RepositoryScope,
    repositories: ReadonlyArray<RepositoryRef>,
    run: { runId: number; signal: AbortSignal },
    previousInbox?: InboxLoadSnapshot,
    refreshError?: string,
  ): void => {
    const applySnapshot = (snapshot: InboxLoadSnapshot): void => {
      if (run.runId !== runIdRef.current) return;
      const inbox = previousInbox ? mergeSnapshotWithPrevious(previousInbox, snapshot) : snapshot;
      setAppState((current) => (current.screen === "inbox" ? { ...current, inbox } : current));
      migrateLegacyCheckpoints(inbox, provider, user, run);
    };

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
      refreshError,
    });
    void loadEngine().then(({ Effect, loadInbox }) =>
      Effect.runPromise(
        loadInbox(provider, repositories, {
          concurrency: 4,
          signal: run.signal,
          checkpoints: checkpointsRef.current,
          currentUserId: user.id,
          onSnapshot: (snapshot) => {
            applySnapshot(snapshot);
          },
        }),
      ).then(applySnapshot),
    );
  };

  const continueAuthenticated = (
    credentials: BitbucketCredentials,
    provider: CodeReviewProvider,
    user: ProviderUser,
    run: { runId: number; signal: AbortSignal },
    promptForVault: boolean,
  ): void => {
    activeCheckpointIdentityRef.current = checkpointIdentity(provider, user);
    void loadCheckpoints(provider, user).then((checkpoints) => {
      if (run.runId !== runIdRef.current) return;
      checkpointsRef.current = checkpoints;
      legacyMigrationRef.current = null;
      return loadSavedScope(provider, user).then(async (scope) => {
        if (run.runId !== runIdRef.current) return;
        if (scope) {
          const discovery = await resolveScopeRepositories(provider, scope, run.signal);
          if (run.runId !== runIdRef.current) return;
          const refreshError = discovery.failures > 0 ? workspaceDiscoveryWarning : undefined;
          if (promptForVault) {
            setAppState({
              screen: "setup-vault",
              credentials,
              provider,
              user,
              scope,
              repositories: discovery.repositories,
              status: "idle",
              refreshError,
            });
            return;
          }
          startSync(provider, user, scope, discovery.repositories, run, undefined, refreshError);
          return;
        }
        setAppState({
          screen: "select-sources",
          mode: "first-run",
          credentials: promptForVault ? credentials : undefined,
          provider,
          user,
          workspaces: [],
          repositories: [],
          initialScope: emptyScope,
          discovery: emptyDiscovery,
        });
        runFullDiscovery(provider, run);
      });
    });
  };

  const connect = (
    credentials: BitbucketCredentials,
    provider: CodeReviewProvider,
    user: ProviderUser,
  ): void => {
    const run = beginRun();
    continueAuthenticated(credentials, provider, user, run, true);
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
                repositoryCount: 0,
                failures: workspacesResult._tag === "Left" ? 1 : 0,
                isComplete: workspaces.length === 0,
              },
            }
          : current,
      );
      await discoverRepositoriesForWorkspaces(
        provider,
        workspaces,
        (completed, repositories, failures) => {
          if (run.runId !== runIdRef.current) return;
          setAppState((current) =>
            current.screen === "select-sources"
              ? {
                  ...current,
                  repositories,
                  discovery: {
                    completed,
                    total: workspaces.length,
                    repositoryCount: repositories.length,
                    failures,
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
    const { credentials, provider, user, mode } = appState;
    const knownRepositories = appState.repositories;
    const discoveryIsComplete = appState.discovery.isComplete;
    const knownFailures = appState.discovery.failures;
    const previousInbox = undefined;
    manageOriginRef.current = null;
    const run = beginRun();
    void saveScopeToStore(provider, user, scope).then(async () => {
      if (run.runId !== runIdRef.current) return;
      const discovery = discoveryIsComplete
        ? {
            repositories: (await loadEngine()).resolveRepositories(scope, knownRepositories),
            failures: knownFailures,
          }
        : await resolveScopeRepositories(provider, scope, run.signal);
      if (run.runId !== runIdRef.current) return;
      const refreshError = discovery.failures > 0 ? workspaceDiscoveryWarning : undefined;
      if (mode === "first-run" && credentials) {
        setAppState({
          screen: "setup-vault",
          credentials,
          provider,
          user,
          scope,
          repositories: discovery.repositories,
          status: "idle",
          refreshError,
        });
        return;
      }
      startSync(provider, user, scope, discovery.repositories, run, previousInbox, refreshError);
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
      credentials: undefined,
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
    const run = beginRun();
    manageOriginRef.current = null;
    rememberLockedOut();
    setAppState({ screen: "unlock", status: "loading" });
    void makeVaultServiceForUser()
      .then(async (vault) => {
        await vault.clearTrustedBrowser();
        return vault.hasVault();
      })
      .then((hasVault) => {
        if (run.runId !== runIdRef.current) return;
        if (!hasVault) forgetLockedOut();
        setAppState(hasVault ? { screen: "unlock", status: "idle" } : { screen: "connect" });
      })
      .catch(() => {
        if (run.runId === runIdRef.current) {
          setAppState({
            screen: "unlock",
            status: "error",
            error: lockFailureMessage,
          });
        }
      });
  };

  const lockRef = useRef(lock);
  lockRef.current = lock;
  const isAuthenticated = isAuthenticatedScreen(appState.screen);
  const isAuthenticatedRef = useRef(isAuthenticated);
  isAuthenticatedRef.current = isAuthenticated;
  const lastActivityAtRef = useRef(Date.now());
  const armInactivityLockRef = useRef<() => void>(() => undefined);

  // Locks an authenticated session after 15 idle minutes, reusing `lock` so
  // credentials and trusted-browser state clear exactly as explicit Lock
  // does. Listens for low-frequency activity signals only (no mousemove/
  // scroll) and keeps a single reschedulable timeout rather than a poll.
  useEffect(() => {
    let timeoutId: ReturnType<typeof window.setTimeout> | undefined;
    const arm = (): void => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      if (!isAuthenticatedRef.current) return;
      const remainingMs = INACTIVITY_LOCK_MS - (Date.now() - lastActivityAtRef.current);
      if (remainingMs <= 0) {
        lockRef.current();
        return;
      }
      timeoutId = window.setTimeout(() => {
        if (isAuthenticatedRef.current) lockRef.current();
      }, remainingMs);
    };
    armInactivityLockRef.current = arm;
    const onActivity = (): void => {
      lastActivityAtRef.current = Date.now();
      arm();
    };
    const onVisibility = (): void => {
      if (document.visibilityState === "visible") arm();
    };
    document.addEventListener("pointerdown", onActivity);
    document.addEventListener("keydown", onActivity);
    document.addEventListener("visibilitychange", onVisibility);
    arm();
    return () => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      document.removeEventListener("pointerdown", onActivity);
      document.removeEventListener("keydown", onActivity);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    if (isAuthenticated) lastActivityAtRef.current = Date.now();
    armInactivityLockRef.current();
  }, [isAuthenticated]);

  const finishVaultSetup = (kind: "passkey" | "passphrase" | "session", passphrase = ""): void => {
    if (appState.screen !== "setup-vault") return;
    const current = appState;
    const run = beginRun();
    const finish = () =>
      startSync(
        current.provider,
        current.user,
        current.scope,
        current.repositories,
        run,
        current.previousInbox,
        current.refreshError,
      );
    if (kind === "session") {
      finish();
      return;
    }
    setAppState({ ...current, status: "loading", error: undefined });
    void makeVaultServiceForUser(current.user, current.credentials)
      .then((vault) =>
        kind === "passkey"
          ? vault.enrollPasskey(current.credentials)
          : vault.enrollPassphrase(current.credentials, passphrase),
      )
      .then(() => {
        if (run.runId === runIdRef.current) {
          forgetLockedOut();
          finish();
        }
      })
      .catch(() => {
        if (run.runId === runIdRef.current) {
          setAppState({
            ...current,
            status: "error",
            error: "Unable to unlock the local vault",
          });
        }
      });
  };

  const unlockVault = (kind: "passkey" | "passphrase", passphrase = ""): void => {
    const run = beginRun();
    setAppState({ screen: "unlock", status: "loading" });
    void makeVaultServiceForUser()
      .then((vault) =>
        kind === "passkey" ? vault.unlockPasskey() : vault.unlockPassphrase(passphrase),
      )
      .then((credentials) =>
        validateCredentials(credentials, run.signal).then((session) => ({
          credentials,
          ...session,
        })),
      )
      .then(({ credentials, provider, user }) => {
        if (run.runId !== runIdRef.current) return;
        forgetLockedOut();
        continueAuthenticated(credentials, provider, user, run, false);
      })
      .catch(() => {
        if (run.runId === runIdRef.current) {
          setAppState({
            screen: "unlock",
            status: "error",
            error: "Unable to unlock the local vault",
          });
        }
      });
  };

  const refresh = (): void => {
    if (appState.screen !== "inbox") return;
    const { provider, user, scope, inbox } = appState;
    const run = beginRun();
    void resolveScopeRepositories(provider, scope, run.signal).then((repositories) => {
      if (run.runId !== runIdRef.current) return;
      const refreshError = repositories.failures > 0 ? workspaceDiscoveryWarning : undefined;
      startSync(provider, user, scope, repositories.repositories, run, inbox, refreshError);
    });
  };

  return (
    <>
      {appState.screen !== "review" && appState.screen !== "inbox" ? (
        <header className="app-shell app-header">
          <div>
            <p className="eyebrow">Personal review workspace</p>
            <h1>Revelio</h1>
          </div>
          <ThemeControl theme={selectedTheme} resolvedTheme={diffTheme} onThemeChange={setTheme} />
        </header>
      ) : null}
      {appState.screen === "restoring" ? (
        <p className="app-shell inbox-copy" role="status">
          Restoring Revelio…
        </p>
      ) : null}
      {appState.screen === "connect" ? <ConnectScreen onConnected={connect} /> : null}
      {appState.screen === "unlock" ? (
        <Suspense
          fallback={
            <p className="app-shell inbox-copy" role="status">
              Loading vault…
            </p>
          }
        >
          <VaultScreen
            mode="unlock"
            status={appState.status}
            error={appState.error}
            onPasskey={() => unlockVault("passkey")}
            onPassphrase={(passphrase) => unlockVault("passphrase", passphrase)}
            onReconnect={() => setAppState({ screen: "connect" })}
          />
        </Suspense>
      ) : null}
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
      {appState.screen === "setup-vault" ? (
        <Suspense
          fallback={
            <p className="app-shell inbox-copy" role="status">
              Loading vault…
            </p>
          }
        >
          <VaultScreen
            mode="setup"
            status={appState.status}
            error={appState.error}
            onPasskey={() => finishVaultSetup("passkey")}
            onPassphrase={(passphrase) => finishVaultSetup("passphrase", passphrase)}
            onSessionOnly={() => finishVaultSetup("session")}
          />
        </Suspense>
      ) : null}
      {appState.screen === "inbox" ? (
        <InboxScreen
          user={appState.user}
          inbox={appState.inbox}
          refreshError={appState.refreshError}
          reviewed={reviewedFromSnapshot(appState.inbox)}
          onSelect={(pullRequest) =>
            setAppState({
              ...appState,
              screen: "review",
              pullRequest,
              inbox: appState.inbox,
            })
          }
          onRefresh={refresh}
          onManageRepositories={manage}
          onLock={lock}
          theme={selectedTheme}
          resolvedTheme={diffTheme}
          onThemeChange={setTheme}
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
            key={pullRequestKey(appState.pullRequest)}
            provider={appState.provider}
            pullRequest={appState.pullRequest}
            themeType={diffTheme}
            theme={selectedTheme}
            onThemeChange={setTheme}
            currentUserId={appState.user.id}
            inbox={appState.inbox}
            onBack={() =>
              setAppState((current) =>
                current.screen === "review" ? { ...current, screen: "inbox" } : current,
              )
            }
            saveCheckpoint={(checkpoint) =>
              saveCheckpoint(appState.provider, appState.user, checkpoint)
            }
            onSelectPullRequest={(pullRequest) =>
              setAppState((current) =>
                current.screen === "review" ? { ...current, pullRequest } : current,
              )
            }
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
