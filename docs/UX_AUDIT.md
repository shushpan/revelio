# Revelio current UI/UX audit

**Scope.** Completed local trustworthy-inbox milestone after the Finish Review and inbox-query work, assessed against sections 5, 11–14, 19, and 20 of `docs/superpowers/specs/2026-08-27-bitbucket-review-workspace-design.md`. This replaces the previous stale audit: **Finish Review exists**, and the inbox now has a query field and three working quick filters.

**Method and evidence limits.** I inspected the rendered component paths and ran only deterministic synthetic checks—no Bitbucket account or real credential was used.

- `pnpm test:unit` passed: **32 files, 299 tests**.
- `pnpm test:e2e` passed: **8 Chromium tests**. The production-build synthetic suite covers connection, source selection, session-only access, cross-repository inbox/diff/general comment, Finish Review checkpointing and automatic advance through the captured queue, progressive successful rows, partial repository failure while retaining successful rows, unsupported-query handling, and Lock/reload clearing the session-only connection (`e2e/review-flow.spec.ts:196-358`; `e2e/smoke.spec.ts:3-49`).
- The E2E check exercises the 390×844 **connection shell** (`e2e/smoke.spec.ts:3-49`), but does **not** exercise persisted-vault unlock, Overview, or the narrow review/diff layout. Findings in only those areas are source/component-evidence findings, not claimed browser observations.
- The full local gate now passes as deterministic synthetic evidence: format (**92 files**), lint (**93 files**), typecheck, **32 unit files / 299 tests**, production build (**312,026-byte initial bundle / 350,000-byte budget; 834,025-byte largest lazy chunk / 850,000-byte budget**), **8 Chromium E2E tests**, and diff check. This validates local fixtures and implementation behavior only; it is not live Bitbucket, credential, or production-environment evidence.

## Objective defects

### P0 — The trusted vault remains resumable for seven days instead of applying the documented 15-minute inactivity lock

- **Screen:** Vault / unlocked session lifecycle.
- **Observed behavior:** Enrolling or unlocking creates a `trusted-browser` record which can resume the token until a fixed seven-day expiry. There is no inactivity timer or visibility/activity lock in `App`.
- **User consequence:** A user who chose a protected vault can leave a browser profile usable far longer than the documented default, undermining the security expectation behind the Lock and vault copy.
- **Intended behavior:** Clear active credentials after 15 minutes of inactivity by default; retain explicit Lock as an immediate override. If a separate trusted-browser convenience period is retained, label it precisely and require a product/security decision rather than presenting it as the vault's normal lock behavior.
- **Evidence:** `src/vault/model.ts:3` (`604_800_000` ms); `src/vault/store.ts:62-75`, `122-143`; `src/vault/VaultScreen.tsx:41-45`. See design §6.4.

### P1 — Inbox rows and ordering do not explain why work is actionable

- **Screen:** Open pull requests.
- **Observed behavior:** Rows show repository, title, branches, author, a generic reviewer chip, and a locale date. They omit PR number, a concrete attention reason, relative/relevant-event age, change size, and accessible CI status. Loading sorts only by `updatedAt`, newest first.
- **User consequence:** A reviewer cannot reliably scan why a PR needs attention, distinguish duplicate titles, or prioritize a direct follow-up over a normal request.
- **Intended behavior:** Show repository **and PR number**, author/title, precise reason, wait/event age, compact change size, and an accessible CI icon. Order direct/renewed work, then new commits, then ordinary requests; within each, oldest first.
- **Evidence:** `src/inbox/InboxScreen.tsx:169-198` (`button.inbox-row`); `src/inbox/load-inbox.ts:41-45`; design §11.

### P1 — The default triage helpers and much of the published query contract are still unavailable

