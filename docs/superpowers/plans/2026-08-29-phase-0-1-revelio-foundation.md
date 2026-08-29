# Revelio Phase 0.1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Phase 0 probe into a correctly named Revelio foundation that discovers Bitbucket repositories through supported endpoints, uses HeroUI exclusively for product UI, follows the native Diffs light/dark themes, and gives contributors reliable local setup instructions.

**Architecture:** Keep the existing backend-free React/Effect boundary and correct the provider workflow at its shared HTTP and discovery seams. HeroUI owns product controls and theming; a single root theme hook resolves light/dark for both HeroUI and `@pierre/diffs`. Preserve the disposable diagnostics flow and its strict secret-redaction boundary while making every change test-first.

**Tech Stack:** React 19, TypeScript 7 strict mode, Effect 3, Vite 8, HeroUI 3, Tailwind CSS 4, `@pierre/diffs` 1.3.6, Vitest 4, Playwright 1.62, pnpm 11.

**Spec:** `docs/superpowers/specs/2026-08-27-bitbucket-review-workspace-design.md`

## Global Constraints

- Product name is `Revelio`; do not retain user-facing `Fast Review` copy.
- Canonical repository is `https://github.com/shushpan/revelio`; implementation stays on local `main` and this plan does not require a push.
- The application remains a client-only static web application with no backend, telemetry, runtime CDN, or third-party network request.
- Credentials remain only in controlled React memory in Phase 0.1 and must never appear in a URL, log, error, fixture, trace, or persisted storage.
- HeroUI v3 is the only product component/theme system. Tailwind CSS v4 is only HeroUI's styling runtime and layout utility layer.
- Use HeroUI's unmodified default light/dark themes and one `useTheme("system")` controller.
- Diffs uses native `pierre-light` and `pierre-dark`; do not pass a custom `theme` value.
- Use supported discovery: `GET /2.0/user/workspaces`, then `GET /2.0/repositories/{workspace}`.
- Preserve opaque pagination, origin restrictions, partial-result semantics, accessibility, and bundle-budget verification.
- Do not stage or modify `.tldr/`, `.tldrignore`, `.DS_Store`, real credentials, or real company data.

---

## File structure

- `src/providers/bitbucket-cloud/http-error.ts` — one redacted HTTP status mapper shared by diagnostics and the provider client.
- `src/providers/bitbucket-cloud/http-error.test.ts` — exact status-family tests without response bodies.
- `src/providers/bitbucket-cloud/diagnostics.ts` — supported workspace-first repository discovery and dependent probes.
- `src/providers/bitbucket-cloud/diagnostics.test.ts` — request order, dependency, encoding, redaction, and status tests.
- `src/providers/bitbucket-cloud/client.ts` — consume the shared error mapper; no behavior-specific duplicate.
- `src/providers/errors.ts` — typed client, resource, deprecation, and provider failure variants.
- `src/connection/model.ts` — diagnostic-safe projection of the new error tags.
- `src/ui/ThemeControl.tsx` — the sole HeroUI theme controller and compact system/light/dark selector.
- `src/ui/ThemeControl.test.tsx` — selection and resolved-theme behavior.
- `src/app/App.tsx` — Revelio/HeroUI shell composition and resolved theme propagation.
- `src/connection/ConnectionDiagnostics.tsx` — HeroUI form, card, buttons, and accessible results.
- `src/review/DiffReview.tsx` — HeroUI review controls and resolved native Diffs theme type.
- `src/styles.css` — required HeroUI imports plus minimal structural layout for the diff viewport.
- `vite.config.ts` — Tailwind CSS v4 Vite integration.
- `package.json`, `pnpm-lock.yaml` — Revelio metadata, Corepack pin, HeroUI/Tailwind exact dependencies.
- `index.html`, `src/main.tsx`, `src/review/patch.ts` — remaining product identity.
- `README.md` — product README, installation, Corepack/pnpm recovery, capabilities, security, and limitations.
- `e2e/connection-diagnostics.spec.ts`, `e2e/smoke.spec.ts`, `e2e/diff-review.spec.ts` — production acceptance for discovery, product theme, and native Diffs themes.

---

### Task 1: Correct Bitbucket discovery and redacted HTTP errors

