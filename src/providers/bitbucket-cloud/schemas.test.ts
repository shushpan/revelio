import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import activityPage from "./__fixtures__/activity-page.json";
import pullRequestPage from "./__fixtures__/pull-request-page.json";
import user from "./__fixtures__/user.json";
import { decodeActivityPage, decodePullRequestPage, decodeUser } from "./schemas";

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
        message: "Bitbucket returned an unreadable user response",
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

  it("maps an unknown activity enum to a safe normalized value", () => {
    const result = Effect.runSync(decodeActivityPage(activityPage));
    expect(result.values.map((signal) => signal.kind)).toEqual(["approved", "commented", "other"]);
  });

  it("rejects malformed timestamps with a redacted provider error", () => {
    const malformed = {
      ...activityPage,
      values: [{ ...activityPage.values[0], created_on: "not-a-timestamp" }],
    };
    const result = Effect.runSync(Effect.either(decodeActivityPage(malformed)));

    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toEqual({
        _tag: "DecodeError",
        message: "Bitbucket returned unreadable review activity",
        endpoint: "/pullrequests/{id}/activity",
      });
      expect(JSON.stringify(result.left)).not.toContain("not-a-timestamp");
    }
  });
});
