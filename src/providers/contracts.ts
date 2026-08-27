import type * as Effect from "effect/Effect";
import type { ProviderError } from "./errors";

export type ProviderId = "bitbucket-cloud" | (string & {});

export interface ProviderCredentials<Provider extends ProviderId, Payload> {
  readonly provider: Provider;
  /** Credential payload is defined by the concrete provider adapter. */
  readonly payload: Payload;
}

export interface ProviderCapabilities {
  readonly canReadPullRequests: boolean;
  readonly canReadReviewSignals: boolean;
  readonly canWriteReviews: boolean;
}

export interface ProviderUser {
  readonly id: string;
  readonly displayName: string;
  readonly nickname?: string;
}

export interface RepositoryRef {
  readonly workspace: string;
  readonly slug: string;
}

export interface PullRequestRef {
  readonly repository: RepositoryRef;
  readonly id: number;
}

export type PullRequestState = "OPEN" | "MERGED" | "DECLINED" | "SUPERSEDED" | "UNKNOWN";

export interface PullRequestSummary {
  readonly ref: PullRequestRef;
  readonly title: string;
  readonly description: string;
  readonly state: PullRequestState;
  readonly updatedAt: string;
  readonly sourceBranch: string;
  readonly targetBranch: string;
  readonly sourceCommit: string;
  readonly author: ProviderUser;
  readonly reviewerIds: ReadonlyArray<string>;
}

export type ReviewSignalKind =
  | "approved"
  | "changes_requested"
  | "commented"
  | "requested"
  | "mentioned"
  | "updated"
  | "other";

export interface ReviewSignal {
  readonly id: string;
  readonly kind: ReviewSignalKind;
  readonly actorId?: string;
  readonly createdAt: string;
  readonly text?: string;
}

export interface CodeReviewProvider {
  readonly id: ProviderId;
  readonly capabilities: ProviderCapabilities;
  readonly getCurrentUser: Effect.Effect<ProviderUser, ProviderError>;
  readonly listOpenPullRequests: (
    repository: RepositoryRef,
  ) => Effect.Effect<ReadonlyArray<PullRequestSummary>, ProviderError>;
  readonly getReviewSignals: (
    pullRequest: PullRequestRef,
  ) => Effect.Effect<ReadonlyArray<ReviewSignal>, ProviderError>;
}
