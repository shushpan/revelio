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

const deterministicOrderingPatch = [
  "diff --git a/src/z.ts b/src/z.ts",
  "--- a/src/z.ts",
  "+++ b/src/z.ts",
  "@@ -1 +1 @@",
  "-z",
  "+z",
  "diff --git a/src/Alpha.ts b/src/Alpha.ts",
  "--- a/src/Alpha.ts",
  "+++ b/src/Alpha.ts",
  "@@ -1 +1 @@",
  "-alpha",
  "+alpha",
  "diff --git a/src/é.ts b/src/é.ts",
  "--- a/src/é.ts",
  "+++ b/src/é.ts",
  "@@ -1 +1 @@",
  "-accent",
  "+accent",
  "",
].join("\n");

describe("preprocessPatch", () => {
  it("returns deterministic path ordering and hand-checkable patch metadata", () => {
    const result = preprocessPatch(syntheticPatch);

    expect(
      result.files.map(
        ({
          id,
          path,
          changeType,
          additions,
          deletions,
          hunkCount,
          firstChangedLine,
          firstChangedSide,
        }) => ({
          id,
          path,
          changeType,
          additions,
          deletions,
          hunkCount,
          firstChangedLine,
          firstChangedSide,
        }),
      ),
    ).toEqual([
      {
        id: "src/alpha.ts",
        path: "src/alpha.ts",
        changeType: "change",
        additions: 1,
        deletions: 1,
        hunkCount: 1,
        firstChangedLine: 1,
        firstChangedSide: "additions",
      },
      {
        id: "src/zeta.ts",
        path: "src/zeta.ts",
        changeType: "change",
        additions: 1,
        deletions: 0,
        hunkCount: 1,
        firstChangedLine: 2,
        firstChangedSide: "additions",
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

  it("sorts paths by deterministic code-unit order", () => {
    expect(preprocessPatch(deterministicOrderingPatch).files.map((file) => file.path)).toEqual([
      "src/Alpha.ts",
      "src/z.ts",
      "src/é.ts",
    ]);
  });

  it("anchors comments to the first real changed line and side", () => {
    const patch = [
      "diff --git a/src/added-late.ts b/src/added-late.ts",
      "--- a/src/added-late.ts",
      "+++ b/src/added-late.ts",
      "@@ -1,2 +1,3 @@",
      " one",
      " two",
      "+three",
      "diff --git a/src/deleted.ts b/src/deleted.ts",
      "--- a/src/deleted.ts",
      "+++ b/src/deleted.ts",
      "@@ -1,2 +1 @@",
      " keep",
      "-remove",
      "diff --git a/src/added-second.ts b/src/added-second.ts",
      "--- a/src/added-second.ts",
      "+++ b/src/added-second.ts",
      "@@ -1 +1,2 @@",
      " keep",
      "+second",
      "",
    ].join("\n");

    expect(
      preprocessPatch(patch).files.map(({ path, firstChangedLine, firstChangedSide }) => ({
        path,
        firstChangedLine,
        firstChangedSide,
      })),
    ).toEqual([
      { path: "src/added-late.ts", firstChangedLine: 3, firstChangedSide: "additions" },
      { path: "src/added-second.ts", firstChangedLine: 2, firstChangedSide: "additions" },
      { path: "src/deleted.ts", firstChangedLine: 2, firstChangedSide: "deletions" },
    ]);
  });

  it("uses hunk-relative offsets for first changed coordinates across multiple hunks", () => {
    const patch = [
      "diff --git a/src/multi.ts b/src/multi.ts",
      "--- a/src/multi.ts",
      "+++ b/src/multi.ts",
      "@@ -1,2 +1,2 @@",
      " keep one",
      " keep two",
      "@@ -20,2 +30,3 @@",
      " keep twenty",
      "-remove twenty-one",
      "+add thirty-one",
      "+add thirty-two",
      "",
    ].join("\n");

    expect(preprocessPatch(patch).files[0]).toMatchObject({
      firstChangedLine: 31,
      firstChangedSide: "additions",
    });
  });

  it("uses hunk-relative deletion offsets when a later hunk is deletion-only", () => {
    const patch = [
      "diff --git a/src/multi-delete.ts b/src/multi-delete.ts",
      "--- a/src/multi-delete.ts",
      "+++ b/src/multi-delete.ts",
      "@@ -1,2 +1,2 @@",
      " keep one",
      " keep two",
      "@@ -20,3 +30,1 @@",
      " keep twenty",
      "-remove twenty-one",
      "-remove twenty-two",
      "",
    ].join("\n");

    expect(preprocessPatch(patch).files[0]).toMatchObject({
      firstChangedLine: 21,
      firstChangedSide: "deletions",
    });
  });
});
