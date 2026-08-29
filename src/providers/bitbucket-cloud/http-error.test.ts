import { describe, expect, it } from "vitest";
import { mapBitbucketHttpError } from "./http-error";

describe("Bitbucket HTTP error mapping", () => {
  it.each([
    [400, "BadRequest"],
    [401, "Unauthorized"],
    [403, "Forbidden"],
    [404, "NotFound"],
    [410, "Gone"],
    [429, "RateLimited"],
    [503, "ServerError"],
    [418, "UnexpectedHttpError"],
  ] as const)("maps HTTP %i to %s", (status, tag) => {
    expect(
      mapBitbucketHttpError(status, "repository discovery", "/repositories/{workspace}", null),
    ).toMatchObject({ _tag: tag, status, operation: "repository discovery" });
  });

  it("serializes only the redacted error shape", () => {
    const error = mapBitbucketHttpError(
      429,
      "repository discovery",
      "/repositories/{workspace}",
      "17",
    );

    expect(JSON.stringify(error)).not.toContain("synthetic-token");
    expect(JSON.stringify(error)).not.toContain("synthetic response body");
    expect(JSON.stringify(error)).toContain("retryAfterSeconds");
  });

  it.each(["17junk", "1.5", "+17", "-1", "", " 17", "17 ", "999999999999999999999999999999999999"])(
    "rejects non-strict Retry-After value %j",
    (retryAfter) => {
      expect(
        mapBitbucketHttpError(429, "repository discovery", "/repositories/{workspace}", retryAfter),
      ).not.toHaveProperty("retryAfterSeconds");
    },
  );

  it("accepts a complete non-negative safe integer Retry-After value", () => {
    expect(
      mapBitbucketHttpError(429, "repository discovery", "/repositories/{workspace}", "017"),
    ).toMatchObject({ retryAfterSeconds: 17 });
  });
});
