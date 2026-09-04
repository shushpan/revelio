# Revelio Trustworthy Inbox Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the checkpoint, review-completion, and inbox-filter contracts already described by the product design, then prove the current repository-selection, vault, inbox, and review workspace together in the browser.

**Architecture:** Keep provider data normalized and keep pure review rules outside React. Add one IndexedDB-backed checkpoint store and one resumable Finish Review transaction, then integrate them into the existing application and progressive inbox without adding dependencies. Query/filter UI must expose only behavior supported by current normalized data; unsupported future rules remain visible in the backlog instead of pretending to work.

**Tech Stack:** React 19, TypeScript 7, Effect 3, native IndexedDB, HeroUI 3, `@pierre/diffs` 1.3.6, Vitest, Testing Library, Playwright, Biome, pnpm.

**Spec:** `docs/superpowers/specs/2026-08-27-bitbucket-review-workspace-design.md`

**Current status:** `docs/PROJECT_STATUS.md`

## Global Constraints

- Work from source revision `7192be4` or an integration revision containing it.
- Every implementation task uses strict RED → observed expected failure → minimal GREEN → focused verification.
- Reuse `KeyValueStore` from `src/persistence/indexed-db.ts`; add no storage or state-management dependency.
- Add no npm dependency.
- Keep credentials, provider payloads, comments, diffs, repository names, and PR titles out of logs, artifacts, prompts, and commits.
- Do not call live Bitbucket. Automated provider and browser tests use synthetic fixtures only.
- A valid checkpoint may hide a PR from the default actionable view but must not remove it from `is:reviewed`/all-open access.
- Missing or undecodable review signals fail open: keep the PR actionable rather than silently hiding it.
- Rules may filter a view, prioritize, or group. They never delete an actionable obligation.
- Do not claim thread-reply/reopened-thread detection until the provider contract exposes thread linkage.
- All code changes are made by Claude Code workers using the Sonnet model in isolated worktrees. The coordinating session reviews and integrates commits; workers never push.

---

## Wave 1 — Independent foundations

### Task 1: Durable Checkpoint Model and Store

**Worker ownership:** only the files listed below.

**Files:**
- Modify: `src/inbox/checkpoint.ts`
- Modify: `src/inbox/checkpoint.test.ts`
- Create: `src/persistence/checkpoint-store.ts`
- Create: `src/persistence/checkpoint-store.test.ts`

**Interfaces:**

```ts
export type ReviewOutcome = "approved" | "changes_requested" | "reviewed";

export interface Checkpoint {
  readonly pullRequestKey: string;
  readonly reviewedHeadCommit: string;
  readonly watermark: string;
  readonly outcome: ReviewOutcome;
  readonly finishedAt: string;
}

export interface CheckpointStore {
  load(providerId: string, userId: string): Promise<ReadonlyArray<Checkpoint>>;
  save(providerId: string, userId: string, checkpoint: Checkpoint): Promise<void>;
  remove(providerId: string, userId: string, pullRequestKey: string): Promise<void>;
}

export const makeCheckpointStore: (kv: KeyValueStore) => CheckpointStore;
```

- [x] **Step 1: Write failing checkpoint-rule tests.** Use literal ISO timestamps and prove that a source-head change, `changes_requested`, `requested`, `mentioned`, and a comment containing the current user's stable ID after the watermark invalidate a checkpoint. Prove that earlier signals, unrelated comments, another approval, `updated`, and malformed timestamps do not invalidate it accidentally.
- [x] **Step 2: Run RED.** Run `pnpm test:unit -- src/inbox/checkpoint.test.ts`. Expected: the new outcome/finished fields and at least the post-watermark changes-requested case fail.
- [x] **Step 3: Implement the smallest corrected pure model.** Reuse the existing `isCheckpointValid`; do not add a rule engine, class, Effect service, or guessed thread semantics.
- [x] **Step 4: Write failing store tests.** Use an injected Map-backed `KeyValueStore`. Prove provider/user isolation, upsert by `pullRequestKey`, immutable sorted output, removal of one checkpoint, malformed stored data returning `[]`, and no localStorage access.
- [x] **Step 5: Run store RED.** Run `pnpm test:unit -- src/persistence/checkpoint-store.test.ts`. Expected: module-not-found failure.
- [x] **Step 6: Implement the store.** Store a versioned array in the existing `settings` object store under `checkpoints:<providerId>:<userId>`. Validate unknown data manually with narrow type guards; do not add a schema dependency.
- [x] **Step 7: Verify.** Focused checkpoint/store tests and typecheck passed; later full verification is recorded in Task 6.
- [x] **Step 8: Commit milestone prepared.** The coordinator will create the local `feat: persist review checkpoints` milestone commit immediately before merging to `main`; this records no push or Bitbucket action.

