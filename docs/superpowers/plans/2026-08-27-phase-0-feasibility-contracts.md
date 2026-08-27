# Phase 0 Feasibility and Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a committed, testable frontend foundation and prove the risky browser-only Bitbucket, diff-rendering, worker, and passkey capability boundaries without storing credentials or mutating a real pull request.

**Architecture:** A static React + TypeScript application owns UI composition. Effect services own provider calls and typed failures. Provider-neutral contracts are implemented first, with Bitbucket Cloud behind an adapter. The browser performs direct requests only to the fixed Bitbucket API origin. A dedicated module worker handles CPU-heavy patch preprocessing. Phase 0 keeps credentials in memory and provides an explicit, read-only diagnostics surface; encrypted persistence is Phase 1.

**Tech Stack:** React, TypeScript, Vite, stable Effect, `@pierre/diffs`, Web Crypto/WebAuthn browser APIs, Vitest, Testing Library, Playwright, Biome, pnpm.

**Spec:** `docs/superpowers/specs/2026-08-27-bitbucket-review-workspace-design.md`

## Global constraints

- [ ] Work only in `/Users/shushpan/Documents/projects/fast-review`.
- [ ] Use `gpt-5.6-luna` with high reasoning effort for every implementation agent.
- [ ] Initialize Git with `main`, preserve the approved design and this plan in the repository, and perform implementation on `implementation/phase-0`.
- [ ] Every implementation task ends with a focused commit. Stage explicit paths only. Do not add AI/Codex attribution.
- [ ] Follow strict red-green-refactor for behavior. Record the failing and passing command in the task report.
- [ ] Never request, print, fixture, persist, or commit a real Atlassian email, Bitbucket API token, PR comment, or source diff.
- [ ] Do not call a real approving, request-changes, commenting, or other mutating Bitbucket endpoint in Phase 0.
- [ ] Prefer native browser APIs and small modules. Do not add a router, state framework, component system, ORM, or service worker.
- [ ] Use stable Effect APIs only. Keep pure classification, schema-independent transformations, and view-model helpers as plain TypeScript.
- [ ] `pnpm verify` is the phase gate and must run format/lint checks, type checking, unit/component tests, a production build, and Playwright tests.

## Task 1: Initialize the repository and verification harness

**Files:**

- Create: `.editorconfig`
- Create: `.gitignore`
- Create: `package.json`
- Create: `pnpm-lock.yaml`
- Create: `tsconfig.json`
- Create: `tsconfig.app.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/app/App.tsx`
- Create: `src/app/App.test.tsx`
- Create: `src/styles.css`
- Create: `e2e/smoke.spec.ts`
- Create: `e2e/fixtures/.gitkeep`
- Create: `.superpowers/sdd/2026-08-27-phase-0-feasibility-contracts/progress.md`
- Preserve: `docs/superpowers/specs/2026-08-27-bitbucket-review-workspace-design.md`
- Preserve: `docs/superpowers/plans/2026-08-27-phase-0-feasibility-contracts.md`

- [ ] Run `git init -b main` and verify the branch with `git branch --show-current`.
- [ ] Commit the approved design and Phase 0 plan on `main` as `docs: add fast review design and phase 0 plan`.
- [ ] Create and switch to `implementation/phase-0`.
- [ ] Create the minimal Vite/React/TypeScript toolchain. Pin exact dependency versions in the lockfile. Use `@biomejs/biome` for formatting and linting; do not add ESLint or Prettier.
- [ ] Define scripts: `dev`, `build`, `preview`, `typecheck`, `format:check`, `lint`, `test:unit`, `test:e2e`, and `verify`.
- [ ] Configure Playwright to build and serve the production bundle, not the Vite development server.
- [ ] Write `src/app/App.test.tsx` first. It must fail because the app does not yet show the product name and a Phase 0 readiness label. Run the single test and record the expected failure.
- [ ] Add the smallest `App` and styles that make the component test pass. This is a neutral diagnostic shell, not the final visual design.
- [ ] Write `e2e/smoke.spec.ts` first and observe it fail before wiring the production server. It must assert that `/` renders `Fast Review` and contains no console errors.
- [ ] Complete the production-server configuration and make the smoke test pass.
- [ ] Run `pnpm verify` and record command, exit code, test counts, and Playwright artifact location.
- [ ] Commit the scaffold as `build: bootstrap verified frontend workspace`.