**Files:**
- Create: `src/providers/bitbucket-cloud/http-error.ts`
- Create: `src/providers/bitbucket-cloud/http-error.test.ts`
- Modify: `src/providers/errors.ts`
- Modify: `src/providers/bitbucket-cloud/client.ts`
- Modify: `src/providers/bitbucket-cloud/diagnostics.ts`
- Modify: `src/providers/bitbucket-cloud/diagnostics.test.ts`
- Modify: `src/connection/model.ts`
- Modify: `src/connection/ConnectionDiagnostics.tsx`
- Modify: `e2e/connection-diagnostics.spec.ts`

**Interfaces:**
- Produces: `mapBitbucketHttpError(status: number, operation: string, endpoint: string, retryAfter: string | null): ProviderError`.
- Produces: supported discovery paths `/user/workspaces?pagelen=1` and `/repositories/{encodedWorkspace}?pagelen=1`.
- Preserves: `runBitbucketDiagnostics(credentials, options): Effect<DiagnosticsReport, ProviderError>` and its redacted report shape.

- [ ] **Step 1: Write failing shared status-mapper tests**

Add table-driven assertions to `http-error.test.ts`:

```ts
it.each([
  [400, "BadRequest"],
  [401, "Unauthorized"],
  [403, "Forbidden"],
  [404, "NotFound"],
  [410, "Gone"],
  [429, "RateLimited"],
  [503, "ServerError"],
  [418, "UnexpectedHttpError"],
] as const)("maps HTTP %i to %s", (status, tag) => {
  expect(mapBitbucketHttpError(status, "repository discovery", "/repositories/{workspace}", null))
    .toMatchObject({ _tag: tag, status, operation: "repository discovery" });
});
```

Also assert that the serialized error contains neither a synthetic token nor a synthetic response body; the mapper must never accept a body argument.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `pnpm vitest run src/providers/bitbucket-cloud/http-error.test.ts`

Expected: FAIL because `http-error.ts` and the new error variants do not exist.

- [ ] **Step 3: Add typed error variants and one shared mapper**

Extend `ProviderError` with `BadRequest` (400), `NotFound` (404), `Gone` (410), and `UnexpectedHttpError` (any other non-success status). Move the existing 401/403/429/5xx mapping into `mapBitbucketHttpError`; map `ServerError` only for `status >= 500`, parse a finite integer `Retry-After`, and pass only operation plus redacted endpoint templates.

Replace both local `httpError` functions in `client.ts` and `diagnostics.ts` with the shared mapper.

- [ ] **Step 4: Make diagnostic status labels precise**

Add the four new tags to `DiagnosticErrorTag` and render these labels in `ConnectionDiagnostics.tsx`:

```ts
BadRequest: "Invalid provider request",
NotFound: "Provider resource not found",
Gone: "Provider endpoint no longer available",
UnexpectedHttpError: "Unexpected provider response",
```

Keep provider response bodies and concrete workspace/repository names out of `DiagnosticsReport`.

- [ ] **Step 5: Write failing workspace-first discovery tests**

Update `diagnostics.test.ts` so the successful fetcher accepts only:

```ts
"/2.0/user"
"/2.0/user/workspaces?pagelen=1"
"/2.0/repositories/acme?pagelen=1"
```

Assert the first dependent request sequence is exactly those paths followed by `/2.0/repositories/acme/review/pullrequests?state=OPEN&pagelen=1`. Add a workspace slug fixture containing a space and assert percent encoding in the repository URL. Add an empty-workspace test that performs only identity plus workspace discovery and marks repository/PR capabilities unavailable.

- [ ] **Step 6: Run the focused diagnostics test and confirm RED**

Run: `pnpm vitest run src/providers/bitbucket-cloud/diagnostics.test.ts`

Expected: FAIL because diagnostics still requests deprecated `/workspaces` and global `/repositories`.

- [ ] **Step 7: Implement supported dependent discovery**

Change the endpoint templates and workflow to:

```ts
"workspace-visibility": "/user/workspaces",
"repository-visibility": "/repositories/{workspace}",
```

Request the first workspace, then request repositories only when a workspace slug exists. Decode the first repository slug without requiring the repository response to repeat its workspace object, pairing it with the already validated workspace slug. When workspace discovery fails or has no values, mark repository and all PR-dependent probes unavailable rather than inventing a request.

