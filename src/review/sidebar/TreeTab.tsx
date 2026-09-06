import { type GitStatus, preparePresortedFileTreeInput } from "@pierre/trees";
import { FileTree, useFileTree } from "@pierre/trees/react";
import { type JSX, useEffect, useRef, useState } from "react";
import type { PreparedPatchFile } from "../patch";

export type TreeTabFile = Pick<PreparedPatchFile, "path" | "changeType">;

export interface TreeTabProps {
  readonly files: ReadonlyArray<TreeTabFile>;
  readonly selectedPath: string | null;
  readonly onSelectPath: (path: string) => void;
  /** Whether the Tree tab is the currently visible sidebar tab. */
  readonly active: boolean;
}

function toGitStatus(changeType: TreeTabFile["changeType"]): GitStatus {
  switch (changeType) {
    case "new":
      return "added";
    case "deleted":
      return "deleted";
    case "rename-pure":
    case "rename-changed":
      return "renamed";
    default:
      return "modified";
  }
}

function gitStatusEntries(
  files: ReadonlyArray<TreeTabFile>,
): ReadonlyArray<{ readonly path: string; readonly status: GitStatus }> {
  return files.map((file) => ({ path: file.path, status: toGitStatus(file.changeType) }));
}

export function TreeTab({ files, selectedPath, onSelectPath, active }: TreeTabProps): JSX.Element {
  const initialPathsRef = useRef<readonly string[]>(files.map((file) => file.path));
  const lastReportedRef = useRef<string | null>(selectedPath);

  const { model } = useFileTree({
    preparedInput: preparePresortedFileTreeInput(initialPathsRef.current),
    flattenEmptyDirectories: true,
    initialExpansion: "open",
    initialSelectedPaths: selectedPath ? [selectedPath] : undefined,
    density: 0.8,
    itemHeight: 24,
    stickyFolders: true,
    search: true,
    gitStatus: gitStatusEntries(files),
    onSelectionChange: (paths) => {
      const next = paths[0];
      if (next === undefined || next === lastReportedRef.current) return;
      lastReportedRef.current = next;
      onSelectPath(next);
    },
  });

  const pathsRef = useRef<readonly string[]>(initialPathsRef.current);
  useEffect(() => {
    const nextPaths = files.map((file) => file.path);
    const changed =
      nextPaths.length !== pathsRef.current.length ||
      nextPaths.some((path, index) => path !== pathsRef.current[index]);
    if (!changed) return;
    pathsRef.current = nextPaths;
    model.resetPaths({ preparedInput: preparePresortedFileTreeInput(nextPaths) });
    model.applyGitStatusPatch({ set: gitStatusEntries(files) });
  }, [files, model]);

  useEffect(() => {
    if (selectedPath === null || selectedPath === lastReportedRef.current) return;
    lastReportedRef.current = selectedPath;
    // `FileTree` (the type useFileTree returns) has no exclusive "select only
    // this path" method — only per-item additive select()/deselect() and
    // getSelectedPaths(). Without explicitly deselecting whatever was
    // selected before, a later diff-driven path change left the previous
    // file's row selected too (verified in a real browser: scrolling into a
    // later file highlighted both rows at once).
    for (const path of model.getSelectedPaths()) {
      if (path !== selectedPath) model.getItem(path)?.deselect();
    }
    model.getItem(selectedPath)?.select();
    // Documented API (model.scrollToPath, no `focus` option): brings an off-screen
    // active row into view without stealing keyboard focus from wherever the user
    // is currently interacting (fix round item 1).
    model.scrollToPath(selectedPath);
  }, [selectedPath, model]);

  // @pierre/trees@1.0.0-beta.6 has no documented resize/refresh/remeasure API
  // (verified against its .d.ts and react/FileTree.js: the only mount-time
  // remeasurement path is model.render()/model.unmount() on host mount/unmount).
  // Remounting only this viewport forces that fresh measurement while `model`
  // itself (search/expansion/selection) persists across the remount.
  const wasActiveRef = useRef(active);
  const [viewportKey, setViewportKey] = useState(0);
  useEffect(() => {
    if (active && !wasActiveRef.current) setViewportKey((key) => key + 1);
    wasActiveRef.current = active;
  }, [active]);

  return (
    <div className="tree-tab">
      <FileTree key={viewportKey} model={model} />
    </div>
  );
}
