# Safe live Bitbucket checklist

This is a procedure for a future, user-controlled feasibility run. It does
not authorize an agent to request, receive, or use credentials, and it does
not turn the Phase 0 synthetic fixtures into live evidence.

## Safety rules

- Keep credentials entirely local: the user opens the local app, enters the
  email and token into the local form, and never pastes either value into chat,
  an issue, a report, a screenshot, a trace, or a terminal command.
- Use a disposable Bitbucket workspace/repository and a disposable pull
  request containing non-sensitive test content. Do not use company names,
  production code, customer data, or a real review obligation.
- Start with read-only checks. Revoke the disposable token after the run.
- Confirm each external mutation separately immediately before it is sent.
  Never batch approval, Request changes, general comments, or inline comments.
- Stop on any unexpected origin, method, endpoint, response exposure, or
  mutation. Do not retry a mutation unless Bitbucket's resulting state is
  understood.
- The current Phase 0 UI has no mutation control. Therefore mutation gates
  remain unresolved until a separately reviewed disposable-PR probe exists;
  the inert request-shape builders are not an execution path.

## Preparation

- [ ] Build and serve the exact commit locally with `pnpm verify` passing.
- [ ] Open the served app directly in a supported browser and record the app
      version (`0.1.0`) and source revision locally.
- [ ] Create or select a disposable repository and pull request that contains
      no sensitive source, title, comments, or identifiers.
- [ ] Issue a least-privilege API token for this experiment. Keep its value
      only in the local password field; do not record it.
- [ ] Open the browser Network panel with response bodies and request headers
      excluded from any eventual notes or screenshots.

## Read-only run

- [ ] Enter the email and token locally and run diagnostics.
- [ ] Confirm the first request is the identity endpoint and that all requests
      use `GET` and the `https://api.bitbucket.org` origin.
- [ ] Confirm diagnostics reports only the capability status/error category,
      not response bodies, source, comments, repository names, PR titles, or
      credential material.
- [ ] Check identity, workspace visibility, repository visibility, open PR
      list, activity, comments, diffstat, and diff one at a time in the
      displayed report.
- [ ] If a request fails, classify it as auth, permission, CORS/network,
      rate-limit, decode, server, pagination, or unavailable. Do not copy the
      provider response body.
- [ ] Click Lock and confirm fields/results clear; reload and confirm the
      fields remain empty. Clear browser network history afterward.

These observations can resolve or narrow browser CORS and scope gates, but a
single successful read does not prove all scopes or all repository shapes.

## Mutation gates (future controlled probe only)

The app must first expose a separately reviewed disposable-PR harness. When it
does, run each item in a new explicit confirmation step:

- [ ] Renew the review request, refresh activity, and record whether a stable
      event is observable. If not, record the absence; do not infer it from a
      changed screen.
- [ ] Confirm one Approve action; verify the resulting remote decision.
- [ ] Confirm one Request changes action; verify the resulting remote
      decision.
- [ ] Confirm one general comment with deliberately non-sensitive text; verify
      visibility, then remove/clean up if the provider permits.
- [ ] Confirm one addition-side and one deletion-side inline comment using a
      disposable diff; verify the remote file path, line, and side.
- [ ] Add a new source commit after approval, refresh, and verify whether the
      review is reset/requeued. Record the observed provider behavior only.

Every mutation needs an individual user confirmation and a known cleanup plan.
If a mutation fails after a prior operation succeeds, preserve the exact
operation order locally but do not claim rollback.

## Sanitized evidence allowlist

The only values allowed in a report, screenshot, trace summary, or issue are:

- endpoint template, such as `/repositories/{workspace}/{repository}/pullrequests`;
- HTTP status class only (`2xx`, `4xx`, `5xx`), not exact response bodies;
- capability result (`succeeded`, `failed`, or `unavailable`) and redacted error
  category;
- timestamp with timezone;
- app version and source revision.

## Forbidden evidence

Never retain or share:

- request/response headers, including Authorization and cookies;
- API tokens, email addresses, account IDs, UUIDs, or validation values;
- response bodies, comments, diff text, source code, or screenshots containing
  them;
- workspace, repository, or pull-request names/titles/numbers that identify
  the disposable or company data;
- Playwright traces, HAR files, network exports, browser storage, or logs that
  may contain any of the above;
- exact mutation payloads when they contain user content.

Delete local browser traces and temporary exports after extracting only the
allowlisted facts. If sanitization is uncertain, discard the artifact rather
than attempting to redact it in place.

## Gate decision

Mark a gate **Proven live** only when the relevant disposable observation is
complete and the resulting evidence contains allowlisted facts only. Mark it
**Unresolved** when the run was not performed, was interrupted, or showed an
ambiguous provider result. Never mark a gate proven because an endpoint shape,
fixture, documentation page, or local request interception looks plausible.