Expected public boundary after this task:

```ts
export function App(): JSX.Element
```

## Task 2: Define provider-neutral contracts and the Bitbucket read adapter

**Files:**

- Create: `src/providers/contracts.ts`
- Create: `src/providers/errors.ts`
- Create: `src/providers/bitbucket-cloud/auth.ts`
- Create: `src/providers/bitbucket-cloud/schemas.ts`
- Create: `src/providers/bitbucket-cloud/request.ts`
- Create: `src/providers/bitbucket-cloud/client.ts`
- Create: `src/providers/bitbucket-cloud/auth.test.ts`
- Create: `src/providers/bitbucket-cloud/request.test.ts`
- Create: `src/providers/bitbucket-cloud/schemas.test.ts`
- Create: `src/providers/bitbucket-cloud/__fixtures__/user.json`
- Create: `src/providers/bitbucket-cloud/__fixtures__/pull-request-page.json`
- Create: `src/providers/bitbucket-cloud/__fixtures__/activity-page.json`

- [ ] Define only the Phase 0 normalized types: `ProviderId`, `ProviderCredentials`, `ProviderCapabilities`, `PullRequestRef`, `PullRequestSummary`, `ReviewSignal`, and `ProviderError` variants.
- [ ] Define the provider service interface below without optional speculative hooks:

```ts
export interface CodeReviewProvider {
  readonly id: ProviderId
  readonly capabilities: ProviderCapabilities
  readonly getCurrentUser: Effect.Effect<ProviderUser, ProviderError>
  readonly listOpenPullRequests: (
    repository: RepositoryRef,
  ) => Effect.Effect<ReadonlyArray<PullRequestSummary>, ProviderError>
  readonly getReviewSignals: (
    pullRequest: PullRequestRef,
  ) => Effect.Effect<ReadonlyArray<ReviewSignal>, ProviderError>
}
```

- [ ] RED: test that credential encoding produces the exact Basic authorization value without logging credentials and that the API base cannot be overridden by arbitrary input.
- [ ] GREEN: implement an isolated Basic-auth helper and fixed `https://api.bitbucket.org/2.0` request builder. Accept email/token only through an in-memory dependency.
- [ ] RED: add fixture decoder tests for a valid response, missing required identity, pagination, unknown enum values, and malformed timestamps.
- [ ] GREEN: decode untrusted JSON at the adapter boundary with stable Effect Schema APIs and map failures to serializable, redacted `ProviderError` values.
- [ ] RED: test normalized open-PR and activity output using checked-in synthetic fixtures.
- [ ] GREEN: implement read-only `/user`, repository pull-request list, and pull-request activity operations. No mutation methods belong in the live client yet.
- [ ] Run focused tests, then `pnpm verify`.
- [ ] Commit as `feat: add provider contracts and Bitbucket read adapter`.

## Task 3: Add a local-only connection diagnostics flow

**Files:**

- Create: `src/connection/model.ts`
- Create: `src/connection/ConnectionDiagnostics.tsx`
- Create: `src/connection/ConnectionDiagnostics.test.tsx`
- Create: `src/providers/bitbucket-cloud/diagnostics.ts`
- Create: `src/providers/bitbucket-cloud/diagnostics.test.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/styles.css`
- Create: `e2e/connection-diagnostics.spec.ts`

- [ ] Model diagnostics as `idle | running | succeeded | failed`, with a redacted result for each required read capability: identity, workspace visibility, repository visibility, open PR list, activity, comments, diffstat, and diff.
- [ ] RED: component tests must prove credentials are controlled in-memory values, disappear after reload, are never reflected in the URL, and are cleared by an explicit Lock action.
- [ ] GREEN: implement the minimal connection form using Atlassian email plus Bitbucket API token. Add clear text stating that nothing is uploaded to a Fast Review server and credentials are not saved in Phase 0.
- [ ] RED: diagnostics tests must prove bounded sequential execution, abort support, redaction of request headers and response bodies, and distinct auth, permission, CORS/network, rate-limit, and decode failures.
- [ ] GREEN: implement the read-only Effect workflow. Restrict requests to the fixed Bitbucket API origin and the expected endpoint templates.
- [ ] Add non-executing request-shape builders for approve, request-changes, comment, and inline-comment endpoints. Test method/path/body shape, but do not expose a UI control that sends them.
- [ ] RED/GREEN: Playwright intercepts all Bitbucket calls and validates success, invalid-token, missing-scope, cancellation, and reload-clears-secret flows without network access.
- [ ] Run focused tests, then `pnpm verify`.
- [ ] Commit as `feat: add safe Bitbucket connection diagnostics`.

