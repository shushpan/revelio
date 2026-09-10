# Repository Scope, Progressive Sync, and Seven-Day Vault

**Date:** 2026-09-02
**Status:** Proposed
**Product:** Revelio

## 1. Problem

The current connection flow validates credentials, discovers every accessible repository, and loads every repository's open pull requests as one opaque operation. A live HAR showed the repository endpoint called with `pagelen=1` for pages 1 through 100. The workspace contained 168 repositories, page 100 still had a `next` link, and Revelio's 100-page safety limit aborted discovery before any pull-request request was made. The UI then rendered an empty inbox with a generic partial-failure warning, creating the false impression that the user had no pull requests to review.

The same screen uses an email field and a password-type API-token field. Browsers can classify this as a login form and offer to save it in Passwords even when `autocomplete="off"` is present. Revelio currently stores credentials only in React memory, so a page reload always returns to the connection form. These are independent behaviors: the password-manager prompt is browser-controlled, while the lost session is an intentional limitation of the current implementation.

## 2. Goals

1. Validate credentials quickly without starting a full inbox sync.
2. Show accessible workspaces and repositories after the first successful sign-in.
3. Let the user include whole workspaces or individual repositories and manage that scope later.
4. Persist repository scope per Bitbucket identity in IndexedDB.
5. Minimize Bitbucket requests and response payloads using maximum supported page sizes and partial response fields.
6. Load selected repositories with bounded concurrency and expose useful progress without blocking the UI.
7. Never claim that there are no pull requests while selected sources remain pending or failed.
8. Persist credentials locally in an encrypted vault, with automatic resume for a fixed seven-day trusted-browser window.
9. Preserve the client-only trust boundary: credentials and provider data never pass through a Revelio backend.

## 3. Non-goals

- A Revelio backend, proxy, webhook receiver, or scheduled sync while the app is closed.
- An undocumented Bitbucket endpoint for cross-repository pull-request aggregation.
- A network Web Worker. Browser fetches are already asynchronous; workers remain limited to CPU-heavy diff preparation.
- Guaranteed suppression of browser password-manager prompts. Browsers may ignore autocomplete hints for login-like forms.
- Silent permanent login. The remembered-browser session expires after seven days and explicit Lock ends it immediately.
- New inbox ranking, rules, activity-watermark semantics, or CI aggregation.

## 4. Bitbucket API Strategy

Bitbucket's documented pull-request list endpoint is repository-scoped, so one pull-request request per included repository is unavoidable. Revelio reduces the surrounding cost:

- Workspaces: `GET /2.0/user/workspaces?pagelen=100&fields=next,values.workspace.slug`
- Repositories: `GET /2.0/repositories/{workspace}?pagelen=100&fields=next,values.slug`
- Pull requests: `GET /2.0/repositories/{workspace}/{repository}/pullrequests?state=OPEN&pagelen=100&fields=...`

The pull-request `fields` value contains only the page `next` link and fields required by `PullRequestSummary`: id, title, description, state, update timestamp, author identity, source branch and commit, destination branch, and reviewer UUIDs. DTO schemas are narrowed to match the requested response rather than requiring unused embedded user fields.

Every collection follows Bitbucket's opaque `next` link after validating its fixed API origin and endpoint family. Revelio does not construct subsequent page numbers. The 100-page loop-safety check remains; with `pagelen=100`, it permits up to 10,000 items for one collection instead of failing at 100 items.

## 5. Connection and Repository Selection

### 5.1 First connection

1. The user enters Atlassian email and Bitbucket API token.
2. Revelio loads only the current Bitbucket user to validate the credentials and obtain the stable user UUID.
3. The user chooses passkey, passphrase, or session-only credential handling. Passkey and passphrase modes create the encrypted long-term vault and seven-day trusted-browser session.
4. Revelio loads workspace summaries and then repository slugs, showing discovery progress.
5. Revelio displays a compact selection screen grouped by workspace.
6. The user may select a workspace or individual repositories.
7. Continue is disabled until at least one source is selected.
8. Revelio saves the normalized scope under the provider ID and current-user UUID, then opens the inbox and starts progressive synchronization.

### 5.2 Selection semantics

Persisted scope contains:

- `selectedWorkspaces`: workspace slugs whose complete repository set is included.
- `selectedRepositories`: explicit `{ workspace, slug }` references in workspaces that are not wholly selected.

