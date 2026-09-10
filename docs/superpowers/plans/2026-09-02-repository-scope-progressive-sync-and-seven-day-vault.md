# Repository Scope, Progressive Sync, and Seven-Day Vault Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Revelio's opaque all-repository connection pipeline with efficient source selection and progressive PR synchronization, then add an encrypted credential vault with a fixed seven-day trusted-browser session.

**Architecture:** Split the provider boundary into identity, workspace, repository, and repository-scoped PR operations. Persist normalized repository scope and vault records through one native IndexedDB adapter, feed explicit repositories into a four-wide progressive sync engine, and let the React shell orchestrate connect, unlock, source selection, inbox, and review states.

**Tech Stack:** React 19, TypeScript 7, Effect 3, native IndexedDB, Web Crypto AES-GCM/HKDF, WebAuthn PRF, Argon2id WASM, HeroUI, Vitest/Testing Library, Playwright, Biome, pnpm.

**Spec:** `docs/superpowers/specs/2026-09-02-repository-scope-progressive-sync-and-seven-day-vault.md`

## Global Constraints

- Never copy the attached HAR, real credentials, authorization headers, or provider bodies into source, tests, logs, screenshots, commits, or worker prompts.
- Requests stay fixed to `https://api.bitbucket.org/2.0`; opaque next links keep the existing safety validation.
- Collections use `pagelen=100` and partial `fields`; PR listing remains repository-scoped.
- Progressive loading runs at most four repository operations concurrently.
- Empty copy appears only after every selected repository succeeds with zero PRs.
- Scope is keyed by provider ID and Bitbucket user UUID. A workspace selection includes future repositories.
- Credentials never enter localStorage, sessionStorage, Cache Storage, service workers, URLs, logs, or errors.
- Trusted-browser expiry is fixed at `604800000` ms and never rolls forward automatically.
- Lock deletes the trusted-browser record and clears credentials/provider state.
- WebAuthn PRF is feature-detected and never silently downgraded.
- Every behavior follows RED, observed expected failure, minimal GREEN, then focused and broader verification.
- Workers edit only assigned files, preserve concurrent work, make no push/PR/live Bitbucket calls, and report commits/tests/risks.

## Parallel Ownership

Wave 1 launches three independent Sonnet worktrees:

- Provider worker: `src/providers/**` files named in Task 1.
- Scope worker: new `src/persistence/**` and `src/scope/repository-scope*` files in Task 2.
- Sync worker: `src/inbox/load-inbox.ts` and its test in Task 3.

After Wave 1 review/integration, Wave 2 separates selection UI (Task 4) from vault files and dependency changes (Task 5). Task 6 joins both; Task 7 owns acceptance/docs.

---

### Task 1: Efficient Bitbucket Provider Operations

**Files:**
- Modify: `src/providers/contracts.ts`
- Modify: `src/providers/bitbucket-cloud/client.ts`
- Modify: `src/providers/bitbucket-cloud/client.test.ts`
- Modify: `src/providers/bitbucket-cloud/schemas.ts`
- Modify: `src/providers/bitbucket-cloud/schemas.test.ts`
- Modify: `src/providers/bitbucket-cloud/diagnostics.ts`
- Modify: `src/providers/bitbucket-cloud/diagnostics.test.ts`

**Interfaces:**
- Produces `listWorkspaces(): Effect<ReadonlyArray<string>, ProviderError>`.
- Produces `listRepositories(workspace: string): Effect<ReadonlyArray<RepositoryRef>, ProviderError>`.
- Keeps existing identity, PR, diff, activity, and mutation members.
- Removes `discoverRepositories` and its aggregate result types after internal callers migrate.

- [ ] **Step 1: Write the 168-repository failing test**

Return 100 synthetic slugs on the first page and 68 on one safe opaque next link. Assert exactly these two requests and 168 normalized refs:

```ts
expect(requests).toEqual([
  "https://api.bitbucket.org/2.0/repositories/acme?pagelen=100&fields=next%2Cvalues.slug",
  "https://api.bitbucket.org/2.0/repositories/acme?cursor=opaque-second-page",
]);
expect(repositories).toHaveLength(168);
```

- [ ] **Step 2: Verify RED**

Run `pnpm test:unit -- src/providers/bitbucket-cloud/client.test.ts`.

Expected: FAIL because `listRepositories` is absent and current discovery uses `pagelen=1`.

- [ ] **Step 3: Split workspace/repository operations using the existing paginator**

Initial query constants:

```ts
const workspaceFields = "next,values.workspace.slug";
const repositoryFields = "next,values.slug";
```

