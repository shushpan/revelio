import { cleanup, render } from "@testing-library/react";
import type { JSX } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TreeTab } from "./TreeTab";

interface FakeResetArg {
  readonly preparedInput?: { readonly paths: readonly string[] };
  readonly initialExpandedPaths?: readonly string[];
}

interface FakeGitStatusPatch {
  readonly set?: ReadonlyArray<{ readonly path: string; readonly status: string }>;
  readonly remove?: readonly string[];
}

class FakeFileTree {
  readonly created: unknown;
  paths: string[];
  gitStatus: Record<string, string> = {};
  // Mirrors the real `FileTree` render class (the type `useFileTree` actually
  // returns): there is no exclusive "select only this path" method, only
  // per-item additive select()/deselect() and getSelectedPaths().
  selectedPaths = new Set<string>();
  onSelectionChange?: (paths: readonly string[]) => void;
  readonly resetCalls: FakeResetArg[] = [];
  readonly gitStatusCalls: FakeGitStatusPatch[] = [];
  readonly selectCalls: string[] = [];
  readonly deselectCalls: string[] = [];
  readonly scrollToPathCalls: Array<{ readonly path: string; readonly focus?: boolean }> = [];

  constructor(options: {
    readonly preparedInput?: { readonly paths: readonly string[] };
    readonly initialSelectedPaths?: readonly string[];
    readonly gitStatus?: ReadonlyArray<{ readonly path: string; readonly status: string }>;
    readonly onSelectionChange?: (paths: readonly string[]) => void;
  }) {
    this.paths = [...(options.preparedInput?.paths ?? [])];
    for (const path of options.initialSelectedPaths ?? []) this.selectedPaths.add(path);
    this.onSelectionChange = options.onSelectionChange;
    for (const entry of options.gitStatus ?? []) this.gitStatus[entry.path] = entry.status;
    this.created = options;
  }

  resetPaths(arg: FakeResetArg): void {
    this.resetCalls.push(arg);
    this.paths = [...(arg.preparedInput?.paths ?? [])];
  }

  applyGitStatusPatch(patch: FakeGitStatusPatch): void {
    this.gitStatusCalls.push(patch);
    for (const entry of patch.set ?? []) this.gitStatus[entry.path] = entry.status;
    for (const path of patch.remove ?? []) delete this.gitStatus[path];
  }

  getSelectedPaths(): readonly string[] {
    return [...this.selectedPaths];
  }

  getItem(path: string): { select: () => void; deselect: () => void } | null {
    if (!this.paths.includes(path)) return null;
    return {
      select: () => {
        this.selectedPaths.add(path);
        this.selectCalls.push(path);
      },
      deselect: () => {
        this.selectedPaths.delete(path);
        this.deselectCalls.push(path);
      },
    };
  }

  scrollToPath(path: string, options?: { readonly focus?: boolean }): void {
    this.scrollToPathCalls.push({ path, focus: options?.focus });
  }

  simulateUserSelect(path: string): void {
    this.selectedPaths = new Set([path]);
    this.onSelectionChange?.([path]);
  }
}

const createdModels: FakeFileTree[] = [];
let viewportMountCount = 0;

vi.mock("@pierre/trees", () => ({
  preparePresortedFileTreeInput: (paths: readonly string[]) => ({ paths: [...paths] }),
}));

vi.mock("@pierre/trees/react", async () => {
  const react = await import("react");
  return {
    useFileTree: (options: ConstructorParameters<typeof FakeFileTree>[0]) => {
      // Mirrors the real hook: create the model once per component instance.
      const [model] = react.useState(() => {
        const created = new FakeFileTree(options);
        createdModels.push(created);
        return created;
      });
      return { model };
    },
    FileTree: (): JSX.Element => {
      react.useEffect(() => {
        viewportMountCount += 1;
      }, []);
      return <div data-testid="file-tree-viewport" />;
    },
  };
});

const files = [
  { path: "src/a/one.ts", changeType: "new" as const },
  { path: "src/a/nested/two.ts", changeType: "change" as const },
  { path: "src/b/three.ts", changeType: "deleted" as const },
];

function lastModel(): FakeFileTree {
  const model = createdModels.at(-1);
  if (!model) throw new Error("no model created");
  return model;
}

