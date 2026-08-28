# Phase 0 acceptance report

Date: 2026-08-28
Branch: `implementation/phase-0`
Head at evidence capture: `94cd8f1`
Application version: `0.1.0`

## Decision summary

The deterministic local feasibility probe is complete. The contracts, fixed
Bitbucket read boundary, redacted diagnostics flow, real `@pierre/diffs`
surface, patch worker, and production Playwright harness have automated
evidence. No real Bitbucket credential, repository, pull request, comment,
diff, or mutating request was used.

This report does not declare live Bitbucket behavior feasible from request
shape, documentation, or intercepted fixtures. The live gates listed as
**Unresolved** require a user-controlled run against a disposable pull
request; the procedure is in
[live-bitbucket-checklist.md](live-bitbucket-checklist.md).

## Evidence legend

- **Proven locally** — deterministic unit/component/E2E evidence exists; this
  does not imply a live provider result.
- **Manual check** — a browser or release-host inspection is still required.
- **Unresolved live gate** — intentionally not exercised in Phase 0.
- **Deferred** — explicitly outside this phase, not a missing Phase 0 test.

## Acceptance matrix

The matrix covers the Phase 0 claims in the design specification (especially
sections 1, 6–7, 13, 16–17, 21, 23–26), the Phase 0 delivery boundary, and
the task plan's completion criteria.

