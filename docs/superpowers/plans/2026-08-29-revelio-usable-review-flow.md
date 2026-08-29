# Revelio Usable Review Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the diagnostics harness with a usable Bitbucket connection, cross-repository PR inbox, and real diff review flow.

**Architecture:** Preserve the existing Effect provider adapter, extend it with only the read/write operations needed by the UI, and drive three screens from a small React state union. Keep credentials in memory and store only non-secret per-commit review checkpoints locally.

**Tech Stack:** React 19, TypeScript, Effect, HeroUI 3, @pierre/diffs, Vitest, Playwright

**Spec:** `docs/superpowers/specs/2026-08-29-revelio-usable-review-flow.md`

## Global Constraints

- Work directly on `main`, as explicitly requested by the user.
- Implementation agents use `gpt-5.6-luna` with high reasoning effort.
- Use HeroUI for product controls and default HeroUI light/dark themes.
- Use native Diffs light/dark rendering without injected GitHub themes.
- Never persist credentials or expose provider response bodies.
- Prefer the smallest working implementation; do not add a router, state framework, cache, vault, or speculative provider registry.
- Verification is focused on the real connect → inbox → diff → action flow, not broad diagnostic permutations.

---

### Task 1: Complete the provider operations for the usable flow

**Files:**
- Modify: `src/providers/contracts.ts`
- Modify: `src/providers/bitbucket-cloud/schemas.ts`
- Modify: `src/providers/bitbucket-cloud/client.ts`
- Modify: `src/providers/bitbucket-cloud/request.ts`
- Test: `src/providers/bitbucket-cloud/schemas.test.ts`
- Test: `src/providers/bitbucket-cloud/client.test.ts`

**Interfaces:**
- Consumes: `PullRequestRef`, `RepositoryDiscoveryResult`, `BitbucketCredentials`
- Produces: provider methods `getPullRequestDiff`, `approvePullRequest`, `requestChanges`, `addGeneralComment`, and `addInlineComment`

- [ ] Write a failing schema test using the documented membership shape `{ workspace: { slug: "acme" } }` and confirm the current decoder rejects it.
- [ ] Update workspace decoding to read `workspace.slug`, while accepting the legacy direct `slug` shape only if it costs no extra branch outside the decoder.
- [ ] Write failing client tests asserting the exact GET diff and POST review request paths, methods, JSON bodies, and absence of secret leakage.
- [ ] Add the five minimal provider operations through the existing authenticated request boundary and set `canWriteReviews` to true.
- [ ] Run the two focused provider test files and commit the task.

### Task 2: Build the real three-screen product flow

**Files:**
- Replace: `src/connection/ConnectionDiagnostics.tsx` with a compact connection component or create `src/connection/ConnectScreen.tsx`
- Create: `src/inbox/load-inbox.ts`
- Create: `src/inbox/InboxScreen.tsx`
- Create: `src/review/ReviewScreen.tsx`
- Modify: `src/review/DiffReview.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/styles.css`
- Test: `src/app/App.test.tsx`
- Test: `src/inbox/load-inbox.test.ts`

**Interfaces:**
- Consumes: the provider methods from Task 1 and `DiffReview`
- Produces: `connect | inbox | review` React state flow and a real `PullRequestSummary` selection

- [ ] Write a failing app test proving the initial UI has Connect but no Phase 0, diagnostics, or diff demo text.
- [ ] Write a failing inbox-domain test proving successful repository results remain visible when another repository fails.
- [ ] Implement a connection form that loads identity, repositories, and all open PRs, reporting one sanitized error.
- [ ] Implement a compact inbox with “Needs my review” and “All open” filters, PR rows, refresh, theme, and lock.
- [ ] Implement a review screen that fetches the real patch and exposes Back, comment, Approve, Request changes, and Mark reviewed.
- [ ] Store only a `{pullRequestKey: sourceCommit}` reviewed checkpoint and exclude matching items from the default filter.
- [ ] Replace the old page CSS with a compact responsive shell and proper HeroUI `Chip` status usage.
- [ ] Run the focused app and inbox unit tests and commit the task.

### Task 3: Prove the usable browser path and update product guidance

**Files:**
- Replace: `e2e/connection-diagnostics.spec.ts` with `e2e/review-flow.spec.ts`
- Modify: `e2e/smoke.spec.ts`
- Remove or adapt: synthetic-demo assertions in `e2e/diff-review.spec.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: visible labels and Bitbucket request contracts from Tasks 1 and 2
- Produces: one intercepted end-to-end acceptance path and accurate local-run instructions

- [ ] Write an intercepted Playwright test whose real documented workspace response connects and shows an open PR from more than one repository fixture.
- [ ] Extend that test to open the PR, render its intercepted raw patch, and submit a general comment with the exact Bitbucket request body.
- [ ] Verify the root contains no Phase 0 or diagnostics UI and the screenshot-width layout has no overlay status elements.
- [ ] Update README to describe the usable flow, current credential-memory limitation, Node/Corepack setup, and local commands.
- [ ] Run focused Vitest files, build, and the single review-flow Playwright spec; fix only failures caused by this work.
- [ ] Commit the task on `main` without pushing.