- [ ] **Step 8: Update browser fixtures and verify the real request contract**

Update `e2e/connection-diagnostics.spec.ts` expected paths and route fixtures to `/2.0/user/workspaces` and `/2.0/repositories/acme`. Add a browser assertion that HTTP 410 displays `Provider endpoint no longer available` without rendering the response body.

- [ ] **Step 9: Run Task 1 verification**

Run:

```bash
pnpm vitest run src/providers/bitbucket-cloud/http-error.test.ts src/providers/bitbucket-cloud/diagnostics.test.ts src/providers/bitbucket-cloud/client.test.ts src/connection/ConnectionDiagnostics.test.tsx
pnpm test:e2e -- e2e/connection-diagnostics.spec.ts
```

Expected: all focused unit and Chromium acceptance tests PASS; no unexpected external request occurs.

- [ ] **Step 10: Commit Task 1**

Stage only the files listed in Task 1 and commit:

```bash
git commit -m "fix: use supported Bitbucket discovery"
```

---

### Task 2: Rename the runtime and install HeroUI foundation

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `vite.config.ts`
- Modify: `src/styles.css`
- Modify: `index.html`
- Modify: `src/main.tsx`
- Modify: `src/review/patch.ts`
- Modify: `src/app/App.test.tsx`
- Modify: `e2e/smoke.spec.ts`

**Interfaces:**
- Produces: package `revelio`, Corepack declaration `pnpm@11.24.0`, and exact HeroUI/Tailwind dependencies.
- Produces: global HeroUI default theme styles through `@import "tailwindcss";` followed by `@import "@heroui/styles";`.
- Preserves: one Vite entry script, lazy Diffs chunk, and current bundle accounting.

- [ ] **Step 1: Write failing identity acceptance assertions**

Change `App.test.tsx` and `e2e/smoke.spec.ts` to require a visible `Revelio` heading and reject `Fast Review`. Add an assertion that `document.title` is `Revelio` in the production browser test.

- [ ] **Step 2: Run identity tests and confirm RED**

Run: `pnpm vitest run src/app/App.test.tsx && pnpm test:e2e -- e2e/smoke.spec.ts`

Expected: FAIL because runtime copy and document metadata still use the old name.

- [ ] **Step 3: Install exact HeroUI/Tailwind dependencies and pin pnpm**

Run:

```bash
pnpm add --save-exact @heroui/react@3.2.4 @heroui/styles@3.2.4
pnpm add --save-dev --save-exact tailwindcss@4.3.3 @tailwindcss/vite@4.3.3
```

Set `package.json` fields:

```json
"name": "revelio",
"packageManager": "pnpm@11.24.0",
"engines": { "node": ">=20.19" }
```

The Node floor follows Vite 8 and remains compatible with React/HeroUI.

- [ ] **Step 4: Wire HeroUI's CSS-first Vite setup**

Add `tailwindcss()` from `@tailwindcss/vite` after `react()` in `vite.config.ts`. Make these the first lines of `src/styles.css` in this exact order:

```css
@import "tailwindcss";
@import "@heroui/styles";
```

Delete the custom palette, custom button/input/card skins, and custom focus colors. Retain only structural rules that Diffs or viewport sizing cannot express cleanly through component classes, including `.diff-view` overflow/height behavior.

- [ ] **Step 5: Complete the product rename**

Set `<title>Revelio</title>` and a neutral default `theme-color` in `index.html`; change the root error to `Revelio root element is missing`; change the parser label from `fast-review` to `revelio`; update all runtime/test descriptions and copy found by:

```bash
rg -n "Fast Review|fast-review" src e2e index.html package.json
```

Expected after edits: no matches.

- [ ] **Step 6: Run Task 2 verification**

Run:

```bash
pnpm vitest run src/app/App.test.tsx src/review/patch.test.ts
pnpm build
pnpm test:e2e -- e2e/smoke.spec.ts
```

Expected: tests and production build PASS and both bundle budgets remain enforced.

- [ ] **Step 7: Commit Task 2**

Stage only Task 2 files and commit:

```bash
git commit -m "chore: establish Revelio HeroUI foundation"
```

