# Revelio project status

**Last assessed:** 2026-09-08
**Milestone:** Trustworthy inbox completion and the DiffHub-inspired full UI
migration are both complete locally and verified. The coordinator's local
milestone commits are the remaining repository bookkeeping before merge to
`main`; this status does not imply a push or live Bitbucket result.

## DiffHub-inspired full UI migration

**Status:** Implemented and verified. Tasks 1–7 of
`docs/superpowers/plans/2026-09-04-diffhub-inspired-full-ui-migration.md`,
commit range `95cab89..bd02eb8` (Tasks 1–6) plus the Task 7 acceptance commit
`test: prove DiffHub-inspired UI migration` on top. See
`docs/superpowers/specs/2026-09-04-diffhub-inspired-full-ui-design.md` for the
design and `.superpowers/sdd/2026-09-04-diffhub-inspired-full-ui-migration/task-7-report.md`
(local, gitignored) for full acceptance evidence.

- **Static audits:** zero `@heroui/(react|styles)` / Berkeley Mono / DiffHub
  wordmark matches in `src`, `package.json`, `pnpm-lock.yaml`; every runtime
  URL under `src` is an intentional Bitbucket API constant, fixture data, or
  the self-hosted Geist OFL license/attribution comment. `git diff --check`
  clean.
- **Automated acceptance (`pnpm verify`):** format (117 files) and lint (118 files) clean,
  `tsc -b` clean, **39 unit test files / 424 tests** passing, production build
  within budget (**initial bundle 250,995 / 350,000 bytes**; **largest lazy
  chunk 834,025 / 850,000 bytes**, unchanged from Task 6 — HeroUI removal's
  byte savings were already realized before Task 7), and **20/20 Playwright
  Chromium E2E tests** passing.
- **Manual visual/keyboard pass:** Connect, Inbox, and Review captured at
  1280×720, 1440×900, and 390×844 in both light and dark themes (plus the
  narrow bottom sheet, the Finish Review dialog, and a partial-repository-
  failure state); keyboard-only traversal of all five screens confirmed a
  visible focus indicator on every stop and correct Arrow-key cycling through
  the Tree/Description/Activity sidebar tabs. Two real layout regressions
  found during this pass were fixed, each behind a new failing-then-passing
  Playwright regression test (see the Task 7 report for full RED/GREEN
  evidence):
  1. At narrow viewports (<768px), an empty sidebar-sheet wrapper still
     claimed its own CSS grid row, squeezing the diff canvas to roughly 60%
     of the available height (`src/review/sidebar/Sidebar.tsx`,
     `src/styles.css`).
  2. At desktop widths, the Inbox's quick-filter and action-button groups
     wrapped onto their own second line inside the fixed 49px toolbar once a
     second repository loaded, and the wrapped "Manage repositories" label
     itself wrapped mid-word (`src/styles.css`, `src/ui/Button.tsx`).
