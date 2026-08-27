import { describe, expect, it, vi } from "vitest";
import { encodeBasicAuthorization } from "./auth";

describe("Bitbucket Basic authentication", () => {
  it("encodes the email and token as the exact Basic authorization value", () => {
    const value = encodeBasicAuthorization({
      email: "reviewer@example.test",
      token: "synthetic-token-123",
    });

    expect(value).toBe("Basic cmV2aWV3ZXJAZXhhbXBsZS50ZXN0OnN5bnRoZXRpYy10b2tlbi0xMjM=");
  });

  it("does not log credentials while encoding them", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);

    encodeBasicAuthorization({ email: "reviewer@example.test", token: "synthetic-token" });

    expect(log).not.toHaveBeenCalled();
    expect(debug).not.toHaveBeenCalled();
    log.mockRestore();
    debug.mockRestore();
  });
});
