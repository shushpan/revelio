# Revelio — Product and Architecture Design

**Status:** Approved architecture; 2026-08-29 product and UI constraints incorporated; awaiting checkpoint review

**Date:** 2026-08-29

**Product name:** Revelio

**Product type:** Open-source, backend-free static web application

## 1. Executive summary

Revelio is a personal review inbox and code-review surface for Bitbucket Cloud. It combines pull requests from many repositories into one trustworthy TODO list, explains why each pull request needs attention, and provides a full-page review experience centered on `@pierre/diffs`.

The application has no product backend, account system, server-side storage, analytics, telemetry, AI calls, or runtime third-party code. The browser communicates directly with `api.bitbucket.org`. Users may open the public hosted version, serve the same static release internally, or run the supplied minimal container.

The primary product promise is trust: an explicit review request or directly relevant follow-up must not be silently missed. Finishing a review creates a local checkpoint and removes the pull request from the actionable inbox. The pull request returns when that checkpoint is invalidated by a new commit, an approval reset, a renewed review request, a direct reply or mention, or a reopened thread created by the user.

## 2. Goals

1. Present one compact actionable review inbox across Bitbucket Cloud repositories.
2. Make every inbox entry explain why it needs attention.
3. Make reviewing code faster than Bitbucket's standard interface.
4. Preserve a clear distinction between Bitbucket lifecycle state, remote review state, and local inbox state.
5. Keep credentials out of any product server and encrypt persisted credentials locally.
6. Remain useful with missing write scopes, partial repository failures, stale metadata, or rate limiting.
7. Create narrow provider boundaries so a later GitHub or GitLab adapter is possible without building a plugin framework now.
8. Make every implementation phase independently verifiable by deterministic unit and Playwright tests.

## 3. Non-goals

- Product accounts or a separate login identity.
- A product backend, serverless API, proxy, database, webhook receiver, or cloud synchronization service.
- Shared team queues, assignments, or cross-device live state.
- OAuth in v1.
- GitHub, GitLab, or Bitbucket Data Center support in v1.
- A dynamic provider plugin system.
- Stacked pull-request workflows in v1.
- AI summaries, prioritization, comments, or recommendations.
- Merge, decline-PR, repository-write, or administrative actions.
- Persistent storage of source code, diffs, PR descriptions, comments, or draft comments in v1.
- Offline review submission.

## 4. User and operating target

The primary user is a developer reviewing code across several Bitbucket Cloud repositories. They are comfortable with dense, keyboard-oriented developer tools and want one review queue rather than repository dashboards, email, and chat notifications.

V1 is designed for:

- One Bitbucket identity and API token at a time.
- Repositories across all workspaces accessible to that identity.
- Approximately 30 included repositories.
- Approximately 50 actionable pull requests at once.
- One browser profile and device-local state.
- Desktop as the primary review surface, with a usable narrow unified-diff layout.

## 5. Product principles

1. **Changes first.** The diff receives the most space and visual weight.
2. **Trust before cleverness.** Reasons, freshness, failures, and limitations remain visible.
3. **Compact by default.** Small padding, restrained chrome, dense rows, and short labels.
4. **One inbox, not a notification feed.** Only actionable review work enters the primary count.
5. **Explainable intelligence.** Search, filters, saved rules, and suggestions use deterministic logic.
6. **Safe degradation.** Limited scopes and partial data remain useful without pretending to be complete.
7. **Minimal dependencies and abstractions.** Security, accessibility, validation, and error handling are never simplified away.

## 6. Authentication and credential lifecycle

### 6.1 Bitbucket authentication

Bitbucket API tokens use HTTP Basic authentication. The connection form therefore collects:

- Atlassian account email.
- Bitbucket API token.

The pair is used only for requests to `https://api.bitbucket.org`. The complete token is never displayed after entry and never appears in logs, URLs, error messages, analytics, or crash reports.

V1 supports one connection. Replacing the token preserves repository exclusions, rules, preferences, cache metadata, and review checkpoints when the Bitbucket identity is unchanged. A changed identity starts a new local workspace after explicit confirmation so checkpoints cannot cross users accidentally.

### 6.2 Required scopes

The setup guide asks for the least privileges needed:

