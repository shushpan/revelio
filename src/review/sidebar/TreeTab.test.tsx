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
  selected: string | null;
  onSelectionChange?: (paths: readonly string[]) => void;
  readonly resetCalls: FakeResetArg[] = [];
  readonly gitStatusCalls: FakeGitStatusPatch[] = [];
  readonly selectCalls: string[] = [];

  constructor(options: {
    readonly preparedInput?: { readonly paths: readonly string[] };
    readonly initialSelectedPaths?: readonly string[];
    readonly gitStatus?: ReadonlyArray<{ readonly path: string; readonly status: string }>;
    readonly onSelectionChange?: (paths: readonly string[]) => void;
  }) {
    this.paths = [...(options.preparedInput?.paths ?? [])];
    this.selected = options.initialSelectedPaths?.[0] ?? null;
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

  getItem(path: string): { select: () => void } | null {
    if (!this.paths.includes(path)) return null;
    return {
      select: () => {
        this.selected = path;
        this.selectCalls.push(path);
      },
    };
  }

  simulateUserSelect(path: string): void {
    this.selected = path;
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

  it("selects the controlled path in the model without re-reporting it back", () => {
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
    expect(onSelectPath).not.toHaveBeenCalled();
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
