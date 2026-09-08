# Revelio current UI/UX audit

**Scope.** Completed local trustworthy-inbox milestone after the Finish Review and inbox-query work, assessed against sections 5, 11–14, 19, and 20 of `docs/superpowers/specs/2026-08-27-bitbucket-review-workspace-design.md`. This replaces the previous stale audit: **Finish Review exists**, and the inbox now has a query field and three working quick filters.

**Method and evidence limits.** I inspected the rendered component paths and ran only deterministic synthetic checks—no Bitbucket account or real credential was used.

- `pnpm test:unit` passed: **39 files, 424 tests**.
- `pnpm test:e2e` passed: **20 Chromium tests**. The production-build synthetic suite covers desktop and narrow layouts, connection, source selection, session-only access, cross-repository inbox/diff/comments, Finish Review checkpointing and advancement, progressive loading, partial failure, keyboard/focus behavior, and Lock/reload clearing the session-only connection.
- The full local gate passes: format (**117 files**), lint (**118 files**), typecheck, **39 unit files / 424 tests**, production build (**250,995-byte initial bundle / 350,000-byte budget; 834,025-byte largest lazy chunk / 850,000-byte budget**), **20 Chromium E2E tests**, and diff check. This validates local fixtures and implementation behavior only; it is not live Bitbucket, credential, or production-environment evidence.

## Objective defects

### Resolved — an authenticated session now locks after 15 minutes of inactivity

- **Screen:** Vault / unlocked session lifecycle.
- **Prior observed behavior:** Enrolling or unlocking created a `trusted-browser` record that could resume the token until a fixed seven-day expiry, with no inactivity timer or visibility/activity lock in `App`.
- **Resolution:** `App.tsx` now arms a 15-minute inactivity timer for every authenticated screen (`setup-vault`, `select-sources`, `inbox`, `review`), reusing the existing `lock()` path so credentials and the trusted-browser record clear exactly as an explicit Lock click does. The timer resets on low-frequency activity signals (`pointerdown`, `keydown`) and on the tab regaining visibility, using one reschedulable `setTimeout` rather than a poll. The seven-day `trusted-browser` record (`src/vault/model.ts:3`, `TRUSTED_BROWSER_TTL_MS`) is unchanged and still governs whether *reopening* the app needs a passphrase/passkey; `VaultScreen.tsx`'s copy now names both timers separately so they read as distinct guarantees.
- **Evidence:** `src/app/App.tsx` (`INACTIVITY_LOCK_MS`, `isAuthenticatedScreen`, the inactivity-lock `useEffect`s); `src/app/App.test.tsx` ("locks an authenticated session automatically after 15 minutes of inactivity", "resets the inactivity timer on user activity instead of locking early"); `src/vault/VaultScreen.tsx`.

### Partially resolved — inbox rows now show PR number, an attention reason, and relative age; CI/size remain unavailable

- **Screen:** Open pull requests.
- **Prior observed behavior:** Rows showed repository, title, branches, author, a generic reviewer chip, and a locale date only. They omitted PR number, a concrete attention reason, and relative age, and loading sorted only by `updatedAt`, newest first.
- **Resolution:** Rows now show `workspace/slug #id`, and an attention chip distinguishing "Needs my review" (requested of me) from "Authored by me" (no chip for a PR that is neither, since the provider contract gives no other involvement signal). The date column shows a short relative age (`formatRelativeAge`, e.g. "3h ago") with the exact date still available via the `<time>` element's `title`. Actionable requested/unreviewed rows now sort oldest first; reviewed/non-actionable rows stay visible in their existing order when the query asks for them, rather than being resorted or hidden.
- **Still out of scope:** change size and an accessible CI icon remain unavailable — `PullRequestSummary` carries no diff-size or build-status field, and inventing one would fake data the provider does not expose. Direct/renewed-vs-new-commits distinction (§ below) is unavailable for the same reason.
- **Evidence:** `src/inbox/InboxScreen.tsx` (`orderedPullRequests`, the `attentionReason` chip, `inbox-repository`); `src/inbox/relative-time.ts`; `src/inbox/InboxScreen.test.tsx`; design §11.

### P1 — The default triage helpers and much of the published query contract are still unavailable