- `read:user:bitbucket` — validate and identify the current user.
- `read:workspace:bitbucket` — discover accessible workspaces.
- `read:repository:bitbucket` — discover repositories, load source/diffs, and read commit statuses.
- `read:pullrequest:bitbucket` — read pull requests and comments; Bitbucket also permits PR comments with this scope.
- `write:pullrequest:bitbucket` — optional, required for Approve and Request changes.

The product never asks for repository write, repository admin, workspace admin, merge, webhook, or deletion permissions. Capability validation tests actual required endpoints and disables only unavailable actions.

### 6.3 Storage modes

The connection screen offers:

1. **Use passkey** — primary when WebAuthn PRF is supported.
2. **Use passphrase** — encrypted fallback.
3. **This session only** — no persisted credential.

Passkey support is feature-detected from actual credential-extension results. The application never silently falls back from passkey protection to another mechanism.

WebAuthn requires a secure context. The public build uses HTTPS; local development may use `localhost`; other self-hosted deployments must provide HTTPS to offer passkey mode. Passkeys and PRF outputs are origin-bound, so a vault created on the public domain cannot be unlocked on a different self-hosted origin. Moving origins requires connecting again.

### 6.4 Vault format

Only the Atlassian email and API token are encrypted in v1.

- Passkey mode: WebAuthn PRF output is domain-separated with HKDF-SHA-256.
- Passphrase mode: bundled Argon2id derives key material from a unique random salt, followed by HKDF-SHA-256.
- The credential payload is encrypted with AES-256-GCM and a fresh random nonce.
- IndexedDB stores a versioned envelope containing ciphertext, nonce, salts, KDF parameters, mode, and passkey credential identifier.
- The encryption key and decrypted credentials exist only in memory while unlocked.
- The default inactivity lock is 15 minutes; explicit Lock clears the active connection immediately as far as JavaScript permits.

There is no credential recovery. If the passkey or passphrase is unavailable, the user removes the encrypted credential envelope and supplies a newly issued Bitbucket token. Non-secret local state may remain.

## 7. Security model

### 7.1 What the design protects

- No application server receives credentials, repository data, comments, or source code.
- Persisted credentials are encrypted at rest.
- API calls are restricted to Bitbucket Cloud by Content Security Policy.
- Runtime third-party scripts, CDNs, fonts, analytics, and telemetry are absent.
- API data is treated as untrusted input and decoded at provider boundaries.
- Remote images in PR Markdown are blocked by default to prevent third-party requests and tracking.
- Service workers never receive or store Bitbucket credentials or API responses.

### 7.2 Honest limitation of public hosting

An unlocked browser application must be able to use the decrypted token. A malicious future deployment at the public origin could attempt to steal that token or repository data after unlock. At-rest encryption cannot prevent this.

The public build therefore:

- Explains this limitation before persistent storage is selected.
- Recommends self-hosting for company repositories.
- Offers session-only mode as the lowest-persistence public-host option.
- Shows the exact build version and source revision.

The product must say “no application backend storage or processing,” not “zero knowledge.”

### 7.3 Browser hardening

The production host and container set a strict CSP equivalent to:

```text
default-src 'self';
script-src 'self';
style-src 'self';
connect-src https://api.bitbucket.org;
img-src 'self' data:;
font-src 'self';
worker-src 'self';
object-src 'none';
base-uri 'none';
frame-ancestors 'none';
form-action 'self';
```

Additional headers include HSTS on HTTPS deployments, `X-Content-Type-Options: nosniff`, a restrictive referrer policy, and a restrictive permissions policy. API fetches use `cache: "no-store"`. PR Markdown does not execute HTML; links leaving the application are explicit and safely opened.

## 8. Local storage and smart cache

### 8.1 Persisted local state

The application stores these non-secret records in IndexedDB:

- Repository and workspace exclusions.
- Saved searches and rule effects.
- Diff and accessibility preferences.
- Review checkpoints.
- Viewed-file paths and reviewed commit hashes.
- Minimal inbox metadata cache.
- Recently finished identifiers and timestamps.

The minimal review checkpoint contains repository/PR identity, reviewed head hash, activity watermarks, reviewer-presence state, known states for threads created by the user, outcome, and finish time.

### 8.2 Metadata cache

