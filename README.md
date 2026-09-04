# Revelio

Revelio is a backend-free, personal Bitbucket Cloud review workspace. Its browser
connects directly to Bitbucket, lets one user choose the repositories that belong
in their inbox, and keeps the review queue and credentials on that browser.

## Current review flow

1. Enter an Atlassian email and Bitbucket API token, then choose a workspace or
   individual repositories. The selection is saved per provider/user locally.
2. Choose **This session only**, an encrypted passphrase vault, or a WebAuthn
   passkey vault. Passphrase/passkey vaults provide a fixed seven-day trusted
   browser window; session-only connections are not restored after reload.
3. Revelio loads selected repositories with bounded concurrency and publishes
   rows as each repository completes. A pending or failed repository is shown as
   incomplete work, never as a normal empty inbox.
4. The default query is `reviewer:@me is:unreviewed`. The supported qualifiers
   are `author`, `reviewer`, `review-requested`, `involves`, `repo`, `workspace`,
   and `is`; unsupported qualifiers are called out instead of filtering to a
   misleading empty result.
5. Open a pull request to review its raw patch. **Finish Review** confirms a
   current head, applies the chosen decision when needed, confirms the head
   again, persists a durable local checkpoint, then advances to the next item
   captured in the queue. A changed head or supported new review signal makes a
   checkpointed pull request actionable again.

## Security and privacy

- Revelio has no application backend, telemetry service, runtime CDN, or
  credential relay. Browser requests are limited to the fixed Bitbucket API
  origin.
- Credentials are kept in memory for a session, or encrypted locally when the
  user deliberately enrolls a passphrase/passkey vault. **Lock** clears the
  trusted-browser record and sensitive in-memory inbox state.
- Repository scope and review checkpoints are local IndexedDB data. Checkpoints
  are not credentials and are isolated by provider and user.
- Real credentials, provider data, comments, diffs, traces, screenshots, and
  HAR files must not be committed. Browser tests use synthetic identities and
  intercepted Bitbucket responses only.

## Requirements

- Node.js 20.19 or newer
- Corepack and pnpm 11.24.0
- Chromium for Playwright

## Install and run

```bash
git clone https://github.com/shushpan/revelio.git
cd revelio
corepack enable
corepack prepare pnpm@11.24.0 --activate
pnpm install --frozen-lockfile
pnpm dev
```

For a production build and local preview:

```bash
pnpm build
pnpm preview
```

## Verification

```bash
pnpm verify
git diff --check
```

`pnpm verify` formats/lints, type-checks, runs unit tests, builds the production
bundle, and runs Playwright against that bundle. The browser harness rejects
unexpected outbound origins and uses synthetic Bitbucket fixtures.

The completed local milestone gate passed with 92 formatted files, 93 linted
files, 32 unit files / 299 tests, a 312,026-byte initial production bundle
(350,000-byte budget), an 834,025-byte largest lazy chunk (850,000-byte budget),
and 8 Chromium acceptance tests.

This is not live Bitbucket proof. A disposable-account check is still required
for browser CORS, API-token scopes, activity/review-request observability,
inline anchors, remote mutation receipts, and approval reset after a new commit.

## Remaining product backlog

- Saved priority/grouping/suggestion rules and the full reason/CI/age/size query
  language with autocomplete.
- Comparison ranges, Viewed state, metadata caching, command palette, keyboard
  workflow, background refresh, and richer retry/rate-limit UX.
- Existing comment-thread handling, stacked pull requests, multiple connections,
  other providers, and encrypted review-content/draft persistence.

## License status

No license file has been declared. Until one is published, all rights remain
reserved; contributions and reuse are not licensed by this README.