---

### Task 3: Migrate product controls and synchronize native Diffs themes

**Files:**
- Create: `src/ui/ThemeControl.tsx`
- Create: `src/ui/ThemeControl.test.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/connection/ConnectionDiagnostics.tsx`
- Modify: `src/connection/ConnectionDiagnostics.test.tsx`
- Modify: `src/review/DiffReview.tsx`
- Modify: `src/review/DiffReview.test.tsx`
- Modify: `src/review/DiffDemo.tsx`
- Modify: `src/styles.css`
- Modify: `e2e/diff-review.spec.ts`
- Modify: `e2e/smoke.spec.ts`

**Interfaces:**
- Produces: `ThemeControl({ theme, resolvedTheme, onThemeChange })` with theme values `"system" | "light" | "dark"`.
- Changes: `DiffReviewProps` adds `themeType: "light" | "dark"`.
- Consumes: one `useTheme("system")` call in `App`; child components never create competing theme controllers.

- [ ] **Step 1: Write failing theme control and Diffs option tests**

Test `ThemeControl` as a three-button HeroUI `ButtonGroup`: System, Light, Dark; selected choice uses `variant="primary"`, and `onThemeChange` receives the requested value. In `DiffReview.test.tsx`, mock `CodeView` and assert its options include the supplied `themeType` but do not contain a `theme` property.

- [ ] **Step 2: Run focused theme tests and confirm RED**

Run: `pnpm vitest run src/ui/ThemeControl.test.tsx src/review/DiffReview.test.tsx`

Expected: FAIL because the component, prop, and native-theme behavior do not exist.

- [ ] **Step 3: Implement one HeroUI theme controller**

In `App`, call:

```ts
const { theme, resolvedTheme, setTheme } = useTheme("system");
const diffTheme = resolvedTheme === "dark" ? "dark" : "light";
```

Render `ThemeControl` once in the application header, use HeroUI `Button`/`ButtonGroup`, and pass `diffTheme` through `DiffDemo` to `DiffReview`. Do not add `next-themes`, a React provider, or a custom theme object.

- [ ] **Step 4: Migrate the connection surface to HeroUI composition**

Use only public HeroUI v3 primitives:

```tsx
<Card>
  <Card.Header>
    <Card.Title>Connect to Bitbucket Cloud</Card.Title>
    <Card.Description>...</Card.Description>
  </Card.Header>
  <Card.Content>
    <TextField name="email" type="email">
      <Label>Atlassian email</Label>
      <Input autoComplete="off" value={email} onChange={...} />
    </TextField>
  </Card.Content>
</Card>
```

Use HeroUI `Button` for Lock, Run diagnostics, Open diff demo, layout choices, file navigation, and inline-comment intent. Keep semantic `main`, `header`, `section`, `form`, `nav`, `ul`, and live-region elements where they carry document meaning. Use HeroUI semantic status styling or utilities instead of custom green/red palette classes; status text remains visible.

- [ ] **Step 5: Restore controlled-form and keyboard assertions**

Update `ConnectionDiagnostics.test.tsx` for HeroUI's composed labels/inputs while preserving these invariants: credentials remain controlled, Lock clears them, reload clears them, an empty form makes no request, and no browser storage call occurs during diagnostics. Assert the submit button remains discoverable by accessible name.

- [ ] **Step 6: Use Diffs' native themes**

Replace the hard-coded options:

```ts
themeType: "light",
theme: "github-light",
```

with:

```ts
themeType,
```

This intentionally lets `@pierre/diffs` choose `pierre-light` or `pierre-dark`. Do not add CSS selectors that recolor Diffs tokens.

- [ ] **Step 7: Add production light/dark acceptance**

In `e2e/smoke.spec.ts`, select Dark and assert `<html>` has both class `dark` and `data-theme="dark"`; select System and verify the selection is represented without testing OS-specific colors. In `e2e/diff-review.spec.ts`, open the real diff under both light and dark modes and assert no browser exception, file navigation still works, and no `github-light` marker exists in rendered markup.

- [ ] **Step 8: Run Task 3 verification**

Run:

```bash
pnpm vitest run src/ui/ThemeControl.test.tsx src/app/App.test.tsx src/connection/ConnectionDiagnostics.test.tsx src/review/DiffReview.test.tsx
pnpm build
pnpm test:e2e -- e2e/smoke.spec.ts e2e/diff-review.spec.ts e2e/connection-diagnostics.spec.ts
```

Expected: focused tests and production Chromium flows PASS; the existing initial/lazy bundle budgets remain green.

- [ ] **Step 9: Commit Task 3**

Stage only Task 3 files and commit:

```bash
git commit -m "feat: migrate Revelio shell to HeroUI"
```

---

### Task 4: Publish the product README and close Phase 0.1 locally

**Files:**
- Modify: `README.md`
- Modify: `docs/phase-0/live-bitbucket-checklist.md`
- Modify: `docs/phase-0/acceptance-report.md`
- Modify: `docs/superpowers/plans/2026-08-29-phase-0-1-revelio-foundation.md`

**Interfaces:**
- Produces: contributor path using Corepack when `pnpm` is absent.
- Produces: honest product/feature/security status and a user-run live verification checklist.
- Preserves: no credential collection through chat, scripts, logs, screenshots, or committed files.

- [x] **Step 1: Replace the feasibility README with a product README**

Write these sections with working commands and direct links: What Revelio is; Why it is better for cross-repository review; Current features; Security model; Requirements; Install and run; If `pnpm` is missing; Production build; Verification; Current limitations; Roadmap; Contributing; License status.

Use this local setup sequence:

```bash
git clone https://github.com/shushpan/revelio.git
cd revelio
corepack enable
corepack prepare pnpm@11.24.0 --activate
pnpm install --frozen-lockfile
pnpm dev
```

Explain that Homebrew users may instead run `brew install pnpm`, but Corepack is the reproducible project default. State that the browser talks directly to Bitbucket and that Phase 0.1 credentials are session-memory only—not yet passkey/passphrase persisted.

- [x] **Step 2: Update live-check and acceptance wording**

Replace deprecated discovery paths in the live checklist, add a sanitized confirmation for at least one workspace and repository, and require the user to record only capability outcomes and HTTP status categories. Update the acceptance report to mark supported workspace/repository discovery as implemented but still awaiting a user-run disposable-token confirmation.

- [x] **Step 3: Run documentation and identity scans**

Run:

```bash
set -eu
fail_on_matches() {
  scan_label="$1"
  scan_pattern="$2"
  shift 2
  scan_matches="$(rg -n "$scan_pattern" "$@" || true)"
  if [ -n "$scan_matches" ]; then
    printf 'FAIL: %s\n%s\n' "$scan_label" "$scan_matches" >&2
    exit 1
  fi
  printf 'PASS: %s (no forbidden matches)\n' "$scan_label"
}

printf '%s\n' 'Documentation validation:'
fail_on_matches "old product identity in README/docs" 'Fast Review|fast-review' README.md docs/phase-0
fail_on_matches "deprecated discovery paths in README/docs" '(^|[^[:alnum:]_])/(workspaces\?|repositories\?role=member)' README.md docs/phase-0
doc_matches="$(rg -n '/2\.0/user/workspaces(\?pagelen=1)?|/2\.0/repositories/\{workspace\}(\?pagelen=1)?' README.md docs/phase-0 --glob '*.md' || true)"
doc_unexpected_files="$(printf '%s\n' "$doc_matches" | cut -d: -f1 | sort -u | rg -v '^(README\.md|docs/phase-0/(live-bitbucket-checklist|acceptance-report)\.md)$' || true)"
if [ -n "$doc_unexpected_files" ]; then
  printf 'FAIL: supported discovery appears in unexpected documentation files\n%s\n' "$doc_unexpected_files" >&2
  exit 1
fi
if [ -z "$doc_matches" ]; then
  printf 'FAIL: supported discovery documentation references are missing\n' >&2
  exit 1
fi
printf 'PASS: supported discovery documentation is scoped to README/live-check/acceptance\n%s\n' "$doc_matches"

printf '%s\n' 'Runtime/test validation:'
fail_on_matches "deprecated discovery paths in source/tests" '(^|[^[:alnum:]_])/(workspaces\?|repositories\?role=member)' src e2e
discovery_source='src/providers/bitbucket-cloud/diagnostics.ts'

workspace_source="$(rg -n -F '"workspace-visibility": "/user/workspaces",' "$discovery_source" || true)"
workspace_fetch="$(rg -n -F '"/user/workspaces?pagelen=1",' "$discovery_source" || true)"
if [ -z "$workspace_source" ] || [ -z "$workspace_fetch" ]; then
  printf 'FAIL: workspace discovery source contract is incomplete\n' >&2
  exit 1
fi
if [ "$(rg -l -F 'workspace-visibility' "$discovery_source" || true)" != "$discovery_source" ]; then
  printf 'FAIL: workspace discovery source file scope changed\n' >&2
  exit 1
fi
printf 'PASS: workspace discovery source contract and file scope\n%s\n%s\n' "$workspace_source" "$workspace_fetch"

repository_source="$(rg -n -F '"repository-visibility": "/repositories/{workspace}",' "$discovery_source" || true)"
repository_fetch="$(rg -n -F '/repositories/${encodeURIComponent(selectedWorkspace)}?pagelen=1' "$discovery_source" || true)"
if [ -z "$repository_source" ] || [ -z "$repository_fetch" ]; then
  printf 'FAIL: repository discovery source contract is incomplete\n' >&2
  exit 1
fi
if [ "$(rg -l -F 'repository-visibility' "$discovery_source" || true)" != "$discovery_source" ]; then
  printf 'FAIL: repository discovery source file scope changed\n' >&2
  exit 1
fi
printf 'PASS: repository discovery source contract and file scope\n%s\n%s\n' "$repository_source" "$repository_fetch"

workspace_files="$(rg -l -e '/2\.0/user/workspaces(\?pagelen=1)?"' src e2e | sort -u || true)"
workspace_expected_files="$(printf '%s\n' src/providers/bitbucket-cloud/diagnostics.test.ts e2e/connection-diagnostics.spec.ts | sort -u)"
if [ "$workspace_files" != "$workspace_expected_files" ]; then
  printf 'FAIL: workspace discovery fixture file scope changed\n%s\n' "$workspace_files" >&2
  exit 1
fi
workspace_tokens="$(rg -o --no-filename '/2\.0/user/workspaces(\?pagelen=1)?"' src e2e | sed 's/"$//' | sort -u || true)"
workspace_expected_tokens="$(printf '%s\n' /2.0/user/workspaces '/2.0/user/workspaces?pagelen=1' | sort -u)"
if [ "$workspace_tokens" != "$workspace_expected_tokens" ]; then
  printf 'FAIL: workspace discovery fixture variants changed\n%s\n' "$workspace_tokens" >&2
  exit 1
fi
printf 'PASS: workspace discovery fixture scope and exact variants\n%s\n' "$workspace_tokens"

repository_files="$(rg -l -e '/2\.0/repositories/[^/[:space:]"?]+(\?pagelen=1)?"' src e2e | sort -u || true)"
repository_expected_files="$(printf '%s\n' src/providers/bitbucket-cloud/diagnostics.test.ts e2e/connection-diagnostics.spec.ts | sort -u)"
if [ "$repository_files" != "$repository_expected_files" ]; then
  printf 'FAIL: repository discovery fixture file scope changed\n%s\n' "$repository_files" >&2
  exit 1
fi
repository_tokens="$(rg -o --no-filename '/2\.0/repositories/[^/[:space:]"?]+(\?pagelen=1)?"' src e2e | sed 's/"$//' | sort -u || true)"
repository_expected_tokens="$(printf '%s\n' /2.0/repositories/acme '/2.0/repositories/acme?pagelen=1' '/2.0/repositories/acme%20cloud?pagelen=1' | sort -u)"
if [ "$repository_tokens" != "$repository_expected_tokens" ]; then
  printf 'FAIL: repository discovery fixture variants changed\n%s\n' "$repository_tokens" >&2
  exit 1
fi
printf 'PASS: repository discovery fixture scope and exact variants\n%s\n' "$repository_tokens"

fail_on_matches "custom Diffs theme in product files" 'github-light' README.md src index.html package.json docs/phase-0
e2e_diff_matches="$(rg -n -F 'github-light' e2e || true)"
e2e_diff_lines="$(printf '%s\n' "$e2e_diff_matches" | sed -E 's/^[^:]+:[0-9]+:[[:space:]]*//' | sort)"
e2e_expected_line='expect(await page.locator(".diff-view").innerHTML()).not.toContain("github-light");'
e2e_expected_lines="$(printf '%s\n%s\n' "$e2e_expected_line" "$e2e_expected_line" | sort)"
if [ "$e2e_diff_lines" != "$e2e_expected_lines" ]; then
  printf 'FAIL: E2E Diffs marker lines changed\n%s\n' "$e2e_diff_lines" >&2
  exit 1
fi
printf 'PASS: E2E Diffs marker lines match the two exact negative assertions\n%s\n' "$e2e_diff_lines"

rg -n "real token|API token" README.md docs/phase-0/live-bitbucket-checklist.md
git diff --check
```