The unencrypted inbox cache may contain repository, PR number, title, author, attention reason, change-size summary, CI summary, and timestamps.

Settings states clearly that this metadata is stored unencrypted, shows its retention period, and provides an immediate Clear cached metadata action.

- Cached rows render immediately after unlock.
- Records are marked stale after five minutes.
- Records are deleted after 24 hours.
- Expired records are purged on launch and periodically while open.
- A stale or partial cache can never produce an “All caught up” claim.

### 8.3 Non-persistent review data

V1 keeps the following only in memory:

- Source code and raw patches.
- Parsed diffs.
- PR descriptions and activity bodies.
- Comments and discussion contents.
- Draft inline and general comments.

While a review is open, the application may prefetch the full data for the current pull request and the next few queue entries into memory. Closing, refreshing, crashing, or locking the application can discard unsent drafts; the UI states this limitation near draft creation.

## 9. Independent state dimensions

“Finished review” is not a Bitbucket PR lifecycle state. Every PR is represented by three independent dimensions.

### 9.1 Bitbucket lifecycle

- `OPEN`
- `MERGED`
- `DECLINED`

Only `MERGED` and Bitbucket `DECLINED` are terminal for the inbox.

### 9.2 Remote review decision

- `UNREVIEWED`
- `APPROVED`
- `CHANGES_REQUESTED`

Bitbucket may change or reset this state after new commits or repository-policy evaluation.

### 9.3 Local inbox state

- `NEEDS_ATTENTION`
- `REVIEWING`
- `CHECKPOINTED`

A successful Finish review creates `CHECKPOINTED`; it does not imply merge or closure.

## 10. Actionable inbox semantics

### 10.1 Initial entry

An open PR becomes actionable when:

- The user is explicitly requested as a reviewer.
- The user is directly involved through an `@mention` or meaningful discussion participation.

Generic repository activity, another reviewer's approval, and unrelated comments are not actionable.

### 10.2 Finish and removal

After Finish review succeeds, the local checkpoint is saved and the PR leaves the actionable inbox. Finish outcomes are:

- **Approve** — posts drafts, then approves when permitted.
- **Request changes** — posts drafts, then requests changes when permitted.
- **Reviewed without status** — posts drafts if present, then creates only a local checkpoint.

### 10.3 Checkpoint invalidation and re-entry

An open checkpointed PR returns when:

- Its source head hash changes.
- Bitbucket resets or removes the user's approval.
- The user is requested as reviewer again.
- Someone directly replies in a thread in which the user participated.
- Someone mentions the user.
- A thread created by the user is reopened.

A new source commit always requeues the PR, whether or not Bitbucket preserves the approval.

Unrelated comments, other reviewers' actions, CI changes alone, and generic PR updates do not requeue it.

### 10.4 API-observability fallback

Phase 0 verifies whether Bitbucket activity exposes a reliable renewed-review-request event. If it does, that event invalidates the checkpoint directly. If it does not, v1 detects only reviewer absence-to-presence transitions observed during refresh and labels this limitation in Settings. The product does not claim to detect an event Bitbucket does not expose.

## 11. Inbox presentation

The default inbox is one compact flat list. Each row shows:

- Repository and PR number.
- PR title and author.
- Specific attention reason.
- Waiting or relevant-event age.
- Compact change size.
- CI icon with accessible name.

Default ordering is:

1. Direct replies, mentions, reopened user threads, and renewed requests.
2. New commits after a finished review.
3. Ordinary review requests.

Within a reason, oldest waits appear first.

Revelio uses HeroUI's default light and dark themes without a custom product palette. Compactness comes from composition, spacing, and information hierarchy built with HeroUI primitives rather than from a separate theme or component system. The interface follows the system preference by default and allows an explicit light, dark, or system choice.

## 12. Search, filters, and saved rules

One GitHub-like query model powers search, quick filters, priority rules, named groups, and optional completion suggestions. Initial qualifiers cover:

- Identity: `author:`, `reviewer:`, `review-requested:`, `reviewed-by:`, `involves:`, `team:`.
- Location: `workspace:`, `repo:`.
- Review state: `review:`, `reason:`, `is:`.
- Delivery: `ci:`.
- Triage: `age:`, `size:`.