Use `pagelen=100`, encoded `fields`, sorted immutable output, and the existing `collectPages`. Do not create a second paginator.

- [ ] **Step 4: Narrow PR partial responses**

Use this exact required-field list:

```ts
const pullRequestFields = [
  "next", "values.id", "values.title", "values.description", "values.state",
  "values.updated_on", "values.author.uuid", "values.author.display_name",
  "values.author.nickname", "values.source.branch.name", "values.source.commit.hash",
  "values.destination.branch.name", "values.reviewers.uuid",
].join(",");
```

Initial PR request is `state=OPEN&pagelen=100&fields=<encoded fields>`. Decode reviewers from `{ uuid }` only while keeping the full author decoder.

- [ ] **Step 5: Update schema/client/diagnostic tests**

Add a reviewer fixture containing only `{ "uuid": "{reviewer}" }`. Adapt diagnostics to call the split operations while preserving sanitized outcomes and its deterministic first-repository capability probe.

- [ ] **Step 6: Verify provider slice**

Run:

```bash
pnpm test:unit -- src/providers/bitbucket-cloud/client.test.ts src/providers/bitbucket-cloud/schemas.test.ts src/providers/bitbucket-cloud/diagnostics.test.ts
pnpm typecheck
```

Expected: all PASS and typecheck exits 0.

- [ ] **Step 7: Commit**

Stage only the seven owned files and commit `fix: make Bitbucket discovery efficient`.

### Task 2: Native IndexedDB Repository Scope

**Files:**
- Create: `src/persistence/indexed-db.ts`
- Create: `src/persistence/indexed-db.test.ts`
- Create: `src/scope/repository-scope.ts`
- Create: `src/scope/repository-scope.test.ts`

**Interfaces:**

```ts
export interface RepositoryScope {
  readonly selectedWorkspaces: ReadonlyArray<string>;
  readonly selectedRepositories: ReadonlyArray<RepositoryRef>;
}
export interface ScopeStore {
  load(providerId: string, userId: string): Promise<RepositoryScope | undefined>;
  save(providerId: string, userId: string, scope: RepositoryScope): Promise<void>;
}
export interface KeyValueStore {
  get<A>(store: "settings" | "vault", key: IDBValidKey): Promise<A | undefined>;
  put(store: "settings" | "vault", value: unknown, key: IDBValidKey): Promise<void>;
  delete(store: "settings" | "vault", key: IDBValidKey): Promise<void>;
}
```

Also produce `normalizeRepositoryScope`, `resolveRepositories`, `makeIndexedDbKeyValueStore`, and `makeScopeStore`.

- [ ] **Step 1: Write failing pure scope tests**

Use literal repositories from `alpha` and `beta`. Prove whole-workspace selection includes all `alpha` repos plus a newly discovered `alpha/new`; exact `beta/three` selection excludes siblings; normalization sorts/deduplicates and removes explicit repos already covered by a selected workspace.

- [ ] **Step 2: Verify RED**

Run `pnpm test:unit -- src/scope/repository-scope.test.ts`.

Expected: FAIL because the module is absent.

- [ ] **Step 3: Implement minimal immutable scope helpers**

Use a stable key and Sets:

```ts
const repositoryKey = ({ workspace, slug }: RepositoryRef) => `${workspace}\u0000${slug}`;
```

Do not add classes, a state library, or speculative exclusion modes.

- [ ] **Step 4: Write store tests with an injected Map fake**

Save distinct scopes for `user-a` and `user-b`; assert identity isolation and normalized round trips. Corrupt records must decode as `undefined`. Do not add `fake-indexeddb`; Task 7 covers the native adapter in Playwright.

- [ ] **Step 5: Implement the database adapter**

Open `revelio` version 1 and create `settings` and `vault` stores. Resolve requests only after transaction completion; reject error/abort with `Error("Local storage is unavailable")` and no DOMException detail. Scope keys use `scope:${providerId}:${userId}`.

- [ ] **Step 6: Verify and commit**

Run:

```bash
pnpm test:unit -- src/scope/repository-scope.test.ts src/persistence/indexed-db.test.ts
pnpm typecheck
```

Expected: PASS. Commit owned files as `feat: persist repository scope`.

### Task 3: Four-Wide Progressive Inbox Loader

**Files:**
- Modify: `src/inbox/load-inbox.ts`
- Modify: `src/inbox/load-inbox.test.ts`

**Interfaces:**

