# Revelio — DiffHub-Inspired Full UI Migration Design

**Status:** Implemented and verified (Tasks 1–7 of `docs/superpowers/plans/2026-09-04-diffhub-inspired-full-ui-migration.md`, commits `95cab89..bd02eb8` plus the Task 7 acceptance commit). Supersedes the HeroUI-only clauses of `docs/superpowers/specs/2026-08-27-bitbucket-review-workspace-design.md` (see §4); see `docs/PROJECT_STATUS.md` for current test/bundle evidence and `.superpowers/sdd/2026-09-04-diffhub-inspired-full-ui-migration/task-7-report.md` for full acceptance evidence.

**Amendment (later, user-approved):** the Queue button/drawer described below (§10.1 item 3, §14, §20 RV-04) is removed. `src/review/QueueDrawer.tsx` no longer exists. The review sidebar (§11) gains a fourth, first, initially-active `Inbox` tab (`src/review/sidebar/InboxTab.tsx`) that renders this review's actionable list directly from the same inbox snapshot the main inbox screen uses (`src/inbox/review-list.ts`), and a compact, desktop-only toolbar control toggles the sidebar's collapsed/expanded state in the Queue button's old toolbar slot (narrow viewports use the sidebar sheet's own trigger instead). Every other clause below — Tree/Description/Activity, the diff canvas, Finish Review, responsive behavior — is unaffected and remains governing.

**Date:** 2026-09-04

**Scope:** Every screen in the application — Connect, Vault (enrollment and unlock), repository/workspace selection, Inbox, and Review — migrates to a small, DiffHub-inspired local design system. This document is an architectural design, not an implementation plan: it defines the target contract, not a task list. Staged migration boundaries (§20) exist so implementation can proceed in independently verifiable steps, matching the existing phase-gated delivery model in the base architecture (§24 of the base spec).

**Primary sources:**

- `docs/research/2026-09-04-diffshub-review-ui/report-source.md` — primary-source-verified findings on the DiffHub reference (`https://diffshub.com/oven-sh/bun/pull/30412`), its stack, exact dimensions, and licensing constraints. Treated as authoritative for every visual/dimensional claim in this document.
- `docs/superpowers/specs/2026-08-27-bitbucket-review-workspace-design.md` — the base architecture (security model, provider boundary, sync algorithm, Finish Review transaction, module layout, testing strategy). This document narrows and supersedes only the clauses listed in §4; everything else in the base architecture remains in force and is not repeated here except where needed for context.
- `docs/UX_AUDIT.md` — current, code-verified defects in the shipped product. §3 of this document treats those defects as pre-existing and out of scope unless a defect is structurally inseparable from the primitive being replaced (called out explicitly where that happens).
- Current source, read in full for this design: `src/app/App.tsx`, `src/review/ReviewScreen.tsx`, `src/review/DiffReview.tsx`, `src/review/FileTree.tsx`, `src/review/QueueDrawer.tsx`, `src/review/Overview.tsx`, `src/review/finish-review.ts`, `src/vault/VaultScreen.tsx`, `src/vault/model.ts`, `src/vault/store.ts`, `src/inbox/InboxScreen.tsx`, `src/inbox/query.ts`, `src/inbox/load-inbox.ts`, `src/scope/RepositorySelectionScreen.tsx`, `src/styles.css`, `scripts/check-bundle-budget.mjs`, `package.json`, `pnpm-lock.yaml`, `src/ui/ThemeControl.tsx`, `e2e/*.spec.ts`, `e2e/fixtures.ts`.

---

## 1. Goals

1. Replace HeroUI, across the entire application, with a small local primitive layer styled to the DiffHub visual idiom: dense, dark-capable, low-chrome, Tailwind-driven.
2. Give the Review screen the exact full-viewport, two-column, `Tree`/`Description`/`Activity`-sidebar layout measured from the DiffHub reference, using `@pierre/diffs` (already adopted) and `@pierre/trees` (newly adopted) as the rendering engines.
3. Preserve every piece of product behavior the base architecture and current tests already establish: the security model, the progressive-loading algorithm, the actionable-inbox rules, the vault lifecycle, the Finish Review transaction, and the accessibility contract. This is a presentation and component-system migration, not a behavior or provider-boundary change.
4. Resolve the standing conflict between the base architecture's HeroUI-only constraint and the newly approved DiffHub direction explicitly (§4), so no future reader has to guess which document governs.
5. Stay inside a YAGNI/minimal-dependency budget: add only the DiffHub stack pieces this product actually uses, keep Vite, and do not add Next.js, Sonner, Vercel Analytics, or any dependency whose only purpose is visual similarity to DiffHub's own app.
6. Keep the bundle-budget gate (`scripts/check-bundle-budget.mjs`) enforced and passing at its current numeric limits unless a measured, ADR-recorded exception is filed — the same discipline already used for the Diffs worker-pool chunk (ADR 0001).

## 2. Non-goals

1. Changing the security model, credential storage format, CSP, or provider boundary described in the base architecture §6–§9, §16.4.
2. Changing the actionable-inbox semantics, checkpoint model, or Finish Review transaction contract described in the base architecture §9, §10, §14, or `src/review/finish-review.ts`.
3. Fixing functional defects already tracked in `docs/UX_AUDIT.md` that are not structurally entangled with the components this migration replaces. Specifically **out of scope**: the 7-day trusted-browser TTL vs. the documented 15-minute inactivity lock (`src/vault/model.ts:3`); the missing `Direct`/`New commits`/`CI failed` quick filters and unsupported query qualifiers (`src/inbox/InboxScreen.tsx`, `src/inbox/query.ts`); the queue drawer's display of already-finished, reopenable entries (`src/review/QueueDrawer.tsx`); row skeletons during progressive load. These remain tracked in `docs/UX_AUDIT.md` and are unaffected by this migration — the new components reproduce the same behavior, bugs included, unless §3 calls out an exception.
4. **Exception carved out of (3):** the Finish Review confirmation surface currently has no Cancel control, no Escape handling, and no focus trap (UX_AUDIT P1). Because this migration replaces that surface's underlying primitive with a Radix `Dialog` (§13), and an inaccessible, untrappable dialog is not a valid instance of that primitive, the new Finish Review dialog is cancellable, Escape-closable, and focus-trapped as an inherent property of adopting Radix Dialog — not as a deliberately expanded scope. Draft *summarization* inside that dialog (showing pending comments before submission) is likewise adopted because the dialog's content area is being rebuilt anyway and `finishReview()` already accepts a `comments` array; `ReviewScreen.finish()` is changed to pass the actual drafts instead of `[]`. No change to `finish-review.ts` itself.
5. Building a general-purpose component library, a theme marketplace, or configurable design tokens beyond what this product's five screens need.
6. Copying DiffHub's brand, wordmark, or the Berkeley Mono font. See §8.

## 3. What "preserve current behavior" means here

Every item in the base architecture's §7 (security), §9–§10 (state model), §14 (Finish Review transaction), §15 (synchronization), and §19–§20 (loading/errors/accessibility contract) is a hard constraint this migration must continue to satisfy. Where this document is silent on a mechanism the base architecture already specifies, the base architecture's text governs unchanged.

## 4. Supersession of the HeroUI-only constraint

The base architecture states, in three places, that HeroUI is the product's sole component and theme system:

