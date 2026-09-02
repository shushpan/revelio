import { type JSX, type KeyboardEvent, useState } from "react";
import type { PreparedPatchFile } from "./patch";

export type FileTreeFile = Pick<
  PreparedPatchFile,
  "path" | "changeType" | "additions" | "deletions"
>;

export interface FileTreeProps {
  readonly files: ReadonlyArray<FileTreeFile>;
  readonly selected?: string | null;
  readonly onSelect: (path: string) => void;
}

function dirOf(path: string): string {
  const cut = path.lastIndexOf("/");
  return cut === -1 ? "" : path.slice(0, cut);
}

function nameOf(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

// ponytail: groups by full parent-dir path, not a nested per-segment tree.
// Upgrade to recursive nesting if deep paths need independent collapse.
function groupByDir(files: ReadonlyArray<FileTreeFile>): [string, FileTreeFile[]][] {
  const groups = new Map<string, FileTreeFile[]>();
  for (const file of files) {
    const dir = dirOf(file.path);
    const bucket = groups.get(dir);
    if (bucket) bucket.push(file);
    else groups.set(dir, [file]);
  }
  return [...groups];
}

export function FileTree({ files, selected, onSelect }: FileTreeProps): JSX.Element {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const groups = groupByDir(files);

  const toggle = (dir: string): void => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(dir)) next.delete(dir);
      else next.add(dir);
      return next;
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key === "Enter") {
      event.preventDefault();
      (document.activeElement as HTMLElement | null)?.click();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const rows = [
      ...event.currentTarget.querySelectorAll<HTMLButtonElement>("[data-file-tree-row]"),
    ];
    const index = rows.indexOf(document.activeElement as HTMLButtonElement);
    const target = event.key === "ArrowDown" ? index + 1 : index - 1;
    rows[Math.max(0, Math.min(rows.length - 1, target))]?.focus();
  };

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handled by row buttons.
    <nav
      aria-label="Changed files"
      className="flex flex-col gap-0.5 text-sm"
      onKeyDown={onKeyDown}
    >
      <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
        {groups.map(([dir, groupFiles]) => {
          const isOpen = !collapsed.has(dir);
          return (
            <li key={dir || "."}>
              {dir ? (
                <button
                  type="button"
                  data-file-tree-row
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-1 rounded px-1.5 py-0.5 text-left font-medium hover:bg-default-100"
                  onClick={() => toggle(dir)}
                >
                  <span aria-hidden className="text-xs opacity-60">
                    {isOpen ? "▾" : "▸"}
                  </span>
                  <span className="truncate">{dir}</span>
                </button>
              ) : null}
              {isOpen ? (
                <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                  {groupFiles.map((file) => (
                    <li key={file.path}>
                      <button
                        type="button"
                        data-file-tree-row
                        aria-current={file.path === selected ? "true" : undefined}
                        className={`flex w-full items-center gap-2 rounded py-0.5 pr-1.5 text-left hover:bg-default-100 aria-[current=true]:bg-default-200 ${dir ? "pl-6" : "pl-1.5"}`}
                        onClick={() => onSelect(file.path)}
                      >
                        <span className="truncate">{nameOf(file.path)}</span>
                        <span className="ml-auto flex shrink-0 gap-1 text-xs tabular-nums">
                          <span className="text-success">+{file.additions}</span>
                          <span className="text-danger">-{file.deletions}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