Selecting a workspace means all repositories currently and subsequently discovered in that workspace. Individual repository selections are exact. Selecting a whole workspace removes redundant individual selections for that workspace. Deselecting a workspace leaves its repositories unselected until the user explicitly chooses individual ones.

### 5.3 Later sessions

When a valid saved scope exists, Revelio reuses it and opens the inbox after credential restoration. Repository discovery still refreshes workspace selections so new repositories in a selected workspace become included. The inbox toolbar exposes **Manage repositories**, which returns to the same selection screen. Saving changes cancels the active sync, persists the new scope, preserves still-relevant results, and starts a sync for the new scope.

Scope is keyed by stable Bitbucket user UUID so one person's repository choices cannot leak into another person's session on the same browser profile.

## 6. Progressive Synchronization

The inbox loader receives an explicit repository list; it no longer owns workspace or repository discovery. It runs at most four repository pull-request operations concurrently. Each operation follows its own pagination sequentially.

The loader emits snapshots containing:

- total selected repositories;
- completed, pending, and failed repository counts;
- accumulated pull requests;
- repository-specific sanitized failures;
- completion state.

The UI renders the inbox shell immediately and updates existing rows as snapshots arrive. Example status text is: `Loaded 12 of 38 repositories - 6 pull requests found.` Existing rows remain interactive while the remaining repositories load. Refresh preserves current rows until replacements arrive and never steals focus.

The terminal empty state is allowed only when all selected repositories completed successfully and zero matching pull requests were returned. If any repository failed, the UI says that results are incomplete and names the affected repository references without exposing provider response bodies. Zero successful results plus failures must never render `No pull requests in this view.`

Cancellation uses an `AbortController` owned by the active connection/sync lifecycle. Changing scope, locking, or starting a newer refresh aborts obsolete requests and ignores late snapshots.

## 7. Credential Vault and Seven-Day Auto-Resume

### 7.1 Primary vault

The encrypted credential payload contains only Atlassian email and Bitbucket API token.

- Preferred mode: a WebAuthn passkey with the PRF extension derives vault key material, followed by HKDF-SHA-256 and AES-256-GCM.
- Fallback mode: a user passphrase derives vault key material using Argon2id with versioned parameters and a random salt, followed by HKDF-SHA-256 and AES-256-GCM.
- Session-only mode: credentials remain in memory and reload requires connection again.

PRF support is determined from actual WebAuthn extension results. Revelio never silently downgrades passkey mode to passphrase or session-only mode.

### 7.2 Remember this browser for seven days

After successful passkey or passphrase unlock, Revelio offers a trusted-browser session with a fixed seven-day expiry:

1. Generate a random AES-GCM session key as a non-extractable `CryptoKey`.
2. Encrypt a short-lived copy of the credential payload with that key.
3. Store the non-extractable key, ciphertext, nonce, creation time, and fixed expiry (`createdAt + 604800000` milliseconds) in IndexedDB.
4. On reload, use the session key only when the record is intact, belongs to the same local identity, and has not expired.
5. Do not extend the expiry during ordinary use or reload. A new seven-day window begins only after an explicit passkey/passphrase unlock.
6. At expiry, delete the short-lived record and show **Unlock Revelio**. The long-term encrypted vault remains.
7. Explicit **Lock** immediately deletes the short-lived key and ciphertext and clears decrypted credentials/provider state from memory.

A non-extractable stored `CryptoKey` prevents ordinary JavaScript from exporting its raw bytes, but same-origin JavaScript can still ask it to decrypt during the trusted period. The UI therefore labels the option **Trust this browser for 7 days** and explains that it is weaker than requiring a passkey on every reload. A malicious same-origin deployment or script injection during the trusted period could use the restored credentials; CSP, pinned/self-hosted builds, and absence of runtime third-party scripts remain essential controls.

If IndexedDB is unavailable, cleared, corrupted, or copied to a different origin/profile, Revelio falls back to explicit unlock or reconnection. There is no credential recovery.

### 7.3 Password-manager prompt

Revelio keeps correct semantic fields and autocomplete hints but does not promise to suppress Passwords prompts, because browsers may ignore those hints on login-like forms. Connection copy explains that the browser prompt is separate from Revelio's encrypted vault. Revelio never reads from or depends on the browser password manager.

## 8. Persistence