| Base architecture clause | Original text | Disposition |
|---|---|---|
| §11, final paragraph | "Revelio uses HeroUI's default light and dark themes without a custom product palette. Compactness comes from composition, spacing, and information hierarchy built with HeroUI primitives..." | **Superseded.** Inbox compactness now comes from the local primitive layer defined in §7, styled with the tokens in §7.2, not HeroUI. |
| §13.1 | "The review surface contains: 1. Extremely thin sticky top bar. 2. `Changes` and `Overview` tabs. 3. Compact left file tree and dominant content surface. 4. Hidden-by-default right queue drawer." | **Superseded.** Replaced by the full-viewport grid, sidebar tabs (`Tree`/`Description`/`Activity`), and toolbar defined in §10–§11 of this document. |
| §16.1 | "HeroUI v3 through `@heroui/react` and `@heroui/styles` as the only product component and theme system. Tailwind CSS v4 only as HeroUI's required styling runtime and layout utility layer." | **Superseded.** §6 of this document is the new stack decision. Tailwind CSS v4 remains, but as the application's own direct styling engine, not as a dependency of HeroUI. |
| §24, Phase 0.1 and Phase 1 bullets | "Migrate the application shell and product controls to HeroUI v3 default light/dark themes." / "HeroUI application shell and module boundaries." | **Superseded** for any work not already shipped. Already-shipped HeroUI code is migrated away per the staged plan in §20. |
| §25, acceptance criterion 13 | "Product UI uses HeroUI as its sole component/theme system and Diffs uses the native Pierre light/dark themes." | **Superseded** by acceptance criterion in §22 of this document. The Diffs-native-theme half of the original criterion is **retained** — `@pierre/diffs` continues to use its native `pierre-light`/`pierre-dark` themes, unchanged. |
| §16.2, module table, `ui/` row | "HeroUI composition and product-specific adapters" | **Superseded.** Redefined in §7.1 of this document as "local primitive layer: Radix behavior, CVA/clsx/tailwind-merge variants, design tokens. No HeroUI dependency." |

Every other clause of the base architecture — security model, credential lifecycle, provider boundary, synchronization algorithm, Finish Review transaction, module boundaries outside `ui/`, testing strategy, deployment model — is unaffected and remains governing. This document is a narrow, explicit amendment, not a replacement, of the base architecture.

**Decision: HeroUI is fully removed, not partially retained.** The research report's own recommendation ("The review route may use these local shadcn-style primitives while HeroUI stays in the inbox, connection, and vault screens... A whole-app HeroUI migration is not required") described a narrower option than what was actually approved. The user's explicit instruction supersedes that narrower research recommendation for this specific point: the approval given was for the **entire** product UI, not the review route alone. Running two component/theme systems side by side (HeroUI plus a local Radix-based layer) permanently would violate the base architecture's own principle of minimal dependencies and abstractions (§5.7) more than a full, staged migration does. §20 defines the removal point as stage RV-07, gated on every other screen having shipped its replacement with equivalent test coverage.

## 5. Approved visual direction (from the research report)

Measured from the live DiffHub reference at 1280×720 (all values ✓ verified in the research report, not re-derived here):

- Full `100dvh` workspace, no page scroll at the app-shell level for the Review screen.
- 49 px toolbar spanning the full width.
- 320 px fixed left sidebar with three sections: `Tree`, `Description`, `Activity`.
- One independently scrolling `@pierre/diffs` `CodeView` filling all remaining width and height.
- Desktop breakpoint at 768 px.
- Toolbar controls mostly 32×32 px with 12–16 px icons; sidebar tab/search icons 16×16 px; tree row height 24 px.
- Chrome type generally 14 px; dark shell background `#101010`.
- Split diff mode by default on desktop.
- `CodeView` layout `{ paddingTop: 0, gap: 1, paddingBottom: 0 }`; tree density override `0.8` with 8 px inline padding; `flattenEmptyDirectories: true`; `initialExpansion: "open"`; `presorted: true`; sticky folders; search enabled.

This document adopts these values as-is for the Review screen (§10–§12) and adapts the same density language (14 px chrome type, 8/12/16 px control sizing, thin toolbars, minimal padding) for Inbox, Connect, Vault, and Repository Selection (§9), without attempting to reproduce a fullscreen two-column grid on screens that have no DiffHub reference equivalent.

## 6. Stack decisions

### 6.1 Added