Expected: the script exits zero. Documentation validation requires supported
templated discovery references only in `README.md`,
`docs/phase-0/live-bitbucket-checklist.md`, and
`docs/phase-0/acceptance-report.md`; it fails on old product identity or
deprecated paths there. Runtime/test validation separately requires workspace
and repository discovery in the exact production/test files, checks the
relative diagnostics templates and exact supported fixture variants (including
the encoded workspace fixture), and fails on any deprecated path or unexpected
file/variant. The quoted endpoint patterns require a closing quote, so longer
pull-request paths cannot pass by prefix. Product files contain no
`github-light`; the complete normalized
E2E matching-line list must equal the two exact
`expect(await page.locator(".diff-view").innerHTML()).not.toContain("github-light");`
assertions.
Token mentions only instruct users to enter credentials in the local browser
and never expose them elsewhere; `git diff --check` exits zero.

- [x] **Step 4: Run the complete verification contract**

Run: `pnpm verify`

Expected: formatting and lint are warning-free; TypeScript passes; all Vitest suites pass; the production build and bundle budgets pass; all Chromium Playwright tests pass with no unexpected external request.

- [x] **Step 5: Inspect the served product manually**

Run `pnpm dev`, open the printed localhost URL, and check at desktop and narrow widths: Revelio heading, default HeroUI light theme, dark/system switching, connection labels, Lock, diagnostics statuses, lazy diff opening, split/unified selection, file navigation, and no visual remnants of the old custom palette.

- [x] **Step 6: Mark plan evidence and commit Task 4**

Check completed boxes only after their command evidence exists. Append a short Phase 0.1 evidence section containing the exact `pnpm verify` exit status, unit-test count, Playwright-test count, and measured bundle sizes. Stage only Task 4 files and commit:

```bash
git commit -m "docs: publish Revelio product guide"
```

- [x] **Step 7: Perform final review without pushing**

Confirm:

```bash
git status --short --branch
git log --oneline -n 6
git remote -v
```

Expected: branch is local `main`; only the pre-existing `.tldr/` and `.tldrignore` remain untracked; origin is `https://github.com/shushpan/revelio.git`; no push is attempted.

## Phase 0.1 evidence

Recorded 2026-08-29 on local `main` at baseline `90c1aa3`.

- `pnpm verify`: exit status `0` (the first sandboxed attempt was blocked when
  the preview server tried to bind localhost; the rerun with approved local
  environment elevation passed).
- Formatting: Biome checked `55` files, clean.
- Lint: Biome checked `56` files, clean.
- Unit tests: `14` Vitest files, `74` tests passed.
- Playwright: `9` Chromium tests passed, `0` failed, with no unexpected browser
  console errors or external requests.
- Bundle budgets: initial JavaScript `276,959` bytes / `350,000`; largest lazy
  chunk `790,000` bytes / `820,000`.
- Manual browser evidence: the served app was inspected at the default desktop
  viewport and `390x844`; light, dark/system controls, connection labels,
  Lock, diagnostics idle state, lazy diff loading, Unified/Split, and changed
  file navigation were visible and interactive. No credentials were entered.
- Identity scan: the revised scoped command exits `0`, confines templated
  discovery references to the intended README/Phase 0 documents, validates
  source/test current paths independently, confirms E2E `github-light` matches
  are negative assertions only, and finds no forbidden old identity, deprecated
  endpoint, or product theme matches. Credential wording remains local-only and
  sanitized.
