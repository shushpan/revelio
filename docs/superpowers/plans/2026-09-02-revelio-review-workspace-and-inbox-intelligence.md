# Revelio Review Workspace and Inbox Intelligence Implementation Plan

**Goal:** Replace the placeholder review layout and two-button inbox filter with the review workspace, checkpoint model, and search/filter language described in the product spec, without adding a router, state framework, or new dependencies.

**Architecture:** Six independent, file-scoped tasks build new pure/presentational modules against the existing `CodeReviewProvider` contract (no provider changes needed — `getReviewSignals` already returns the activity/comment/approval data every task needs but nothing currently consumes it). A seventh, sequential task composes the finished modules into `App.tsx` and `ReviewScreen.tsx`.

**Tech Stack:** React 19, TypeScript, Effect, HeroUI 3, `@pierre/diffs`, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-27-bitbucket-review-workspace-design.md` (§9, §10, §12, §13, §17)

**Reference:** `docs/superpowers/plans/2026-08-29-revelio-usable-review-flow.md` (the flow this extends)

## Global Constraints

- Work on `main` directly at the end (each task lands via its own short-lived branch/worktree, merged sequentially).
- Use HeroUI components and default light/dark themes; no custom palette.
- Pure classification/matching/ordering logic stays ordinary TypeScript; only fallible/async work uses Effect.
- No new npm dependencies. No new persisted-storage formats beyond what's already in `src/persistence/indexed-db.ts`.
- Never persist credentials or raw review content beyond what's already documented in the spec (§8).
- Each task adds/edits only the files it owns (listed below) so tasks can run in parallel without merge conflicts. Do not touch `App.tsx`, `ReviewScreen.tsx`, or `styles.css`'s existing rules except in Task 7.
- Each task is TDD: failing test first, then implementation.
- Each task finishes by running `pnpm typecheck && pnpm test:unit` and committing on its own branch.

---

### Task 1: Query-based search and filters

**Files:**
- Create: `src/inbox/query.ts`, `src/inbox/query.test.ts`
- Modify: `src/inbox/InboxScreen.tsx` (swap the `needs-review`/`all-open` toggle for a text query field + quick-filter chips that write into it)
- Test: `src/inbox/InboxScreen.test.tsx`

**Interfaces:**
- Consumes: `PullRequestSummary` from `src/providers/contracts.ts`
- Produces: `parseQuery(input: string): ParsedQuery`, `matchesQuery(pr: PullRequestSummary, query: ParsedQuery, ctx: { currentUserId: string; reviewed: ReadonlySet<string> }): boolean`

- [ ] Write failing tests for qualifiers: `author:`, `reviewer:`, `review-requested:`, `involves:`, `repo:`, `workspace:`, `is:reviewed`/`is:unreviewed`, free-text title match, space = AND, leading `-` = exclude, quoted values with spaces.
- [ ] Implement `parseQuery`/`matchesQuery` as pure functions (no Effect needed — deterministic string/array logic per spec §12).
- [ ] Wire the query bar into `InboxScreen.tsx`: a text input (source of truth) plus four quick-filter chips (Requested, Direct, New commits, CI failed) that insert/remove query terms rather than maintaining separate boolean state.
- [ ] Show matching-count vs total-actionable-count when the query narrows results (spec §12 — rules must never look like hidden obligations).
- [ ] Omit `team:` entirely (spec §26 — not reliably exposed); do not stub it.
- [ ] Run `pnpm typecheck && pnpm test:unit`, commit.

### Task 2: Checkpoint state model and re-entry detection

**Files:**
- Create: `src/inbox/checkpoint.ts`, `src/inbox/checkpoint.test.ts`
- Modify: `src/inbox/load-inbox.ts` (call the new module when comparing fetched PRs against stored checkpoints)
- Do not modify `App.tsx` — export a pure function `App.tsx` will call in Task 7; do not touch its current `reviewed` `localStorage` map yet.

**Interfaces:**
- Consumes: `PullRequestSummary`, `ReviewSignal`/`ReviewSignalKind` from `src/providers/contracts.ts`
- Produces: `type Checkpoint = { pullRequestKey: string; reviewedHeadCommit: string; watermark: string }`, `isCheckpointValid(pr: PullRequestSummary, signals: ReadonlyArray<ReviewSignal>, checkpoint: Checkpoint, currentUserId: string): boolean`

- [ ] Write failing tests for every invalidation trigger in spec §10.3: source head hash changed, approval reset (a `changes_requested`/absent-approval signal after `watermark`), user requested as reviewer again (`requested` signal after watermark), a reply in a thread the user participated in, a `mentioned` signal, a reopened user-created thread — each after `watermark`.
- [ ] Write failing tests proving unrelated comments, other reviewers' actions, and CI-only changes do NOT invalidate a checkpoint (spec §10.3 negative cases).
- [ ] Implement `isCheckpointValid` as a pure function over `ReviewSignal[]` already returned by `getReviewSignals` — no provider or schema changes required.
- [ ] Update `load-inbox.ts` to use `isCheckpointValid` instead of the current bare commit-hash comparison when deciding whether a checkpointed PR re-enters the actionable set.
- [ ] Run `pnpm typecheck && pnpm test:unit`, commit.

### Task 3: PR Overview tab

**Files:**
- Create: `src/review/Overview.tsx`, `src/review/Overview.test.tsx`
- Do not modify `ReviewScreen.tsx` — build a standalone component Task 7 will mount as a tab.

**Interfaces:**
- Consumes: `PullRequestSummary`, `CodeReviewProvider.getReviewSignals`
- Produces: `<Overview provider={...} pullRequest={...} />` rendering description, source/target branch relationship, reviewers with decision state (derive from `reviewerIds` + latest `approved`/`changes_requested` signal per actor), and an activity/comments feed ordered by `createdAt` (spec §13.4).

- [ ] Write failing tests: renders PR description as plain text (Markdown execution stays out of scope per spec §7.3 — no HTML rendering), renders one row per reviewer with their latest decision, renders activity feed items with actor/time/text, renders empty state when there is no activity yet.
- [ ] Implement using HeroUI primitives only, matching the compact density in spec §5.3.
- [ ] Fetch signals via `Effect.runPromise(provider.getReviewSignals(pullRequest.ref))` on mount, mirroring the loading pattern already used in `ReviewScreen.tsx` for the diff.
- [ ] Run `pnpm typecheck && pnpm test:unit`, commit.

### Task 4: File tree navigation

**Files:**
- Create: `src/review/FileTree.tsx`, `src/review/FileTree.test.tsx`
- Do not modify `ReviewScreen.tsx` or `DiffReview.tsx` — build a standalone component that takes parsed file paths and emits a selection event; Task 7 wires it to `DiffReview`'s existing file list.

**Interfaces:**
- Consumes: `ReadonlyArray<string>` file paths (already derivable from the parsed patch in `src/review/patch.ts` — check `patch.ts`'s exported shape before duplicating parsing logic)
- Produces: `<FileTree files={...} selected={...} onSelect={(path) => void} />`, collapsed by default into directory groups, compact rows (spec §13.1: "compact left file tree").

- [ ] Write failing tests: groups files by directory, expand/collapse, keyboard up/down/Enter selection (spec §20 — keyboard-complete), highlights the currently selected file.
- [ ] Implement with semantic HTML (`<ul>`/`<li>`/`<button>`) and HeroUI only for visual chrome — no new dependency for tree UI.
- [ ] Run `pnpm typecheck && pnpm test:unit`, commit.

### Task 5: Review queue drawer

**Files:**
- Create: `src/review/QueueDrawer.tsx`, `src/review/QueueDrawer.test.tsx`
- Do not modify `ReviewScreen.tsx` or `App.tsx` — standalone component; Task 7 wires it to the inbox order and auto-advance.

**Interfaces:**
- Consumes: `ReadonlyArray<PullRequestSummary>`, current index
- Produces: `<QueueDrawer queue={...} currentIndex={...} isOpen={...} onSelect={(pr) => void} onClose={() => void} />`, hidden by default, opened by an explicit control (spec §13.5).

- [ ] Write failing tests: renders current + upcoming PRs in captured order, selecting an item calls `onSelect`, closes on `onClose`/Escape, does not reorder when new PRs arrive mid-session (order is a snapshot per spec §13.5).
- [ ] Implement as a HeroUI drawer/overlay, keyboard-dismissible.
- [ ] Run `pnpm typecheck && pnpm test:unit`, commit.

### Task 6: Diffs worker-pool compatibility gate

**Note:** the *custom* compute worker for patch parsing (`src/workers/patch.worker.ts` + `preprocessPatchAsync`) already exists and is already wired into `DiffReview`. This task is specifically about `@pierre/diffs`'s own experimental worker pool, which is a separate thing: `CodeView` (from `@pierre/diffs/react`) accepts a `disableWorkerPool?: boolean` prop and defaults to using the pool. `@pierre/diffs/worker` exports `getOrCreateWorkerPoolSingleton`/`terminateWorkerPoolSingleton`/`WorkerPoolManager` (see `node_modules/@pierre/diffs/dist/worker/index.d.ts`). Do not build new worker transport plumbing — the library already has it; this task only decides when it's safe to leave enabled.

**Files:**
- Create: `src/workers/diffs-worker-gate.ts`, `src/workers/diffs-worker-gate.test.ts`
- Do not modify `DiffReview.tsx` — export a single capability probe that Task 7 reads and passes into `CodeView`'s `disableWorkerPool` prop.

**Interfaces:**
- Consumes: `getOrCreateWorkerPoolSingleton` from `@pierre/diffs/worker`
- Produces: `shouldUseDiffsWorkerPool(): Promise<boolean>` — true only if the pool initializes without error under CSP-equivalent conditions (module worker, no `unsafe-eval`) and a large-diff fixture renders within budget; false (i.e. `disableWorkerPool={true}`, falling back to main-thread highlighting) otherwise. Cache the result for the session; never retry per keystroke.

- [ ] Write failing tests: returns `false` on pool construction/initialization failure, returns `false` on timeout against a large-patch fixture, returns `true` when both checks pass, result is memoized after first check.
- [ ] Implement the probe against the real `@pierre/diffs/worker` API. If some part of the real API is unusable under test (e.g. jsdom has no real Worker), mock only the worker transport in the test, not the gate's decision logic.
- [ ] Run `pnpm typecheck && pnpm test:unit`, commit.

### Task 7: Integration — compose the review workspace and wire filters/checkpoints

**Files:**
- Modify: `src/app/App.tsx`, `src/review/ReviewScreen.tsx`, `src/inbox/InboxScreen.tsx` (only the composition points, not re-deriving Task 1–6 logic), `src/styles.css`
- Test: `src/app/App.test.tsx`, `src/review/ReviewScreen.test.tsx`

**Interfaces:**
- Consumes: every module produced in Tasks 1–6
- Produces: the assembled review workspace layout from spec §13.1 (thin sticky top bar, Changes/Overview tabs, file tree + dominant diff, hidden-by-default queue drawer) and the assembled inbox (query bar replaces toggle, checkpoint model replaces the bare commit-hash map)

- [ ] Rebase/merge Tasks 1–6 branches into one integration branch; resolve any accidental overlap by re-reading the owning task's diff, not by improvising new logic.
- [ ] Replace `ReviewScreen.tsx`'s current single-column layout with: sticky top bar (Back, title, actions), `Changes`/`Overview` tab control, `FileTree` in a compact left column, `DiffReview` as the dominant panel, `QueueDrawer` as a hidden-by-default overlay opened from the top bar.
- [ ] Wire `Overview` as the second tab's content.
- [ ] Replace `App.tsx`'s `reviewed: Record<string, string>` `localStorage` map with `Checkpoint[]` records and call `isCheckpointValid` where the reviewed filter is applied.
- [ ] Read `shouldUseDiffsWorkerPool()` once at `ReviewScreen` mount, add a `disableWorkerPool?: boolean` prop to `DiffReview.tsx` that forwards to `CodeView`, and pass `!result` into it.
- [ ] Auto-advance to the next queue entry after a successful Finish-review action; open the inbox after the final entry (spec §13.5).
- [ ] Run `pnpm verify` (format, lint, typecheck, unit, build, e2e) and update `e2e/review-flow.spec.ts` only for assertions this composition changes.
- [ ] Commit on `main`.
