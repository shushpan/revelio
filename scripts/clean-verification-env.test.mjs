import { describe, expect, it } from "vitest";
import { cleanVerificationEnv } from "./clean-verification-env.mjs";

describe("cleanVerificationEnv", () => {
  it("removes color controls while preserving the command environment", () => {
    expect(
      cleanVerificationEnv({
        FORCE_COLOR: "1",
        NO_COLOR: "1",
        PATH: "/usr/bin",
        NODE_ENV: "test",
      }),
    ).toEqual({ PATH: "/usr/bin", NODE_ENV: "test" });
  });
});
