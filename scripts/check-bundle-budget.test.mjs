import { describe, expect, it } from "vitest";
import { accountBundleAssets } from "./check-bundle-budget-lib.mjs";

const entry = (extra = "") => `<!doctype html>
<link rel="modulepreload" href="/assets/shared.js">
<script type="module" src="/assets/index.js"></script>${extra}`;

describe("accountBundleAssets", () => {
  it("accounts the module entry and every modulepreload script", () => {
    expect(
      accountBundleAssets(entry(), [
        { name: "index.js", bytes: 100 },
        { name: "shared.js", bytes: 25 },
        { name: "lazy.js", bytes: 200 },
      ]),
    ).toMatchObject({
      initialBytes: 125,
      initialNames: ["index.js", "shared.js"],
      largestLazy: { name: "lazy.js", bytes: 200 },
    });
  });

  it("rejects an index with no module entry script", () => {
    expect(() =>
      accountBundleAssets('<link rel="modulepreload" href="/assets/shared.js">', []),
    ).toThrow("exactly one module entry script");
  });

  it("rejects an index with duplicate module entry scripts", () => {
    expect(() =>
      accountBundleAssets(entry('<script type="module" src="/assets/second.js"></script>'), [
        { name: "index.js", bytes: 100 },
        { name: "second.js", bytes: 50 },
      ]),
    ).toThrow("exactly one module entry script");
  });

  it("rejects a missing module entry asset", () => {
    expect(() => accountBundleAssets(entry(), [{ name: "shared.js", bytes: 25 }])).toThrow(
      "Missing initial JavaScript asset: index.js",
    );
  });

  it("rejects a missing modulepreload asset", () => {
    expect(() => accountBundleAssets(entry(), [{ name: "index.js", bytes: 100 }])).toThrow(
      "Missing initial JavaScript asset: shared.js",
    );
  });
});