Spaces mean AND, a leading `-` excludes, quoted values support spaces, and compatible repeated values may express OR. Autocomplete and validation work entirely by keyboard.

Quick filters insert or remove query terms; the text field remains the source of truth. Default helpers are Requested, Direct, New commits, and CI failed.

Saved query effects are:

1. Prioritize matches.
2. Create a named group.
3. Suggest when caught up.

Rules may reorder or visibly group actionable PRs. They cannot permanently hide obligations. A narrowed view always shows matching and total actionable counts.

Phase 0 verifies whether Bitbucket exposes deterministic team membership usable by the token. If it does not, `team:` is omitted from v1 rather than implemented with guessed or locally duplicated membership.

## 13. Review workspace

### 13.1 Layout

The review surface contains:

1. Extremely thin sticky top bar.
2. `Changes` and `Overview` tabs.
3. Compact left file tree and dominant content surface.
4. Hidden-by-default right queue drawer.

Opening an inbox entry always opens `Changes`.

### 13.2 `@pierre/diffs`

`@pierre/diffs/react` is the primary code-review surface.

- `CodeView` and built-in virtualization render multi-file changes.
- Bitbucket patches are decoded and parsed into the library's file model.
- Bitbucket discussions and local drafts map to annotations.
- Line selections map back to Bitbucket inline-comment anchors.
- Wide screens default to split; narrow screens default to unified.
- A manual override is remembered.
- Diffs uses its native default themes: `pierre-light` and `pierre-dark`.
- The Diffs theme follows Revelio's resolved light/dark mode; Revelio does not override the code palette.
- Editing APIs are out of scope.
- The experimental Diffs worker pool is enabled only if the Phase 2 compatibility/performance gate passes; built-in virtualization is the fallback.

### 13.3 Comparison and files

The Changes tab offers:

- All changes.
- Since the last finished review, when available.
- Individual commit or commit range.

First reviews default to All changes. A PR requeued by new commits defaults to Since last finished review.

Viewed state is explicit. Scrolling never implies review. New commits reset Viewed only for affected files.

### 13.4 Overview

Overview combines description, branch relationship, reviewers and decisions, general comments, activity, commits, and linked items exposed by Bitbucket. It is not a permanent side panel.

### 13.5 Queue

The review queue is a right-side overlay drawer. It shows the current and upcoming PRs from the inbox order captured when the session starts. New arrivals do not interrupt the active sequence. After successful Finish review, the next valid PR opens automatically; after the final PR, the inbox opens.

## 14. Comments and Finish review transaction

Draft inline and general comments are local and in-memory by default. Each draft can be sent immediately. Finish review shows pending drafts, an optional overall comment, and available outcomes.

Bitbucket does not provide one atomic “finish review” operation, so submission is a resumable ordered workflow:

1. Fetch and compare the current source head with the reviewed head.
2. If changed, stop and refresh before any review submission.
3. Post pending inline comments sequentially.
4. Post the general comment.
5. Apply Approve or Request changes; skip this step for Reviewed without status.
6. Fetch the source head again.
7. Persist the local checkpoint.
8. Remove the PR, or immediately requeue it if the head changed during submission.

Each successful comment response is recorded in the active session. A retry sends only unfinished operations. If the decision fails after comments were posted, the PR remains actionable and the retry attempts only the decision.

If local persistence fails after Bitbucket accepted remote operations, the application states exactly what succeeded and keeps the PR visible until it can save or the user refreshes. It never claims rollback of Bitbucket actions.

## 15. Synchronization

### 15.1 Refresh triggers

Refresh occurs:

- On unlock and launch.
- On focus when the snapshot is stale.
- After review actions.
- Approximately every five minutes while visible and unlocked.
- On manual request.

No token-backed refresh occurs after the application is closed or locked.

### 15.2 Progressive algorithm

1. Render valid cached inbox metadata immediately.
2. Validate identity and capabilities.
3. Discover accessible workspaces and repositories.
4. Apply workspace/repository exclusions.
5. Fetch open PR summaries with Bitbucket filtering and partial response fields.
6. Read repository-wide PR activity and detailed PR activity only where needed.
7. Normalize provider data.
8. Compare normalized data with checkpoints.
9. Emit progressive inbox snapshots.
10. Confirm completion only when every included repository has succeeded.

