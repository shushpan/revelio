# Product source of truth

Authority: Ready issue acceptance criteria → `contract/` → current code/tests.
An issue overrides a contract only when explicit; otherwise stop on conflicts
or missing decisions. Preserve behavior outside the issue.

- `contract/` — binding shared rules.
- `ADRs/` — binding technical decisions.
- `status.md` — shipped scope and backlog.
- `mockups/` — binding only when linked by an issue.
- `research/` — non-binding context.
- `assets/` — product assets.

Workflow: **Inbox** captures an idea; **Ready** has complete scope, design,
dependencies, acceptance criteria, and verification; **In progress** has one
owner and linked work; **Done** is closed with evidence.
