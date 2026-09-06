# Revelio project status

**Last assessed:** 2026-09-06
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
- **Automated acceptance (`pnpm verify`):** format (115 files) and lint clean,
  `tsc -b` clean, **38 unit test files / 398 tests** passing, production build
  within budget (**initial bundle 248,759 / 350,000 bytes**; **largest lazy
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
- **Known deferred issues (explicitly out of scope, unaffected by this
  migration — tracked in `docs/UX_AUDIT.md`):**
  1. **P0** — the trusted vault still resumes for 7 days instead of applying
     the documented 15-minute inactivity lock (`src/vault/model.ts:3`).
  2. **P1** — the default triage quick filters (Direct/New commits/CI failed)
     and most of the published query qualifiers (`reviewed-by`, `team`,
     `review`, `reason`, `ci`, `age`, `size`) remain unavailable
     (`src/inbox/InboxScreen.tsx`, `src/inbox/query.ts`).
  3. **P1** — the review queue panel still displays already-finished,
     reopenable entries instead of only current/upcoming ones
     (`src/review/QueueDrawer.tsx`).
  4. **P2** — progressive inbox loading has no pending-repository row
     skeletons (`src/inbox/InboxScreen.tsx`, `src/inbox/load-inbox.ts`).

## Delivery snapshot

| Area | Status | Evidence and boundary |
| --- | --- | --- |
| Direct Bitbucket provider | Implemented, synthetic covered | Identity, discovery, scoped pull-request reads, raw diffs, comments, Approve, and Request changes use the fixed Bitbucket origin. Live CORS/scopes/mutations are not verified. |
| Repository scope and progressive inbox | Implemented, unit and browser covered | Workspace and individual repository choices persist locally per user. Four bounded workers publish usable successful rows before all selected repositories complete; repository failure remains visibly incomplete. |
| Local vault | Implemented, unit and session browser covered | Session-only, passphrase, and WebAuthn-PRF enrollment paths exist. Passphrase/passkey trusted-browser state is fixed to seven days; Lock clears trusted state. Browser acceptance covers session-only reload and Lock, not a real passkey ceremony. |
| Honest inbox query | Implemented, unit and browser covered | The default is `reviewer:@me is:unreviewed`; the limited qualifier set is validated in place. Unsupported filters do not masquerade as zero results. |
| Durable review completion | Implemented, unit and browser covered | Browser acceptance observes the exact approval POST (including its empty body), reads the approved PR/head/outcome from the real IndexedDB checkpoint record, and proves that the provider's PR #9 response on Finish Review's final mandatory head refresh leaves the captured queue unchanged. |
| Verification gate | Passed | `pnpm verify && git diff --check` passed: format (92 files), lint (93 files), typecheck, 32 unit files/299 tests, production build (312,026-byte initial bundle against 350,000 bytes; 834,025-byte largest lazy chunk against 850,000 bytes), and 8 Chromium acceptance tests. |

## Confirmed current behavior

- The browser contains no Revelio service or token relay; synthetic browser tests reject unexpected origins.
- Scope, checkpoints, and encrypted-vault records stay in IndexedDB. Credentials are only retained across reload after deliberate vault enrollment.
- A completed repository with rows stays useful while another is pending or fails. Normal empty copy appears only for a complete, failure-free result.
- General comments do not complete a review. Finish Review is the checkpointing path and does not advance until the real checkpoint record is durable; the browser test observes the stored PR key, reviewed head, and outcome.
- The provider's PR #9 response on Finish Review's final mandatory head refresh does not recompute the live inbox or alter the already captured queue: the drawer remains PR #7 and PR #8, with PR #8 current. A subsequent explicit inbox refresh exposes PR #9 as actionable.

## Remaining live-provider and UI work

- Verify a disposable Bitbucket account for CORS, token scopes, activity/review-request signals, inline anchors, action receipts, and new-head approval reset. Do not infer this from intercepted browser tests.
- Add the complete reason/CI/age/size query language, autocomplete, saved prioritization/grouping rules, and transparent suggestions without hiding obligations.
- Improve comparison/viewed-state workflows, metadata/rate-limit/retry UX, keyboard/command-palette support, thread history, stacked PRs, multiple connections, providers, and encrypted review draft/content persistence.

## References

- [Trustworthy inbox completion plan](superpowers/plans/2026-09-02-revelio-trustworthy-inbox-completion.md)
- [Repository scope and vault specification](superpowers/specs/2026-09-02-repository-scope-progressive-sync-and-seven-day-vault.md)
- [Product design](superpowers/specs/2026-08-27-bitbucket-review-workspace-design.md)
- [DiffHub-inspired full UI migration design](superpowers/specs/2026-09-04-diffhub-inspired-full-ui-design.md)
- [DiffHub-inspired full UI migration plan](superpowers/plans/2026-09-04-diffhub-inspired-full-ui-migration.md)
