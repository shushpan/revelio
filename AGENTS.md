# Agent instructions

Before editing:

1. Read the Ready issue, comments, and links.
2. Read `product/README.md`.
3. For UI work, read `product/contract/ui.md` and inspect `src/ui/`.
4. Trace the affected flow and tests.

Keep all product documentation in `product/`.

Stop if requirements conflict or a decision is missing. Otherwise make the
smallest scoped change, reuse existing code and dependencies, and preserve
unmentioned behavior. Never weaken security, validation, accessibility, or
error handling. Keep credentials and real provider content out of the repo;
tests use synthetic data.

Map each acceptance criterion to evidence. Run focused checks, `pnpm verify`,
and `git diff --check`; apply the UI contract's visual checks when relevant.
Link the PR to the issue and close it only when all criteria pass.

## Delivery harness

1. Take a Ready issue or spec from `product/`.
2. Plan with `gpt-5.6-sol` at high reasoning; ask questions when needed.
3. Implement with `gpt-5.6-terra` at high reasoning; use several agents only
   for independent work.
4. Verify, commit, push, and create a PR linked to the issue.
