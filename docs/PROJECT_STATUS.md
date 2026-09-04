# Revelio project status

**Last assessed:** 2026-09-04
**Milestone:** Trustworthy inbox completion is complete locally and verified. The
coordinator's local milestone commits are the remaining repository bookkeeping
before merge to `main`; this status does not imply a push or live Bitbucket result.

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
