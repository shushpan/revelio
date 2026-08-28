# ADR 0001: Diff renderer and patch worker boundary

- Status: accepted for Phase 0
- Date: 2026-08-28

## Context

The Phase 0 review probe needs a real multi-file diff surface, deterministic
patch metadata, and a safe path for moving expensive patch preprocessing off
the main thread. Synthetic patches are the only input in this feasibility
probe. Credentials, provider responses, and network operations must not cross
the worker boundary.

## Decision

Pin `@pierre/diffs` to the current stable npm `latest` release `1.3.6`.
The renderer uses only these public, documented exports:

- `parsePatchFiles` and the `ParsedPatch`/`FileDiffMetadata` types from
  `@pierre/diffs` to parse a raw patch into file metadata.
- `CodeView` and the `CodeViewItem` type from `@pierre/diffs/react` to render
  controlled diff items. Each item has a stable file path ID, a parsed
  `fileDiff`, and a public `DiffLineAnnotation`-compatible local annotation.
- `CodeView`'s public `options.diffStyle` (`unified` or `split`) and built-in
  virtualization. The application sets `disableWorkerPool` for this probe so
  the custom patch worker remains the only worker boundary under test.

The application owns a separate stateless module worker boundary in
`src/workers/patch.worker.ts`. It accepts only a request ID and serialized raw
patch string, runs the pure `preprocessPatch` function, and returns the
serializable result. The client keeps small inputs on the main thread, sends
larger inputs to the worker, terminates pending work on abort, and falls back
to local preprocessing when construction, structured-clone posting, or worker
execution errors occur. Every settled request terminates its worker exactly
once; an already-signaled abort wins over fallback and rejects with
`AbortError`. The fallback preserves the raw patch content and never needs
credentials, fetch, storage, or provider data.

Patch preprocessing remains pure and deterministic. File paths use
locale-independent code-unit ordering, and each file derives its first changed
line/side from parsed hunk content. The review surface carries that stable
`{path, line, side}` value as local annotation and comment intent only.

File navigation calls the documented `CodeViewHandle.scrollTo` item target with
the file's stable ID. The large synthetic fixture contains six diff items and
200 additions; browser coverage observes the renderer's item-level
virtualization by showing the first item while the final item is absent, then
showing the final item's real diff content after navigation.

The normal root lazy-loads the diff demo. A production build measurement keeps
the initial JavaScript referenced by `index.html` below 350,000 raw bytes and
the largest lazy JavaScript chunk below 820,000 raw bytes. The measured values
are 317,607 and 790,000 bytes respectively; the latter is the known bundled
Shiki `emacs-lisp` language payload emitted by the renderer. Vite's warning
limit is set to 820 kB to match that explicit enforced lazy-chunk budget, and
`scripts/check-bundle-budget.mjs` fails the build when either budget grows.
The checker fails closed unless `index.html` contains exactly one external
module entry script, includes all JavaScript `modulepreload` references in the
initial total, and every referenced asset exists in `dist/assets`.

## `@pierre/diffs/worker` ruling

Version `1.3.6` exposes `@pierre/diffs/worker` as a public package export with
types for `WorkerPoolManager`, `getOrCreateWorkerPoolSingleton`, and worker
render requests. Its package README documents the library's renderer but not
an application-level patch-preprocessing integration, and the public worker
types are for syntax-highlight/render AST tasks rather than this application's
serialized patch contract. The design specification also marks the Diffs
worker pool experimental until a later browser/CSP/performance gate. We
therefore do not adopt `@pierre/diffs/worker` in Phase 0; the local worker
boundary is the compatible, deterministic fallback.

## Consequences

`@pierre/diffs` owns diff rendering and virtualization, while the application
owns patch preprocessing and cancellation semantics. This keeps provider
boundaries out of the worker and leaves the Diffs worker pool available for a
future compatibility gate without coupling Phase 0 to undocumented internals.