| Package | Purpose | Pin policy |
|---|---|---|
| `@pierre/trees` | Recursive, virtualized file tree for the sidebar `Tree` tab; replaces `src/review/FileTree.tsx`'s flat parent-directory grouping. | Exact pin to the latest stable release compatible with React 19 at implementation kickoff, no `^`/`~` range — same policy already used for `@pierre/diffs` in ADR 0001. |
| `@pierre/icons` | Compact iconography for the review toolbar, sidebar tabs, and tree rows, matching the reference's icon sizing. Used selectively elsewhere (§8.2) — not adopted as a blanket icon system for every screen. | Exact pin, same policy. |
| `@radix-ui/react-tabs` | Accessible `Tree`/`Description`/`Activity` sidebar tabs and any other tabbed surface the local primitive layer needs. | Exact pin. |
| `@radix-ui/react-dialog` | Finish Review confirmation, and any other modal surface. | Exact pin. |
| `@radix-ui/react-dropdown-menu` | Toolbar "Display" menu (line numbers, wrapping, diff indicators). | Exact pin. |
| `@radix-ui/react-tooltip` | Icon-only toolbar/tab tooltips (Back, collapse-all, diff-mode toggle). | Exact pin. |
| `@radix-ui/react-slot` | Polymorphic `asChild` support for the local `Button`/`Link` primitives built with CVA. | Exact pin (promoted from HeroUI's transitive dependency to a direct one; see §6.3). |
| `class-variance-authority` | Variant definitions for local primitives (`Button`, `Chip`, `Card`, etc.). Genuinely new — absent from the lockfile today. | Exact pin, latest stable at implementation kickoff. |
| `clsx` | Class-name composition helper for the local primitives. | Exact pin (promoted from transitive; see §6.3). |
| `tailwind-merge` | Conflict-safe Tailwind class merging for the local primitives' `cn()` helper. | Exact pin (promoted from transitive; see §6.3). |

No other package from the DiffHub manifest is adopted. Explicitly rejected, with reasons already established by the research report and reaffirmed here: Next.js (Vite stays, per the user's explicit constraint), Sonner (no toast requirement exists in this product), Vercel Analytics (the product has no telemetry, by design — base architecture §7.1), `@pierre/theme` and `@pierre/theming` as **direct** dependencies (§6.4), Berkeley Mono (§8.1, license-incompatible with an open-source app).

### 6.2 Removed

| Package | Removed at | Reason |
|---|---|---|
| `@heroui/react` | Stage RV-07 | Superseded per §4; last consumer migrated in RV-06. |
| `@heroui/styles` | Stage RV-07 | Same. Its `@import` in `src/styles.css` is deleted in the same stage. |

### 6.3 Unchanged, but reclassified

`@pierre/theme` and `@pierre/theming` sit in `pnpm-lock.yaml` today as transitive dependencies of `@pierre/diffs` (verified: `pnpm-lock.yaml`'s `@pierre/diffs@1.3.6` dependency block lists both packages directly; `@heroui/react`'s own dependency block lists neither). Because `@pierre/diffs` is retained by this migration (Goal 2), both packages remain in the lockfile after RV-07 regardless of HeroUI's removal — **RV-07's bundle-budget measurement (§19) must not credit HeroUI removal with their byte weight**; only `@heroui/react`/`@heroui/styles` and whatever they alone pulled in are expected to shrink the bundle at that stage. This does not change the decision in §6.4: `@pierre/theme`/`@pierre/theming` stay present only as `@pierre/diffs`' own transitive dependencies, never as packages this product's code imports or calls directly.

Most of the Radix primitives, plus `clsx` and `tailwind-merge`, are also already in `pnpm-lock.yaml` today, but as transitive dependencies pulled in by `@heroui/react` — the application never imports them directly (verified: no `src/` import matches). Once HeroUI is removed (RV-07), any of these that the local primitive layer still needs (`clsx`, `tailwind-merge`, `@radix-ui/react-slot`) must already be **direct** dependencies with their own pinned versions — added starting at RV-00 (§20) precisely so their availability never depends on HeroUI still being present mid-migration. `@radix-ui/react-tabs`, `-dialog`, `-dropdown-menu`, and `-tooltip` are not already present transitively and are added fresh.

### 6.4 `@pierre/theme` / `@pierre/theming` — explicit non-adoption

The research report flags these as optional, needed only if the product adopts DiffHub's full cross-surface theme catalog. Revelio already owns light/system/dark preference resolution and already passes a resolved `themeType` into `@pierre/diffs`' `CodeView` (`DiffReview.tsx`, current `themeType` prop). That existing one-line mapping — Revelio's resolved theme string in, `pierre-light`/`pierre-dark` out — is simpler than adopting Pierre's theme catalog and continues unchanged by this migration. **Decision: do not add `@pierre/theme` or `@pierre/theming` as direct dependencies.** This is revisited only if a later product requirement needs Pierre's full theme catalog (e.g., multiple named code themes), which is not part of this migration.

### 6.5 Styling engine

Tailwind CSS v4 (`tailwindcss`, `@tailwindcss/vite`) is already a dependency and remains one. Before RV-07 it serves both HeroUI's styling runtime and the new local primitives; after RV-07 it is the application's own direct styling engine — no HeroUI-specific Tailwind preset or plugin exists today (verified: `src/styles.css` contains exactly two `@import` lines, `tailwindcss` and `@heroui/styles`, with no HeroUI Tailwind plugin registration), so removing HeroUI requires no Tailwind configuration change beyond deleting the second `@import`.

## 7. Design tokens and local primitives

### 7.1 Module placement

`src/ui/` is redefined (superseding the base architecture's `ui/` row in §16.2) as: **local design-system primitives — Radix behavior, CVA/clsx/tailwind-merge variants, and design tokens. No HeroUI dependency, no product-specific business logic.** Its existing two files (`ThemeControl.tsx` and its test) are rebuilt on the new primitives, not deleted — the theme control remains a real product feature, now composed from local parts instead of `@heroui/react`'s `Button`/`ButtonGroup`.

New files added under `src/ui/`:

```text
src/ui/
  tokens.css        CSS custom properties: color scale, spacing scale, radii, type scale, breakpoints
  cn.ts             clsx + tailwind-merge composition helper
  Button.tsx        CVA-based button (primary/secondary/ghost/icon variants)
  IconButton.tsx     32x32/24x24 icon-only button variant, always paired with a Tooltip and an accessible name
  Card.tsx          Bordered container for Connect/Vault/RepositorySelectionScreen
  TextField.tsx     Label + Input composite (replaces HeroUI's Label/Input/TextField trio)
  Chip.tsx          Small status/label pill (replaces HeroUI's Chip/Badge)
  Tabs.tsx          Radix Tabs wrapper with the project's focus/ArrowLeft-ArrowRight styling
  Tooltip.tsx       Radix Tooltip wrapper
  DropdownMenu.tsx  Radix Dropdown Menu wrapper
  Dialog.tsx        Radix Dialog wrapper (focus trap, Escape, Cancel slot built in)
  ThemeControl.tsx  Rebuilt on Button/IconButton; same public props and DOM contract as today (§9.5)
```

### 7.2 Tokens (`src/ui/tokens.css`)

A single CSS custom-property sheet, loaded once at the app root, replacing `@import "@heroui/styles"`:

- **Color:** a neutral gray scale (`--gray-50` … `--gray-950`) plus semantic aliases (`--bg`, `--bg-muted`, `--fg`, `--fg-muted`, `--border`, `--accent`, `--danger`, `--success`) resolved per theme via `[data-theme="light"]` / `[data-theme="dark"]` attribute selectors on `<html>` — the same attribute-based mechanism the app already uses today (see §9.5), so no new theme-resolution wiring is invented, only re-implemented without HeroUI's `useTheme`.
- **Spacing/sizing:** `--space-1` (4px) through `--space-8` (32px); `--control-sm` (24px), `--control-md` (32px) for icon buttons; `--toolbar-h` (49px); `--sidebar-w` (320px); `--tree-row-h` (24px) — all taken directly from the measured DiffHub values in §5.
- **Type:** `--font-ui` (Geist stack, §8.1), `--font-mono` (system monospace stack, §8.1), `--text-sm` (14px, the chrome default), `--text-xs` (12px).
- **Breakpoints:** `--bp-sm: 480px`, `--bp-md: 768px`, `--bp-lg: 1024px`. **Decision:** these three tokens replace every hardcoded breakpoint in the codebase, including the current ad hoc `900px` and `680px` values in `src/styles.css`. `768px` (`--bp-md`) becomes the single sidebar/tree collapse breakpoint for Review, matching the DiffHub reference exactly; Inbox and the setup screens reflow at the same tokens rather than inventing their own.
- **Radius:** `--radius-sm` (4px), `--radius-md` (6px) — DiffHub's chrome uses small, consistent radii; no token for a larger "card" radius is defined because no surface in the new design uses one.

### 7.3 Why no shadcn CLI / component copy step

The research report notes that shadcn/ui distributes component *source*, not a runtime package. This design does not run the shadcn CLI or vendor its generated files verbatim; the eleven files listed in §7.1 are hand-written against the same Radix primitives and the same CVA/`cn()` pattern shadcn's `new-york`/`neutral` recipe uses, sized to exactly what these five screens need. This keeps the primitive layer auditable in a handful of files instead of importing a larger generated surface area, consistent with Goal 5.

## 8. Fonts and iconography

### 8.1 Fonts — explicit, final decision

- **UI chrome text:** self-hosted Geist (variable, Latin subset only), added as static WOFF2 assets under `src/assets/fonts/` with an `@font-face` rule in `tokens.css` and `font-display: swap`. Geist is OFL-licensed and open source; self-hosting keeps it inside the existing CSP (`font-src 'self'`, base architecture §7.3) with no policy change. This matches the research report's explicit recommendation.
- **Code/diff monospace:** the existing system monospace stack (`ui-monospace, ...`) is **retained, unchanged**. **Decision:** no new monospace font is added. The research report explicitly sanctions this as one of two compliant options (the other being a self-hosted JetBrains Mono); retaining the system stack costs zero new bytes and the visual density parity with DiffHub comes from the layout numbers in §5 (row height, gap, padding), not the glyph shapes. Berkeley Mono, DiffHub's actual code font, is commercial and its vendor explicitly disallows redistribution in open-source apps (research report, "Do not copy") — it is never considered.
- Both decisions apply to the whole app, not just Review — Connect/Vault/Inbox/RepositorySelectionScreen chrome text also moves to Geist; none of them use a monospace font today or need one.

### 8.2 Icons — explicit, final decision

`@pierre/icons` is used for: the review toolbar (back, split/unified toggle, collapse-all, display menu, theme), the sidebar tab triggers (`Tree`/`Description`/`Activity`), and tree-row status glyphs (added/modified/deleted, git status). It is **not** adopted as a general icon system for Connect, Vault, or RepositorySelectionScreen — those screens keep today's text-first, icon-minimal presentation (e.g., a warning banner is a colored text row with an accessible label, not a decorated icon component), because they have no DiffHub reference to match and adding icon dependencies there would be scope beyond what those screens need. The one exception is the theme control and lock affordance shared across every screen (§9.5), which already benefits from a compact icon+label pattern and reuses whatever `@pierre/icons` glyphs already exist for that purpose rather than sourcing a second icon package.

## 9. App shell behavior, per screen

### 9.1 Global rule: the Revelio masthead

`src/app/App.tsx` currently renders its `<header className="app-shell app-header">` (product name, eyebrow, theme control) unconditionally, on every `screen` value including `"review"` (verified: lines 796–804, no conditional guard exists today). **Decision:** the masthead renders on the centered setup-flow screens (`"connect"`, `"unlock"`, `"vault-setup"`, and `"select-sources"`) and is absent from the two full-screen work surfaces (`"inbox"` and `"review"`). Review and Inbox each own a 49 px toolbar containing compact product identity and the same theme control (§9.5, §9.6, §10), so retaining the global masthead on either route would duplicate both chrome and theme actions. The condition changes presentation only; the state machine is unchanged.

### 9.2 Connect

Rebuilt on `Card`, `TextField`, `Button` from `src/ui/` in place of `@heroui/react`'s `Card`/`Input`/`Label`/`TextField`/`Button`. Layout: a single centered `Card` at a fixed `30rem` max width (a DiffHub-density-appropriate reduction from the base architecture's current `72rem` `.app-shell` width, which was sized for HeroUI's default card padding, not for this design's tighter chrome). Same three storage-mode choices (Passkey / Passphrase / Session-only), same copy, same feature-detection behavior — this screen's *logic* (`src/connection/ConnectScreen.tsx`, `ConnectionDiagnostics.tsx`) is unchanged; only its HeroUI imports are swapped for local primitives.

### 9.3 Vault (enrollment and unlock)

`src/vault/VaultScreen.tsx` is rebuilt on the same local `Card`/`TextField`/`Button` primitives, same `30rem` centered card, same two modes (`"setup"` / `"unlock"`), same passphrase-length messaging sourced from `MIN_VAULT_PASSPHRASE_LENGTH`. No change to `src/vault/model.ts` or `src/vault/store.ts` — the 7-day trusted-browser TTL defect is out of scope per §2.

### 9.4 Repository/workspace selection

`src/scope/RepositorySelectionScreen.tsx` keeps its two-`<fieldset>` native-checkbox structure (native checkboxes are the correct primitive here per the YAGNI ladder — no Radix checkbox is introduced for a control HTML already provides for free) and its discovery-progress/failure-banner behavior unchanged. Its one HeroUI import (`Button`, for Cancel/Continue) becomes the local `Button`. Container width matches Connect/Vault's `30rem` card for visual consistency across the three setup-flow screens.

### 9.5 Theme control — DOM contract preserved exactly

`e2e/smoke.spec.ts`'s second test asserts, against the rendered app, that clicking "Dark" adds class `dark` and attribute `data-theme="dark"` to `<html>`, and that clicking "System" sets `aria-pressed="true"` on the System button. **Decision:** the rebuilt `ThemeControl` and its underlying theme-resolution hook (`src/ui/useThemePreference.ts`, new — replaces HeroUI's `useTheme("system")` call in `App.tsx`) must reproduce this exact DOM contract: `<html class="dark" data-theme="dark">` for dark, no `dark` class and `data-theme="light"` for light, `aria-pressed="true"` on whichever of System/Light/Dark button is active. This is a hard requirement, not a suggestion, so that `e2e/smoke.spec.ts` needs no rewrite for this specific behavior (it is rewritten for other reasons per §21). The hook reads `window.matchMedia("(prefers-color-scheme: dark)")` for the System option and stores an explicit override using the same non-secret local-preferences mechanism the app already uses for other settings (base architecture §8.1) — no new persistence primitive is introduced.

### 9.6 Inbox

Inbox becomes a fullscreen, edge-to-edge dense list — the other screen, besides Review, that a reviewer spends real time in, so it adopts the same thin-toolbar density language as Review rather than the centered-card treatment given to the one-time setup screens. Concretely:

- A shared `--toolbar-h` (49px) top bar: product identity (compact, replacing the current large "Revelio" `<h1>` + eyebrow treatment), the query input, quick-filter buttons, theme control, and a manage-sources affordance.
- Rows below the toolbar fill the full viewport width, no `72rem`/`96rem` cap.
- **Unchanged, verified:** `DEFAULT_QUERY`, `QUICK_FILTERS` (Requested/Unreviewed/Reviewed), `SUPPORTED_QUALIFIERS`, ordering, partial-failure and unsupported-query rendering (`src/inbox/InboxScreen.tsx`, `src/inbox/query.ts`, `src/inbox/load-inbox.ts`) — this migration touches only the two HeroUI imports (`Button`, `Chip`) in `InboxScreen.tsx`, replacing them with local `Button`/`Chip`, and the surrounding layout markup/CSS. No query-language or filter-availability change is in scope (§2.3).

## 10. Review workspace — exact layout

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ 49px toolbar: Back · repo/PR identity · Queue (N) · split/unified ·      │
│               collapse-all · Display ▾ · theme · Finish Review          │
├──────────────────────┬───────────────────────────────────────────────────┤
│ 320px sidebar        │ one CodeView, full remaining width/height        │
│ [Tree][Desc][Activity]│ sticky per-file headers; split by default (≥768px)│
│                      │                                                   │
│ active tab's content │                                                   │
│ (independently        │                                                   │
│  scrolling)          │                                                   │
└──────────────────────┴───────────────────────────────────────────────────┘
```

- Root: `height: 100dvh; width: 100%; overflow: hidden` — replaces today's `.review-page { width: min(100% - 1.5rem, 96rem) }` (`src/styles.css:239`), which is deleted.
- CSS grid: rows `var(--toolbar-h) minmax(0, 1fr)`; columns `var(--sidebar-w) minmax(0, 1fr)` at ≥768px (§15 for the narrow layout). The toolbar spans both columns.
- No surrounding card, no page margin, no global masthead (§9.1).
- The sidebar has a right hairline border (`1px solid var(--border)`); only the sidebar's active-tab body and the `CodeView` scroll independently. The toolbar never scrolls.
- The first diff file begins at the top of the viewer — no summary strip, no comment composer above the diff (the composer moves into Finish Review, §13).

### 10.1 Toolbar contents, left to right

1. `IconButton` — Back to inbox (tooltip "Back to inbox").
2. Compact PR identity: `{workspace}/{repo} #{number}`, title truncated to one line, optional external Bitbucket link icon when available.
3. `Button` — Queue, showing the remaining count (`Queue ({queue.length})`, same text contract as today's `ReviewScreen.tsx` Queue button) — text-labeled, not icon-only, because it changes workflow state.
4. `IconButton` group — split/unified toggle (two `IconButton`s or one two-state toggle, tooltipped).
5. `IconButton` — collapse/expand all files.
6. `DropdownMenu` — Display (line numbers, wrapping, diff indicators).
7. `ThemeControl` — same component as every other screen (§9.5), compacted to icon-button size here.
8. `Button` — Finish Review, the only visually explicit primary action on the toolbar (filled/accent variant; everything else is a ghost/icon variant).

### 10.2 File removed/replaced

- `src/review/FileTree.tsx` is **deleted**, replaced by the `@pierre/trees`-based `Tree` tab (§11.1). Its self-documented `ponytail:` limitation (flat parent-directory grouping, not a real recursive tree) is resolved as a direct consequence of adopting a real tree library, not as separate scope.
- `src/review/Overview.tsx` is **deleted**; its content is redistributed into the `Description` and `Activity` sidebar tabs (§11.2–§11.3). No new provider call is introduced — both tabs consume data Overview already fetched.
- `src/review/QueueDrawer.tsx` is rebuilt as a `Dialog`-or-`DropdownMenu`-anchored panel opened from the toolbar's Queue button rather than a fixed full-height overlay drawer; its **contents and selection logic are unchanged** (§2.3) — it still renders the full captured `queue` array with `aria-current` on the active entry. Only its trigger affordance and visual chrome change.

## 11. Sidebar data flow — Tree / Description / Activity

The sidebar is a Radix `Tabs` instance (`src/ui/Tabs.tsx`) with three triggers, each a 16 px `@pierre/icons` glyph plus tooltip plus accessible name, supporting ArrowLeft/ArrowRight per the base architecture's keyboard contract (§20). Switching tabs preserves each tab's own scroll position and internal state (search text, collapsed tree nodes, loaded activity) — tabs are kept mounted (`display: none` on the inactive panel, not unmounted) so state is not lost on switch, matching acceptance criterion 5 in §22.

**Decision — Tree remeasurement on tab reactivation:** keeping the inactive `Tree` panel mounted at `display: none` conflicts with `@pierre/trees`' virtualization, which measures its scroll container's dimensions to decide which rows to render; a container with `display: none` reports zero size, so the virtualizer's cached measurements can go stale while hidden and produce missing or misaligned rows once the panel is shown again. This migration requires, in order of preference, checked once against the `@pierre/trees` version actually pinned at RV-02 kickoff (§20):

1. If that pinned version exposes a documented refresh/resize/remeasure method on its tree ref/handle — verified against that version's own published API, not assumed or invented — `TreeTab` calls it in an effect keyed on the `Tree` tab's `data-state="active"` transition, before the panel becomes visible.
2. If no such documented API exists in the pinned version, only `TreeTab`'s internal virtualized viewport component is remounted via a React `key` that changes on each `Tree`-tab activation, forcing a fresh measurement pass. Search text, expanded-node state, and the selected/highlighted row live in `TreeTab`'s (or `ReviewScreen`'s, matching `activePath`) own state, outside that viewport component, so remounting it discards only the virtualizer's internal row cache — never the tree's user-visible state.

Either way, the requirement is behavioral, not a specific API name: correct rows and preserved search/expanded/selection state after repeated Tree ↔ other-tab cycling, verified by the test in §21.3.

### 11.1 Tree

- New component `src/review/sidebar/TreeTab.tsx`, wrapping `@pierre/trees/react`.
- Data source: the same file list `DiffReview.tsx` already derives from the parsed patch (`ParsedPatch`/`FileDiffMetadata`, per ADR 0001) — no new fetch or parsing step. `TreeTab` receives that file list as a prop from `ReviewScreen`, exactly where `FileTree` receives it today.
- Configuration mirrors the measured reference exactly (§5): row height `24`, density override `0.8`, `8px` inline padding, `flattenEmptyDirectories: true`, `initialExpansion: "open"`, `presorted: true` (preserve patch order, do not alphabetize), sticky folders, built-in search.
- Remeasurement on tab reactivation implements the requirement stated in §11 exactly: a documented `@pierre/trees` refresh/resize API if the pinned version exposes one, otherwise a remount key scoped to the internal virtualized viewport only, with search/expanded/selection state kept outside that component.
- Selection: clicking a tree row calls `CodeViewHandle.scrollTo` with the file's stable item ID — the same stable-ID contract `DiffReview.tsx` already exposes via its `activePath`/`onActivePathChange` props (verified in the current component). `CodeView` scroll position updates the tree's highlighted row via the same `activePath` state, one level up in `ReviewScreen`, without stealing keyboard focus from whichever surface the user is interacting with (base architecture §19.1's "never steal keyboard focus during refresh" principle extended to this sync loop).
- Addition/deletion totals stay in the diff's own sticky file headers, not duplicated onto every tree row (per the research report's explicit density guidance).

### 11.2 Description

- New component `src/review/sidebar/DescriptionTab.tsx`.
- Data source: `PullRequestSummary.description`, already loaded before Review opens — no new fetch.
- Renders as plain text today, preserving paragraph breaks; if Markdown rendering is added later, it must render locally with HTML execution disabled and remote images blocked, continuing the base architecture's existing "PR Markdown does not execute HTML" / "remote images blocked by default" boundary (§7.1, §7.3) rather than injecting Bitbucket's server-rendered HTML description.
- A compact metadata block (repository, source→target branch, author, reviewers with their decision `Chip`, same `latestDecision()` logic `Overview.tsx` has today) sits above the description text, carrying over `Overview.tsx`'s reviewer/decision rendering verbatim.

### 11.3 Activity

- New component `src/review/sidebar/ActivityTab.tsx`.
- Data source: `provider.getReviewSignals(pullRequest.ref)` — the exact call `Overview.tsx` already makes on mount today. **Decision:** the call moves from "on `ReviewScreen` mount" to "on first `Activity` tab activation," matching the research report's lazy-load guidance, and is cached in a `ReviewScreen`-level `Map` keyed by PR ref for the lifetime of the open review so re-opening the tab does not re-fetch (avoiding duplicate reads against the same endpoint the Inbox screen may also be polling, per the research report's "Activity tab duplicates inbox reads" risk).
- Newest-first timeline; distinct icon per `ReviewSignalKind` (comment, approval, request-changes, PR update) — icons are supplementary, never the sole signal (base architecture §20, "status never relies on color alone," extended to icon-alone).
- Four explicit states: loading (skeleton rows), loaded, empty ("No activity yet."), and error/partial with an inline retry action that re-issues only the `getReviewSignals` call, not the whole PR load.

## 12. Diff canvas changes

`src/review/DiffReview.tsx`'s `CodeView` options change from today's `{ paddingTop: 0, paddingBottom: 0, gap: 12 }` to `{ paddingTop: 0, paddingBottom: 0, gap: 1 }`, matching §5 exactly. The bounding wrapper `.review-card`/`.diff-view` CSS (`src/styles.css:330–332`, `:368–373`, including the `max-height: 42rem` / `min-height: 18rem` cap) is deleted — the `CodeView` now fills the grid's second column at full height, with `overflow` handled by the grid cell, not a fixed-height inner box.

- **Split/unified default:** today's `DiffReview.tsx` hardcodes `useState<"unified" | "split">("unified")` regardless of viewport. **Decision:** default becomes `split` at ≥768px and `unified` below 768px, computed once on mount from `window.matchMedia(\`(min-width: 768px)\`)`, matching base architecture §13.2's already-specified (but not yet implemented) "wide screens default to split; narrow screens default to unified" rule — this migration is what finally implements that existing requirement, it does not introduce a new one. A manual override, once chosen, persists for the session via the same local-preferences mechanism used for other diff/accessibility preferences (base architecture §8.1).
- Sticky per-file headers, line-hover on the gutter, line selection, and the gutter comment affordance are added as documented `CodeView` options — no change to `disableWorkerPool` wiring or the `diffs-worker-gate` compatibility check (ADR 0001, base architecture §17, §26 fallback rule remain exactly as specified).
- `hideFileNav` stays `true` when a `TreeTab` is present (it already is when `FileTree` is present today) — no duplicate file-navigation UI.
- File-level inline-comment affordance (today's single "Comment on {path} line {line}" button, `DiffReview.tsx`) is retained as-is for this migration; per-line gutter comment creation is a `CodeView` option this migration enables but whose comment-authoring UX is unchanged from today's single-anchor-per-file model. Expanding to true per-line comment authoring is not required by this migration and is not blocked by it.

## 13. Finish Review and comments

The confirmation surface (`src/review/ReviewScreen.tsx`'s inline `<section role="dialog">`, today rendered directly in the page flow with no Cancel/Escape/focus-trap) is rebuilt on `src/ui/Dialog.tsx` (Radix `Dialog.Root`/`Dialog.Content`), which provides focus trapping, `Escape`-to-close, and an explicit Cancel action as inherent primitive behavior (§2, exception 4). Its content:

1. A summary list of pending inline drafts and the optional general/overall comment, sourced from the same in-memory draft state `ReviewScreen.tsx` already tracks.
2. The three existing outcome actions — Approve, Request changes (only when `provider.capabilities.canWriteReviews`), Reviewed without status — unchanged.
3. "Send now" remains available as an explicit secondary action for a draft the user wants to post immediately rather than bundle into Finish Review, per the research report's explicit guidance not to remove that option.

**Decision:** `ReviewScreen.finish()` is changed to call `finishReview()` with the actual accumulated draft comments instead of today's hardcoded `comments: []`. `src/review/finish-review.ts` itself — its five-stage transaction, `FinishReviewError`/receipt retry model, and idempotency guarantees — is **unchanged**; it already accepts a `comments` array and was simply never given one. This is the one place where this migration's component rebuild and a UX_AUDIT-tracked defect (draft summarization missing from Finish Review) are the same code path, so fixing it is a natural consequence of rebuilding the dialog, not separate scope creep.

## 14. Queue affordance — scope boundary

**Superseded by the top-of-document amendment.** The Queue button/drawer described in this section is removed; the review sidebar's `Inbox` tab is the review sequence instead, and it does exclude checkpointed entries — the current/upcoming-only behavior this section places out of scope is exactly what the replacement provides. Retained below only as the historical record of what RV-04 originally shipped.

The Queue button opens a panel listing `queue` (the `PullRequestSummary[]` captured by `App.tsx`'s `actionableQueue()` when review started), marking the current entry with `aria-current="true"`. **This migration changes only the panel's trigger and visual chrome** (from a fixed-position slide-in drawer to a toolbar-anchored panel styled with the new tokens). It does **not** change which entries the panel shows — the panel continues to render every entry in `queue`, including ones already finished earlier in the session, exactly as `QueueDrawer.tsx` does today. Filtering the queue to current-and-upcoming-only is the UX_AUDIT-tracked defect this document explicitly places out of scope (§2.3); doing so here would silently expand this migration's blast radius into `App.tsx`'s queue-capture logic, which this document does not otherwise touch.

## 15. Responsive behavior

- **≥768px (`--bp-md`):** Review keeps the fixed 320px sidebar exactly as specified in §10. Inbox and the setup screens use their full-width/centered-card layouts as specified in §9.
- **<768px:** Review's sidebar becomes a bottom-sheet overlay (a `Dialog`-based sheet, not a persistent column) triggered from a toolbar icon, containing the same `Tree`/`Description`/`Activity` tabs; the diff canvas defaults to `unified` (§12). The toolbar wraps onto a second row only below 768px — it never grows past 49px tall at ≥768px, matching the reference exactly.

  **Decision — two-row toolbar composition below 768px** (§10.1's eight-item list no longer fits one 49px-tall row at narrow widths):
  - **Row 1:** Back, the PR identity block, Finish Review — in that order. The PR identity block truncates its text (repository/PR title) to make room; it never displaces or hides Finish Review, which stays visible and clickable in Row 1 at every width down to 320px.
  - **Row 2:** Queue, the split/unified toggle, collapse/expand-all, the Display dropdown, and the theme control, in that order.
  - Both rows satisfy the base architecture's touch-target requirement (§20) via padding, not by exceeding 49px per row.
- **<480px (`--bp-sm`):** Inbox rows and the Review toolbar's PR-identity block truncate further (already-established truncation behavior, now driven by the shared token instead of the ad hoc `680px` breakpoint in today's `src/styles.css:420`).
- Touch targets expand via padding, not by increasing the 24px tree row height or 49px toolbar height on desktop — this is the base architecture's existing accessibility requirement (§20), carried forward unchanged.

## 16. Loading, empty, and error states

| Surface | Loading | Empty | Error/partial |
|---|---|---|---|
| Tree tab | Skeleton rows matching 24px row height | N/A — a diff always has at least one file when the tab is reachable | N/A — tree data comes from the already-loaded patch, not a separate fetch |
| Description tab | N/A — description is already loaded before Review opens | "No description provided." (existing `Overview.tsx` copy, carried over) | N/A |
| Activity tab | Skeleton rows on first activation (§11.3) | "No activity yet." | Inline retry action scoped to `getReviewSignals` only (§11.3) |
| Diff canvas | Existing patch-loading state, unchanged | N/A | Existing diff/comment-mismatch handling (base architecture §19.2), unchanged |
| Inbox | Existing progressive-snapshot rendering and skeleton gap (base architecture §19.1; skeleton rows themselves remain the tracked UX_AUDIT P2 gap, unchanged by this migration) | Existing "All caught up" contract (base architecture §19.3), unchanged | Existing partial-failure/unsupported-query rendering (§9.6), unchanged |
| Connect/Vault/RepositorySelectionScreen | Existing `status: "idle"/"loading"/"error"` handling in `App.tsx`, unchanged | N/A | Existing error copy and Replace-token/Retry affordances, unchanged |

No new loading/empty/error state is introduced anywhere that did not already have one; this migration re-skins existing states onto the new primitives, plus adds the two new Activity-tab states described in §11.3 (which itself replaces `Overview.tsx`'s activity rendering, so this is a relocation, not a net-new surface).

## 17. Keyboard and accessibility contract

All of the base architecture's §20 requirements apply unchanged and are reaffirmed here, extended with primitive-specific specifics this migration introduces:

- Sidebar `Tabs`: ArrowLeft/ArrowRight moves between `Tree`/`Description`/`Activity` triggers (Radix `Tabs` default behavior), Enter/Space activates, each trigger has a visible focus ring and an accessible name distinct from its tooltip text.
- `Tree` rows: Arrow keys move focus, Enter selects and scrolls the diff, matching the keyboard contract `FileTree.tsx` already implements today (carried over into the `@pierre/trees` adapter's keyboard configuration).
- Finish Review `Dialog`: focus moves to the dialog on open and returns to the triggering Finish Review button on close (Radix default); Escape closes without submitting; Tab/Shift+Tab cannot leave the dialog while open.
- `DropdownMenu` (Display) and `Tooltip` (icon buttons): both keyboard-operable and screen-reader-labeled via Radix's built-in ARIA wiring — no custom ARIA is hand-rolled where Radix already provides it correctly.
- The `/` -focuses-query and Cmd/Ctrl+K-opens-commands requirements from the base architecture §20 remain **unimplemented today** (UX_AUDIT P1) and remain out of this migration's scope per §2.3 — this document does not claim to add them.
- Reduced-motion preference is honored in any new transition (sidebar collapse/expand, dialog open/close) via `prefers-reduced-motion`, consistent with the base architecture's existing requirement.

## 18. Security and privacy boundaries

No change to the base architecture's security model (§7). Specifically reaffirmed for this migration:

- No new runtime third-party script, CDN, font-loading service, or analytics is introduced. Geist (§8.1) is self-hosted; `@pierre/trees`/`@pierre/icons`/Radix packages are build-time npm dependencies bundled into the same static output, not runtime CDN loads.
- No CSP change is required: the new fonts are served from `'self'` (already permitted by `font-src 'self'`); no new external `connect-src` origin is introduced; `@pierre/trees` performs no network I/O of its own (it renders a file list already in memory).
- The Description tab continues to render PR text without executing HTML and without loading remote images (§11.2), preserving the existing Markdown-safety boundary (base architecture §7.1, §7.3).
- `e2e/fixtures.ts`'s `browserGuards` invariant — failing any test on an unexpected console error or a network request to any origin other than the local dev server or `https://api.bitbucket.org` — continues to run, unmodified, against every screen rebuilt by this migration.

## 19. Bundle and performance budgets

Current measured state (verified): `scripts/check-bundle-budget.mjs` enforces an initial-JS budget of `350,000` bytes and a largest-lazy-chunk budget of `850,000` bytes (raised once already, from `820,000`, specifically for the `@pierre/diffs` worker-pool chunk — an ADR-recorded precedent, not a casual increase). The Review-screen lazy chunk is already close to that ceiling.

**Decision: both numeric budgets stay exactly where they are through this entire migration.** This migration is expected to both add weight (`@pierre/trees`, `@pierre/icons`, the Radix packages in §6.1, the self-hosted Geist subset) and remove weight (`@heroui/react`, `@heroui/styles`, once RV-07 completes) — the net effect is not known in advance and is not assumed favorable. The implementation must, at minimum, at the end of each stage in §20 that changes a dependency:

1. Run the production build and record the exact initial-JS and largest-lazy-chunk byte counts (the same numbers `check-bundle-budget.mjs` already prints).
2. If either budget is at risk of being exceeded before HeroUI removal (RV-07) frees space, split the new tree/icon code into its own lazy chunk (dynamic `import()`), the same mitigation the research report already recommends, rather than raising the ceiling speculatively.
3. Only raise a budget number with a recorded ADR, mirroring the existing precedent for the worker-pool chunk — never as an undocumented side effect of a dependency bump.

No new performance target beyond the base architecture's §23 is introduced; the 50ms main-thread-task ceiling, worker-based patch preprocessing, and bounded prefetch all apply unchanged to the rebuilt Review screen.

## 20. Staged migration boundaries

Each stage is independently shippable and independently verifiable via `pnpm verify`, matching the base architecture's phase-gate discipline (§21.3, §24). No stage depends on a later stage's code existing.

### RV-00 — Local primitive foundation

**Ownership:** new files under `src/ui/` (§7.1), `src/ui/tokens.css`, self-hosted Geist assets, `package.json` additions from §6.1/§6.3 (added, not yet used to replace any HeroUI import).

- Add design tokens, `cn()` helper, and the eleven primitive components.
- Add unit tests for each primitive (render, variant classes, ARIA roles/attributes for `Tabs`/`Dialog`/`DropdownMenu`/`Tooltip`).
- No existing screen changes yet; HeroUI remains fully in place and in use.

### RV-01 — Review full-screen shell and toolbar

**Ownership:** `src/app/App.tsx` (masthead conditional, §9.1), new toolbar markup in `src/review/ReviewScreen.tsx`, scoped layout CSS replacing `.review-page`/`.review-toolbar`.

- Introduce the `100dvh` grid and 49px toolbar (§10).
- Wire Back, Queue (contents unchanged, §14), Finish Review trigger, theme control into the new toolbar using RV-00 primitives.
- Add desktop (1280×720, 1440×900) and narrow (390×844) layout invariant tests.

### RV-02 — Sidebar: Tree, Description, Activity

**Ownership:** delete `src/review/FileTree.tsx` and `src/review/Overview.tsx`; add `src/review/sidebar/{Sidebar,TreeTab,DescriptionTab,ActivityTab}.tsx`; add `@pierre/trees` to `package.json`.

- Implement §11 exactly: tree configuration, description metadata block, lazily-loaded/cached activity.
- Implement the Tree remeasurement requirement (§11): check the pinned `@pierre/trees` version's own documentation for a refresh/resize/remeasure API before assuming the remount-key fallback is needed; record which branch was taken.
- Add tests: tree search/collapse/keyboard, tab-switch state preservation, activity loading/empty/error/retry, and correct Tree rows plus preserved search/expanded/selection state after at least two Tree → other tab → Tree cycles (§21.3).

### RV-03 — Diff canvas density and responsive defaults

**Ownership:** `src/review/DiffReview.tsx`, `src/styles.css` deletions (`.review-card`, `.review-header`, `.diff-view` max-height rules).

- Change `CodeView` `gap` from `12` to `1`; remove the bounded wrapper (§12).
- Implement the split/unified responsive default and persisted override (finally implementing base architecture §13.2, per §12).
- Add sticky headers, gutter hover, line selection.
- No change to `disableWorkerPool`/`diffs-worker-gate` wiring.

### RV-04 — Finish Review dialog and Queue panel

**Ownership:** Finish Review markup in `src/review/ReviewScreen.tsx`, `src/review/finish-review.ts` call site only (not its internals), `src/review/QueueDrawer.tsx` chrome.

- Rebuild the Finish Review confirmation on `src/ui/Dialog.tsx` (§13).
- Change the `finishReview()` call site to pass real drafts instead of `[]`.
- Rebuild the Queue panel's trigger/chrome on the new tokens (§14) — contents unchanged.
- Add tests: dialog focus trap/Escape/Cancel, draft summary rendering, existing Finish Review E2E assertions re-pointed at the new DOM structure without behavior change.

### RV-05 — Inbox

**Ownership:** `src/inbox/InboxScreen.tsx` layout and its two HeroUI imports.

- Rebuild the toolbar/rows on the new tokens and primitives (§9.6).
- No change to `query.ts`/`load-inbox.ts` or any filter/qualifier behavior.
- Update `e2e/smoke.spec.ts` and `e2e/review-flow.spec.ts` selectors that target now-renamed CSS classes; behavioral assertions (partial failure, unsupported query, default query) stay green throughout, since the underlying logic did not move.

### RV-06 — Connect, Vault, Repository Selection

**Ownership:** `src/connection/ConnectScreen.tsx`, `src/connection/ConnectionDiagnostics.tsx`, `src/vault/VaultScreen.tsx`, `src/scope/RepositorySelectionScreen.tsx`; `src/ui/ThemeControl.tsx` rebuild plus the new `src/ui/useThemePreference.ts` hook (§9.5).

- Swap each screen's HeroUI imports for the RV-00 primitives (§9.2–§9.4).
- Verify the exact theme DOM contract (§9.5) against the existing `e2e/smoke.spec.ts` theme test with zero test changes required for that specific assertion.
- This is the last stage with any HeroUI import remaining in the tree (verified inventory: `ThemeControl.tsx`, `InboxScreen.tsx`, `App.tsx`, `ConnectionDiagnostics.tsx`, `ConnectScreen.tsx`, `RepositorySelectionScreen.tsx`, `ReviewScreen.tsx`, `DiffReview.tsx`, `Overview.tsx`, `VaultScreen.tsx`, `styles.css` — all eleven touchpoints are retired by the end of RV-06, since `Overview.tsx` is already deleted in RV-02 and `ReviewScreen.tsx`/`DiffReview.tsx`'s HeroUI `Button` imports are retired in RV-01/RV-03).

### RV-07 — HeroUI removal

**Ownership:** `package.json`, `pnpm-lock.yaml`, `src/styles.css`.

- Delete `@heroui/react` and `@heroui/styles` from `dependencies`.
- Delete `@import "@heroui/styles";` from `src/styles.css`.
- Run `pnpm install`, full `pnpm verify`, and the bundle-budget measurement from §19. Per §6.3, `@pierre/theme`/`@pierre/theming` remain in `pnpm-lock.yaml` as `@pierre/diffs`' own transitive dependencies — the measured delta at this stage is attributed to `@heroui/react`/`@heroui/styles` only, not to those two packages.
- Update the base architecture document's superseded clauses (§4 of this document) to point at this document, or fold this document's content into it — an editorial follow-up, not a code change, and not required for RV-07 to be considered complete.

## 21. Testing strategy

### 21.1 Unit tests (Vitest)

- Every new `src/ui/` primitive: render output, variant class application, ARIA roles/states (`role="tab"`/`aria-selected`, `role="dialog"`/`aria-modal`, `role="menu"`, `role="tooltip"`).
- `useThemePreference` hook: system/light/dark resolution, `matchMedia` change handling, persistence round-trip.
- `TreeTab` adapter: stable path-to-item-ID mapping, search filtering, collapse/expand state.
- `DescriptionTab`/`ActivityTab`: rendering of loaded/empty/error states; `ActivityTab`'s in-memory cache-by-PR-ref behavior (no duplicate `getReviewSignals` call on tab re-activation within the same open review).
- `ReviewScreen.finish()` call-site change: asserts `finishReview()` receives the actual accumulated drafts, not `[]`.
- All existing unit coverage for `finish-review.ts`, `query.ts`, `load-inbox.ts`, vault modules, and provider mapping is unaffected by this migration and continues to run unmodified — none of those files change.

### 21.2 Playwright E2E — preserved contracts

The following existing assertions must continue to pass, updated only for DOM-selector renames where a component was rebuilt, never for behavior:

- `e2e/fixtures.ts`'s `browserGuards` (no console errors, no non-allowlisted network origin) — applies to every rebuilt screen automatically.
- `e2e/smoke.spec.ts`: the 390×844 connect-shell content assertions (updated selectors if `ConnectScreen`'s markup changes, same assertions) and the theme-toggle DOM contract (§9.5, no change needed).
- `e2e/review-flow.spec.ts`: all six existing scenarios (cross-repo inbox → real diff → general comment; Finish Review checkpoint persistence and queue advance; partial-repository-load progress; partial-repository-failure with visible successful rows; unsupported-query handling; session-only Lock/reload) continue to pass against the rebuilt screens, with the general-comment scenario updated to route its comment through the new Finish Review dialog per §13 rather than the removed above-diff composer.

### 21.3 Playwright E2E — new coverage this migration requires

- Review layout invariants at 1280×720 and 1440×900 (49px toolbar, 320px sidebar ±1px, no visible global masthead).
- Narrow Review layout at 390×844 (sidebar becomes a bottom sheet, diff defaults to unified).
- Toolbar row split at 390×844 (§15): Row 1 contains exactly Back, PR identity, and Finish Review, with Finish Review fully visible and clickable and the PR identity text truncated (not Finish Review pushed out or hidden); Row 2 contains exactly Queue, the split/unified toggle, collapse-all, Display, and theme.
- Sidebar tab switching preserves per-tab state (tree search text, activity load) across at least two switches; for the `Tree` tab specifically, after at least two Tree → other tab → Tree cycles, every previously rendered row is present and correctly positioned (no missing/misaligned rows from stale virtualizer measurement under `display: none`, §11), and search text, expanded nodes, and the selected/highlighted row are all unchanged from before the cycling.
- `Tree` tab: search, collapse/expand, keyboard navigation, selection-to-scroll sync in both directions (tree-click scrolls diff; diff-scroll highlights tree).
- Split/unified default at ≥768px vs. <768px, and that a manual override persists across a tab switch within the same review.
- Finish Review dialog: Escape closes without submitting, Cancel closes without submitting, drafts are visible in the dialog before submission, and the existing checkpoint-persistence/queue-advance assertions still hold with drafts routed through the dialog.
- CSP/no-external-request assertions extended to cover the new self-hosted font requests (must resolve from the app's own origin, asserted via the existing `browserGuards` origin allowlist).
- Bundle-budget measurement recorded at the end of each dependency-changing stage (§19), not a single end-of-migration check.

## 22. Acceptance criteria

The migration is complete only when all of the following are true:

1. No file under `src/` imports from `@heroui/react` or `@heroui/styles`, and neither package appears in `package.json`.
2. Review occupies the full viewport at ≥768px; the global Revelio masthead is absent while `screen === "review"`.
3. At 1280px, the Review toolbar is 49px tall and the sidebar is 320px ± 1px wide.
4. The diff viewport fills all remaining height and is the only vertically scrolling region in the main column; the sidebar's active tab body scrolls independently.
5. `Tree`, `Description`, and `Activity` are all keyboard-complete (Tab/Arrow/Enter/Escape as specified in §17) and each preserves its own state across tab switches.
6. The Tree tab is a true recursive, virtualized tree (via `@pierre/trees`) supporting search and git-status display — not the flat parent-directory grouping it replaces.
7. Wide (`≥768px`) first-open defaults to split diff mode; narrow (`<768px`) first-open defaults to unified; a manual override persists for the session.
8. The `CodeView` inter-file gap is `1px` and file headers remain sticky during scroll.
9. Selecting a Tree row scrolls the diff to that file, and scrolling the diff updates the Tree's highlighted row, without either surface stealing keyboard focus from the other.
10. The Description tab never executes HTML and never triggers a remote image request; the Activity tab loads only once per open review per PR, on first activation.
11. The Queue button and Finish Review button are both visible in the toolbar without either dominating its 49px height; the Queue panel's contents are unchanged from today's (§14).
12. The Finish Review dialog is cancellable via an explicit Cancel control and via Escape, traps focus while open, and displays pending drafts before submission; `finish-review.ts`'s transaction, retry, and checkpoint behavior are unchanged and pass their existing tests unmodified.
13. Existing checkpoint durability, re-entry rules, partial-failure inbox rendering, and unsupported-query handling show no regression (verified by the unmodified assertions in §21.2).
14. No Berkeley Mono asset, DiffHub wordmark, or DiffHub brand asset exists anywhere in the built output.
15. `pnpm verify` passes at every stage boundary in §20, and the bundle-budget check in `scripts/check-bundle-budget.mjs` passes at its existing numeric limits (§19) without an unrecorded increase.
16. Connect, Vault (setup and unlock), and Repository Selection render on the same local primitive set as Review and Inbox, with identical security/credential/discovery behavior to today.
17. The theme control's DOM contract (`dark` class, `data-theme` attribute, `aria-pressed` state) is byte-for-byte identical to today's, verified by the existing `e2e/smoke.spec.ts` theme assertion.

## 23. Risks and decisions

| Risk | Decision / mitigation |
|---|---|
| `@pierre/trees` is a comparatively new library (per the research report's confidence notes) | Exact pin, adapter boundary confined to `src/review/sidebar/TreeTab.tsx`, unit + E2E coverage before RV-02 is considered done. `FileTree.tsx` is deleted only once `TreeTab.tsx` ships with equivalent coverage, not before. |
| Keeping the inactive `Tree` panel mounted at `display: none` (§11) can leave `@pierre/trees`' virtualizer with stale, zero-size measurements, producing missing or misaligned rows when the panel is shown again | Documented refresh/resize API on the pinned version if one exists, otherwise a remount key scoped to the virtualized viewport only, with search/expanded/selection state kept outside it (§11, §11.1); verified by the two-cycle Tree ↔ other-tab test in §21.3 before RV-02 is considered done. |
| Removing HeroUI mid-migration temporarily leaves two component systems in the tree (RV-00 through RV-06) | Accepted as the cost of a staged, independently-verifiable migration rather than a single flag-day rewrite; each stage still leaves the app in a fully working, fully tested state — this is explicitly preferred over an atomic big-bang swap per the base architecture's phase-gate discipline. |
| Bundle budget headroom is currently thin (§19) | Budgets stay fixed; per-stage measurement is mandatory; a dedicated lazy chunk for tree/icon code is the designated mitigation before any budget number is touched, and any budget change requires its own ADR. |
| Tree/diff selection could form a feedback loop (tree click scrolls diff, diff scroll re-selects tree, re-triggering a scroll) | Stable item IDs plus one-directional-at-a-time state updates (the update that originated a change is not echoed back into itself) — the same guard pattern the current `activePath`/`onActivePathChange` contract already uses, extended to the new `TreeTab`. |
| Activity tab reintroduces a network call already made elsewhere (Inbox's own polling) | In-memory cache keyed by PR ref for the open review's lifetime (§11.3); no shared cross-screen cache is introduced, since Inbox and Review already have separate data-loading lifecycles per the base architecture. |
| Folding the Finish Review draft-summarization fix into this migration (§13) blurs the "presentation-only" scope line | Explicitly justified in §2, exception 4: the dialog's content area is being rebuilt regardless, and `finish-review.ts` already accepts the input this fix supplies — the alternative (deliberately keeping the old bug in a newly-built dialog) would be worse than the minor scope note this table records. |
| Reproducing the DiffHub reference too literally | Only Apache/MIT-licensed libraries (`@pierre/diffs`, `@pierre/trees`, `@pierre/icons`) and generic Radix/CVA interaction patterns are reused — no DiffHub source file, brand asset, or Berkeley Mono file is copied (§8.1, acceptance criterion 14). |
| A future reader finds this document and the base architecture disagreeing | §4's supersession table is the single source of truth for exactly which base-architecture clauses this document overrides; everything else in the base architecture governs unchanged, and this document says so explicitly rather than leaving it implied. |

## 24. Explicitly out of scope (tracked elsewhere)

Restated from §2 for a single point of reference: this migration does not fix the 7-day trusted-browser TTL, the missing quick filters/qualifiers, the queue's display of finished-and-reopenable entries, or the missing progressive-load skeletons. All four remain tracked in `docs/UX_AUDIT.md` under their existing severity ratings and are unaffected — neither fixed nor made worse — by this document.

## 25. Self-review

- No `TBD`, `TODO`, or placeholder value appears anywhere above; every dimension, breakpoint, budget, pin policy, and file path is a specific, stated choice.
- Every point where two documents could be read as disagreeing (HeroUI-only vs. full migration; base architecture's already-specified-but-unimplemented split/unified default; the research report's narrower "review route only" recommendation vs. the user's whole-app approval) is resolved explicitly in §4, §12, and §4 respectively, with the deciding rationale stated inline rather than left for an implementer to infer.
- Every "should" in the source research report that this document adopts has been converted to a "must"/"is" with one concrete choice (font pairing in §8.1, breakpoint consolidation in §7.2/§15, HeroUI removal timing in §20, queue-scope boundary in §14).
- Every new dependency in §6.1 has a stated purpose and a stated pin policy; every dependency NOT added has a stated reason (§6.1, §6.4, §8.1, §8.2).
- Every current-behavior claim in this document (state machine transitions, HeroUI import inventory, exact CSS values, bundle budgets, DOM contracts, test coverage) was verified by reading the actual source files and test files in this worktree, not inferred from file names or prior documentation.
