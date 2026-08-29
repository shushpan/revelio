import { Effect, Schema } from "effect";
import type {
  PullRequestState,
  PullRequestSummary,
  ProviderUser,
  RepositoryRef,
  ReviewSignal,
} from "../contracts";
import { decodeError } from "../errors";
import type { ProviderError } from "../errors";

const Timestamp = Schema.String.pipe(
  Schema.filter(
    (value) =>
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
      !Number.isNaN(Date.parse(value)),
    { message: () => "expected a strict RFC 3339 timestamp" },
  ),
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

const ApprovalDto = Schema.Struct({ date: Timestamp, user: UserDto });
const RequestChangesDto = Schema.Struct({ date: Timestamp, user: UserDto });
const CommentDto = Schema.Struct({
  id: Schema.Number,
  created_on: Timestamp,
  content: Schema.Struct({ raw: Schema.String }),
  user: UserDto,
});
const UpdateDto = Schema.Struct({ date: Timestamp, state: Schema.String, author: UserDto });

const ActivityDto = Schema.Struct({
  approval: Schema.optional(ApprovalDto),
  request_changes: Schema.optional(RequestChangesDto),
  changes_requested: Schema.optional(RequestChangesDto),
  comment: Schema.optional(CommentDto),
  update: Schema.optional(UpdateDto),
  date: Schema.optional(Timestamp),
}).pipe(
  Schema.filter(
    (activity) =>
      activity.approval !== undefined ||
      activity.request_changes !== undefined ||
      activity.changes_requested !== undefined ||
      activity.comment !== undefined ||
      activity.update !== undefined ||
      activity.date !== undefined,
    { message: () => "expected a recognized activity event or dated unknown event" },
  ),
);

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
  decode(UserDto, input, decodeError("current user", "/user")).pipe(Effect.map(mapUser));

export interface PullRequestPage {
  readonly values: ReadonlyArray<PullRequestDto>;
  readonly next?: string;
}

const SlugDto = Schema.Struct({ slug: Schema.String.pipe(Schema.filter((value) => value !== "")) });
const WorkspaceMembershipDto = Schema.Struct({ workspace: SlugDto });
const WorkspaceDto = Schema.Union(WorkspaceMembershipDto, SlugDto);

export interface WorkspacePage {
  readonly values: ReadonlyArray<string>;
  readonly next?: string;
}

export const decodeWorkspacePage = (input: unknown): Effect.Effect<WorkspacePage, ProviderError> =>
  decode(PageDto(WorkspaceDto), input, decodeError("workspace discovery", "/user/workspaces")).pipe(
    Effect.map((page) => ({
      ...page,
      values: page.values.map((value) =>
        "workspace" in value ? value.workspace.slug : value.slug,
      ),
    })),
  );

export interface RepositoryPage {
  readonly values: ReadonlyArray<string>;
  readonly next?: string;
}

export const decodeRepositoryPage = (
  input: unknown,
): Effect.Effect<RepositoryPage, ProviderError> =>
  decode(
    PageDto(SlugDto),
    input,
    decodeError("repository discovery", "/repositories/{workspace}"),
  ).pipe(Effect.map((page) => ({ ...page, values: page.values.map((value) => value.slug) })));

export const decodePullRequestPage = (
  input: unknown,
): Effect.Effect<PullRequestPage, ProviderError> =>
  decode(
    PageDto(PullRequestDto),
    input,
    decodeError("open pull requests", "/repositories/{workspace}/{repo}/pullrequests"),
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

const mapActivity = (activity: ActivityDto): ReviewSignal | undefined => {
  if (activity.approval) {
    return {
      id: `approval:${activity.approval.date}:${activity.approval.user.uuid}`,
      kind: "approved",
      actorId: activity.approval.user.uuid,
      createdAt: activity.approval.date,
    };
  }
  const requestChanges = activity.request_changes ?? activity.changes_requested;
  if (requestChanges) {
    return {
      id: `changes-requested:${requestChanges.date}:${requestChanges.user.uuid}`,
      kind: "changes_requested",
      actorId: requestChanges.user.uuid,
      createdAt: requestChanges.date,
    };
  }
  if (activity.comment) {
    return {
      id: String(activity.comment.id),
      kind: "commented",
      actorId: activity.comment.user.uuid,
      createdAt: activity.comment.created_on,
      text: activity.comment.content.raw,
    };
  }
  if (activity.update) {
    return {
      id: `update:${activity.update.date}:${activity.update.author.uuid}`,
      kind:
        activity.update.state === "OPEN" ||
        activity.update.state === "MERGED" ||
        activity.update.state === "DECLINED"
          ? "updated"
          : "other",
      actorId: activity.update.author.uuid,
      createdAt: activity.update.date,
    };
  }
  if (activity.date) {
    return { id: `other:${activity.date}`, kind: "other", createdAt: activity.date };
  }
  return undefined;
};

export const decodeActivityPage = (input: unknown): Effect.Effect<ActivityPage, ProviderError> =>
  decode(
    PageDto(ActivityDto),
    input,
    decodeError("review activity", "/pullrequests/{id}/activity"),
  ).pipe(
    Effect.map((page) => ({
      ...page,
      values: page.values.flatMap((activity) => {
        const signal = mapActivity(activity);
        return signal === undefined ? [] : [signal];
      }),
    })),
  );