- **Screen:** Open pull requests.
- **Observed behavior:** The query is genuinely the filter source of truth, but the only quick buttons are Requested, Unreviewed, and Reviewed. Supported qualifiers are limited to `author`, `reviewer`, `review-requested`, `involves`, `repo`, `workspace`, and `is`; `reviewed-by`, `team`, `review`, `reason`, `ci`, `age`, and `size` report as unsupported.
- **User consequence:** Direct follow-up, new commits, and CI failure—the specified default triage states—cannot be isolated. The validation is honest, but the resulting inbox is materially less useful for multi-repository review.
- **Intended behavior:** Default helpers are Requested, Direct, New commits, and CI failed; add the documented qualifiers only when their provider data is available, while retaining the current explicit validation for unsupported input.
- **Evidence:** `src/inbox/InboxScreen.tsx:18-24`, `118-145` (`input[type="search"]`, quick-filter buttons); `src/inbox/query.ts:31-43`, `57-92`; design §12.

### Partially resolved — the main inbox now names failed repositories; targeted retry remains deferred

- **Screen:** Open pull requests and source selection.
- **Prior observed behavior:** The inbox said only that a count of repositories could not load, discarding the names the snapshot already retained. Source selection separately reported only that "Some workspaces" failed.
- **Resolution (main inbox only):** The inbox's failure notice now lists every failed repository's `workspace/slug` identity from the existing snapshot (e.g. "2 repositories could not be loaded (acme/bad, acme/worse)."), alongside the unchanged successful rows.
- **Still deferred:** A per-repository targeted retry is not implemented. `loadInbox` schedules repositories through an internal worker pool with no per-repository cancellation/retry hook; adding one is an architectural change to the loader, not a UI tweak, so the only retry action remains the existing global Refresh. Source selection's "Some workspaces" summary (`src/scope/RepositorySelectionScreen.tsx:82-90`) is unchanged and out of scope for this pass.
- **Evidence:** `src/inbox/InboxScreen.tsx` (the `.inbox-warning` failure list); `src/inbox/InboxScreen.test.tsx` ("names every failed repository, not just a count"); `src/inbox/load-inbox.ts` (no per-repository retry hook); design §15.3 and §19.2.

### Resolved — Finish Review is cancellable, keyboard-correct, and draft-aware

- **Screen:** Changes / Finish Review.
- **Resolution:** The three-outcome dialog traps focus, supports Cancel and Escape, lists pending inline/general drafts, keeps Send now as an explicit secondary action, and retries only unfinished operations after failure. Navigation waits for the durable local checkpoint.
- **Evidence:** `src/review/FinishReviewDialog.tsx`; `src/review/ReviewScreen.tsx`; `src/review/finish-review.ts`; unit and Chromium acceptance coverage; design §14 and §20.

### Resolved — diff layout follows the viewport and remembers user choice

- **Screen:** Changes.
- **Resolution:** Review defaults to split at desktop widths and unified below 768px, while a manual choice persists in local storage and survives tab switches.
- **Evidence:** `src/review/ReviewScreen.tsx`; `src/review/DiffReview.tsx`; `e2e/review-flow.spec.ts`; design §13.2.

### Resolved — the Queue drawer is removed in favor of a live sidebar Inbox tab

- **Screen:** Review sidebar.
- **Prior observed behavior:** The Queue drawer mapped the entire original captured queue, including entries already finished earlier in the session, and every row was selectable.
- **Resolution:** Per user-approved redesign, `src/review/QueueDrawer.tsx` is deleted. The review sidebar's Inbox tab (`src/review/sidebar/InboxTab.tsx`) is the review list instead, computed live from the same inbox snapshot (`src/inbox/review-list.ts`) rather than a frozen queue: it excludes checkpointed pull requests, so a finished entry cannot be reopened, and Finish Review advances to the next remaining actionable entry or back to the main inbox when none remain. The toolbar's collapse/expand control that replaced the old Queue button is now desktop-only (`.review-toolbar-sidebar-toggle`, hidden below 768px), since narrow viewports already have the bottom sheet's own "Open sidebar" trigger.

### Partially resolved — the cheap keyboard contract is wired; the command palette remains deferred