```ts
export interface InboxLoadSnapshot {
  readonly pullRequests: ReadonlyArray<PullRequestSummary>;
  readonly failures: ReadonlyArray<{ repository: RepositoryRef; errorTag: ProviderError["_tag"] }>;
  readonly totalRepositories: number;
  readonly completedRepositories: number;
  readonly isComplete: boolean;
}
export interface LoadInboxOptions {
  readonly concurrency?: number;
  readonly signal?: AbortSignal;
  readonly onSnapshot?: (snapshot: InboxLoadSnapshot) => void;
}
export const loadInbox: (
  provider: CodeReviewProvider,
  repositories: ReadonlyArray<RepositoryRef>,
  options?: LoadInboxOptions,
) => Effect.Effect<InboxLoadSnapshot, never>;
```

Also export `inboxHasConfirmedEmptyResult(snapshot)`.

- [ ] **Step 1: Write a failing concurrency test**

Start six deferred repository calls, record `active/maxActive`, and assert four start initially, the fifth starts after one completes, and `maxActive` remains 4.

- [ ] **Step 2: Verify RED**

Run `pnpm test:unit -- src/inbox/load-inbox.test.ts`.

Expected: FAIL because loading discovers internally and runs sequentially.

- [ ] **Step 3: Add progressive/failure/cancellation tests**

Assert the first success emits its PR before later calls finish, failure increments completed and remains sanitized, terminal snapshot is complete, and abort prevents late snapshots. Test confirmed-empty helper for pending-zero, failed-zero, complete-zero, and complete-nonzero literals.

- [ ] **Step 4: Implement the minimal worker pool**

Use a shared next index and at most four async runners:

```ts
const workerCount = Math.min(options.concurrency ?? 4, repositories.length);
let nextIndex = 0;
await Promise.all(Array.from({ length: workerCount }, async () => {
  while (!options.signal?.aborted) {
    const index = nextIndex++;
    if (index >= repositories.length) return;
    await loadOne(repositories[index]);
  }
}));
```

Use `Effect.either` per repository, emit frozen copies, and sort PRs by updated timestamp descending then workspace/slug/id. Do not add a queue dependency.

- [ ] **Step 5: Implement truthful empty predicate**

```ts
snapshot.isComplete && snapshot.failures.length === 0 && snapshot.pullRequests.length === 0
```

- [ ] **Step 6: Verify and commit**

Run `pnpm test:unit -- src/inbox/load-inbox.test.ts` and `pnpm typecheck`. Focused tests must pass; a temporary provider-contract type mismatch is reported rather than fixed outside ownership. Commit owned files as `feat: load inbox progressively`.

### Task 4: Interactive Source Selection and Progressive Inbox UI

**Files:**
- Create: `src/scope/RepositorySelectionScreen.tsx`
- Create: `src/scope/RepositorySelectionScreen.test.tsx`
- Modify: `src/connection/ConnectScreen.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`
- Modify: `src/inbox/InboxScreen.tsx`
- Create: `src/inbox/InboxScreen.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**

```ts
export interface RepositorySelectionScreenProps {
  readonly workspaces: ReadonlyArray<string>;
  readonly repositories: ReadonlyArray<RepositoryRef>;
  readonly initialScope: RepositoryScope;
  readonly discovery: { readonly completed: number; readonly total: number; readonly isComplete: boolean };
  readonly onSave: (scope: RepositoryScope) => void;
  readonly onCancel?: () => void;
}
```

- [ ] **Step 1: Write failing selection tests**

Render two workspaces/three repos. Selecting workspace `alpha` must save `selectedWorkspaces: ["alpha"]` with no redundant child refs. Selecting only `beta/three` saves exactly that ref. Continue is disabled for empty scope.

- [ ] **Step 2: Verify RED**

Run `pnpm test:unit -- src/scope/RepositorySelectionScreen.test.tsx`.

Expected: FAIL because the component is absent.

- [ ] **Step 3: Implement the compact semantic selector**

Use fieldsets, checkboxes, headings, and existing HeroUI buttons. Preserve selections as repository pages arrive and show literal progress such as `Loading repositories 100 of 168`. Add no tree/virtualization dependency.

- [ ] **Step 4: Make Connect validate identity only**

Change success to `onConnected(provider, user)`. Remove the `loadInbox` import/call so connection never starts discovery or PR loading.

- [ ] **Step 5: Expand app state explicitly**

```ts
type AppState =
  | { readonly screen: "connect" }
  | ({ readonly screen: "select-sources"; readonly mode: "first-run" | "manage" } & Session & DiscoveryState)
  | ({ readonly screen: "inbox"; readonly scope: RepositoryScope; readonly inbox: InboxLoadSnapshot } & Session)
  | ({ readonly screen: "review"; readonly scope: RepositoryScope; readonly pullRequest: PullRequestSummary; readonly inbox: InboxLoadSnapshot } & Session);
