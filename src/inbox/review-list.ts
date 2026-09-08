import type { PullRequestSummary } from "../providers/contracts";
import type { InboxLoadSnapshot } from "./load-inbox";
import { pullRequestKey } from "./query";

/** The review list for one open review: every not-yet-checkpointed pull
 * request assigned to `currentUserId`, in the inbox snapshot's own order. If
 * `selected` (the pull request currently open) does not itself qualify - e.g.
 * it was opened manually and is not assigned to this reviewer - the list is
 * just that one pull request, so a manual detour never pulls in unrelated
 * rows. */
export const reviewList = (
  snapshot: InboxLoadSnapshot,
  currentUserId: string,
  selected: PullRequestSummary,
): ReadonlyArray<PullRequestSummary> => {
  const valid = new Set(snapshot.validCheckpointKeys ?? []);
  const actionable = snapshot.pullRequests.filter(
    (pullRequest) =>
      !valid.has(pullRequestKey(pullRequest)) &&
      pullRequest.reviewerIds.some((id) => id.toLowerCase() === currentUserId.toLowerCase()),
  );
  actionable.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  return actionable.some((pullRequest) => pullRequestKey(pullRequest) === pullRequestKey(selected))
    ? actionable
    : [selected];
};
