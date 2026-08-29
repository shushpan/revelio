# Revelio

Revelio is a backend-free Bitbucket Cloud review workspace. The browser connects
directly to Bitbucket, discovers open pull requests across accessible
repositories, renders a real pull-request diff, and sends review actions.

## Usable review flow

1. Enter an Atlassian email and Bitbucket API token and select **Connect**.
2. Review the cross-repository inbox. **Needs my review** is the default;
   **All open** keeps every discovered open pull request reachable.
3. Open a pull request to load its raw Bitbucket patch in the diff-first review
   surface.
4. Send a general comment, approve, request changes, or mark the pull request
   reviewed. A local per-source-commit checkpoint keeps reviewed work out of
   the default inbox until the source commit changes.

## Current features

- Workspace-first discovery through Bitbucket's supported workspace,
  repository, and open-pull-request endpoints.
- Cross-repository inbox rows with repository, title, author, branches, update
  time, reviewer status, and Needs my review / All open filters.
- Real pull-request diff loading with worker-backed patch preparation, changed
  file navigation, unified/split layout, and native light/dark Diffs themes.
- General comments, Approve, Request changes, and Mark reviewed actions sent
  directly to Bitbucket.
- HeroUI controls with light, dark, and system theme choices.
- Sanitized connection and action errors that do not display provider response
  bodies.

## Security and privacy

- Revelio has no application backend, telemetry service, runtime CDN, or
  credential relay. Requests go from the browser to the fixed Bitbucket API
  origin.
- Credentials remain in React memory only. Lock or reload clears them; there is
  no encrypted vault or passkey storage in this release.
- The browser uses GET requests for discovery and the minimum POST endpoints
  needed for review actions. Non-secret reviewed checkpoints are the only data
  written to local storage.
- Real credentials, repository data, comments, and diffs must stay out of
  source, logs, screenshots, traces, and commits. Automated browser fixtures
  use disposable synthetic values only.

## Requirements

- Node.js 20.19 or newer
- Corepack and pnpm 11.24.0
- Chromium for the Playwright acceptance suite

## Install and run locally

```bash
git clone https://github.com/shushpan/revelio.git
cd revelio
corepack enable
corepack prepare pnpm@11.24.0 --activate
pnpm install --frozen-lockfile
pnpm dev
```

Open the localhost URL printed by Vite. To build and serve the production
bundle locally:

```bash
pnpm build
pnpm preview
```

If `pnpm` is missing, run the Corepack commands above. Homebrew users may
install pnpm with `brew install pnpm`, while keeping the project's pinned
version for reproducible results.

## Verification

Run focused checks with:

```bash
pnpm test:unit
pnpm build
pnpm test:e2e
```

Or run the complete local contract:

```bash
pnpm verify
```

The browser harness intercepts Bitbucket with synthetic fixtures and rejects
unexpected external requests. Passing locally does not prove live Bitbucket
CORS, token scopes, or provider behavior.

## Current limitations

Credentials are session-memory only. The release does not yet include an
encrypted passkey/passphrase vault, background caching, search or rules,
repository exclusions, existing comment threads, a command palette or keyboard
shortcuts, stacked pull requests, or additional providers.

Live browser CORS, token scope sufficiency, activity watermarks, renewed-review
signals, and mutation behavior against a real Bitbucket account depend on the
user's environment and have not been validated by the synthetic browser suite.

## Contributing

Keep credentials and real company data out of source, tests, logs, screenshots,
traces, and commits. Run `pnpm verify` before opening a change, and update the
security guidance when the provider boundary changes.

## License status

No license file has been declared yet. Until the project publishes one, all
rights remain reserved; contributions and reuse are not licensed by this
README.