```

First successful sign-in always shows selection. Later saved scope resolves current repository discovery and starts sync. Manage returns to selection.

- [ ] **Step 6: Wire progress and cancellation**

Own one active `AbortController` and run ID. Scope change, refresh, Lock, or newer sync aborts the old run; late snapshots are ignored. Workspace repository discovery also uses a four-wide pool.

- [ ] **Step 7: Make status and empty copy truthful**

Show `Loaded N of M repositories - P pull requests found.` Pending/failed zero never renders empty copy. Failure shows `Results are incomplete: F repositories could not be loaded.` while successful rows remain.

- [ ] **Step 8: Add Manage repositories**

Add the secondary action beside Refresh/Lock and test its callback. Preserve current inbox rows while manage is canceled.

- [ ] **Step 9: Verify and commit**

Run:

```bash
pnpm test:unit -- src/scope/RepositorySelectionScreen.test.tsx src/app/App.test.tsx src/inbox/InboxScreen.test.tsx
pnpm typecheck
pnpm build
```

Expected: PASS and bundle budget success. Commit owned files as `feat: add repository source selection`.

### Task 5: Encrypted Vault and Fixed Seven-Day Session

**Files:**
- Create: `src/vault/model.ts`
- Create: `src/vault/crypto.ts`
- Create: `src/vault/crypto.test.ts`
- Create: `src/vault/store.ts`
- Create: `src/vault/store.test.ts`
- Create: `src/vault/webauthn.ts`
- Create: `src/vault/webauthn.test.ts`
- Create: `src/vault/VaultScreen.tsx`
- Create: `src/vault/VaultScreen.test.tsx`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

```ts
export const TRUSTED_BROWSER_TTL_MS = 604_800_000;
export interface VaultService {
  enrollPasskey(credentials: BitbucketCredentials): Promise<void>;
  enrollPassphrase(credentials: BitbucketCredentials, passphrase: string): Promise<void>;
  unlockPasskey(): Promise<BitbucketCredentials>;
  unlockPassphrase(passphrase: string): Promise<BitbucketCredentials>;
  resumeTrustedBrowser(now: number): Promise<BitbucketCredentials | undefined>;
  clearTrustedBrowser(): Promise<void>;
  hasVault(): Promise<boolean>;
}
```

- [ ] **Step 1: Add the approved Argon2id implementation**

Run `pnpm add argon2id`. Keep the lockfile's resolved version and import only the package loader needed for browser WASM. Add no second crypto helper dependency.

- [ ] **Step 2: Write AES-GCM round-trip/tamper tests**

Use synthetic credentials and injected deterministic random bytes. Serialized envelopes must contain neither email nor token. Flipping one ciphertext byte must reject with sanitized `Unable to unlock the local vault`.

- [ ] **Step 3: Verify RED**

Run `pnpm test:unit -- src/vault/crypto.test.ts`.

Expected: FAIL because the module is absent.

- [ ] **Step 4: Implement Web Crypto envelope helpers**

Use native HKDF-SHA-256 and AES-256-GCM. Bind version/mode through `additionalData`. Keys are `extractable: false` and limited to encrypt/decrypt. Never include DOMException text in errors.

- [ ] **Step 5: Implement passphrase derivation**

Use versioned parameters:

```ts
const ARGON2_PARAMETERS = { parallelism: 1, passes: 3, memorySize: 65_536, tagLength: 32 } as const;
```

Use a random 32-byte salt. Measure one desktop-browser unlock; change parameters only with recorded evidence that the approved values are unusable.

- [ ] **Step 6: Write and implement WebAuthn PRF adapter**

Inject a credential port. Test `prf.enabled === true`, false/missing PRF, a 32-byte authentication output, malformed output, and cancellation. Use `userVerification: "required"` and domain-separated input `revelio:v1:vault`. Unsupported PRF never invokes fallback automatically.

- [ ] **Step 7: Write trusted-session tests**

At fake time `1000`, resume succeeds at `1000 + TTL - 1`, deletes/fails at exact expiry, and ordinary resume leaves `expiresAt` unchanged. Explicit clear deletes short-lived key and ciphertext.

- [ ] **Step 8: Implement trusted record**

```ts
interface TrustedBrowserRecord {
  readonly version: 1;
  readonly key: CryptoKey;
  readonly ciphertext: Uint8Array;
  readonly nonce: Uint8Array;
  readonly createdAt: number;
  readonly expiresAt: number;
}
```

Generate AES-GCM key with `extractable: false`; store through Task 2's vault store. Create a new fixed window only after explicit enroll/unlock.

- [ ] **Step 9: Build vault enrollment/unlock UI**

Offer **Use passkey**, **Use passphrase**, **This session only**, and **Trust this browser for 7 days**. Existing vault without trusted record shows **Unlock Revelio**. Copy states that browser Passwords prompts are independent and that same-origin JS can use the remembered key during the window.

- [ ] **Step 10: Verify and commit**

Run:

```bash
pnpm test:unit -- src/vault/crypto.test.ts src/vault/store.test.ts src/vault/webauthn.test.ts src/vault/VaultScreen.test.tsx
pnpm typecheck
pnpm build
```

Expected: PASS and bundle budget success. Commit as `feat: add encrypted credential vault`.

### Task 6: Integrate Vault Lifecycle

**Files:**
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`
- Modify: `src/connection/ConnectScreen.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Write failing startup-state tests**

Prove these literal transitions: no vault -> connect; vault plus valid trusted credentials -> saved-scope path; vault without trusted credentials -> unlock. Lock clears trusted state before unlock/connect.

- [ ] **Step 2: Verify RED**

Run `pnpm test:unit -- src/app/App.test.tsx`.

Expected: FAIL because startup knows only connect.

- [ ] **Step 3: Add startup restoration**

Show `Restoring Revelio...` while checking the trusted record once. Restored credentials create the provider and validate current user before loading saved scope. Rejected credentials delete only the trusted record, preserving non-secret scope.

- [ ] **Step 4: Enroll after first identity validation**

After Connect validates identity, show vault mode choice before source selection. Session-only writes nothing. Successful passkey/passphrase enrollment creates long-term and trusted records.

- [ ] **Step 5: Preserve fixed expiry and Lock semantics**

Reload, navigation, refresh, repository management, and review never recreate/extend trusted expiry. Only explicit enrollment/unlock does. Lock always clears it immediately.

- [ ] **Step 6: Verify and commit**

Run app, connection, selection, inbox, and vault component tests plus `pnpm typecheck` and `pnpm build`. Expected: PASS. Commit as `feat: resume trusted sessions for seven days`.

### Task 7: Browser Acceptance, Documentation, and Full Verification

**Files:**
- Modify: `e2e/review-flow.spec.ts`
- Modify: `e2e/smoke.spec.ts`
- Modify: `README.md`
- Modify: `docs/phase-0/live-bitbucket-checklist.md`

- [ ] **Step 1: Update intercepted API paths**

Expect exact `pagelen=100`/encoded fields. Serve 168 synthetic repositories as 100+68 and assert two repository requests.

- [ ] **Step 2: Test first-run selection/progressive rows**

Assert selection appears before PR requests. Choose sources, delay the last repo, and assert an earlier PR row plus `Loaded 1 of 2 repositories` while pending.

- [ ] **Step 3: Test truthful empty/failure states**

Pending and failed-zero cases must not show empty copy. A successful row survives another repo's 403. All-success zero shows empty only after completion.

- [ ] **Step 4: Test native IndexedDB scope and trusted timing**

Reload after scope save and before trusted expiry; assert direct restoration and **Manage repositories**. At exact expiry assert **Unlock Revelio**. Unlock creates a new deadline; Lock requires unlock immediately. Use only synthetic credentials.

- [ ] **Step 5: Update documentation**

Document selection semantics, four-wide repository loading, no bulk endpoint, browser Passwords independence, passkey/passphrase vault, exact non-rolling seven days, same-origin limitation, immediate Lock, and no closed-app background sync.

- [ ] **Step 6: Run full verification**

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build
pnpm test:e2e
git diff --check
```

Expected: every command exits 0. Inspect 1440x1000 and 390x844 synthetic flows for overflow/focus/status problems.

- [ ] **Step 7: Scan artifacts and commit**

Run targeted credential-pattern scans across `src`, `e2e`, docs, and README. Confirm the HAR and untracked `.tldr/` files remain untouched. Commit acceptance/docs as `test: cover scoped progressive review flow`.

## Claude Code Execution Schedule

1. Launch Sonnet worktrees for Tasks 1, 2, and 3 from the same base.
2. Each agent reads the spec/plan, edits only its ownership, follows TDD, commits, and reports tests.
3. Codex reviews every diff and reruns focused tests before integrating.
4. Integrate approved Wave 1 slices and run provider/scope/inbox tests plus typecheck.
5. Launch separate Sonnet worktrees for Tasks 4 and 5 from integrated Wave 1.
6. Review/integrate both, then execute Task 6 in a fresh integration worktree.
7. Execute Task 7 and a final correctness/security review before claiming completion.