Pagination follows opaque `next` links rather than constructing page numbers. The initial concurrency limit is four repository requests and is changed only with measurement. Requests use retry with jitter for transient failures and respect rate-limit headers. Automatic refresh pauses when the safe request budget is exhausted.

At the target scale, a five-minute visible polling interval leaves room under Bitbucket's default authenticated 1,000-request rolling-hour limit for details and user actions.

### 15.3 Partial and stale results

- Successful repository results stay usable when another repository fails.
- Failed repositories are listed and retried separately.
- Stale metadata retains its last-confirmed time.
- Writes are disabled when connectivity or credential validity is unconfirmed.
- Partial or stale state cannot show “All caught up.”
- Rate limiting preserves the snapshot and shows the next safe retry time.

## 16. Application architecture

### 16.1 Technology stack

- React and TypeScript in strict mode.
- Vite static production build.
- Latest stable Effect release at implementation kickoff.
- `@pierre/diffs/react` as the primary review renderer.
- HeroUI v3 through `@heroui/react` and `@heroui/styles` as the only product component and theme system.
- Tailwind CSS v4 only as HeroUI's required styling runtime and layout utility layer.
- HeroUI's default light and dark themes; no custom palette in the initial product.
- Native semantic HTML and narrowly scoped CSS only for layout glue or behavior for which HeroUI has no primitive.
- IndexedDB through one small wrapper.
- Web Crypto plus one bundled, reviewed Argon2id implementation.
- Vitest for unit/module tests.
- Playwright for browser acceptance tests.
- pnpm with a frozen lockfile.

The initial implementation does not add SSR, React Query, Redux, Zustand, a second UI framework, an Effect React atom package, or a server runtime. Existing Phase 0 bespoke presentation CSS is migrated to HeroUI rather than maintained as a parallel design system. Beta or unstable Effect APIs are not used without an explicit architecture update.

### 16.2 Modules

```text
src/
  app/                 Composition root, runtime, routing, React integration
  connection/          Vault, unlock, identity, capabilities
  workspace/           Repository discovery and exclusions
  inbox/               Attention rules, checkpoints, queries, ordering
  review/              Diffs, comments, decisions, Finish review
  sync/                Scheduling, concurrency, rate budget, prefetch
  providers/
    contract/           Narrow normalized provider operations and models
    bitbucket-cloud/    API DTOs, schemas, mapping, authentication
  platform/
    crypto/             WebAuthn PRF, Argon2id, HKDF, AES-GCM
    persistence/        IndexedDB vault, metadata cache, checkpoints
    workers/            CPU-heavy request/response jobs
  ui/                   HeroUI composition and product-specific adapters
```

Each module exposes one small public entry point. Code outside a module does not import that module's internal files.

### 16.3 Effect boundaries

Effect is used for asynchronous or fallible application work:

- Typed failures.
- API decoding with Effect Schema.
- Cancellation and scoped lifetimes.
- Bounded concurrency.
- Retry, backoff, and rate scheduling.
- Service composition with Context and Layers.
- Background synchronization streams.

Pure inbox classification, query matching, ordering, checkpoint comparison, and view-model transformations remain ordinary pure TypeScript.

One Effect runtime is created at the application root. React invokes thin command/query hooks and observes stable snapshots through `useSyncExternalStore`. There is no global event bus. Cross-module communication uses explicit services and plain tagged domain data. An Effect queue exists only inside the synchronization coordinator.

### 16.4 Provider boundary

The provider contract covers only capabilities required by the product:

- Validate a connection and return identity/capabilities.
- Discover repositories.
- List open PR summaries and activity.
- Load one PR, its comparisons, statuses, comments, and patch.
- Post inline/general comments.
- Approve, unapprove when needed, request changes, or remove that request.

Provider DTOs never escape the adapter. The adapter validates and maps them into normalized IDs, summaries, activity records, diff inputs, comment anchors, and capability flags. V1 composes one Bitbucket Cloud implementation directly; it has no registry, dynamic loading, provider configuration DSL, or plugin lifecycle.

## 17. Web-worker strategy

Workers are used for CPU-heavy isolated computations, following established browser practice. Async network calls and the main Effect runtime remain on the main thread because moving them provides little responsiveness benefit and adds communication complexity.