Use one small native IndexedDB wrapper with versioned records; add no persistence dependency. Stores contain:

- repository scope keyed by provider and user UUID;
- active local identity metadata containing provider and user UUID, but no email or token;
- long-term encrypted vault envelope and non-secret vault metadata;
- seven-day trusted-browser key/ciphertext record;
- existing non-secret review checkpoints, migrated separately only if needed by the implementation plan.

Repository selections are non-secret metadata. Credentials are never stored in localStorage, URLs, logs, error objects, analytics, service workers, or Cache Storage.

## 9. UI States

The application state becomes:

- `connect`: no usable vault or the user chose to replace credentials;
- `unlock`: long-term vault exists but no valid trusted-browser session exists;
- `select-sources`: authenticated, discovering or editing repository scope;
- `inbox`: authenticated with a saved scope and progressive sync state;
- `review`: existing pull-request review screen.

Connection and selection screens display short, specific steps such as `Checking credentials`, `Loading 1 workspace`, and `Loading repositories 100 of 168`. The UI remains interactive throughout. Errors distinguish credential rejection, workspace discovery failure, repository discovery failure, partial PR sync, rate limiting, and local-vault failure without displaying provider bodies or secrets.

## 10. Testing and Verification

Implementation follows test-driven development.

Provider tests must prove:

- workspace and repository discovery request `pagelen=100` and exact partial fields;
- a synthetic 168-repository workspace completes in two repository pages;
- opaque next links remain validated;
- PR requests include only required fields and open state;
- no real workspace names, tokens, or HAR payloads enter fixtures.

Domain tests must prove:

- workspace selection includes current and newly discovered repositories;
- explicit repository selection excludes unselected siblings;
- saved scope is isolated by user UUID;
- no more than four repository operations run concurrently;
- snapshots accumulate successful results and retain sanitized failures;
- an empty state is impossible while work is pending or any source failed;
- cancellation prevents stale snapshots from replacing a newer scope or refresh.

Vault tests must prove:

- credential ciphertext round-trips without exposing the token in serialized records;
- wrong passphrase, tampering, unsupported PRF, and corrupted records fail closed;
- a trusted-browser record auto-resumes before its fixed expiry;
- ordinary reload/use does not extend expiry;
- expiry and explicit Lock delete the short-lived key/ciphertext and require unlock;
- session-only mode writes no credential material.

Component and Playwright tests must prove:

- first connection reaches interactive repository selection before inbox sync;
- saved scope exposes **Manage repositories** and is reused later;
- progress changes while repository responses are deliberately staggered;
- successful PRs appear before the last repository completes;
- failed or pending repositories never produce a false all-clear/empty message;
- reload during a valid seven-day session returns to the scoped inbox;
- expired session shows **Unlock Revelio**;
- Lock always requires unlock regardless of remaining time;
- credentials never appear in DOM text, URLs, console output, or committed fixtures.

Final verification runs formatting, lint, type checking, unit tests, production build and bundle budget, Playwright, and desktop/narrow visual checks. Live Bitbucket verification remains a user-run check with disposable credentials; automated tests do not consume or record the attached real HAR beyond the sanitized counts documented in this design.

## 11. Delivery Order

1. Correct Bitbucket page sizes and partial fields, with the 168-repository regression test.
2. Split identity validation, repository discovery, and explicit-scope inbox loading.
3. Add IndexedDB repository-scope persistence and the interactive selector.
4. Add bounded progressive sync and truthful pending/partial/empty states.
5. Add the long-term passkey/passphrase vault.
6. Add fixed seven-day trusted-browser auto-resume, expiry, and Lock behavior.
7. Update end-to-end coverage, documentation, and live-check instructions.

The order fixes the false-empty production defect early while keeping the vault work isolated from provider synchronization.

## 12. References

- [Bitbucket Cloud pagination and partial responses](https://developer.atlassian.com/cloud/bitbucket/rest/)
- [Bitbucket Cloud pull-request API](https://developer.atlassian.com/cloud/bitbucket/rest/api-group-pullrequests/)
- [HTML autocomplete behavior](https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/Turning_off_form_autocompletion)
- [WebAuthn Level 3 PRF extension](https://www.w3.org/TR/webauthn-3/#sctn-prf-extension)
- [Web Crypto key storage and security considerations](https://www.w3.org/TR/webcrypto-2/#concepts-key-storage)