| ID | Claim or criterion | Automated evidence | Manual browser/release check | Status |
| --- | --- | --- | --- | --- |
| P0-01 | Static, backend-free app with direct Bitbucket API boundary | `src/providers/bitbucket-cloud/request.test.ts`; `e2e/connection-diagnostics.spec.ts` assert fixed origin and GET-only requests; `pnpm build` | Inspect the served bundle's network panel and deployment configuration | Proven locally; deployment-header check remains manual |
| P0-02 | Basic authorization is formed from in-memory email/token and is not logged | `src/providers/bitbucket-cloud/auth.test.ts`; connection component tests; E2E checks no token in DOM | Enter only a disposable credential locally and inspect sanitized DevTools metadata, never headers | Proven locally for synthetic values; real-token CORS is unresolved |
| P0-03 | API origin cannot be overridden by arbitrary input | Request-builder tests reject absolute/foreign paths and mutation-shaped options | None beyond release review of the fixed-origin source | Proven locally |
| P0-04 | Read adapter validates identity, pull-request pages, activity, timestamps, and unknown events | `src/providers/bitbucket-cloud/schemas.test.ts`, `client.test.ts` (synthetic fixtures) | Observe a disposable repository only after live CORS/scopes pass | Proven locally; live schema compatibility remains a gate |
| P0-05 | Pagination follows the adapter's bounded safe behavior | `client.test.ts` covers page progression, repeated marker, and page ceiling | Check a disposable response with more than one page if needed | Proven locally; live pagination is not exercised |
| P0-06 | Diagnostics reports identity, workspace, repository, open PR, activity, comments, diffstat, and diff separately | `src/providers/bitbucket-cloud/diagnostics.test.ts`; `e2e/connection-diagnostics.spec.ts` success and dependent-unavailable cases | Run the local form with a disposable credential and inspect only capability statuses | Proven locally; real required scopes unresolved |
| P0-07 | Auth, permission, network/CORS, rate-limit, server, decode, pagination, and unavailable failures are distinct and redacted | Diagnostics unit tests and component/E2E invalid-token, missing-scope, cancellation flows | Confirm only status class/capability result is retained in any live note | Proven locally; live CORS classification unresolved |
| P0-08 | Credentials clear on Lock/reload and no Phase 0 persistence exists | `ConnectionDiagnostics.test.tsx`; E2E Lock/reload flow; source inspection finds no storage integration | Repeat with a disposable credential, then close/reload the tab | Proven locally |
| P0-09 | Read probes are sequential, cancellable, and limited to expected endpoint templates | Diagnostics tests assert order, abort behavior, and endpoint templates; E2E rejects unexpected paths | Observe the browser Network panel only long enough to record an allowlisted status class | Proven locally |
| P0-10 | Mutation boundaries are known without executing remote writes | Diagnostics tests cover inert POST shapes for approve, Request changes, general comment, and inline comment | Do not send a mutation from this build; use the gated procedure only when a controlled probe exists | Proven locally as shape only; all remote mutations unresolved |
| P0-11 | Browser CORS works for Basic-auth requests from the target static origin | No real network test by policy; synthetic route interception proves only application handling | Real-token read-only diagnostics from a local/target static origin | **Unresolved live gate** |
| P0-12 | Required token scopes are sufficient and missing scopes degrade safely | Synthetic 403 coverage and redacted capability outcomes | Test least-privilege token capabilities against a disposable repository/PR | **Unresolved live gate** |
| P0-13 | Activity exposes a reliable renewed-review-request signal, or fallback can be chosen honestly | Adapter normalizes synthetic activity variants; no product checkpoint/re-entry implementation exists | Request review, refresh activity, and record only whether a deterministic event is observable | **Unresolved live gate** |
| P0-14 | Approval operation succeeds and is observable | Only inert request-shape descriptor is tested; no mutation method/UI exists | Explicitly confirm one approval on a disposable PR, then verify remote state | **Unresolved live gate** |
| P0-15 | Request-changes operation succeeds and is observable | Only inert request-shape descriptor is tested; no mutation method/UI exists | Explicitly confirm one Request changes action on a disposable PR, then verify remote state | **Unresolved live gate** |
| P0-16 | General comments can be posted and receipts/visibility are understood | Only inert request-shape descriptor is tested | Explicitly confirm one disposable general comment and verify it remotely; sanitize all evidence | **Unresolved live gate** |
| P0-17 | Inline coordinates map correctly to Bitbucket anchors | `src/review/patch.test.ts` and `DiffReview.test.tsx` prove local `{path,line,side}` intent; no remote send | Confirm one addition and one deletion anchor on a disposable PR, then remove/clean up if possible | **Unresolved live gate** |
| P0-18 | Approval resets after a new source commit and re-entry can be observed | No inbox/checkpoint implementation exists in Phase 0 | Approve, add a new disposable source commit, refresh, and record only the capability result | **Unresolved live gate** |
| P0-19 | `@pierre/diffs` public API can render a multi-file patch with stable local annotation intent | `DiffReview.test.tsx`, `e2e/diff-review.spec.ts`, ADR 0001; exact pinned version `1.3.6` | Open the production demo at a narrow and wide viewport and check readable diff layout | Proven locally |
| P0-20 | Large patch preprocessing has a safe worker boundary with cancellation/fallback | `src/workers/patch-worker-client.test.ts`; real-worker E2E; worker source inspection | Optional browser performance observation with synthetic large fixture | Proven locally |
| P0-21 | Experimental `@pierre/diffs/worker` is not adopted without compatibility evidence | ADR 0001 records public exports and the Phase 0 local-worker decision | Revisit only in the later CSP/annotation/performance gate | Proven locally as a documented decision |
| P0-22 | Production verification builds and serves the production bundle, with no browser console errors | `pnpm verify`; Playwright production server; 7/7 Chromium flows passed, 0 console errors | Confirm a fresh machine has the pinned browser installed | Proven locally |
| P0-23 | Bundle budget stays within the recorded Phase 0 limits | `scripts/check-bundle-budget.mjs`; build measured 317,607-byte initial JS and 790,000-byte largest lazy chunk under 350,000/820,000 | Review release output and immutable asset hosting | Proven locally; release-host review manual |
| P0-24 | No secret-like values are present in history, fixtures, traces, logs, or build output | Source/fixture review plus synthetic-only E2E; `.gitignore` excludes runtime artifacts | Before any live run, inspect/export only sanitized metadata under the checklist rules | Proven locally for repository artifacts; live evidence hygiene is manual |
| P0-25 | Security headers/CSP constrain production deployment | Source fixes API request origin; no header server is part of this probe | Inspect response headers and CSP on the actual static host/container | Manual check; not proven by `vite preview` |
| P0-26 | Phase 0 keeps credentials in memory and defers encrypted persistence | Component/E2E reload/Lock tests; no vault or persistence module exists | None; confirm the local build does not offer a persistence mode | Proven locally |
| P0-27 | Missing scopes and partial read failures do not expose payloads or falsely claim completion | Synthetic 401/403 and unavailable diagnostics tests; no inbox completion UI exists | Validate later inbox behavior when implemented; do not infer it here | Proven locally for diagnostics; inbox behavior deferred |
| P0-28 | No real approving, Request changes, comment, or other mutation endpoint is called in Phase 0 | No mutation client method; E2E allows only expected GET paths; shape tests have no fetch path | Review network panel during the probe; stop if a POST appears unexpectedly | Proven locally |
| P0-29 | Comparisons and activity watermarks support a future since-last-review view | No comparison/checkpoint implementation exists in Phase 0; adapter activity is read-only normalization | Observe comparison and activity watermark fields on a disposable PR before implementing them | **Unresolved live gate** |
| P0-30 | WebAuthn PRF and Argon2id choices work across supported browsers | No vault or KDF implementation is included in Phase 0; persistence is explicitly deferred | Run browser capability checks with non-secret test material in a secure-vault probe | **Unresolved live/browser gate** |
| P0-31 | Implementation remains on `implementation/phase-0`, with `main` containing only the approved baseline | `git branch --show-current`, `git log main`, and the pre-commit `git diff main...HEAD` inspection | Fresh reviewer checks branch ancestry before accepting the phase | Proven locally |
| P0-32 | Fresh review follows each task and a final review covers the complete range | Prior task reports record review-fixed rounds; this report records the complete `main...HEAD` range | Final reviewer checks `git diff main...implementation/phase-0` | Manual final review |

