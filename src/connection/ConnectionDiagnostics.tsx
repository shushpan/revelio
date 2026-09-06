import { Effect } from "effect";
import { type FormEvent, type JSX, useRef, useState } from "react";
import type { BitbucketCredentials } from "../providers/bitbucket-cloud/auth";
import { runBitbucketDiagnostics } from "../providers/bitbucket-cloud/diagnostics";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Chip, type ChipProps } from "../ui/Chip";
import { TextField } from "../ui/TextField";
import {
  type DiagnosticCapability,
  type DiagnosticErrorTag,
  type DiagnosticsReport,
  type DiagnosticsState,
  diagnosticCapabilities,
} from "./model";

const capabilityLabels: Record<DiagnosticCapability, string> = {
  identity: "Identity",
  "workspace-visibility": "Workspace visibility",
  "repository-visibility": "Repository visibility",
  "open-pr-list": "Open pull requests",
  activity: "Activity",
  comments: "Comments",
  diffstat: "Diffstat",
  diff: "Diff",
};

const initialState: DiagnosticsState = { state: "idle" };

export function ConnectionDiagnostics(): JSX.Element {
  const [email, setEmail] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [diagnostics, setDiagnostics] = useState<DiagnosticsState>(initialState);
  const activeController = useRef<AbortController | null>(null);
  const runId = useRef(0);

  const lock = (): void => {
    runId.current += 1;
    activeController.current?.abort();
    activeController.current = null;
    setEmail("");
    setApiToken("");
    setDiagnostics(initialState);
  };

  const run = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (email.trim() === "" || apiToken === "") return;

    const controller = new AbortController();
    activeController.current?.abort();
    activeController.current = controller;
    const requestId = ++runId.current;
    const credentials: BitbucketCredentials = {
      provider: "bitbucket-cloud",
      payload: { email: email.trim(), apiToken },
    };
    setDiagnostics({ state: "running" });

    void Effect.runPromise(runBitbucketDiagnostics(credentials, { signal: controller.signal }))
      .then((report) => {
        if (requestId !== runId.current) return;
        activeController.current = null;
        setDiagnostics({ state: report.state, report });
      })
      .catch(() => {
        if (requestId !== runId.current) return;
        activeController.current = null;
        setDiagnostics({ state: "failed", report: unexpectedFailureReport() });
      });
  };

  return (
    <main className="app-shell connection-page">
      <section aria-labelledby="connection-title">
        <Card className="connection-card">
          <div className="connection-heading">
            <p className="eyebrow">Phase 0</p>
            <h2 id="connection-title">Connect to Bitbucket Cloud</h2>
            <p className="connection-copy">
              Use your Atlassian email and a Bitbucket API token to run read-only connection
              diagnostics. Nothing is uploaded to a Revelio server, and credentials are not saved in
              Phase 0.
            </p>
            <Button variant="secondary" onClick={lock}>
              Lock
            </Button>
          </div>
          <form onSubmit={run} className="connection-form">
            <TextField
              label="Atlassian email"
              name="email"
              type="email"
              autoComplete="off"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <TextField
              label="Bitbucket API token"
              name="apiToken"
              type="password"
              autoComplete="off"
              value={apiToken}
              onChange={(event) => setApiToken(event.target.value)}
            />
            <Button
              type="submit"
              variant="primary"
              disabled={diagnostics.state === "running" || email.trim() === "" || apiToken === ""}
            >
              {diagnostics.state === "running" ? "Running diagnostics…" : "Run diagnostics"}
            </Button>
          </form>
          <DiagnosticsSummary diagnostics={diagnostics} />
        </Card>
      </section>
    </main>
  );
}

const unexpectedFailureReport = (): DiagnosticsReport => {
  return {
    state: "failed",
    capabilities: Object.fromEntries(
      diagnosticCapabilities.map((capability) => [
        capability,
        { capability, status: "failed", errorTag: "ServerError" },
      ]),
    ) as DiagnosticsReport["capabilities"],
  };
};

const errorLabels: Record<DiagnosticErrorTag, string> = {
  BadRequest: "Invalid provider request",
  Unauthorized: "Unauthorized",
  Forbidden: "Forbidden",
  NotFound: "Provider resource not found",
  Gone: "Provider endpoint no longer available",
  UnexpectedHttpError: "Unexpected provider response",
  NetworkError: "Network or CORS error",
  RateLimited: "Rate limited",
  DecodeError: "Invalid provider response",
  ServerError: "Provider server error",
  PaginationError: "Pagination error",
  PartialDiscovery: "Partial repository discovery",
  Unavailable: "Unavailable",
};

const chipVariantForStatus = (
  status: "succeeded" | "failed" | "unavailable",
): ChipProps["variant"] => {
  if (status === "succeeded") return "success";
  if (status === "failed") return "danger";
  return "neutral";
};

function DiagnosticsSummary({
  diagnostics,
}: {
  readonly diagnostics: DiagnosticsState;
}): JSX.Element {
  if (diagnostics.state === "idle") {
    return <p className="diagnostics-status">No diagnostics run yet.</p>;
  }
  if (diagnostics.state === "running") {
    return (
      <p className="diagnostics-status" role="status">
        Checking Bitbucket read capabilities…
      </p>
    );
  }

  const report = diagnostics.report;
  if (!report) return <p className="diagnostics-status">Diagnostics unavailable.</p>;
  return (
    <section className="diagnostics-results" aria-labelledby="diagnostics-title">
      <h3 id="diagnostics-title">
        {diagnostics.state === "succeeded" ? "Diagnostics succeeded" : "Diagnostics failed"}
      </h3>
      <ul>
        {diagnosticCapabilities.map((capability) => {
          const result = report.capabilities[capability];
          return (
            <li key={capability}>
              <span>{capabilityLabels[capability]}</span>
              <Chip variant={chipVariantForStatus(result.status)}>
                {result.status}
                {result.errorTag ? ` — ${errorLabels[result.errorTag]}` : ""}
              </Chip>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
