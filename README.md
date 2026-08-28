# Fast Review

Fast Review is a backend-free Bitbucket Cloud review-workspace feasibility
probe. The Phase 0 build is a static React/TypeScript application: the browser
calls Bitbucket directly and the local diagnostics screen proves only read
request shape, decoding, redaction, cancellation, and error handling.

## Local setup

Requirements: Node.js, pnpm, and a Chromium installation for the Playwright
acceptance suite.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open the local URL printed by Vite. The production verification gate builds
and serves the production bundle itself:

```sh
pnpm verify
```

The gate runs formatting, linting, strict TypeScript checking, Vitest, a
production build, bundle-budget checks, and Playwright against that production
server. `pnpm build` creates `dist/`; `pnpm preview` serves it locally.

## Security boundary

- Phase 0 accepts the Atlassian email and Bitbucket API token only in
  in-memory React state. Credentials are cleared by Lock and by a browser
  reload; they are not written to a server, URL, log, storage API, fixture, or
  build artifact.
- The request builder fixes the API origin to
  `https://api.bitbucket.org/2.0`, uses GET-only read options, and rejects
  absolute or foreign paths. The diagnostics workflow does not send a request
  to any other remote origin.
- Provider responses are decoded at the adapter boundary and diagnostics
  expose only capability status and redacted error categories. Source code,
  diffs, comments, and response bodies are not persisted by this probe.
- The worker receives only synthetic patch text and performs CPU work. It has
  no credential, provider, storage, or network dependency.
- Approve, Request changes, general-comment, and inline-comment code in Phase 0
  consists of inert request-shape descriptors covered by tests. No UI path
  executes a Bitbucket mutation.
- The browser tests intercept Bitbucket calls with synthetic fixtures. Passing
  them does not prove real-token CORS, token scopes, or remote behavior.

When deploying the static files, configure the host with the CSP and security
headers described in the design specification. Vite preview is a local test
server and does not by itself provide production hosting headers.

## Phase 0 limitations

This is not yet the review product. Encrypted vault storage, passkeys,
passphrase derivation, repository exclusions, cache and checkpoints, the
actionable inbox, search and rules, Overview, review drafts, Finish review, and
the continuous queue are later-phase work.

The following gates remain explicitly unresolved until a controlled disposable
pull request is observed with a real token: browser CORS, the required token
scopes, renewed-review-request activity, approval, Request changes, general
comments, inline-comment coordinates, and approval reset after a new source
commit. Comparisons/activity watermarks and WebAuthn PRF/Argon2id browser
capability are also not proven. See [the acceptance report](docs/phase-0/acceptance-report.md)
and [the live-check checklist](docs/phase-0/live-bitbucket-checklist.md).

Never put a real email, token, repository content, pull-request title, comment,
or diff in chat, an issue, a fixture, a trace, or a log. Use the local form and
the sanitized evidence rules in the live checklist.
