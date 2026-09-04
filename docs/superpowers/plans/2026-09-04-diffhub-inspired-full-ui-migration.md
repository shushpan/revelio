# DiffHub-Inspired Full UI Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Revelio's HeroUI presentation with a compact local DiffHub-inspired UI across Connect, Vault, source selection, Inbox, and a full-screen Review workspace while preserving product behavior, security, and bundle limits.

**Architecture:** Build one small Radix/CVA/Tailwind primitive layer, then migrate the high-value Review workspace, Inbox, and setup flows in that order. Keep application state, provider calls, vault code, inbox rules, checkpoint semantics, and `finish-review.ts` unchanged; only the review call site gains real pending comments. Remove HeroUI only after the last consumer has migrated.

**Tech Stack:** React 19, TypeScript 7, Vite 8, Tailwind CSS 4, Radix primitives, CVA, `clsx`, `tailwind-merge`, `@pierre/diffs`, `@pierre/trees`, `@pierre/icons`, Vitest, Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-04-diffhub-inspired-full-ui-design.md`

## Global Constraints

- Keep Vite and the existing client-only/provider architecture; do not add Next.js, SSR, server code, telemetry, runtime CDNs, Sonner, or Vercel Analytics.
- Do not modify credential formats, vault crypto/storage, CSP origins, inbox query semantics, progressive loading, checkpoint validity, queue membership, or `src/review/finish-review.ts` internals.
- Keep `scripts/check-bundle-budget.mjs` limits at initial JS `350_000` bytes and largest lazy chunk `850_000` bytes; any increase requires a separate ADR and is not authorized by this plan.
- Review desktop geometry is exact: `100dvh`, 49px toolbar, 320px sidebar at widths `>=768px`, independently scrolling sidebar body and diff canvas, no global masthead.
- Review narrow geometry is exact: below 768px the sidebar is a dialog-backed bottom sheet, diff defaults to unified, and the toolbar uses the two rows specified in the spec.
- Use the measured Pierre settings: CodeView gap `1`, tree row `24px`, density `0.8`, inline padding `8px`, flattened empty directories, initially open, presorted patch order, sticky folders, search.
- Do not copy DiffHub source, branding, wordmarks, or Berkeley Mono. Self-host only the OFL-licensed Geist UI font; retain the existing system monospace stack for code.
- Description is plain text: never inject HTML and never load remote images. Activity uses only `provider.getReviewSignals()` and caches per PR for the lifetime of the open Review screen.
- Preserve the theme DOM contract: dark mode sets `<html class="dark" data-theme="dark">`; light resolves to `data-theme="light"` without `dark`; the selected System/Light/Dark button has `aria-pressed="true"`.
- Accessibility is required, not polish: visible focus, accessible names, Radix keyboard behavior, focus trapping and restoration, Escape/Cancel, reduced motion, status never conveyed only by color/icon.
- Each task is implemented by one Claude Code Sonnet worker on the shared migration branch, sequentially. The worker must inspect current HEAD first, must not revert earlier task commits, must stage only owned files, and must commit its package.
- Every dependency-changing task records the exact bundle output. Every task ends with targeted tests, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, and `git diff --check`; run full `pnpm verify` at Tasks 1, 3, and 6 and whenever a targeted gate exposes cross-package risk.

---

### Task 1: Local UI foundation and exact dependency pins

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `src/styles.css`
- Create: `src/assets/fonts/GeistVariable.woff2`
- Create: `src/assets/fonts/OFL.txt`
- Create: `src/ui/tokens.css`
- Create: `src/ui/cn.ts`
- Create: `src/ui/Button.tsx`
- Create: `src/ui/IconButton.tsx`
- Create: `src/ui/Card.tsx`
- Create: `src/ui/TextField.tsx`
- Create: `src/ui/Chip.tsx`
- Create: `src/ui/Tabs.tsx`
- Create: `src/ui/Tooltip.tsx`
- Create: `src/ui/DropdownMenu.tsx`
- Create: `src/ui/Dialog.tsx`
- Create: `src/ui/primitives.test.tsx`

**Interfaces:**
- Consumes: existing Tailwind/Vite pipeline and current `data-theme`/`dark` attributes on `<html>`.
- Produces: `cn(...inputs: ClassValue[]): string`; native-event `Button`; tooltip-wrapped `IconButton`; semantic card/text-field/chip exports; styled Radix `Tabs`, `Dialog`, `DropdownMenu`, and `Tooltip` wrappers. Later tasks import only from `src/ui/`, never directly from HeroUI.

- [ ] **Step 1: Pin only the approved dependencies**

Run package metadata checks, choose React-19-compatible releases, and save exact versions without `^`/`~`:

```bash
pnpm add --save-exact @pierre/icons @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-slot @radix-ui/react-tabs @radix-ui/react-tooltip class-variance-authority clsx tailwind-merge
```

Do not add `@pierre/trees` until Task 3. Do not add `@pierre/theme` or `@pierre/theming` directly.

- [ ] **Step 2: Add the failing primitive contract tests**

Create `src/ui/primitives.test.tsx` covering these observable contracts before implementation:

```tsx
it("merges variants without duplicate Tailwind conflicts", () => {
  expect(cn("px-2", false && "hidden", "px-3")).toBe("px-3");
});