## Task 4: Prove the diff-first review surface and worker boundary

**Files:**

- Create: `src/review/patch.ts`
- Create: `src/review/patch.test.ts`
- Create: `src/review/DiffReview.tsx`
- Create: `src/review/DiffReview.test.tsx`
- Create: `src/workers/patch.worker.ts`
- Create: `src/workers/patch-worker-client.ts`
- Create: `src/workers/patch-worker-client.test.ts`
- Create: `src/review/__fixtures__/small.patch`
- Create: `src/review/__fixtures__/large.patch`
- Create: `e2e/diff-review.spec.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/styles.css`
- Create: `docs/architecture/decisions/0001-diff-renderer-and-worker.md`

- [ ] Inspect the installed `@pierre/diffs` public exports and record the exact stable API used in the ADR. Do not use undocumented internals.
- [ ] RED: test deterministic file ordering and patch metadata preprocessing using synthetic patches.
- [ ] GREEN: implement a pure patch preprocessing function with a serializable input/output contract.
- [ ] RED: test that small inputs execute locally, large inputs use the module worker, abort terminates pending work, and worker errors fall back without losing review content.
- [ ] GREEN: implement the smallest worker bridge. The worker performs only CPU work and never receives credentials or makes network requests.
- [ ] RED/GREEN: component and Playwright tests render a multi-file sample with `@pierre/diffs`, switch unified/split layout, navigate files, virtualize a large fixture, and emit an inline-comment intent carrying stable file/line/side coordinates.
- [ ] Keep comments local in this task; no remote mutation is allowed.
- [ ] Record whether `@pierre/diffs/worker` is stable enough to adopt. Default to the local worker boundary unless the compatibility evidence is explicit.
- [ ] Run focused tests, then `pnpm verify`.
- [ ] Commit as `feat: prove diff-first review surface`.

## Task 5: Document Phase 0 evidence and remaining live gates

**Files:**

- Create: `docs/phase-0/acceptance-report.md`
- Create: `docs/phase-0/live-bitbucket-checklist.md`
- Modify: `README.md`

- [ ] Build an acceptance matrix mapping every Phase 0 claim in the design spec to an automated test, a manual browser check, or an explicitly unresolved live Bitbucket gate.
- [ ] Document the safe live-check procedure without requesting credentials in chat: the user opens the local app, enters credentials locally, selects a disposable test repository/PR, and confirms each external mutation individually.
- [ ] Mark these as unresolved until actually observed against a disposable PR: browser CORS with a real API token; required scopes; activity observability for renewed review requests; approve; request changes; general comments; inline comment coordinates; approval reset after a new source commit.
- [ ] Document sanitized evidence rules: endpoint template, status class, capability result, timestamp, and app version are allowed; headers, tokens, email, response bodies, comments, diffs, repository names, and PR titles are forbidden.
- [ ] Add local setup, `pnpm verify`, security boundaries, and Phase 0 limitations to the README.
- [ ] Run `pnpm verify` from a clean production build.
- [ ] Inspect `git diff main...HEAD`, confirm every Phase 0 plan item is accounted for, and record any unresolved item honestly.
- [ ] Commit as `docs: record phase 0 feasibility evidence`.

## Phase 0 completion gate

- [ ] All commits are on `implementation/phase-0`; `main` contains only the approved design/plan baseline.
- [ ] `pnpm verify` exits 0 with no skipped core tests and no browser console errors.
- [ ] No secret-like values exist in Git history, fixtures, Playwright traces, screenshots, logs, or build output.
- [ ] The production bundle makes no request to an origin other than the locally served app and `https://api.bitbucket.org`.
- [ ] Any live Bitbucket behavior not safely exercised is labeled unresolved, not inferred from request shape or documentation.
- [ ] A fresh reviewer confirms spec compliance and code quality after every task; a final reviewer checks the complete `main...implementation/phase-0` range.