A stateless dedicated module worker handles:

- Argon2id passphrase derivation.
- Large patch decoding and parsing.
- Expensive diff preprocessing.
- Any later computation shown by profiling to create long main-thread tasks.

Worker requests use tagged schemas, request IDs, cancellation messages, one bounded queue, and transferable buffers where possible. The worker can be terminated and recreated without losing application state.

`@pierre/diffs/worker` is currently experimental. Phase 2 tests it with real annotation, CSP, browser, and large-diff fixtures. It is enabled only if that gate passes; otherwise syntax highlighting stays on the main thread with Diffs virtualization.

## 18. Routing and UI state

The static build uses hash-based routes so the downloadable build and minimal container need no rewrite configuration:

- `#/connect`
- `#/inbox`
- `#/review/{workspace}/{repository}/{pr}`
- `#/settings`

Transient dialogs, queue visibility, focused file, and draft editors remain component state. Domain and synchronization state live behind module services. URL state is used only when a refresh or shareable local navigation target is useful; credentials and query secrets never enter the URL.

## 19. Loading, errors, and completion

### 19.1 Loading

- Render the shell and preferences immediately.
- Use compact row skeletons only for repositories not yet loaded.
- Preserve existing rows during background refresh.
- Never steal keyboard focus during refresh.

### 19.2 Errors

- Invalid/expired token: preserve non-secret state and offer Replace token.
- Missing scopes: continue with available read-only features.
- Repository failure: keep other results and show the failed repositories.
- Rate limit: pause retries until safe and show timing.
- Diff/comment mismatch: preserve the in-memory draft and offer re-anchor, general comment, or discard.
- Action failure: preserve in-memory drafts, selected outcome, and known remote-operation receipts; do not advance the queue.
- Worker crash: restart the worker; only passphrase derivation or active parsing work is retried.

### 19.3 Completion

“All caught up” appears only after a complete live refresh confirms no actionable PRs. It includes last-confirmed time, manual refresh, and recent finished reviews available from the current metadata cache.

An optional Can help section is separate from the actionable count. Suggestions use transparent deterministic reasons and never prevent completion.

## 20. Accessibility and keyboard behavior

- All primary flows are keyboard-complete.
- Arrow keys navigate lists; Enter opens; Escape closes/returns; `/` focuses search; Cmd/Ctrl+K opens commands.
- Single-letter shortcuts may be shown as quiet keycaps but never use Vim-style navigation.
- Finish-review shortcuts open a confirmation surface and never submit destructively in one keystroke.
- Native controls and semantic landmarks are preferred.
- Focus is visible in all themes.
- Status never relies on color alone.
- Dynamic results use non-disruptive announcements.
- Reduced-motion preferences are honored.
- Touch targets expand without forcing desktop row height.

## 21. Testing strategy

### 21.1 Unit and module tests

Vitest covers:

- Every inbox entry, checkpoint, invalidation, and terminal transition.
- Query parsing, validation, filtering, ordering, grouping, and suggestions.
- Cache stale/expiry behavior.
- Rate-budget and retry schedules with controlled time.
- Bitbucket schemas, mappings, pagination, and capability handling.
- Vault round trips, tamper failure, wrong passphrase, and unsupported PRF.
- Worker protocol, cancellation, queueing, and crash recovery.
- Finish-review operation sequences and partial failures.

Effect services use deterministic test Layers for provider, clock, persistence, crypto, and worker ports. Provider-contract fixtures are synthetic or sanitized and contain no company data or credentials.

### 21.2 Playwright acceptance tests

Playwright runs against the production build. It intercepts `api.bitbucket.org` with realistic deterministic fixtures and fails any unexpected external request.

Core E2E coverage includes:

- Connection, capability validation, passphrase unlock, and session-only mode.
- Passkey setup/unlock using Chromium's virtual authenticator.
- Progressive multi-repository inbox and exclusions.
- Cache age, partial failure, retry, and false-completion prevention.
- Search, filters, ordering, grouping, and keyboard flow.
- Actual `@pierre/diffs` rendering, file navigation, modes, Viewed state, and annotations.
- Inline/general draft creation and Send now.
- Approve, Request changes, and Reviewed without status.
- Partial submission failure and retry without duplicates during the active session.
- Re-entry for new commits, approval reset, renewed request, reply, mention, and reopened thread.
- Removal for merged and Bitbucket-declined PRs.
- CSP and external-network restrictions.

