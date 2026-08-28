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
to local preprocessing when a worker errors. The fallback preserves the raw
patch content and never needs credentials, fetch, storage, or provider data.

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