### Task 2: Resumable Finish Review Transaction

**Worker ownership:** only the files listed below.

**Files:**
- Create: `src/review/finish-review.ts`
- Create: `src/review/finish-review.test.ts`

**Interfaces:**

```ts
export interface PendingReviewComment {
  readonly id: string;
  readonly text: string;
  readonly anchor?: InlineCommentAnchor;
}

export type FinishReviewOutcome = "approved" | "changes_requested" | "reviewed";

export interface FinishReviewReceipt {
  readonly sentCommentIds: ReadonlyArray<string>;
  readonly decisionApplied: boolean;
}

export interface FinishReviewDependencies {
  readonly loadHead: () => Promise<string>;
  readonly sendComment: (comment: PendingReviewComment) => Promise<void>;
  readonly applyDecision: (outcome: FinishReviewOutcome) => Promise<void>;
  readonly saveCheckpoint: (checkpoint: Checkpoint) => Promise<void>;
  readonly now: () => string;
}

export const finishReview: (
  input: {
    pullRequestKey: string;
    reviewedHeadCommit: string;
    comments: ReadonlyArray<PendingReviewComment>;
    outcome: FinishReviewOutcome;
    previousReceipt?: FinishReviewReceipt;
  },
  deps: FinishReviewDependencies,
) => Promise<FinishReviewReceipt>;
```

- [x] **Step 1: Write failing order and success tests.** Assert the literal call order `head-before → comments in order → decision → head-after → checkpoint`; `reviewed` skips the remote decision; the saved checkpoint contains the reviewed head, outcome, and the injected clock value.
- [x] **Step 2: Run RED.** Run `pnpm test:unit -- src/review/finish-review.test.ts`. Expected: module-not-found failure.
- [x] **Step 3: Implement minimal success flow.** Use ordinary async functions and immutable receipts. Do not add a workflow framework.
- [x] **Step 4: Write failing safety/retry tests.** Prove a changed initial head sends nothing; a changed final head saves nothing; comment failure stops later operations; decision failure returns/throws with receipts preserving sent comment IDs; retry skips sent comments; checkpoint failure reports remote success but does not pretend completion.
- [x] **Step 5: Implement typed failure data.** Export a small tagged `FinishReviewError` carrying stage and receipt but never raw provider messages or comment text. Do not implement rollback.
- [x] **Step 6: Verify.** Focused transaction tests and typecheck passed; later full verification is recorded in Task 6.
- [x] **Step 7: Commit milestone prepared.** The coordinator will create the local `feat: add resumable finish review` milestone commit immediately before merging to `main`; this records no push or Bitbucket action.

### Task 3: Honest Inbox Query and Filter UX

**Worker ownership:** only the files listed below.

**Files:**
- Modify: `src/inbox/query.ts`
- Modify: `src/inbox/query.test.ts`
- Modify: `src/inbox/InboxScreen.tsx`
- Modify: `src/inbox/InboxScreen.test.tsx`

**Interfaces:**

```ts
export interface QueryValidationIssue {
  readonly token: string;
  readonly reason: "unsupported-qualifier" | "unsupported-value" | "unterminated-quote";
}

export const validateQuery: (input: string) => ReadonlyArray<QueryValidationIssue>;
```