## Plan-item accounting

| Plan task | Accounted files/evidence | Result |
| --- | --- | --- |
| Task 1 — scaffold and verification harness | Prior report `task-1-report.md`; package scripts, Vite production server, unit/smoke E2E | Complete and review-fixed |
| Task 2 — contracts and read adapter | Prior report `task-2-report.md`; provider contract, auth/request/schema/client tests and synthetic fixtures | Complete and review-fixed |
| Task 3 — local diagnostics | Prior report `task-3-report.md`; connection model/component, diagnostics workflow, request-shape tests, intercepted E2E | Complete and review-fixed |
| Task 4 — diff and worker boundary | Prior report `task-4-report.md`; ADR, patch/worker/DiffReview tests, production E2E and bundle check | Complete and review-fixed |
| Task 5 — evidence and live gates | This report, `live-bitbucket-checklist.md`, and README | Complete in this commit |

`git diff main...HEAD` was inspected before this report. It contains the
approved baseline plus the Task 1–4 implementation history: 59 tracked paths,
with no credential or live provider data. The implementation branch contains
the following commits after the baseline: `e5782a4`, `85e6639`, `d37f3e8`,
`970984f`, `6bb160f`, `aaeb35a`, `d2038fd`, `04588e0`, `000ba89`, `38d12b0`,
and `94cd8f1`. No later-phase work is included.

## Verification evidence

Exact command, run from a clean production build:

```text
pnpm verify
```

Result: exit code 0 on 2026-08-28.

- Biome format: 50 files checked, clean.
- Biome lint: 51 files checked, clean.
- TypeScript project build: passed.
- Vitest: 12 files, 52 tests passed.
- Production Vite build and explicit bundle budget: passed (317,607 initial
  bytes / 350,000; 790,000 largest lazy chunk / 820,000).
- Playwright against the production preview: 7 Chromium tests passed, 0
  failed, with 0 browser console errors.
- No tests were skipped.
- No failure traces or screenshots were produced by the passing run.

## Honest completion state

The local Phase 0 contract evidence is complete. The project is not ready to
claim first real-world Bitbucket use until the unresolved live/browser gates in
P0-11 through P0-18, P0-29, and P0-30 are run safely and documented under the
allowlist below. A passing synthetic Playwright route is not a substitute for
those observations.