- **Resolved since the migration (tracked in `docs/UX_AUDIT.md`):**
  1. **Was P0** — the trusted vault resumed for 7 days with no inactivity
     lock. `App.tsx` now locks an authenticated session after 15 idle
     minutes via the existing `lock()` path; the 7-day `trusted-browser`
     record (`src/vault/model.ts:3`) is unchanged and still governs resuming
     the app across restarts — the two are now named separately in
     `VaultScreen.tsx`'s copy.
  2. **Resolved by a later, user-approved redesign** — the Queue drawer
     (`src/review/QueueDrawer.tsx`) is removed; the review sidebar's Inbox tab
     (`src/review/sidebar/InboxTab.tsx`) replaces it as the review list,
     sourced live from the same inbox snapshot used by the main inbox screen
     (`src/inbox/review-list.ts`). Because that tab excludes checkpointed
     pull requests instead of rendering the whole frozen queue, the
     already-finished/reopenable-entry defect this bullet tracked no longer
     applies. Its toolbar toggle (`.review-toolbar-sidebar-toggle`) is now
     desktop-only, since narrow viewports have their own sheet trigger.
  3. **Was P2** — progressive inbox loading now shows a fixed number (3) of
     `.inbox-row-skeleton` placeholders after the already-loaded rows while
     `!inbox.isComplete`, instead of an empty list.
  4. Inbox rows now show the PR number, an attention reason ("Needs my
     review" vs. "Authored by me"), and a short relative age; actionable
     requested/unreviewed rows sort oldest first. Failed repositories are
     named (`workspace/slug`) instead of only counted.
  5. A cheap keyboard contract is wired: `/` focuses the inbox query, Arrow
     keys move through visible inbox rows, and Escape returns from the
     review workspace to the inbox unless a dialog/sheet/menu is open or a
     Finish action is in flight.
- **Still deferred (tracked in `docs/UX_AUDIT.md`):**
  1. **P1** — the default triage quick filters (Direct/New commits/CI failed)
     and most of the published query qualifiers (`reviewed-by`, `team`,
     `review`, `reason`, `ci`, `age`, `size`) remain unavailable
     (`src/inbox/InboxScreen.tsx`, `src/inbox/query.ts`) — all need provider
     data (CI status, commit history, team membership) this codebase does
     not have yet.
  2. A per-repository targeted retry is not implemented; `loadInbox` has no
     per-repository cancellation/retry hook, so only the existing global
     Refresh exists. Adding targeted retry is an architectural change to the
     loader.
  3. Cmd/Ctrl+K and any command palette remain a deliberate deferred
     boundary, not attempted here.

## Delivery snapshot

| Area | Status | Evidence and boundary |
| --- | --- | --- |
| Direct Bitbucket provider | Implemented, synthetic covered | Identity, discovery, scoped pull-request reads, raw diffs, comments, Approve, and Request changes use the fixed Bitbucket origin. Live CORS/scopes/mutations are not verified. |
| Repository scope and progressive inbox | Implemented, unit and browser covered | Workspace and individual repository choices persist locally per user. Four bounded workers publish usable successful rows before all selected repositories complete; repository failure remains visibly incomplete. |
| Local vault | Implemented, unit and session browser covered | Session-only, passphrase, and WebAuthn-PRF enrollment paths exist. Passphrase/passkey trusted-browser state is fixed to seven days; Lock clears trusted state. Browser acceptance covers session-only reload and Lock, not a real passkey ceremony. |
| Honest inbox query | Implemented, unit and browser covered | The default is `reviewer:@me is:unreviewed`; the limited qualifier set is validated in place. Unsupported filters do not masquerade as zero results. |
| Durable review completion | Implemented, unit and browser covered | Browser acceptance observes the exact approval POST (including its empty body), reads the approved PR/head/outcome from the real IndexedDB checkpoint record, and proves that the provider's PR #9 response on Finish Review's final mandatory head refresh leaves the review list unchanged. |
| Verification gate | Passed | Format (117 files), lint (118 files), typecheck, 39 unit files/424 tests, production build (250,995-byte initial bundle against 350,000 bytes; 834,025-byte largest lazy chunk against 850,000 bytes), 20 Chromium acceptance tests, and diff check passed. |

## Confirmed current behavior

- The browser contains no Revelio service or token relay; synthetic browser tests reject unexpected origins.
- Scope, checkpoints, and encrypted-vault records stay in IndexedDB. Credentials are only retained across reload after deliberate vault enrollment.
- A completed repository with rows stays useful while another is pending or fails. Normal empty copy appears only for a complete, failure-free result.
- General comments do not complete a review. Finish Review is the checkpointing path and does not advance until the real checkpoint record is durable; the browser test observes the stored PR key, reviewed head, and outcome.
- The provider's PR #9 response on Finish Review's final mandatory head refresh does not recompute the live inbox: the completed PR #7 disappears from the sidebar list, PR #8 becomes current, and a subsequent explicit inbox refresh exposes PR #9 as actionable.

## Remaining live-provider and UI work

- Verify a disposable Bitbucket account for CORS, token scopes, activity/review-request signals, inline anchors, action receipts, and new-head approval reset. Do not infer this from intercepted browser tests.
- Add the complete reason/CI/age/size query language, autocomplete, saved prioritization/grouping rules, and transparent suggestions without hiding obligations.
- Improve comparison/viewed-state workflows, metadata/rate-limit/retry UX (including a targeted per-repository retry), a Cmd/Ctrl+K command palette, thread history, stacked PRs, multiple connections, providers, and encrypted review draft/content persistence. (The cheap `/`/Arrow/Escape keyboard contract is already wired — see above.)

## References

- [Trustworthy inbox completion plan](superpowers/plans/2026-09-02-revelio-trustworthy-inbox-completion.md)
- [Repository scope and vault specification](superpowers/specs/2026-09-02-repository-scope-progressive-sync-and-seven-day-vault.md)
- [Product design](superpowers/specs/2026-08-27-bitbucket-review-workspace-design.md)
- [DiffHub-inspired full UI migration design](superpowers/specs/2026-09-04-diffhub-inspired-full-ui-design.md)
- [DiffHub-inspired full UI migration plan](superpowers/plans/2026-09-04-diffhub-inspired-full-ui-migration.md)