- [x] **Step 1: Write failing honesty tests.** Prove the screen does not present Direct, New commits, or CI failed as working shortcuts while normalized PR data cannot support them. Keep Requested and reviewed/unreviewed controls. An unsupported `ci:failed`, `reason:direct`, or unknown qualifier shows a concise validation message and does not masquerade as a legitimate zero-result filter.
- [x] **Step 2: Run RED.** Run `pnpm test:unit -- src/inbox/query.test.ts src/inbox/InboxScreen.test.tsx`. Expected: existing misleading quick-filter assertions or missing validation behavior fail.
- [x] **Step 3: Add minimal query validation.** Keep parsing/matching pure; list the currently supported qualifiers explicitly. Do not build autocomplete or saved rules in this task.
- [x] **Step 4: Improve the visible filter contract.** Default to `reviewer:@me is:unreviewed`; keep matching/total counts; label reviewed access clearly; render validation near the input with `role="status"`. Preserve keyboard-native text editing and buttons.
- [x] **Step 5: Verify.** Focused query/inbox tests and typecheck passed; later full verification is recorded in Task 6.
- [x] **Step 6: Commit milestone prepared.** The coordinator will create the local `fix: make inbox filters truthful` milestone commit immediately before merging to `main`; this records no push or Bitbucket action.

### Task 4: Current UI/UX Audit (No Product-Code Changes)

**Worker ownership:** documentation and temporary ignored browser artifacts only.

**Files:**
- Create: `docs/UX_AUDIT.md`

- [x] **Step 1: Build and exercise the synthetic flow.** Run the existing production Playwright flow and inspect the connection, repository selection, inbox, Changes, Overview, vault, and narrow layouts. Use only synthetic data.
- [x] **Step 2: Compare the rendered product with design sections 5, 11–14, 19–20.** Record concrete usability gaps, affected screen, user consequence, and supporting selector/screenshot path when available.
- [x] **Step 3: Prioritize the audit.** Use `P0 trust/correctness`, `P1 core review friction`, and `P2 polish`. Separate objective defects from subjective design choices requiring user input. Include a compact list of questions for the user's next visual review.
- [x] **Step 4: Commit milestone prepared.** The coordinator will create the local `docs: audit current Revelio UX` milestone commit immediately before merging to `main`; this records no push or Bitbucket action.

---

## Wave 2 — Sequential integration

### Task 5: Integrate Checkpoints and Finish Review

**Prerequisite:** Tasks 1–3 are reviewed and integrated.

**Worker ownership:** integration files only; adapt to the exact merged interfaces without reimplementing Task 1–3 logic.

