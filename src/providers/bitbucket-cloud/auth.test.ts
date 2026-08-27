import { describe, expect, expectTypeOf, it, vi } from "vitest";
import type { ProviderCredentials } from "../contracts";
import { encodeBasicAuthorization, type BitbucketCredentials } from "./auth";

const credentials = {
  provider: "bitbucket-cloud",
  payload: { email: "reviewer@example.test", apiToken: "synthetic-token-123" },
} satisfies BitbucketCredentials;

const mismatchedCredentials: BitbucketCredentials = {
  provider: "bitbucket-cloud",
  // @ts-expect-error A Bitbucket payload must use apiToken, not a generic token field.
  payload: { email: "reviewer@example.test", token: "synthetic-token-123" },
};
void mismatchedCredentials;

expectTypeOf<BitbucketCredentials>().toEqualTypeOf<
  ProviderCredentials<"bitbucket-cloud", { readonly email: string; readonly apiToken: string }>
>();

describe("Bitbucket Basic authentication", () => {
  it("encodes the email and token as the exact Basic authorization value", () => {
    const value = encodeBasicAuthorization(credentials);

    expect(value).toBe("Basic cmV2aWV3ZXJAZXhhbXBsZS50ZXN0OnN5bnRoZXRpYy10b2tlbi0xMjM=");
  });

  it("does not log credentials while encoding them", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);

    encodeBasicAuthorization({
      provider: "bitbucket-cloud",
      payload: { email: "reviewer@example.test", apiToken: "synthetic-token" },
    });

    expect(log).not.toHaveBeenCalled();
    expect(debug).not.toHaveBeenCalled();
    log.mockRestore();
    debug.mockRestore();
  });
});