- **Screen:** Inbox and review workspace.
- **Prior observed behavior:** Inbox rows were native buttons (Tab/Enter already worked), but there was no Arrow-key navigation, no `/` to focus the query, and no Escape-to-return from the review workspace.
- **Resolution:** In the main inbox, `/` focuses and selects the query field unless an editable control already has focus, and ArrowUp/ArrowDown move focus through the currently visible `.inbox-row` buttons (clamped, not wrapping). Enter is unchanged native button activation. In the review workspace, Escape returns to the inbox, but only when nothing else already owns it: it no-ops while the Finish Review dialog or the narrow sidebar sheet is open (both render `[role="dialog"][aria-modal="true"]`), while a toolbar `role="menu"` is open, or while a Finish action is in flight — checked against real DOM/state at the moment of the keypress rather than by threading each descendant's open state through props.
- **Still deferred:** Cmd/Ctrl+K and any command palette are intentionally not built here — that is product/UI surface, not a "cheap" wire-up, and remains a deferred boundary. The sidebar's `Tree`/`Description`/`Activity`/`Inbox` tabs already get Arrow-key cycling from the shared `Tabs` primitive (§ Task 7 acceptance); this pass did not change that.
- **Evidence:** `src/inbox/InboxScreen.tsx` (`isEditableTarget`, the `/`/Arrow `keydown` effect); `src/inbox/InboxScreen.test.tsx` ("focuses the query field when / is pressed...", "moves focus through visible inbox rows..."); `src/review/ReviewScreen.tsx` (the Escape `keydown` effect); `src/review/ReviewScreen.test.tsx` ("returns to the inbox on Escape...", "does not return to the inbox on Escape..."); design §20.

### P1 — Overview lacks the required review context

- **Screen:** Overview.
- **Observed behavior:** It renders description, branches, reviewer IDs/derived decisions, and generic activity signals. It exposes no commit list, distinct general comments, or linked items.
- **User consequence:** Reviewers must leave the intended context surface to reconstruct basic PR history and related work.
- **Intended behavior:** Combine description, branch relationship, reviewers/decisions, general comments, activity, commits, and linked items where Bitbucket provides them.
- **Evidence:** `src/review/Overview.tsx:59-146`; `button[role="tab"]:has-text("Overview")`; design §13.4.

### Resolved — progressive loading now shows a fixed number of row skeletons

- **Screen:** Open pull requests during initial/partial load.
- **Prior observed behavior:** The UI showed textual `Loaded N of M` status and an empty list until rows arrived, with no pending-repository skeleton representation.
- **Resolution:** While `!inbox.isComplete`, the row list appends a small fixed number (3) of `aria-hidden` `.inbox-row-skeleton` placeholders after the already-loaded rows, so partial loads read as "more is coming" without hiding or reordering what already loaded. The count is a fixed, honest placeholder, not a progress estimate.
- **Evidence:** `src/inbox/InboxScreen.tsx` (`PENDING_ROW_SKELETON_COUNT`); `src/styles.css` (`.inbox-row-skeleton`); `src/inbox/InboxScreen.test.tsx` ("shows a fixed number of row skeletons...", "renders no skeletons once loading is complete"); design §19.1.

## Subjective product choices requiring a decision

1. **Density:** Current 0.8/0.9rem bordered cards are readable, but a flat list/table scan surface may better realize “compact by default.” This is a visual trade-off, not a correctness defect. Evidence: `src/styles.css:146-196`.
2. **Scope selection:** Workspace and repository checkboxes are independent. A hierarchy could show inclusion/overlap more clearly, but the present inclusive model is workable if explained. Evidence: `src/scope/RepositorySelectionScreen.tsx:92-120`.
3. **Composer placement:** Keeping the immediate general-comment composer above the diff is convenient, while moving drafts into Finish Review would make the Changes tab more decisively code-first. Evidence: `src/review/ReviewScreen.tsx:276-296`.

## Ordered recommendation

1. ~~Restore the 15-minute inactivity lock~~ — **done** (see Resolved above).
2. Close the remaining inbox triage gap: `reviewed-by`/`team`/`review`/`reason`/`ci`/`age`/`size` query qualifiers and the Direct/New commits/CI failed quick filters all still need provider data this codebase does not have yet. Attention reason/PR number/relative age/ordering and named failed repositories are done (see above).
3. ~~Complete the review loop: draft-aware cancellable Finish Review, wide/narrow persisted diff mode, and a current/upcoming-only queue~~ — **done** (the Inbox tab replaces the removed queue).
4. Add Overview context and a per-repository targeted retry (needs a `loadInbox` architecture change, see above), then the density/scope/composer choices in the next visual pass. A command palette (Cmd/Ctrl+K) is a deliberate deferred boundary, not a next-pass item.

## Questions for the next visual review

1. ~~Should the trusted-browser convenience record exist at all...~~ — settled: it remains as a distinct 7-day resume convenience, separate from the 15-minute inactivity lock that now governs an active session.
2. Should Finish Review be the default home for draft comments, with “Send now” preserved only as a deliberate secondary action?
3. Is the intended inbox a denser flat list, or should the card treatment remain now that reason, PR number, and relative age are added (CI and size remain unavailable — see above)?
4. ~~When a queue item finishes, should prior items disappear entirely...~~ — settled: the Inbox tab excludes checkpointed entries entirely, so a finished item disappears rather than staying as non-selectable history.
