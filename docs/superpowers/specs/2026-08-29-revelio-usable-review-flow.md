# Revelio Usable Review Flow

**Status:** Approved in conversation on 2026-08-29

## Goal

Replace the Phase 0 diagnostics harness with a simple, working Bitbucket Cloud review product: connect, see open pull requests across repositories, open a real diff, and leave a review action.

## Product flow

1. The initial screen is a compact Revelio connection form for Atlassian email and Bitbucket API token. It contains no phase labels or capability checklist.
2. Revelio validates the credentials by loading the current user and accessible repositories. A failure appears as one short, actionable inline message without provider response bodies or credential data.
3. Success replaces the connection screen with a cross-repository inbox. The default view lists pull requests where the current user is a reviewer; an “All open” filter exposes every discovered open pull request.
4. Each row shows repository, title, author, branches, update time, and whether the user was requested as a reviewer. All open work stays reachable; filtering must not silently destroy it.
5. Selecting a pull request opens a full-page review surface. The diff is the dominant content. A compact header provides Back, theme, layout, general comment, Approve, and Request changes.
6. Review actions are sent directly from the browser to Bitbucket. Successful actions show a small confirmation and mark the current pull request reviewed locally.
7. “Mark reviewed” hides the item from the default inbox for the current source commit. A new source commit makes it actionable again. The All open filter always shows it.
8. Lock clears credentials and in-memory provider state. Credentials are not persisted in this slice. Non-secret review checkpoints may use localStorage.

## UI direction

- Use HeroUI components and its default light/dark themes for product UI.
- Use the native Diffs light/dark rendering; do not inject GitHub themes.
- Compact desktop-first layout with responsive behavior, small padding, restrained typography, and no decorative oversized whitespace.
- Use `Chip` for inline status, never overlay `Badge` without an anchor.
- No diagnostics or synthetic demo controls in the normal product flow.

## Architecture

- Keep the existing Effect-based provider boundary and Bitbucket adapter.
- Extend the provider only with operations the usable flow needs: fetch a raw diff and submit approve, request-changes, general-comment, and inline-comment requests.
- Add a small inbox loader that discovers repositories and loads open pull requests. Partial repository failures keep successful results visible and produce a non-blocking warning.
- Keep navigation as a React state union (`connect | inbox | review`) instead of adding a router.
- Keep credentials in React memory. Do not implement the encrypted vault in this slice.

## Acceptance checks

- A documented Bitbucket workspace-membership response containing `workspace.slug` is decoded correctly.
- A synthetic browser flow connects, displays a cross-repository pull request, opens its real intercepted patch, and submits one review action.
- The initial screen contains no “Phase 0,” diagnostics list, or synthetic diff demo.
- Invalid credentials show one compact error and do not expose response bodies or secrets.
- Existing diff preprocessing remains functional.

## Deferred polish

Passkey/passphrase credential vault, background caching, richer TODO requeue signals, existing comment threads, command palette, keyboard shortcuts, stacked pull requests, and additional providers remain future work.