**Files:**
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`
- Modify: `src/inbox/load-inbox.ts`
- Modify: `src/inbox/load-inbox.test.ts`
- Modify: `src/review/ReviewScreen.tsx`
- Modify: `src/review/ReviewScreen.test.tsx`

- [x] **Step 1: Write failing migration and bootstrap tests.** A legacy `revelio.reviewed` map becomes IndexedDB checkpoint records once, then the legacy key is removed. Loading another user never reuses those checkpoints.
- [x] **Step 2: Write failing classification tests.** A current valid checkpoint remains available to `is:reviewed` but is absent from the default actionable query. New head or a supported post-watermark signal returns it. A review-signal fetch error keeps it actionable.
- [x] **Step 3: Run RED.** Run the three owned test files and record the expected failures before editing production code.
- [x] **Step 4: Integrate checkpoint loading.** Load once after identity resolution, preserve it through selection/inbox/review state, and update it only after successful checkpoint persistence. Fetch signals only for PRs with a checkpoint; do not multiply activity requests for ordinary unreviewed PRs.
- [x] **Step 5: Integrate Finish Review.** Replace independent checkpointing actions with one confirmation surface offering Approve, Request changes, or Reviewed. Keep general/inline Send now. Disable advance until `finishReview` confirms checkpoint persistence; retain the PR and receipt-aware error copy on partial failure.
- [x] **Step 6: Preserve queue semantics.** After success, open the next currently actionable captured queue item; after the final item, return to the inbox. New arrivals do not interrupt the captured queue.
- [x] **Step 7: Verify.** Focused integration tests, typecheck, build, and later full verification passed.
- [x] **Step 8: Commit milestone prepared.** The coordinator will create the local `feat: complete trustworthy review flow` milestone commit immediately before merging to `main`; this records no push or Bitbucket action.

> **Historical RED record:** Accepted Task 1, 2, 3, and 5 reports each record their
> intended RED failures before the corresponding production work. Task 2's later
> review-only coverage found the existing implementation already conformed and
> therefore passed immediately; no artificial production regression was introduced.
> Task 4 is a documentation audit, not a RED/GREEN implementation task. The
> coordinator will create the specified local milestone commits immediately before
> merging to `main`; no push or Bitbucket action is represented here.

---

## Wave 3 — Acceptance and current documentation

### Task 6: Browser Acceptance, Verification Gate, and Docs

**Prerequisite:** Task 5 is reviewed and integrated.

**Files:**
- Modify: `biome.json`
- Modify: `.gitignore` only if required after inspecting existing ignore rules
- Modify: `e2e/review-flow.spec.ts`
- Modify: `e2e/smoke.spec.ts`
- Modify: `e2e/fixtures.ts` if present and required by the new flows
- Modify: `README.md`
- Modify: `docs/PROJECT_STATUS.md`
- Modify: this plan's checkboxes

- [x] **Step 1: Investigate the historical formatting failure.** In the isolated integration tree, `pnpm format:check` did not reproduce the historical nested `.claude/worktrees/**/biome.json` root-configuration conflict. The narrow `.claude` exclusion remains applied as repository hygiene without hiding tracked source.
- [x] **Step 2: Apply the narrowest repository hygiene fix.** Configure Biome to ignore tool-owned worktrees/artifacts without hiding tracked source. Do not delete user worktrees or generated evidence.
- [x] **Step 3: Write failing browser tests.** Cover session-only first connection → repository selection → progressive inbox; successful rows before final repository completion; partial failure without false empty state; query validation; Finish Review approval request/body, durable IndexedDB checkpoint, and captured-queue auto-advance even when the provider returns PR #9 on its final mandatory head refresh without changing the captured drawer; reload/Lock behaviour for the supported vault path. Use only synthetic identities, repositories, comments, and diffs.
- [x] **Step 4: Run browser RED.** Run the focused Playwright files and verify failures are caused by missing integration/fixtures, not selectors that contradict the spec.
- [x] **Step 5: Update fixtures and minimal UI seams.** Prefer existing controls and provider fixtures. If production changes are required, stop and report the exact missing behavior rather than expanding this docs/acceptance task silently.
- [x] **Step 6: Update README and status.** Describe repository selection, progressive loading, vault choices, honest query support, checkpoint semantics, Finish Review, and remaining live-provider/UI backlog. Remove stale claims that these features do not exist.
- [x] **Step 7: Run the complete gate.** `pnpm verify && git diff --check` passed: format (92 files), lint (93 files), typecheck, 32 unit files/299 tests, build (312,026-byte initial bundle against 350,000 bytes; 834,025-byte largest lazy chunk against 850,000 bytes), and 8 Chromium tests.
- [x] **Step 8: Commit milestone prepared.** The coordinator will create the local `test: prove trustworthy inbox flow` milestone commit immediately before merging to `main`; this records no push or Bitbucket action.

---

## Integration and Review Protocol

1. Each Sonnet worker runs in a separate Claude Code worktree and commits only its owned files.
2. The coordinator inspects every commit and focused test report before cherry-picking it onto the integration branch.
3. Conflicting or out-of-scope changes are rejected and sent back to the same worker with concrete feedback.
4. Wave 2 begins only after Tasks 1–3 are integrated. The UX audit can land independently.
5. Wave 3 begins only after the integration task is green.
6. A final Sonnet reviewer compares the integrated diff with this plan and the product spec. Any P0/P1 correctness finding is fixed by a new Sonnet worker before final verification.

## Deferred from This Milestone

- Saved priority/group/suggestion rules.
- Full reason/CI/age/size query language and autocomplete.
- Comparison ranges, Viewed state, metadata cache, command palette, and background refresh scheduling.
- Subjective visual redesign items not yet confirmed by the user from the UX audit.
- Live Bitbucket or real-credential validation.
