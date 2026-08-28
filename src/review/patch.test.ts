import { describe, expect, it } from "vitest";
import { preprocessPatch } from "./patch";

const syntheticPatch = [
  "diff --git a/src/zeta.ts b/src/zeta.ts",
  "index 1111111..2222222 100644",
  "--- a/src/zeta.ts",
  "+++ b/src/zeta.ts",
  "@@ -1 +1,2 @@",
  " export const zeta = 1;",
  "+export const zetaNext = 2;",
  "diff --git a/src/alpha.ts b/src/alpha.ts",
  "index 3333333..4444444 100644",
  "--- a/src/alpha.ts",
  "+++ b/src/alpha.ts",
  "@@ -1 +1 @@",
  "-export const alpha = 1;",
  "+export const alpha = 2;",
  "",
].join("\n");

describe("preprocessPatch", () => {
  it("returns deterministic path ordering and hand-checkable patch metadata", () => {
    const result = preprocessPatch(syntheticPatch);

    expect(
      result.files.map(({ id, path, changeType, additions, deletions, hunkCount }) => ({
        id,
        path,
        changeType,
        additions,
        deletions,
        hunkCount,
      })),
    ).toEqual([
      {
        id: "src/alpha.ts",
        path: "src/alpha.ts",
        changeType: "change",
        additions: 1,
        deletions: 1,
        hunkCount: 1,
      },
      {
        id: "src/zeta.ts",
        path: "src/zeta.ts",
        changeType: "change",
        additions: 1,
        deletions: 0,
        hunkCount: 1,
      },
    ]);
    expect(result.metadata).toEqual({
      fileCount: 2,
      additions: 2,
      deletions: 1,
      hunkCount: 2,
      inputBytes: new TextEncoder().encode(syntheticPatch).byteLength,
    });
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("rejects an empty patch instead of producing an empty review", () => {
    expect(() => preprocessPatch(" ")).toThrow("Patch contains no files");
  });
});
