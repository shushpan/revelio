# Revelio

## What Revelio is

Revelio is a backend-free Bitbucket Cloud review workspace foundation. It is a
static React and TypeScript application: the browser talks directly to
Bitbucket's API, while the app keeps the Phase 0.1 experiment deliberately
small and inspectable. The current release is a read-only feasibility build,
not a hosted review service.

## Why it is better for cross-repository review

Revelio is designed around one review surface for work spread across multiple
Bitbucket repositories. The foundation already makes the important boundary
visible: workspace-first discovery, separate capability results, and a
diff-first view instead of a sequence of provider pages. This gives later
inbox and queue work a clear place to grow without hiding actionable failures.

The cross-repository inbox, persistent checkpoints, and review actions are
roadmap work. They are not presented as available features in Phase 0.1.

## Current features

- Direct, read-only Bitbucket Cloud requests from the browser, with a fixed API
  origin, GET-only request boundary, opaque pagination, and redacted failures.
- Workspace-first discovery through the supported
  `/2.0/user/workspaces` and `/2.0/repositories/{workspace}` endpoint family,
  followed by separately reported identity, repository, open pull-request,
  activity, comments, diffstat, and diff capabilities.
- Session-memory connection diagnostics. The local form accepts an Atlassian
  email and Bitbucket API token, and Lock or reload clears the credentials and
  results.
- A lazy, synthetic multi-file diff demo powered by
  [`@pierre/diffs` 1.3.6](https://github.com/pierrecomputer/diffs), the open-source
  diff renderer from [diffs.com](https://diffs.com/). It includes worker-backed
  patch preparation, unified/split layout, changed-file navigation, native
  light/dark Diffs themes, and local inline-comment intent only.
- HeroUI controls with light, dark, and system theme choices. The app uses
  HeroUI's default themes and Diffs' native `pierre-light`/`pierre-dark`
  themes.
- Automated formatting, linting, strict TypeScript, Vitest, production build
  and bundle budgets, and Chromium Playwright acceptance coverage through
  [`pnpm verify`](#verification).

## Security model

- The browser calls Bitbucket directly; Revelio has no application backend,
  telemetry service, runtime CDN, or credential relay.
- Phase 0.1 credentials exist only in controlled React memory. They are not
  yet persisted with a passkey/passphrase vault, and they never go into a URL,
  storage API, log, error, fixture, trace, screenshot, or build artifact.
- The request builder fixes the origin to `https://api.bitbucket.org/2.0`,
  accepts only safe read requests, and rejects foreign or absolute paths.
- Diagnostics expose capability outcomes and redacted error categories, not
  provider response bodies, repository content, comments, or pull-request
  identifiers.
- The diff worker receives synthetic patch text only and has no credential,
  provider, storage, or network dependency.
- The current build does not execute approvals, Request changes, general
  comments, or inline comments. Request-shape descriptors are test fixtures,
  not mutation paths.

Never put a credential, repository content, pull-request title, comment, or
diff in chat, an issue, a fixture, a trace, or a log. For a user-controlled
disposable check, follow the [safe live Bitbucket checklist](docs/phase-0/live-bitbucket-checklist.md).

## Requirements

- Node.js 20.19 or newer.
- Corepack (included with supported Node.js releases) and pnpm 11.24.0.
- Chromium installed for the Playwright acceptance suite.

## Install and run

The reproducible project setup is:

```bash
git clone https://github.com/shushpan/revelio.git
cd revelio
corepack enable
corepack prepare pnpm@11.24.0 --activate
pnpm install --frozen-lockfile
pnpm dev
```

Open the localhost URL printed by Vite. The app uses synthetic diagnostics
fixtures for automated checks; do not paste credentials into a terminal or
chat.

## If `pnpm` is missing

Corepack is the project default because it activates the exact pnpm version
declared in `package.json`. If `pnpm` is not available, run `corepack enable`
and `corepack prepare pnpm@11.24.0 --activate`, then rerun the install command.
Homebrew users may instead run `brew install pnpm`; use the project's pinned
version when possible so local and CI results agree.

## Production build

Build the static release and serve it locally with:

```bash
pnpm build
pnpm preview
```

The build reports and enforces the initial JavaScript and largest lazy-chunk
budgets. Vite preview is a local test server; production hosting must supply
the CSP and security headers described in the
[acceptance report](docs/phase-0/acceptance-report.md).

## Verification

Run the complete local contract with:

```bash
pnpm verify
```

This runs Biome formatting and linting, strict TypeScript, all Vitest suites,
the production build and bundle-budget check, and all Chromium Playwright
tests. The browser harness intercepts Bitbucket with synthetic fixtures and
rejects unexpected external requests, so a green run does not prove live
Bitbucket CORS, scopes, or provider behavior.

## Current limitations

Phase 0.1 intentionally does not include an encrypted vault, passkeys,
passphrase derivation, persistent storage, repository exclusions, a cross-repo
inbox, search or rules, Overview, review drafts, Finish review, a persistent
TODO/checkpoint workflow, or remote review actions. Credentials remain
session-memory only.

Live browser CORS, token scope sufficiency, activity watermarks, renewed-review
signals, and all mutation behavior remain unresolved until a user runs the
[sanitized disposable-token checklist](docs/phase-0/live-bitbucket-checklist.md).

## Roadmap

1. Run and record the disposable, read-only Bitbucket check with allowlisted
   evidence only.
2. Validate browser capability requirements and design the encrypted
   passkey/passphrase vault.
3. Add repository exclusions, the actionable cross-repository inbox, search,
   rules, and durable review checkpoints.
4. Add explicit, separately confirmed review actions and re-entry behavior.

## Contributing

Read the [foundation plan](docs/superpowers/plans/2026-08-29-phase-0-1-revelio-foundation.md)
and [acceptance report](docs/phase-0/acceptance-report.md) before changing the
provider boundary or security model. Keep credentials and real company data
out of source, tests, logs, screenshots, traces, and commits. Run `pnpm verify`
before opening a change, and update the sanitized checklist or acceptance
evidence when a capability boundary changes.

## License status

No license file has been declared yet. Until the project publishes one, all
rights remain reserved; contributions and reuse are not licensed by this
README.
