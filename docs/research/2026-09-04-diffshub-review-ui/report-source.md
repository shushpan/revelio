# DiffHub-style full-screen review for Revelio

**Research date:** 2026-09-04  
**Reference:** [oven-sh/bun #30412 in DiffsHub](https://diffshub.com/oven-sh/bun/pull/30412)  
**Decision scope:** the Revelio pull-request review surface, not the inbox, vault, or connection screens  
**Status:** implementation-ready recommendation; no product code changed by this research

## Executive decision

Revelio should adopt the DiffHub composition for its review route: a true
`100dvh` workspace, a 49 px full-width toolbar, a fixed 320 px left sidebar,
and one independently scrolling `@pierre/diffs` CodeView filling all remaining
space. The sidebar should contain the requested three sections: **Tree**,
**Description**, and **Activity**.

The same public building blocks are available and should be used:

- `@pierre/diffs` for the virtualized diff surface — already installed in
  Revelio.
- `@pierre/trees` for the file tree — this should replace Revelio's current
  hand-built grouped list.
- Tailwind plus shadcn/ui's `new-york` / `neutral` component recipe for the
  compact toolbar, tabs, menus, switches, and popovers.
- Radix primitives under those local shadcn-style components.
- Pierre icons for the closest iconography.

This is not a recommendation to add a mysterious monolithic UI framework.
shadcn/ui distributes component source rather than acting as a conventional
runtime package. DiffHub's own manifest confirms `style: "new-york"`, neutral
tokens, Tailwind CSS variables, and Lucide icons; its package manifest confirms
the Pierre, Radix, Tailwind, CVA, `clsx`, and `tailwind-merge` stack.
[DiffHub components manifest](https://raw.githubusercontent.com/pierrecomputer/pierre/main/apps/diffshub/components.json),
[DiffHub package manifest](https://raw.githubusercontent.com/pierrecomputer/pierre/main/apps/diffshub/package.json)

The review route may use these local shadcn-style primitives while HeroUI stays
in the inbox, connection, and vault screens. A whole-app HeroUI migration is not
required to deliver the requested review experience.

## What was verified

### Live visual and DOM inspection

At a 1280 × 720 desktop viewport the reference page currently renders:

| Element | Observed value |
| --- | ---: |
| Workspace | `1280 × 720`, constrained to `100dvh` |
| Top toolbar | `49 px` high, spanning both columns |
| Left sidebar | `320 px` wide, `671 px` high below the toolbar |
| Diff viewport | Remaining `960 px`, independently scrollable |
| Desktop breakpoint | `768 px` (`md`) |
| Toolbar controls | mostly `32 × 32 px`, with 12–16 px icons |
| Sidebar tab/search controls | `16 × 16 px` icon buttons |
| Tree row height | `24 px` |
| Body font | Geist; chrome generally 14 px |
| Dark shell background | `#101010` |
| Diff mode | split by default |

These values were measured from the live reference rather than inferred from a
screenshot. The source independently confirms the responsive grid as
`320px minmax(0,1fr)`, the `h-dvh` wrapper, and the toolbar/sidebar/viewer grid
areas. [Review route source](https://github.com/pierrecomputer/pierre/blob/main/apps/diffshub/app/%5B...path%5D/DiffsHubViewByPathPage.tsx),
[Review grid source](https://github.com/pierrecomputer/pierre/blob/main/apps/diffshub/components/ReviewUI.tsx#L340-L371)

### Reference implementation stack

The implementation is open source under Apache-2.0. Its current application
manifest lists `@pierre/diffs`, `@pierre/trees`, `@pierre/icons`,
`@pierre/theme`, `@pierre/theming`, Next.js, Tailwind, Radix dropdown/slot/switch,
CVA, `clsx`, `tailwind-merge`, Lucide, and Sonner. Revelio does **not** need to
copy Next.js, analytics, or Vercel-specific pieces because they do not create
the visual result. [DiffHub package manifest](https://raw.githubusercontent.com/pierrecomputer/pierre/main/apps/diffshub/package.json),
[DiffHub license](https://raw.githubusercontent.com/pierrecomputer/pierre/main/apps/diffshub/LICENSE.md)

The visible file tree is not custom JSX. DiffHub uses `@pierre/trees`, with
paths as stable identity, built-in search, git status, virtualization, sticky
folders, and theme translation. The official library is Apache-2.0 and exposes
a React adapter. [Trees documentation](https://trees.software/docs),
[`@pierre/trees` package](https://www.npmjs.com/package/@pierre/trees)

The main review canvas uses the `CodeView` abstraction from `@pierre/diffs`.
Its official documentation describes one virtualized scroll region, sticky
headers, item/line scrolling, annotations, and line selection. That is the same
architecture Revelio already started using. [Diffs CodeView documentation](https://diffs.com/docs)

### Exact density choices in DiffHub source

The current source uses:

- CodeView layout `{ paddingTop: 0, gap: 1, paddingBottom: 0 }`.
- Tree row height `24`.
- `flattenEmptyDirectories: true`.
- `initialExpansion: "open"`.
- `presorted: true`, search enabled, and sticky folders enabled.
- Tree density override `0.8` with 8 px inline padding.
- A single scrolling CodeView with sticky file headers and gutter utilities.
- Split/unified, collapse-all, theme, and display settings in the thin toolbar.

These are source-level facts, not visual guesses.
[DiffHub constants](https://raw.githubusercontent.com/pierrecomputer/pierre/main/apps/diffshub/lib/constants.ts),
[DiffHub file-tree adapter](https://github.com/pierrecomputer/pierre/blob/main/apps/diffshub/components/DiffsHubFileTree.tsx),
[DiffHub viewer](https://raw.githubusercontent.com/pierrecomputer/pierre/main/apps/diffshub/components/DiffsHubViewer.tsx)

## Where Revelio differs today

| Concern | Current Revelio | Target |
| --- | --- | --- |
| App chrome | Global Revelio title/theme header remains visible during review | Review route replaces all normal app chrome |
| Width/height | Review max width is 96rem; diff max height is 42rem | Full viewport; no max width/height |
| Scrolling | Page, tree, and bounded diff can all participate | Only sidebar body and CodeView scroll independently |
| Main density | Outer review heading, summary, composer, and 12 px gaps | Diff begins immediately; 1 px file gap |
| Tree | Custom grouping by complete parent path; not a true recursive tree | `@pierre/trees`, flattened empty folders, virtualization, search, sticky folders |
| Diff default | Unified on every mount | Split on wide screens, unified on narrow screens; persisted override |
| Context | Top-level Changes/Overview tabs consume vertical space | Tree/Description/Activity live inside the left sidebar |
| Comments | General composer sits above the diff | Inline drafts live at lines; overall draft belongs to Finish Review |
| Theme | HeroUI chrome around Pierre's native diff | Scoped Pierre/shadcn review chrome using the same theme plane |

The main code evidence is in
[`src/app/App.tsx`](../../../src/app/App.tsx),
[`src/review/ReviewScreen.tsx`](../../../src/review/ReviewScreen.tsx),
[`src/review/DiffReview.tsx`](../../../src/review/DiffReview.tsx),
[`src/review/FileTree.tsx`](../../../src/review/FileTree.tsx), and
[`src/styles.css`](../../../src/styles.css).

Two values account for much of the present visual mismatch: Revelio constrains
the diff to `max-height: 42rem`, and its CodeView uses a `12 px` inter-file gap;
DiffHub uses all available height and a `1 px` gap.

## Proposed Revelio screen contract

### 1. Viewport and grid

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ 49 px toolbar: back · PR identity · queue · diff controls · Finish      │
├──────────────────────┬───────────────────────────────────────────────────┤
│ 320 px sidebar       │ one CodeView, full remaining width and height    │
│ Tree Desc Activity   │ sticky file headers; split by default            │
│                      │                                                   │
│ active section body  │                                                   │
│                      │                                                   │
│ compact stats/footer │                                                   │
└──────────────────────┴───────────────────────────────────────────────────┘
```

- Root: `height: 100dvh; width: 100%; overflow: hidden`.
- Desktop grid: rows `49px minmax(0, 1fr)`, columns
  `320px minmax(0, 1fr)`.
- Toolbar spans both columns.
- No surrounding card, page margin, max width, or global app header.
- Sidebar has a right hairline border; viewer owns its vertical scrolling.
- The first diff file begins at the top of the viewer.

### 2. Toolbar

The toolbar should preserve DiffHub's visual rhythm but use Revelio data:

1. Back icon to return to the inbox.
2. Compact PR identity: `workspace/repo #123`, title truncated to one line.
3. Optional external Bitbucket link when available.
4. Queue button with remaining count.
5. Split/unified toggle.
6. Collapse/expand all files.
7. Display menu: line numbers, wrapping, diff indicators.
8. Theme mode.
9. **Finish Review** as the only visually explicit primary action.

Not every control should become icon-only. Back, diff settings, and collapse
can be icons with tooltips; Queue and Finish Review need readable text because
they change workflow state.

### 3. Left sidebar tabs

Use a semantic Radix Tabs primitive styled like DiffHub's tiny icon group.
Each trigger has a 16 px icon, visible focus state, tooltip, accessible name,
and ArrowLeft/ArrowRight behavior.

#### Tree

- Use `@pierre/trees/react` and canonical path strings.
- Match the reference options: 24 px rows, density `0.8`, 8 px inline padding,
  flatten empty directories, initial open state, preserved patch order, sticky
  folders, search, and git status.
- Search and status-filter icons appear only while Tree is selected.
- Clicking a file scrolls CodeView by stable item ID.
- CodeView scroll position updates the selected tree item without stealing
  keyboard focus.
- Addition/deletion totals stay in the diff headers or compact footer; do not
  widen every tree row with both counters.

#### Description

- Show the raw PR description from the already loaded `PullRequestSummary`.
- Preserve paragraphs and code blocks in the narrow column.
- V1 may retain safe plain-text rendering. If Markdown is added, render the raw
  Markdown locally with HTML disabled/sanitized and block remote images, which
  preserves Revelio's no-third-party-request security contract.
- Keep repository, branch relationship, author, reviewers, and decisions as a
  compact metadata block above or below the description.

Bitbucket's Pull Request representation also exposes a rendered description,
but directly injecting remote HTML is unnecessary. The official API confirms
both the description representation and the activity endpoint.
[Bitbucket Cloud Pull Requests API](https://developer.atlassian.com/cloud/bitbucket/rest/api-group-pullrequests/)

#### Activity

- Reuse the existing `getReviewSignals` provider method; no new endpoint is
  required for the first version.
- Load on first activation and cache only in memory for the open review.
- Show newest first in a narrow timeline: actor, action, relative time, and
  comment text when present.
- Add distinct icons for comment, approval, request changes, and PR update;
  never rely on color alone.
- Preserve an explicit loading, empty, partial/unavailable, and retry state.

The official Bitbucket Cloud activity endpoint returns a paginated log of
reviewer comments, updates, approvals, and change requests, so the requested
tab maps directly to provider data Revelio already normalizes.
[Bitbucket activity endpoint](https://developer.atlassian.com/cloud/bitbucket/rest/api-group-pullrequests/#api-repositories-workspace-repo-slug-pullrequests-pull-request-id-activity-get)

### 4. Diff canvas

- Keep `CodeView`; do not replace Pierre Diffs.
- Set layout to `{ paddingTop: 0, gap: 1, paddingBottom: 0 }`.
- Enable sticky file headers, line hover on the line-number gutter, line
  selection, and gutter comment utility.
- Wide default: split. Narrow default: unified. Persist an explicit override.
- Remove the current `review-card`, `review-header`, summary strip, and bounded
  `.diff-view` wrapper.
- Keep patch parsing and the tested worker-pool gate.
- Move the current generic comment composer into Finish Review; inline comment
  creation should originate from the selected line/gutter.

### 5. Responsive behavior

- At `>= 768px`, keep the 320 px sidebar fixed, matching DiffHub.
- Below 768 px, default to unified diff and present the sidebar as a bottom
  sheet/overlay with the same three tabs.
- The toolbar wraps only on narrow screens; it must not increase desktop height.
- Touch targets may expand invisibly without increasing desktop row height.

## Theme and font decision

### Adopt

- shadcn/ui `new-york` geometry and neutral CSS-variable model, scoped to the
  review route.
- Pierre Light/Dark theme data for code, tree, and review chrome.
- Geist for UI text, self-hosted as a build asset.
- Pierre icons where a matching icon exists.

### Do not copy

DiffHub self-hosts Berkeley Mono for code. Berkeley Mono is commercial; its
vendor explicitly says commercial licenses are not compatible with open-source
apps and asks IDE/editor products to contact them. Revelio must not copy or
redistribute DiffHub's font file. Use a self-hosted open-source font such as
JetBrains Mono, or retain the system monospace stack, unless an explicit license
is obtained. [Berkeley Mono licensing](https://usgraphics.com/products/berkeley-mono),
[JetBrains Mono license and download](https://www.jetbrains.com/lp/mono/)

The result can match layout, spacing, color, and interaction closely without
misrepresenting the product as DiffHub or copying its brand assets.

## Dependency recommendation

Add only what the review implementation uses, with exact pins:

| Package | Purpose | Recommendation |
| --- | --- | --- |
| `@pierre/trees` | exact file-tree behavior and density | add, pin current compatible release |
| `@pierre/icons` | matching compact toolbar/tree icons | add if the selected icons are used |
| `@pierre/theme` | common Pierre theme data | add if explicit cross-surface theme mapping is implemented |
| Radix Tabs | accessible three-section sidebar | add |
| Radix Dropdown Menu / Tooltip | compact settings and labels | add only when used |
| CVA, `clsx`, `tailwind-merge` | local shadcn-style variants | add as one small UI utility layer |

Do not add Next.js, Sonner, Vercel Analytics, or the complete DiffHub dependency
list. `@pierre/theming` is optional: Revelio already owns system/light/dark
preference, so direct theme mapping is simpler unless the full DiffHub theme
catalog becomes a product requirement.

The current build's largest lazy asset is 834,025 bytes against an 850,000-byte
limit, while the current ReviewScreen chunk is roughly 621 KiB. Adding the tree
may still fit because it belongs to the review chunk, not the existing worker
chunk, but the implementation must measure both chunks and must not simply raise
the budget. Prefer a dedicated lazy tree/theme chunk if the review chunk grows
too far.

## Work packages for implementation agents

These packets are intentionally separable and should be integrated in this
order on `main` after review.

### RV-01 — Full-screen shell and route chrome

**Ownership:** `src/app/App.tsx`, review-shell markup in
`src/review/ReviewScreen.tsx`, and scoped layout CSS.

- Hide the normal Revelio masthead while `screen === "review"`.
- Introduce the `100dvh` two-column review grid and 49 px toolbar.
- Preserve Back, Queue, Finish Review, notice, and modal behavior.
- Add desktop/narrow layout tests.

### RV-02 — Pierre tree and sidebar sections

**Ownership:** replace `src/review/FileTree.tsx`; create the sidebar/tabs and
section components.

- Add `@pierre/trees` adapter with stable path-to-CodeView-ID mapping.
- Add Tree, Description, and Activity tabs.
- Reuse existing description and `getReviewSignals` data.
- Add search/filter, keyboard, loading, empty, and error tests.

### RV-03 — DiffHub-density viewer and theme

**Ownership:** `src/review/DiffReview.tsx`, Pierre theme adapter, viewer styles.

- Change CodeView gap from 12 to 1 and remove the bounded container.
- Add split/unified responsive default and persisted override.
- Add sticky headers, line selection, gutter utility, collapse-all hook, and
  scoped Pierre chrome variables.
- Keep worker-pool and patch preprocessing boundaries intact.

### RV-04 — Toolbar, Finish Review integration, and acceptance

**Ownership:** compact local UI primitives, toolbar controls, review E2E tests,
and final integration.

- Wire Queue, display, collapse, theme, and Finish Review controls.
- Move overall commenting into the safe Finish Review flow without weakening
  the existing head-check/checkpoint transaction.
- Add 1280 × 720 and 1440 × 900 visual invariants, 390 × 844 behavior,
  keyboard coverage, large-tree/diff smoke coverage, CSP/no-external-request
  assertions, bundle accounting, and the full `pnpm verify` gate.

## Acceptance criteria

The redesign is complete only when all of these are true:

1. Review occupies the complete viewport and the normal Revelio header is absent.
2. At 1280 px, the toolbar is 49 px and the sidebar is 320 px ± 1 px.
3. The diff viewport fills the remaining height and is the only main vertical scroller.
4. Tree, Description, and Activity are keyboard-complete and preserve their state while switching.
5. The tree is a true recursive, virtualized tree and supports search and git status.
6. Wide first-open is split; narrow first-open is unified; a manual override persists.
7. Inter-file gap is 1 px and file headers remain sticky.
8. Selecting a tree file and scrolling the diff keep both surfaces synchronized.
9. Description and activity cannot execute HTML or load remote images.
10. Queue and Finish Review remain visible without dominating the toolbar.
11. Existing Finish Review ordering, receipts, checkpoint durability, and captured queue behavior do not regress.
12. No Berkeley Mono or DiffHub brand asset is copied.
13. `pnpm verify && git diff --check` passes and bundle limits are met without an unexplained increase.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Two component systems | Scope shadcn-style primitives to the review route; retain HeroUI elsewhere until a separate decision |
| `@pierre/trees` is currently beta | Exact pin, adapter boundary, fixture/E2E coverage, and keep old tree removable until acceptance |
| Tree and CodeView selection loops | Stable item IDs plus guarded updates; never derive state from DOM |
| Activity tab duplicates inbox reads | Cache per open PR in memory and reuse an in-flight request |
| Remote Markdown content | Render raw text first; if Markdown is enabled, disable HTML and remote images |
| Bundle growth | Lazy review/tree chunks, inspect emitted assets, preserve current budgets |
| Copying the reference too literally | Reuse Apache/MIT libraries and interaction patterns, not DiffHub branding or commercial font assets |

## What not to do

- Do not iframe DiffHub or send private Bitbucket URLs/data to it.
- Do not replace `@pierre/diffs` with a hand-built renderer.
- Do not reproduce the file tree manually when the reference's tree library is
  public and compatible.
- Do not migrate all Revelio screens to shadcn in the same change.
- Do not inject Bitbucket's rendered HTML directly.
- Do not make Finish Review a one-click destructive icon.
- Do not raise bundle limits before measuring the emitted chunks.

## Source ledger

Primary sources used:

1. [Live DiffsHub reference](https://diffshub.com/oven-sh/bun/pull/30412)
2. [Pierre monorepo](https://github.com/pierrecomputer/pierre)
3. [DiffHub application package manifest](https://raw.githubusercontent.com/pierrecomputer/pierre/main/apps/diffshub/package.json)
4. [DiffHub shadcn manifest](https://raw.githubusercontent.com/pierrecomputer/pierre/main/apps/diffshub/components.json)
5. [DiffHub review grid](https://github.com/pierrecomputer/pierre/blob/main/apps/diffshub/components/ReviewUI.tsx)
6. [DiffHub sidebar](https://raw.githubusercontent.com/pierrecomputer/pierre/main/apps/diffshub/components/DiffsHubSidebar.tsx)
7. [DiffHub tree adapter](https://github.com/pierrecomputer/pierre/blob/main/apps/diffshub/components/DiffsHubFileTree.tsx)
8. [DiffHub CodeView adapter](https://raw.githubusercontent.com/pierrecomputer/pierre/main/apps/diffshub/components/DiffsHubViewer.tsx)
9. [Diffs documentation](https://diffs.com/docs)
10. [Trees documentation](https://trees.software/docs)
11. [Bitbucket Cloud Pull Requests API](https://developer.atlassian.com/cloud/bitbucket/rest/api-group-pullrequests/)
12. [Berkeley Mono licensing](https://usgraphics.com/products/berkeley-mono)
13. [JetBrains Mono](https://www.jetbrains.com/lp/mono/)

## Confidence and remaining unknowns

**High confidence:** stack, licenses of the Pierre/shadcn code, desktop grid,
dimensions, CodeView/tree settings, current Revelio gaps, and Bitbucket activity
capability.

**Medium confidence until implementation spike:** exact bundle impact of
`@pierre/trees`, theme synchronization through Shadow DOM in Revelio's Vite
build, and visual parity across Firefox/WebKit.

**Requires live Bitbucket verification:** exact production CORS/scopes and all
real-world activity variants. The current project tests these with synthetic
fixtures; this research does not convert that into a live-provider claim.