it("renders a disabled native button with the selected variant", () => {
  render(<Button variant="primary" disabled>Save</Button>);
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
});

it("exposes accessible tabs, dialog, menu, and tooltip behavior", async () => {
  // Render each wrapper through its exported parts and assert the Radix role/state:
  // tab + aria-selected, dialog + aria-modal, menu, tooltip, Escape close.
});
```

Run: `pnpm exec vitest run src/ui/primitives.test.tsx`

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement the minimal primitive layer**

Use native DOM props and events so screen migrations convert `onPress` to `onClick` and `isDisabled` to `disabled` instead of preserving HeroUI aliases:

```tsx
export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { readonly asChild?: boolean };

export function Button({ asChild, className, variant, size, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
```

Required variants are `primary`, `secondary`, `ghost`, `danger`; required sizes are `sm`, `md`, `icon`. `IconButton` requires both `label` and `tooltip`, sets `aria-label={label}`, and composes `Tooltip` plus `Button size="icon"`. Keep each wrapper thin: behavior stays in Radix, styling stays in CVA/Tailwind.

- [ ] **Step 4: Add tokens and self-hosted Geist**

Source the variable Latin WOFF2 and OFL license from the official Geist repository/release, record the upstream URL in a comment beside `@font-face`, and serve it from `src/assets/fonts/`. Add the exact token families from spec §7.2, including `--toolbar-h: 49px`, `--sidebar-w: 320px`, `--tree-row-h: 24px`, neutral light/dark semantic colors, 4/6px radii, and 480/768/1024px breakpoint values. Import `tokens.css` after Tailwind and before existing presentation rules; keep `@heroui/styles` temporarily.

- [ ] **Step 5: Verify foundation and bundle**

Run:

```bash
pnpm exec vitest run src/ui/primitives.test.tsx
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
pnpm verify
git diff --check
```

Expected: all pass; bundle output remains within `350_000`/`850_000`. Record both printed byte counts in the worker report.

- [ ] **Step 6: Commit the package**

```bash
git add package.json pnpm-lock.yaml src/styles.css src/assets/fonts src/ui
git commit -m "feat: add compact local UI foundation"
```

---

### Task 2: Full-screen Review shell and toolbar frame

**Files:**
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`
- Modify: `src/review/ReviewScreen.tsx`
- Modify: `src/review/ReviewScreen.test.tsx`
- Modify: `src/styles.css`
- Create: `src/review/ReviewToolbar.tsx`
- Create: `src/review/ReviewToolbar.test.tsx`
- Modify: `e2e/review-flow.spec.ts`

**Interfaces:**
- Consumes: Task 1 `Button`, `IconButton`, `DropdownMenu`, `ThemeControl` compatibility, tokens.
- Produces: `ReviewToolbarProps` with `pullRequest`, queue count, busy state, layout/display actions, `onBack`, `onQueue`, `onFinish`; `ReviewScreen` root geometry ready for the sidebar/diff in Task 3.

- [ ] **Step 1: Write shell/toolbar tests first**

Add assertions that:

```tsx
expect(screen.queryByRole("banner", { name: /revelio/i })).not.toBeInTheDocument();
expect(screen.getByRole("button", { name: "Back to inbox" })).toBeEnabled();
expect(screen.getByRole("button", { name: /Queue \(/ })).toBeVisible();
expect(screen.getByRole("button", { name: "Finish Review" })).toBeVisible();
```

Add Playwright geometry checks using `getBoundingClientRect()` at 1280×720 and 1440×900: toolbar height 49px, no global masthead, review root equal to viewport.

Run: `pnpm exec vitest run src/app/App.test.tsx src/review/ReviewScreen.test.tsx src/review/ReviewToolbar.test.tsx`

Expected: FAIL on current masthead/layout.

- [ ] **Step 2: Hide the global masthead only in Review**

In `App.tsx`, keep the state machine untouched and condition only the header:

```tsx
{appState.screen !== "review" ? <header className="app-shell app-header">...</header> : null}
```

Pass the current theme choice/change handler to `ReviewScreen` only if required by the toolbar; do not replace the theme hook yet.

- [ ] **Step 3: Extract and render the compact toolbar**

Create `ReviewToolbar.tsx` with the eight ordered slots from spec §10.1. Task 2 wires Back, identity, Queue, theme, and Finish. The layout toggle/collapse/display callbacks may be present but disabled until Task 3 supplies them; they must still have accessible labels and tooltips, not placeholder text. At `<768px`, render row 1 as Back/identity/Finish and row 2 as Queue/layout/collapse/Display/theme; identity uses CSS truncation and cannot displace Finish.

- [ ] **Step 4: Replace page geometry without changing review behavior**

Set `.review-page` to the two-row/two-column grid from the spec. Remove its max-width/margins and page-level scrolling, but leave the current FileTree/Overview/DiffReview functional until Task 3 replaces them. Preserve loading, failure, queue advance, and action-lock behavior.

- [ ] **Step 5: Verify and commit**

Run targeted Vitest, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, the two new Playwright geometry cases, `pnpm build`, and `git diff --check`.

```bash
git add src/app src/review/ReviewScreen.tsx src/review/ReviewScreen.test.tsx src/review/ReviewToolbar.tsx src/review/ReviewToolbar.test.tsx src/styles.css e2e/review-flow.spec.ts
git commit -m "feat: make review a full-screen workspace"
```

---

### Task 3: Pierre sidebar tree and dense diff canvas

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `src/review/ReviewScreen.tsx`
- Modify: `src/review/ReviewScreen.test.tsx`
- Modify: `src/review/DiffReview.tsx`
- Modify: `src/review/DiffReview.test.tsx`
- Delete: `src/review/FileTree.tsx`
- Delete: `src/review/FileTree.test.tsx`
- Delete: `src/review/Overview.tsx`
- Delete: `src/review/Overview.test.tsx`
- Create: `src/review/sidebar/Sidebar.tsx`
- Create: `src/review/sidebar/TreeTab.tsx`
- Create: `src/review/sidebar/TreeTab.test.tsx`
- Create: `src/review/sidebar/DescriptionTab.tsx`
- Create: `src/review/sidebar/DescriptionTab.test.tsx`
- Create: `src/review/sidebar/ActivityTab.tsx`
- Create: `src/review/sidebar/ActivityTab.test.tsx`
- Modify: `src/styles.css`
- Modify: `e2e/review-flow.spec.ts`

**Interfaces:**
- Consumes: `PreparedPatchFile`, `DiffReview`'s `activePath`/`onActivePathChange`/`onFilesChange`, `provider.getReviewSignals(ref)`, Task 1 Tabs/Chip/Dialog primitives, Task 2 shell.
- Produces: `SidebarProps { files, selectedPath, onSelectPath, pullRequest, currentUserId, provider }`; `TreeTab` stable ID adapter; lazy activity cache; `DiffReview` toolbar control state and full-height CodeView.

- [ ] **Step 1: Pin and inspect `@pierre/trees` before coding**

```bash
pnpm add --save-exact @pierre/trees
```

Inspect the installed package exports and `.d.ts` files. Record whether that exact version exposes a documented remeasure/resize/refresh handle. Use it only if it exists; otherwise implement the spec's viewport-only remount key. Do not invent method names.

- [ ] **Step 2: Write failing adapter/tab tests**

Tests must prove:

```tsx
// Tree: recursive paths, patch-order IDs, selected aria-current, keyboard selection,
// search filtering, collapse/expand, two hide/show cycles with preserved state.
// Description: metadata + plain text; literal HTML remains text and creates no img.
// Activity: no request before activation; one request per PR after repeated activation;
// newest-first loaded state; loading, empty, sanitized error, retry.
```

Run: `pnpm exec vitest run src/review/sidebar`

Expected: FAIL because adapters do not exist.

- [ ] **Step 3: Implement Sidebar, Tree, Description, and Activity**

Keep all tab panels mounted and toggle visibility through Radix state. Keep tree search, expanded-node IDs, and selected path outside the virtualized viewport. Map each `PreparedPatchFile.id`/`.path` one-to-one; preserve the prepared patch order (`presorted: true`). `DescriptionTab` renders text nodes only. Cache activity in a `Map<string, ActivityState>` owned by the open `ReviewScreen`; retry replaces only that entry.

- [ ] **Step 4: Wire bidirectional tree/diff selection without loops**

Keep `selectedPath` in `ReviewScreen`. A tree-originated change sets it and tells `CodeViewHandle.scrollTo`; a diff-originated active-path change sets it but does not echo the scroll back to the CodeView. Represent the origin with a ref or an equality guard and cover it with a regression test.

- [ ] **Step 5: Densify CodeView and expose toolbar controls**

Change the CodeView layout to:

```tsx
layout: { paddingTop: 0, paddingBottom: 0, gap: 1 }
```

Initialize layout once from `matchMedia("(min-width: 768px)")`, persist a manual override in the existing non-secret settings store, and connect split/unified, collapse/expand-all, and Display controls to documented CodeView capabilities. Preserve `disableWorkerPool={!workerPoolEnabled}` exactly. Delete summary/file-nav wrappers and the 42rem max-height CSS; retain loading/error and inline-comment intent behavior.

- [ ] **Step 6: Implement narrow bottom sheet and acceptance E2E**

At 390×844, sidebar trigger opens the same mounted Tree/Description/Activity content in a dialog-backed bottom sheet, default layout is unified, and the exact two toolbar rows remain visible. At desktop sizes assert 49px/320px ±1px. Add two-cycle tree tab, tree-to-diff, diff-to-tree, manual-layout persistence, and no-external-request checks.

- [ ] **Step 7: Verify, record bundle, and commit**

Run sidebar/DiffReview/ReviewScreen unit tests, affected Playwright review tests, `pnpm build`, and full `pnpm verify`. Record the exact bundle counts; if a limit is threatened, lazy-load tree/icon code before considering any budget change.

```bash
git add package.json pnpm-lock.yaml src/review src/styles.css e2e/review-flow.spec.ts
git commit -m "feat: add Pierre review sidebar and dense diff canvas"
```

---

### Task 4: Finish Review dialog, pending comments, and queue chrome

**Files:**
- Modify: `src/review/ReviewScreen.tsx`
- Modify: `src/review/ReviewScreen.test.tsx`
- Modify: `src/review/QueueDrawer.tsx`
- Modify: `src/review/QueueDrawer.test.tsx`
- Create: `src/review/FinishReviewDialog.tsx`
- Create: `src/review/FinishReviewDialog.test.tsx`
- Modify: `src/styles.css`
- Modify: `e2e/review-flow.spec.ts`

**Interfaces:**
- Consumes: existing `PendingReviewComment`, `FinishReviewOutcome`, `FinishReviewReceipt`, `finishReview()` unchanged; Task 1 Dialog/Button; Task 2 toolbar; Task 3 inline intent.
- Produces: local `drafts: PendingReviewComment[]`; `FinishReviewDialogProps`; toolbar-anchored queue panel with unchanged queue data/selection.

- [ ] **Step 1: Write failing dialog and draft-flow tests**

Cover explicit Cancel, Escape, focus trap/restoration, unavailable remote decisions, pending general/inline summaries, sending a draft immediately, finish passing the exact remaining drafts, failure retaining unsent drafts, and existing receipt reuse across retry. Assert `finish-review.ts` tests remain byte-for-byte unchanged.

- [ ] **Step 2: Model pending comments only in `ReviewScreen`**

Use the existing type without changing transaction code:

```tsx
const [drafts, setDrafts] = useState<readonly PendingReviewComment[]>([]);

const toDraft = (text: string, anchor?: InlineCommentAnchor): PendingReviewComment => ({
  id: crypto.randomUUID(),
  text: text.trim(),
  ...(anchor ? { anchor } : {}),
});
```

Reset drafts/inline intent when the PR changes. "Send now" calls the same provider methods used today and removes only the confirmed draft. `finish()` passes `comments: drafts`; `sendComment` selects `addInlineComment` or `addGeneralComment` from the draft anchor. Keep receipt/idempotency handling unchanged.

- [ ] **Step 3: Build the Radix Finish Review dialog**

Render the pending list and optional general input, Cancel, Reviewed, and conditional Approve/Request changes. Disable destructive navigation/actions while `action !== null`. On successful finish, close and advance exactly as today; on failure, leave the dialog and drafts available with sanitized stage copy.

- [ ] **Step 4: Rebuild queue presentation without changing contents**

Use a toolbar-anchored Radix panel/dialog appropriate to viewport, preserve every captured queue entry, `aria-current`, selection lock while finishing, backdrop/Escape close, and current tests. Do not filter completed/reopenable entries.

- [ ] **Step 5: Verify and commit**

Run `ReviewScreen`, `FinishReviewDialog`, `QueueDrawer`, and existing `finish-review.ts` tests plus affected Playwright scenarios, then typecheck/lint/format/build/diff-check.

```bash
git add src/review/ReviewScreen.tsx src/review/ReviewScreen.test.tsx src/review/FinishReviewDialog.tsx src/review/FinishReviewDialog.test.tsx src/review/QueueDrawer.tsx src/review/QueueDrawer.test.tsx src/styles.css e2e/review-flow.spec.ts
git commit -m "feat: integrate compact finish review workflow"
```

---

### Task 5: Full-screen compact Inbox

**Files:**
- Modify: `src/inbox/InboxScreen.tsx`
- Modify: `src/inbox/InboxScreen.test.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`
- Modify: `src/styles.css`
- Modify: `e2e/review-flow.spec.ts`

**Interfaces:**
- Consumes: Task 1 Button/Chip/tokens; existing `InboxLoadSnapshot`, `DEFAULT_QUERY`, `QUICK_FILTERS`, `matchesQuery`, `validateQuery` unchanged.
- Produces: edge-to-edge 49px Inbox toolbar and dense rows with identical behavior/callbacks; App hides the redundant global masthead for Inbox while keeping it on setup screens.

- [ ] **Step 1: Pin behavior with failing presentation tests**

Keep every existing InboxScreen test. Add assertions for semantic toolbar, query input, exact Requested/Unreviewed/Reviewed controls, Manage repositories/Refresh/Lock callbacks, and dense row metadata. Add geometry at 1280×720 and truncation at 390×844.

- [ ] **Step 2: Migrate imports and layout only**

Replace HeroUI `Button`/`Chip` with local primitives and native events. Build the toolbar from compact product identity, query, existing quick filters, source management, refresh/lock, and the shared theme control supplied by App. Hide the global App masthead for `screen === "inbox"` so this toolbar is the only Inbox chrome; keep the masthead on Connect, Vault, and Repository Selection. Preserve validation feedback, progress wording, partial failures, successful rows, empty gating, ordering, and all query/filter logic without moving it.

- [ ] **Step 3: Verify and commit**

Run InboxScreen tests plus Playwright partial-progress, partial-failure, unsupported-query, and cross-repository selection scenarios; then typecheck/lint/format/build/diff-check.

```bash
git add src/app/App.tsx src/app/App.test.tsx src/inbox/InboxScreen.tsx src/inbox/InboxScreen.test.tsx src/styles.css e2e/review-flow.spec.ts
git commit -m "feat: migrate inbox to compact full-screen UI"
```

---

### Task 6: Connect, Vault, source selection, theme hook, and HeroUI removal

**Files:**
- Modify: `src/connection/ConnectScreen.tsx`
- Modify: `src/connection/ConnectionDiagnostics.tsx`
- Modify: their existing tests
- Modify: `src/vault/VaultScreen.tsx`
- Modify: `src/vault/VaultScreen.test.tsx`
- Modify: `src/scope/RepositorySelectionScreen.tsx`
- Modify: `src/scope/RepositorySelectionScreen.test.tsx`
- Modify: `src/ui/ThemeControl.tsx`
- Modify: `src/ui/ThemeControl.test.tsx`
- Create: `src/ui/useThemePreference.ts`
- Create: `src/ui/useThemePreference.test.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`
- Modify: `src/styles.css`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `e2e/smoke.spec.ts`

**Interfaces:**
- Consumes: Task 1 Card/TextField/Button/Chip/theme tokens; existing screen props and state machine.
- Produces: `useThemePreference(): { theme, resolvedTheme, setTheme }`; zero `@heroui/*` imports; centered 30rem setup cards; unchanged native checkbox selection.

- [ ] **Step 1: Write theme-hook tests before replacing HeroUI**

Cover stored System/Light/Dark choice, `matchMedia` resolution/change events, HTML class/attribute updates, and `aria-pressed` compatibility. Use the same non-secret preferences store already used by application settings; do not use credential/vault storage.

- [ ] **Step 2: Implement theme hook and rebuild ThemeControl**

Expose the same public `ThemeChoice` and `ThemeControlProps`. Replace `useTheme("system")` in App with `useThemePreference()`. Keep exact browser-visible behavior from `e2e/smoke.spec.ts`; do not change that test's theme assertions.

- [ ] **Step 3: Migrate Connect and diagnostics**

Replace HeroUI with local Card/TextField/Button/Chip equivalents, native `onClick`/`disabled`, and the fixed 30rem centered card. Keep controlled credential fields, `autocomplete` values, lazy imports, abort/run-id stale-result guard, sanitized errors, and lock/reload clearing exactly as tested.

- [ ] **Step 4: Migrate Vault**

Preserve `MIN_VAULT_PASSPHRASE_LENGTH`, setup/unlock branching, Passkey/Passphrase/Session-only/Use token instead availability, loading disables, and error copy. Do not touch `model.ts`, `crypto.ts`, `store.ts`, or `webauthn.ts`.

- [ ] **Step 5: Migrate Repository Selection**

Keep the two native fieldsets and checkboxes, progressive discovery copy, partial-failure alert, late-page selection preservation, normalization, Cancel, and disabled Continue when empty. Change only container/primitives/events.

- [ ] **Step 6: Remove HeroUI completely**

Before uninstalling, require this command to return no matches:

```bash
rg -n '@heroui/(react|styles)' src
```

Then remove both dependencies and their CSS import:

```bash
pnpm remove @heroui/react @heroui/styles
```

Confirm `@pierre/theme` and `@pierre/theming` remain only as `@pierre/diffs` transitive dependencies.

- [ ] **Step 7: Full verification, bundle accounting, and commit**

Run all affected unit suites, `pnpm verify`, `git diff --check`, and `rg` for HeroUI. Record exact initial/largest-lazy counts and compare with Task 1/3 reports.

```bash
git add src package.json pnpm-lock.yaml e2e/smoke.spec.ts
git commit -m "feat: complete full UI migration and remove HeroUI"
```

---

### Task 7: Whole-product acceptance, accessibility, and integration cleanup

**Files:**
- Modify only files required to fix failures found by this task
- Modify: `docs/PROJECT_STATUS.md`
- Modify: `docs/superpowers/specs/2026-08-27-bitbucket-review-workspace-design.md`
- Modify: `docs/superpowers/specs/2026-09-04-diffhub-inspired-full-ui-design.md`
- Test: all `src/**/*.test.*`
- Test: all `e2e/*.spec.ts`

**Interfaces:**
- Consumes: Tasks 1–6 complete branch.
- Produces: acceptance evidence, current docs, clean dependency/import inventory, and a release-ready branch for integration into `main`.

- [ ] **Step 1: Run static migration audits**

```bash
rg -n '@heroui/(react|styles)|Berkeley Mono|diffshub.*(logo|wordmark)' src package.json pnpm-lock.yaml
rg -n 'https?://' src --glob '!**/*.test.*'
git diff --check
```

Expected: no HeroUI/brand/font matches; runtime URLs remain only intentional Bitbucket/provider constants or documented local assets.

- [ ] **Step 2: Run complete automated acceptance**

```bash
pnpm verify
```

Expected: format, lint, typecheck, all unit tests, production build, bundle budgets, and every Playwright scenario pass. Do not weaken selectors or remove behavior assertions to make the suite green.

- [ ] **Step 3: Inspect the rendered app at required viewports**

Serve the production build and capture Connect, Inbox, and Review at 1280×720, 1440×900, and 390×844. Check no clipping/overlap, exact Review geometry, both themes, independently scrolling panes, toolbar rows, bottom sheet, dialog focus, long PR titles, partial failures, and empty/loading states. Any visual failure becomes a targeted test before its fix.

- [ ] **Step 4: Run an accessibility pass**

Keyboard-only traverse all five screens. Confirm visible focus, tab/arrow behavior, tree Enter, dialog focus trap/return, Escape/Cancel, menu behavior, screen-reader names, reduced motion, and status semantics. Fix only verified failures and add the smallest regression test for each.

- [ ] **Step 5: Update project documentation**

Mark the new design implemented, point the base architecture's superseded HeroUI clauses to the new spec, and update `docs/PROJECT_STATUS.md` with commit range, exact test counts, E2E count, bundle bytes, and known out-of-scope UX_AUDIT items. Do not claim the four explicitly deferred defects are fixed.

- [ ] **Step 6: Final commit**

```bash
git add src e2e docs package.json pnpm-lock.yaml
git commit -m "test: prove DiffHub-inspired UI migration"
```

The controller then requests one broad Claude Code Sonnet branch review against the spec, sends only material findings to one final fix agent, reruns `pnpm verify`, and fast-forwards/cherry-picks the reviewed branch into local `main`. No push is performed unless the user asks.