Chromium runs for every change. Firefox and WebKit run the core smoke suite. Visual snapshots are limited to stable layout invariants; behavioral DOM assertions are preferred.

### 21.3 Agent verification contract

Every implementation phase defines `pnpm verify` and maps its acceptance criteria to test files. The command runs:

1. Formatting/lint checks.
2. Type checking.
3. Unit and module tests.
4. Production build.
5. Phase-relevant Playwright tests against that build.

An implementation agent may claim completion only after reporting:

- Exact command executed.
- Successful exit status.
- Test counts.
- Any intentionally skipped tests and reasons.
- Playwright trace/screenshot paths for failures.

Source inspection, a development server, or an assertion that tests “should pass” is not completion evidence.

## 22. Deployment and releases

One Vite output is packaged as:

- A public static hosted site.
- A downloadable static archive.
- A minimal static-server container.

Releases use immutable versioned assets, a frozen dependency lockfile, and no runtime CDN. The release publishes the source revision, archive checksum, and container digest. Settings shows the same build identity.

The container contains only the static assets and security-header configuration. It has no application API and needs no persistent volume.

A service worker is deferred until the later PWA phase. When added, it caches only versioned application-shell assets, never Bitbucket requests, credentials, repository data, or review drafts.

The canonical source repository is `https://github.com/shushpan/revelio`, and `main` is the integration and release branch. Released artifacts are built only from a reviewed, verified commit on `main`.

## 23. Performance targets

- Cached inbox shell and rows appear without waiting for Bitbucket.
- Background refresh never replaces usable rows with a full-page spinner.
- Keyboard input and scrolling avoid main-thread long tasks over 50 ms under target-scale fixtures.
- Large patch parsing moves to the compute worker.
- Diff virtualization is always enabled for multi-file review.
- Full-data prefetch is bounded to the current and a small number of upcoming PRs.
- Repository concurrency and polling are conservative enough to preserve Bitbucket rate budget.

Performance claims are verified with deterministic large-repository and large-diff fixtures before changing worker counts or adding caches.

## 24. Delivery boundaries

### Phase 0 — Feasibility and contracts

- Verify Basic-auth CORS from the target static origin.
- Validate exact endpoints/scopes and response schemas.
- Verify renewed-review-request observability.
- Verify comment anchors, approval/request-changes operations, comparisons, and activity watermarks.
- Validate WebAuthn PRF and Argon2id choices across supported browsers.
- Validate a minimal `@pierre/diffs` Bitbucket patch and annotation integration.
- Establish the production-build Playwright harness and `pnpm verify`.

This phase produces proven contracts and fixtures, not product UI beyond a disposable probe.

### Phase 0.1 — Product identity and live discovery correction

- Rename product copy, package metadata, and documentation to Revelio.
- Make `https://github.com/shushpan/revelio` the canonical repository with all current work on `main`.
- Replace deprecated global discovery with `GET /2.0/user/workspaces`, followed by `GET /2.0/repositories/{workspace}` for each accessible workspace.
- Follow opaque pagination links and preserve successful workspace results when another workspace fails.
- Distinguish malformed requests, missing resources, revoked/deprecated endpoints, provider failures, and rate limiting without exposing credentials or response bodies.
- Migrate the application shell and product controls to HeroUI v3 default light/dark themes.
- Use Diffs' native `pierre-light` and `pierre-dark` themes, synchronized with the application theme.
- Update the product README with prerequisites, Corepack/pnpm setup, installation, local use, security boundaries, features, and current limitations.
- Verify the corrected discovery contract with deterministic tests and a disposable-token live check run only by the user in their browser.

### Phase 1 — Secure connection and trustworthy inbox

- HeroUI application shell and module boundaries.
- Credential modes and vault.
- Repository discovery/exclusions.
- Metadata persistence and TTL cache.
- Progressive synchronization, partial errors, and rate budget.
- Actionable event model and checkpoints.
- Compact flat inbox, default ordering, basic search, and quick filters.

### Phase 2 — Code-first read-only review

