# Task 3 report: migrate Revelio shell to HeroUI

## RED

Added the ThemeControl contract test and the DiffReview native-theme options test before production changes.

Command:

```text
pnpm vitest run src/ui/ThemeControl.test.tsx src/review/DiffReview.test.tsx
```

Result: RED. The ThemeControl suite failed because `ThemeControl` did not exist, and the new DiffReview test failed because the rendered options contained `themeType: "light"` instead of the supplied `"dark"`. The three existing DiffReview tests passed.

## GREEN

Implemented one root HeroUI `useTheme("system")` controller in `App`, with resolved light/dark values passed through `DiffDemo` into `DiffReview`. Added `ThemeControl` as a HeroUI `ButtonGroup`, migrated connection controls to HeroUI `Card`, `TextField`, `Label`, `Input`, `Button`, and semantic `Badge`, and migrated review controls to HeroUI `Button`. Diffs now receive only `themeType` and no custom `theme` option. Added light/dark/system acceptance coverage and retained the lazy diff boundary.

## Verification

- `pnpm typecheck` — PASS.
- `pnpm vitest run src/ui/ThemeControl.test.tsx src/app/App.test.tsx src/connection/ConnectionDiagnostics.test.tsx src/review/DiffReview.test.tsx` — PASS, 4 files / 9 tests.
- `pnpm test:unit` — PASS, 14 files / 74 tests.
- `pnpm biome check ...` on all Task 3 files — PASS.
- `pnpm lint` — PASS, 56 files.
- `pnpm build` — BLOCKED by the existing bundle budget: initial `417602` bytes vs `350000`; largest lazy asset `790000` bytes vs `820000`. A clean archive of base `2bf92b9` produced the same initial `417602` bytes, confirming Task 3 did not increase the initial bundle.
- `pnpm test:e2e -- e2e/smoke.spec.ts e2e/diff-review.spec.ts e2e/connection-diagnostics.spec.ts` — BLOCKED before tests because the configured web server runs the failing bundle-budget check.
- Against the successfully generated `dist` preview, the equivalent Chromium command with the web server bypassed — PASS, 9 tests. This covered smoke, dark/system DOM synchronization, real light/dark diff rendering and navigation, absence of `github-light` in rendered diff markup, lazy loading, and all diagnostics flows.

## Files changed

- `src/ui/ThemeControl.tsx`
- `src/ui/ThemeControl.test.tsx`
- `src/app/App.tsx`
- `src/app/App.test.tsx` (test-only `localStorage`/`matchMedia` browser-global stubs required by HeroUI `useTheme` under Node/jsdom)
- `src/connection/ConnectionDiagnostics.tsx`
- `src/review/DiffReview.tsx`
- `src/review/DiffReview.test.tsx`
- `src/review/DiffDemo.tsx`
- `src/styles.css`
- `e2e/diff-review.spec.ts`
- `e2e/smoke.spec.ts`

## Self-review

- Exactly one application `useTheme` call exists; child components do not create theme controllers.
- No `next-themes`, provider, custom palette, or Diffs token recoloring was added.
- All product controls in the changed surfaces use public HeroUI primitives; semantic `main`, `header`, `section`, `form`, `nav`, lists, and live regions remain.
- Credentials remain controlled, are cleared by Lock and remount/reload, empty submissions do not request, and diagnostics do not use browser storage.
- Existing unrelated `.tldr/` and `.tldrignore` files were not staged.

## Concerns

The repository’s initial bundle budget is already over its configured limit on base `2bf92b9`; the build and normal E2E command therefore remain non-zero until that pre-existing budget issue is addressed. Task 3 preserves the measured initial size exactly while keeping the largest lazy chunk under its limit.

## Fix round 1

### Analysis

The prior 417,602-byte entry was caused by eagerly importing the complete HeroUI diagnostics surface through `App`. A clean Vite build from base `2bf92b9` measured 318,520 bytes, while the Task 3 head measured 417,602 bytes. The diagnostics module is not needed to render the application header or diff-open affordance, so it is now loaded with React `lazy`/`Suspense` from `App`. The diff demo remains lazy as before.

The prior connection card also carried the accessible label on a `div`, which did not expose the intended named region. A RED test now requires a native `<section aria-labelledby="connection-title">` wrapper, with the HeroUI `Card` nested inside it.

### RED/GREEN

Command:

```text
pnpm vitest run src/connection/ConnectionDiagnostics.test.tsx
```

Result: RED. The new semantic-region assertion could not find a named `region` because the Card was the labelled `div`.

After adding the native section and lazy diagnostics boundary:

```text
pnpm vitest run src/connection/ConnectionDiagnostics.test.tsx src/app/App.test.tsx
```

Result: GREEN, 2 files / 4 tests.

### Fix verification

- `pnpm build` — PASS, initial `276959` / `350000`; largest lazy `emacs-lisp` `790000` / `820000`.
- Clean base `2bf92b9` Vite + budget accounting — PASS, initial `318520` / `350000`; largest lazy `emacs-lisp` `790000` / `820000`.
- `pnpm test:e2e -- e2e/smoke.spec.ts e2e/diff-review.spec.ts e2e/connection-diagnostics.spec.ts` — PASS, configured web server started and Chromium passed 9/9 tests.
- Existing `.tldr/` and `.tldrignore` remain untouched and unstaged.

### Fix concerns

None. The initial bundle is now below the existing budget, the normal configured E2E gate passes, and the connection surface exposes the required native named section.