- **Screen:** Open pull requests.
- **Observed behavior:** The query is genuinely the filter source of truth, but the only quick buttons are Requested, Unreviewed, and Reviewed. Supported qualifiers are limited to `author`, `reviewer`, `review-requested`, `involves`, `repo`, `workspace`, and `is`; `reviewed-by`, `team`, `review`, `reason`, `ci`, `age`, and `size` report as unsupported.
- **User consequence:** Direct follow-up, new commits, and CI failure—the specified default triage states—cannot be isolated. The validation is honest, but the resulting inbox is materially less useful for multi-repository review.
- **Intended behavior:** Default helpers are Requested, Direct, New commits, and CI failed; add the documented qualifiers only when their provider data is available, while retaining the current explicit validation for unsupported input.
- **Evidence:** `src/inbox/InboxScreen.tsx:18-24`, `118-145` (`input[type="search"]`, quick-filter buttons); `src/inbox/query.ts:31-43`, `57-92`; design §12.

### P1 — Partial repository results identify neither the missing repositories nor a targeted retry

- **Screen:** Open pull requests and source selection.
- **Observed behavior:** The inbox says only that a count of repositories could not load. The snapshot retains each failed repository internally, but the UI discards the names and offers only the global Refresh action. Source selection similarly reports only that “Some workspaces” failed.
- **User consequence:** The user cannot tell which obligations may be absent, nor retry a single affected repository without reloading everything.
- **Intended behavior:** Keep successful rows, list the failed workspace/repository names and error-safe state, and provide a separate retry. The incomplete state must remain distinct from completion.
- **Evidence:** `src/inbox/load-inbox.ts:12-24`, `71-101`; `src/inbox/InboxScreen.tsx:159-168` (`.inbox-warning`); `src/scope/RepositorySelectionScreen.tsx:82-90`; design §15.3 and §19.2.

### P1 — Finish Review is no longer one-click destructive, but its confirmation is incomplete and does not manage drafts

- **Screen:** Changes / Finish Review.
- **Observed behavior:** The main action opens a three-outcome dialog and uses the ordered head-check/decision/checkpoint transaction. However, the dialog has no Cancel control or Escape handling, does not trap/manage focus, and cannot summarize or submit drafts: the only comment composer sends immediately and `finishReview` is called with `comments: []`.
- **User consequence:** The safe second click is an improvement, but users cannot review the material that will be submitted, cancel through the dialog, or use the promised draft-first flow. Immediate sends also make a coherent final review harder to inspect.
- **Intended behavior:** A cancellable, keyboard-correct confirmation shows pending inline/general drafts and the selected outcome; it resumes only unfinished operations after a failure. “Send now” may remain an explicit secondary route.
- **Evidence:** `src/review/ReviewScreen.tsx:123-173`, `220-245` (`section[role="dialog"][aria-label="Finish Review"]`), `276-295`; `src/review/finish-review.ts:53-150`; design §14 and §20.

### P1 — Wide/narrow diff defaults and remembered layout do not meet the review-surface contract

- **Screen:** Changes.
- **Observed behavior:** Diff layout always initializes as unified. The 900px breakpoint hides the file-tree column but never changes the diff mode, and a manual Split choice remains React component state only.
- **User consequence:** Desktop reviewers start in the less scannable mode and must repeatedly choose Split; narrow behavior is incidental rather than responsive intent.
- **Intended behavior:** Default to split on wide screens and unified on narrow screens, then persist a user override.
- **Evidence:** `src/review/DiffReview.tsx:41`, `131-147` (`button[aria-pressed]`); `src/styles.css:276-303`; design §13.2.

### P1 — The captured queue still displays completed entries and lets users reopen them

- **Screen:** Review queue.
- **Observed behavior:** Opening a PR correctly captures `actionableQueue` and a successful Finish Review advances to the next captured item. The drawer nevertheless maps the entire original queue, including entries already finished earlier in the session, and every row is selectable.
- **User consequence:** The queue is not a clear current/upcoming sequence; a completed item can be reopened and its review repeated.
- **Intended behavior:** Preserve the captured order, but render only current and upcoming valid entries (or distinctly label historical ones as non-actionable) and advance to inbox after the final valid item.
- **Evidence:** `src/app/App.tsx:175-178`, `859-863`; `src/review/ReviewScreen.tsx:99-106`, `327-335`; `src/review/QueueDrawer.tsx:45-65` (`aside[aria-label="Review queue"]`); design §13.5.