describe("TreeTab", () => {
  afterEach(() => {
    cleanup();
    createdModels.length = 0;
    viewportMountCount = 0;
  });

  it("builds the tree from patch-ordered, recursive file paths", () => {
    render(<TreeTab files={files} selectedPath={null} onSelectPath={vi.fn()} active={false} />);

    expect(lastModel().paths).toEqual(["src/a/one.ts", "src/a/nested/two.ts", "src/b/three.ts"]);
  });

  it("maps each file's change type to a git status entry keyed by path", () => {
    render(<TreeTab files={files} selectedPath={null} onSelectPath={vi.fn()} active={false} />);

    expect(lastModel().gitStatus).toEqual({
      "src/a/one.ts": "added",
      "src/a/nested/two.ts": "modified",
      "src/b/three.ts": "deleted",
    });
  });

  it("exclusively selects the controlled path in the model without re-reporting it back", () => {
    const onSelectPath = vi.fn();
    const { rerender } = render(
      <TreeTab files={files} selectedPath={null} onSelectPath={onSelectPath} active={false} />,
    );

    rerender(
      <TreeTab
        files={files}
        selectedPath="src/b/three.ts"
        onSelectPath={onSelectPath}
        active={false}
      />,
    );

    expect(lastModel().selectCalls).toEqual(["src/b/three.ts"]);
    expect(lastModel().deselectCalls).toEqual([]);
    expect(onSelectPath).not.toHaveBeenCalled();
  });

  it("deselects the previously controlled path so the selection replaces rather than accumulates", () => {
    // The real `FileTree` render class has no exclusive "select only this
    // path" method — an item's own `.select()` is additive. Without an
    // explicit deselect of whatever was selected before, a later
    // diff-driven path change left both the old and new active file
    // highlighted at once (verified in a real browser).
    const onSelectPath = vi.fn();
    const { rerender } = render(
      <TreeTab files={files} selectedPath={null} onSelectPath={onSelectPath} active={false} />,
    );

    rerender(
      <TreeTab
        files={files}
        selectedPath="src/a/one.ts"
        onSelectPath={onSelectPath}
        active={false}
      />,
    );
    rerender(
      <TreeTab
        files={files}
        selectedPath="src/b/three.ts"
        onSelectPath={onSelectPath}
        active={false}
      />,
    );

    expect(lastModel().selectCalls).toEqual(["src/a/one.ts", "src/b/three.ts"]);
    expect(lastModel().deselectCalls).toEqual(["src/a/one.ts"]);
    expect(lastModel().getSelectedPaths()).toEqual(["src/b/three.ts"]);
  });

  it("scrolls an off-screen externally selected path into view without stealing focus", () => {
    const onSelectPath = vi.fn();
    const { rerender } = render(
      <TreeTab files={files} selectedPath={null} onSelectPath={onSelectPath} active={false} />,
    );

    rerender(
      <TreeTab
        files={files}
        selectedPath="src/b/three.ts"
        onSelectPath={onSelectPath}
        active={false}
      />,
    );

    expect(lastModel().scrollToPathCalls).toEqual([{ path: "src/b/three.ts", focus: undefined }]);
  });

  it("reports a user-originated tree selection without feeding it back into the model", () => {
    const onSelectPath = vi.fn();
    render(
      <TreeTab files={files} selectedPath={null} onSelectPath={onSelectPath} active={false} />,
    );

    lastModel().simulateUserSelect("src/a/one.ts");

    expect(onSelectPath).toHaveBeenCalledWith("src/a/one.ts");
    expect(lastModel().selectCalls).toEqual([]);
  });

  it("resets the model's paths and git status when the file list changes", () => {
    const { rerender } = render(
      <TreeTab files={files} selectedPath={null} onSelectPath={vi.fn()} active={false} />,
    );

    const nextFiles = [...files, { path: "src/c/four.ts", changeType: "new" as const }];
    rerender(
      <TreeTab files={nextFiles} selectedPath={null} onSelectPath={vi.fn()} active={false} />,
    );

    expect(lastModel().resetCalls).toHaveLength(1);
    expect(lastModel().paths).toContain("src/c/four.ts");
    expect(lastModel().gitStatus["src/c/four.ts"]).toBe("added");
  });

  it("remounts only the viewport, keeping the same model, across two hide/show cycles", () => {
    const { rerender, getAllByTestId } = render(
      <TreeTab files={files} selectedPath={null} onSelectPath={vi.fn()} active={false} />,
    );
    expect(viewportMountCount).toBe(1);

    rerender(<TreeTab files={files} selectedPath={null} onSelectPath={vi.fn()} active />);
    expect(viewportMountCount).toBe(2);

    rerender(<TreeTab files={files} selectedPath={null} onSelectPath={vi.fn()} active={false} />);
    expect(viewportMountCount).toBe(2);

    rerender(<TreeTab files={files} selectedPath={null} onSelectPath={vi.fn()} active />);
    expect(viewportMountCount).toBe(3);

    expect(createdModels).toHaveLength(1);
    expect(getAllByTestId("file-tree-viewport")).toHaveLength(1);
  });
});
