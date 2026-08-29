import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import activityPage from "./__fixtures__/activity-page.json";
import pullRequestPage from "./__fixtures__/pull-request-page.json";
import user from "./__fixtures__/user.json";
import {
  decodeActivityPage,
  decodePullRequestPage,
  decodeUser,
  decodeWorkspacePage,
} from "./schemas";

describe("Bitbucket response schemas", () => {
  it("decodes a valid user fixture into the normalized identity", () => {
    expect(Effect.runSync(decodeUser(user))).toEqual({
      id: "{user-uuid}",
      displayName: "Synthetic Reviewer",
      nickname: "reviewer",
    });
  });

  it("rejects a response that does not contain the required identity", () => {
    const result = Effect.runSync(Effect.either(decodeUser({ display_name: "Missing id" })));

    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toEqual({
        _tag: "DecodeError",
        message: "Provider returned invalid data",
        operation: "current user",
        endpoint: "/user",
      });
    }
  });

  it("decodes a paginated pull-request page and preserves the next-page marker", () => {
    const result = Effect.runSync(decodePullRequestPage(pullRequestPage));

    expect(result.next).toBe(
      "https://api.bitbucket.org/2.0/repositories/acme/review/pullrequests?page=2",
    );
    expect(result.values).toHaveLength(1);
    expect(result.values[0]?.id).toBe(7);
  });

  it("decodes documented workspace membership entries", () => {
    expect(
      Effect.runSync(decodeWorkspacePage({ values: [{ workspace: { slug: "acme" } }] })),
    ).toEqual({ values: ["acme"] });
  });

  it("decodes documented approval, request-change, comment, update, and unknown events", () => {
    const result = Effect.runSync(decodeActivityPage(activityPage));
    expect(result.values.map((signal) => signal.kind)).toEqual([
      "approved",
      "changes_requested",
      "commented",
      "updated",
      "other",
    ]);
    expect(result.values.map((signal) => signal.createdAt)).toEqual([
      "2026-08-28T09:31:00+00:00",
      "2026-08-28T09:32:00+00:00",
      "2026-08-28T09:33:00+00:00",
      "2026-08-28T09:34:00+00:00",
      "2026-08-28T09:35:00+00:00",
    ]);
  });

  it("rejects malformed timestamps with a redacted provider error", () => {
    const malformed = {
      ...activityPage,
      values: [
        {
          ...activityPage.values[0],
          approval: { ...activityPage.values[0].approval, date: "2026-08-28 09:31:00" },
        },
      ],
    };
    const result = Effect.runSync(Effect.either(decodeActivityPage(malformed)));

    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toEqual({
        _tag: "DecodeError",
        message: "Provider returned invalid data",
        operation: "review activity",
        endpoint: "/pullrequests/{id}/activity",
      });
      expect(JSON.stringify(result.left)).not.toContain("2026-08-28 09:31:00");
    }
  });
});
