import { parsePatchFiles, type FileDiffMetadata } from "@pierre/diffs";

export interface PreparedPatchFile {
  readonly id: string;
  readonly path: string;
  readonly changeType: FileDiffMetadata["type"];
  readonly additions: number;
  readonly deletions: number;
  readonly hunkCount: number;
  readonly firstChangedLine?: number;
  readonly firstChangedSide?: "additions" | "deletions";
  readonly fileDiff: FileDiffMetadata;
}

export interface PreparedPatchMetadata {
  readonly fileCount: number;
  readonly additions: number;
  readonly deletions: number;
  readonly hunkCount: number;
  readonly inputBytes: number;
}

export interface PreparedPatch {
  readonly files: readonly PreparedPatchFile[];
  readonly metadata: PreparedPatchMetadata;
}

export function preprocessPatch(patch: string): PreparedPatch {
  const parsed = parsePatchFiles(patch, "revelio", true);
  const files = parsed.flatMap((part) => part.files);
  if (files.length === 0) {
    throw new Error("Patch contains no files");
  }

  const preparedFiles = files
    .map((fileDiff) => {
      const counts = fileDiff.hunks.reduce(
        (total, hunk) => {
          for (const content of hunk.hunkContent) {
            if (content.type === "change") {
              total.additions += content.additions;
              total.deletions += content.deletions;
            }
          }
          return total;
        },
        { additions: 0, deletions: 0 },
      );
      const firstChanged = fileDiff.hunks.flatMap((hunk) =>
        hunk.hunkContent
          .filter((content) => content.type === "change")
          .map((content) => {
            if (content.additions > 0) {
              return {
                line: hunk.additionStart + (content.additionLineIndex - hunk.additionLineIndex),
                side: "additions" as const,
              };
            }
            return {
              line: hunk.deletionStart + (content.deletionLineIndex - hunk.deletionLineIndex),
              side: "deletions" as const,
            };
          }),
      )[0];
      return {
        id: fileDiff.name,
        path: fileDiff.name,
        changeType: fileDiff.type,
        additions: counts.additions,
        deletions: counts.deletions,
        hunkCount: fileDiff.hunks.length,
        firstChangedLine: firstChanged?.line,
        firstChangedSide: firstChanged?.side,
        fileDiff,
      } satisfies PreparedPatchFile;
    })
    .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));

  return {
    files: preparedFiles,
    metadata: {
      fileCount: preparedFiles.length,
      additions: preparedFiles.reduce((total, file) => total + file.additions, 0),
      deletions: preparedFiles.reduce((total, file) => total + file.deletions, 0),
      hunkCount: preparedFiles.reduce((total, file) => total + file.hunkCount, 0),
      inputBytes: new TextEncoder().encode(patch).byteLength,
    },
  };
}