- Changes and Overview.
- `@pierre/diffs` integration and virtualization.
- Compute-worker patch parsing.
- Adaptive split/unified layout.
- File tree, Viewed state, comparison selector, comments/activity reading.
- Queue drawer and prefetch.
- Diffs worker-pool compatibility gate.

### Phase 3 — Review actions and continuous queue

- In-memory drafts and Send now.
- Finish-review transaction and partial-failure recovery.
- Approve, Request changes, and Reviewed without status.
- Automatic next PR.
- Re-entry detection, including approval reset.
- Recently finished presentation.

### Phase 4 — Personal intelligence and product hardening

- Full qualifier autocomplete.
- Saved priority/group/suggestion rules.
- Can help.
- Refined keyboard and responsive behavior.
- Installable PWA shell cache.
- Release archive/container, checksums, build identity, and security-header verification.

### Future

- Encrypted cache for review content and persistent drafts.
- Encrypted user-selected backup file with manual import/export fallback.
- Multiple identities/connections.
- Provider-boundary validation with a GitHub or GitLab adapter.
- Stacked pull-request discovery and design.
- Optional hardened browser extension or local credential broker.

## 25. Acceptance criteria

The product is ready for its first real-world trial when:

1. It connects directly to Bitbucket with email plus API token and stores credentials using the chosen secure mode.
2. It progressively discovers all accessible included repositories without a product backend.
3. Every explicit request and supported relevant follow-up appears with a deterministic reason.
4. A successful finish hides the PR by checkpoint, not by assuming it is merged.
5. New commits and approval resets requeue approved PRs.
6. Unrelated comments do not requeue finished PRs.
7. Partial or stale data never displays false completion.
8. The actual `@pierre/diffs` surface supports the specified review and annotation workflows.
9. Review submission reports and recovers from partial operations without pretending they were atomic.
10. Public hosting and self-hosting use the same identifiable static build.
11. No credential or Bitbucket payload is sent to an origin other than Bitbucket.
12. `pnpm verify` passes and provides reproducible evidence for all completed phase requirements.
13. Product UI uses HeroUI as its sole component/theme system and Diffs uses the native Pierre light/dark themes.

## 26. Feasibility gates and fixed fallbacks

These are explicit gates rather than unresolved product decisions:

- **Renewed review request unavailable in activity:** use observed reviewer absence-to-presence and disclose the limitation.
- **WebAuthn PRF unavailable:** offer passphrase and session-only; never emulate passkey protection.
- **Diffs worker pool unreliable:** retain CodeView virtualization and main-thread highlighting; keep custom compute-worker patch parsing.
- **A Bitbucket capability is missing:** disable only that action and retain read-only review.
- **Rate budget is insufficient at target scale:** lengthen polling and prioritize focus/manual refresh; do not add a backend silently.
- **Team membership is not exposed reliably:** omit `team:` from v1; all other qualifier families remain available.
- **Static host cannot set required headers:** mark that host unsupported for the official deployment; use the supplied container or a compatible host.

## 27. Primary references

- [Bitbucket Cloud REST API and authentication](https://developer.atlassian.com/cloud/bitbucket/rest/)
- [Bitbucket workspace discovery](https://developer.atlassian.com/cloud/bitbucket/rest/api-group-workspaces/)
- [Bitbucket repository discovery](https://developer.atlassian.com/cloud/bitbucket/rest/api-group-repositories/)
- [Bitbucket API token permissions](https://support.atlassian.com/bitbucket-cloud/docs/api-token-permissions/)
- [Bitbucket pull-request endpoints](https://developer.atlassian.com/cloud/bitbucket/rest/api-group-pullrequests/)
- [Bitbucket API request limits](https://support.atlassian.com/bitbucket-cloud/docs/api-request-limits/)
- [WebAuthn Level 3 PRF extension](https://www.w3.org/TR/webauthn-3/)
- [Web Cryptography API](https://www.w3.org/TR/WebCryptoAPI/)
- [OWASP Password Storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [`@pierre/diffs` documentation](https://diffs.com/docs)
- [HeroUI React quick start](https://heroui.com/docs/react/getting-started/quick-start)
- [HeroUI theming](https://heroui.com/docs/react/getting-started/theming)
- [Web worker performance guidance](https://web.dev/learn/performance/web-worker-overview)