### P1 — Primary keyboard behavior is incomplete

- **Screen:** Inbox and review workspace.
- **Observed behavior:** Inbox rows are native buttons, so Tab and Enter already open them. The missing contract is Arrow-key navigation for inbox lists/tabs, `/` to focus query, and Cmd/Ctrl+K for commands. The queue implements Escape only; review tabs use `role="tab"` but have no Arrow-key behavior or tab/panel relationship.
- **User consequence:** Keyboard-oriented reviewers can activate focused controls, but cannot move through review work or reach query/commands at the documented speed; the custom tab interface also lacks expected tab keyboard behavior.
- **Intended behavior:** Arrow keys navigate lists/tabs, Escape closes/returns, `/` focuses query, Cmd/Ctrl+K opens commands, and destructive shortcuts only open confirmation.
- **Evidence:** `src/inbox/InboxScreen.tsx:118-145`, `169-195`; `src/review/ReviewScreen.tsx:252-270`; `src/review/QueueDrawer.tsx:21-28`; design §20.

### P1 — Overview lacks the required review context

- **Screen:** Overview.
- **Observed behavior:** It renders description, branches, reviewer IDs/derived decisions, and generic activity signals. It exposes no commit list, distinct general comments, or linked items.
- **User consequence:** Reviewers must leave the intended context surface to reconstruct basic PR history and related work.
- **Intended behavior:** Combine description, branch relationship, reviewers/decisions, general comments, activity, commits, and linked items where Bitbucket provides them.
- **Evidence:** `src/review/Overview.tsx:59-146`; `button[role="tab"]:has-text("Overview")`; design §13.4.

### P2 — Progressive loading has no row skeletons

- **Screen:** Open pull requests during initial/partial load.
- **Observed behavior:** The UI shows textual `Loaded N of M` status and an empty list until rows arrive; it has no pending-repository skeleton representation.
- **User consequence:** Large first loads can look empty rather than progressively useful.
- **Intended behavior:** Preserve loaded rows and show compact skeletons only for repositories still pending.
- **Evidence:** `src/inbox/InboxScreen.tsx:152-204`; `src/inbox/load-inbox.ts:98-101`; design §19.1.

## Subjective product choices requiring a decision

1. **Density:** Current 0.8/0.9rem bordered cards are readable, but a flat list/table scan surface may better realize “compact by default.” This is a visual trade-off, not a correctness defect. Evidence: `src/styles.css:146-196`.
2. **Scope selection:** Workspace and repository checkboxes are independent. A hierarchy could show inclusion/overlap more clearly, but the present inclusive model is workable if explained. Evidence: `src/scope/RepositorySelectionScreen.tsx:92-120`.
3. **Composer placement:** Keeping the immediate general-comment composer above the diff is convenient, while moving drafts into Finish Review would make the Changes tab more decisively code-first. Evidence: `src/review/ReviewScreen.tsx:276-296`.

## Ordered recommendation

1. Restore the 15-minute inactivity lock or explicitly revise the approved security/product contract; this is the only P0.
2. Make the inbox explainable and triageable: attention data/order, Direct/New commits/CI failed, then named failed repositories and targeted retry.
3. Complete the review loop: draft-aware cancellable Finish Review, wide/narrow persisted diff mode, and a current/upcoming-only queue.
4. Add keyboard completion and Overview context, then address skeletons and the density/scope/composer choices in the next visual pass.

## Questions for the next visual review

1. Should the trusted-browser convenience record exist at all, or must every inactive session require vault unlock after 15 minutes?
2. Should Finish Review be the default home for draft comments, with “Send now” preserved only as a deliberate secondary action?
3. Is the intended inbox a denser flat list, or should the card treatment remain once reason, PR number, CI, and size are added?
4. When a queue item finishes, should prior items disappear entirely or remain as clearly non-selectable history?
