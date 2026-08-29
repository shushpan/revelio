export const diagnosticCapabilities = [
  "identity",
  "workspace-visibility",
  "repository-visibility",
  "open-pr-list",
  "activity",
  "comments",
  "diffstat",
  "diff",
] as const;

export type DiagnosticCapability = (typeof diagnosticCapabilities)[number];
export type DiagnosticRunState = "idle" | "running" | "succeeded" | "failed";
export type DiagnosticErrorTag =
  | "BadRequest"
  | "Unauthorized"
  | "Forbidden"
  | "NotFound"
  | "Gone"
  | "UnexpectedHttpError"
  | "NetworkError"
  | "RateLimited"
  | "DecodeError"
  | "ServerError"
  | "PaginationError"
  | "Unavailable";

export interface DiagnosticCapabilityResult {
  readonly capability: DiagnosticCapability;
  readonly status: "succeeded" | "failed" | "unavailable";
  readonly errorTag?: DiagnosticErrorTag;
}

export interface DiagnosticsReport {
  readonly state: Exclude<DiagnosticRunState, "idle" | "running">;
  readonly capabilities: Readonly<Record<DiagnosticCapability, DiagnosticCapabilityResult>>;
}

export interface DiagnosticsState {
  readonly state: DiagnosticRunState;
  readonly report?: DiagnosticsReport;
}
