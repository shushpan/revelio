# UI contract

**Binding.** Workbench Graphite is compact, quiet, keyboard-first, and gives
code and the current review action priority.

## Foundation

- `src/ui/tokens.css` owns shared colors, spacing, type, radii, sizes, and
  breakpoints; `src/ui/` owns components.
- Reuse native HTML, existing components, Radix behavior, and Pierre diff/tree
  UI. No new UI, icon, font, or styling dependency without explicit approval.
- Use Geist for UI, the existing monospace stack for code, token variables for
  shared values, and support system/light/dark themes.
- Prefer spacing and separators to cards. Keep labels short and decoration
  restrained. Never communicate state by color alone.

## Components and layout

- Use `Button`/`IconButton`, `TextField`, `Dialog`, `DropdownMenu`, `Tabs`,
  `Tooltip`, and `Chip` for their existing roles. Icon-only actions need a name
  and tooltip.
- Add a shared primitive only for two real call sites; otherwise keep it local.
- Design at 480/768/1024px. Keep desktop full-viewport and code-dominant; use a
  sheet or stack on narrow screens. Hidden UI reserves no space and toolbars do
  not wrap.
- At 390×844 and 1440×900, avoid page overflow, clipping, and unreachable
  actions.

## Interaction and states

- Use semantic HTML, keyboard access, visible focus, and WCAG 2.2 AA contrast.
- Preserve Tab, Enter, Space, and Escape conventions. Layered UI consumes Escape
  before page navigation; shortcuts do not fire while typing.
- Keep focus stable through refresh and respect `prefers-reduced-motion`.
- Specify applicable loading, partial, empty, error/retry, unavailable,
  in-flight, success, stale, and destructive states. Errors identify the failed
  scope without exposing secrets or provider bodies.

## Ready and verified

A Ready UI issue defines outcome, flow, states, reused components, responsive
behavior, keyboard/focus behavior, accessible names, exact acceptance criteria,
and a mockup for a new layout.

Use the smallest test per non-trivial behavior, then run `pnpm verify` and
`git diff --check`. Visually check both target sizes and themes, keyboard/focus,
loading/error states, and unexpected network origins; map evidence to criteria.
