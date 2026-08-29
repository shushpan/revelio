# Task 2 report: Revelio usable review flow

## RED evidence

- `pnpm exec vitest run src/app/App.test.tsx src/inbox/load-inbox.test.ts` failed as expected before implementation: the new inbox test could not resolve the missing `load-inbox` module, and the app test could not find the new connection heading while the old Phase 0/diff-demo shell was still rendered.
- After adding the focused provider assertion, `src/providers/bitbucket-cloud/client.test.ts` failed because the raw diff request sent `Accept: application/json` instead of `text/plain`.

## GREEN evidence

- `pnpm run typecheck` passed.
- `pnpm run lint` passed.
- `pnpm run format:check` passed.
- `pnpm exec vitest run` passed: 15 test files, 91 tests.
- The production build compiled and the initial bundle was reduced below the configured 350 kB budget, but the repository bundle-budget script still failed because the largest generated lazy chunk was 950,296 bytes against an 820,000-byte limit.

## Changed files

- `src/app/App.tsx`: `connect | inbox | review` state flow, theme, lock, refresh, and reviewed checkpoints.
- `src/app/App.test.tsx`: initial-screen acceptance test.
- `src/connection/ConnectScreen.tsx`: in-memory Bitbucket connection form and sanitized failure message.
- `src/inbox/load-inbox.ts`: partial-failure-safe repository/PR loader.
- `src/inbox/load-inbox.test.ts`: successful results remain visible when another repository fails.
- `src/inbox/InboxScreen.tsx`: review filters, rows, refresh, lock, and HeroUI Chip status.
- `src/review/ReviewScreen.tsx`: real diff loading and review/comment actions.
- `src/review/DiffReview.tsx`: removed synthetic-patch loading copy from the product flow.
- `src/styles.css`: compact responsive application shell.
- `src/providers/bitbucket-cloud/client.ts`: raw diff requests use `Accept: text/plain`.
- `src/providers/bitbucket-cloud/client.test.ts`: focused raw-diff header assertion.

## Commit

- `09f0485` — `Build usable Revelio review flow`

Commit reasoning: `.git/Codex/commits/09f0485/reasoning.md`

## Concerns

- `pnpm run build` remains red only at the existing bundle-budget gate because the generated lazy diff-language chunk exceeds the 820 kB threshold. This was left isolated rather than changing unrelated bundling or Task 3-owned e2e work.
- The old `ConnectionDiagnostics` module and its tests remain in the repository for compatibility, but the normal `App` flow no longer imports or renders that diagnostics harness.

## Round 1 fixes

### RED evidence

- Added review-screen tests for failed general and inline comment submissions; they exercise the prior bug where comment state was cleared and the review was checkpointed despite a failed request.
- The bundle gate had previously failed with a 950,296-byte lazy Effect chunk, exposing the namespace-style dynamic import.

### GREEN evidence

- `pnpm exec vitest run src/app/App.test.tsx src/inbox/load-inbox.test.ts src/review/ReviewScreen.test.tsx src/providers/bitbucket-cloud/client.test.ts` passed: 4 files, 21 tests.
- `pnpm run format:check`, `pnpm run lint`, and `pnpm run typecheck` passed.
- `pnpm run build` passed with initial 296,832 bytes / 350,000 and largest lazy 790,000 bytes / 820,000.

### Fix commit

- `3abe647` — `Fix review flow edge cases`

### Concerns

- Refresh errors now show a compact warning, but there is no separate refresh-specific component test; the state is intentionally kept in `App` to avoid expanding the slice.
