import { describe, expect, it } from "vitest";
import { buildBitbucketRequest } from "./request";

const credentials = {
  email: "reviewer@example.test",
  token: "synthetic-token",
};

describe("Bitbucket request builder", () => {
  it("uses the fixed Bitbucket API origin and Basic authorization", () => {
    const request = buildBitbucketRequest("/user", credentials);

    expect(request.url).toBe("https://api.bitbucket.org/2.0/user");
    expect(request.method).toBe("GET");
    expect(request.headers.get("Accept")).toBe("application/json");
    expect(request.headers.get("Authorization")).toBe(
      "Basic cmV2aWV3ZXJAZXhhbXBsZS50ZXN0OnN5bnRoZXRpYy10b2tlbg==",
    );
  });

  it("rejects an absolute or foreign API path instead of allowing an origin override", () => {
    expect(() => buildBitbucketRequest("https://evil.example/user", credentials)).toThrow(
      "Bitbucket API paths must be relative",
    );
    expect(() => buildBitbucketRequest("ftp://evil.example/user", credentials)).toThrow(
      "Bitbucket API paths must be relative",
    );
  });

  it("preserves a safe query string while keeping the API origin fixed", () => {
    const request = buildBitbucketRequest(
      "repositories/acme/review/pullrequests?state=OPEN",
      credentials,
    );

    expect(request.url).toBe(
      "https://api.bitbucket.org/2.0/repositories/acme/review/pullrequests?state=OPEN",
    );
  });
});
