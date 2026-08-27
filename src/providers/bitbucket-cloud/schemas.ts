import { Effect, Schema } from "effect";
import type {
  PullRequestSummary,
  PullRequestState,
  ProviderUser,
  RepositoryRef,
  ReviewSignal,
} from "../contracts";
import { decodeError } from "../errors";
import type { ProviderError } from "../errors";

const Timestamp = Schema.String.pipe(
  Schema.filter((value) => !Number.isNaN(Date.parse(value)), {
    message: () => "expected an ISO timestamp",
  }),
);

const UserDto = Schema.Struct({
  uuid: Schema.String,
  display_name: Schema.String,
  nickname: Schema.optional(Schema.String),
});

const PageDto = <A extends Schema.Schema.Any>(value: A) =>
  Schema.Struct({
    values: Schema.Array(value),
    next: Schema.optional(Schema.String),
  });

const PullRequestDto = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  description: Schema.String,
  state: Schema.String,
  updated_on: Timestamp,
  author: UserDto,
  source: Schema.Struct({
    branch: Schema.Struct({ name: Schema.String }),
    commit: Schema.Struct({ hash: Schema.String }),
  }),
  destination: Schema.Struct({ branch: Schema.Struct({ name: Schema.String }) }),
  reviewers: Schema.Array(UserDto),
});

const ActivityDto = Schema.Struct({
  uuid: Schema.String,
  created_on: Timestamp,
  approval: Schema.optional(Schema.Struct({ user: UserDto })),
  changes_requested: Schema.optional(Schema.Struct({ user: UserDto })),
  comment: Schema.optional(
    Schema.Struct({
      id: Schema.Number,
      content: Schema.Struct({ raw: Schema.String }),
      user: UserDto,
    }),
  ),
  update: Schema.optional(Schema.Struct({ state: Schema.String, author: UserDto })),
});

type UserDto = Schema.Schema.Type<typeof UserDto>;
type PullRequestDto = Schema.Schema.Type<typeof PullRequestDto>;
type ActivityDto = Schema.Schema.Type<typeof ActivityDto>;

const decode = <A, I>(schema: Schema.Schema<A, I>, input: unknown, error: ProviderError) =>
  Effect.try({ try: () => Schema.decodeUnknownSync(schema)(input), catch: () => error });

const mapUser = (user: UserDto): ProviderUser => ({
  id: user.uuid,
  displayName: user.display_name,
  ...(user.nickname === undefined ? {} : { nickname: user.nickname }),
});

export const decodeUser = (input: unknown): Effect.Effect<ProviderUser, ProviderError> =>
  decode(
    UserDto,
    input,
    decodeError("Bitbucket returned an unreadable user response", "/user"),
  ).pipe(Effect.map(mapUser));

export interface PullRequestPage {
  readonly values: ReadonlyArray<PullRequestDto>;
  readonly next?: string;
}

export const decodePullRequestPage = (
  input: unknown,
): Effect.Effect<PullRequestPage, ProviderError> =>
  decode(
    PageDto(PullRequestDto),
    input,
    decodeError(
      "Bitbucket returned an unreadable pull-request response",
      "/repositories/{workspace}/{repo}/pullrequests",
    ),
  );

const mapState = (state: string): PullRequestState =>
  state === "OPEN" || state === "MERGED" || state === "DECLINED" || state === "SUPERSEDED"
    ? state
    : "UNKNOWN";

export const mapPullRequest = (
  dto: PullRequestDto,
  repository: RepositoryRef,
): PullRequestSummary => ({
  ref: { repository, id: dto.id },
  title: dto.title,
  description: dto.description,
  state: mapState(dto.state),
  updatedAt: dto.updated_on,
  sourceBranch: dto.source.branch.name,
  targetBranch: dto.destination.branch.name,
  sourceCommit: dto.source.commit.hash,
  author: mapUser(dto.author),
  reviewerIds: dto.reviewers.map((reviewer) => reviewer.uuid),
});

export interface ActivityPage {
  readonly values: ReadonlyArray<ReviewSignal>;
  readonly next?: string;
}

const mapActivity = (activity: ActivityDto): ReviewSignal => {
  if (activity.approval) {
    return {
      id: activity.uuid,
      kind: "approved",
      actorId: activity.approval.user.uuid,
      createdAt: activity.created_on,
    };
  }
  if (activity.changes_requested) {
    return {
      id: activity.uuid,
      kind: "changes_requested",
      actorId: activity.changes_requested.user.uuid,
      createdAt: activity.created_on,
    };
  }
  if (activity.comment) {
    return {
      id: String(activity.comment.id),
      kind: "commented",
      actorId: activity.comment.user.uuid,
      createdAt: activity.created_on,
      text: activity.comment.content.raw,
    };
  }
  if (activity.update) {
    return {
      id: activity.uuid,
      kind:
        activity.update.state === "OPEN" || activity.update.state === "MERGED"
          ? "updated"
          : "other",
      actorId: activity.update.author.uuid,
      createdAt: activity.created_on,
    };
  }
  return { id: activity.uuid, kind: "other", createdAt: activity.created_on };
};

export const decodeActivityPage = (input: unknown): Effect.Effect<ActivityPage, ProviderError> =>
  decode(
    PageDto(ActivityDto),
    input,
    decodeError("Bitbucket returned unreadable review activity", "/pullrequests/{id}/activity"),
  ).pipe(Effect.map((page) => ({ ...page, values: page.values.map(mapActivity) })));
