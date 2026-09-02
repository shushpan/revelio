import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FileTree, type FileTreeFile } from "./FileTree";

const files: FileTreeFile[] = [
  { path: "src/foo/a.ts", changeType: "change", additions: 3, deletions: 1 },
  { path: "src/foo/b.ts", changeType: "new", additions: 10, deletions: 0 },
  { path: "README.md", changeType: "change", additions: 1, deletions: 1 },
];

describe("FileTree", () => {
  afterEach(() => cleanup());

  it("groups files under their directory", () => {
    render(<FileTree files={files} selected={null} onSelect={vi.fn()} />);

    expect(screen.getByRole("button", { name: /src\/foo/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /a\.ts/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /b\.ts/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /README\.md/ })).toBeInTheDocument();
  });

  it("collapses and expands a directory group", () => {
    render(<FileTree files={files} selected={null} onSelect={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /src\/foo/ }));
    expect(screen.queryByRole("button", { name: /a\.ts/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /src\/foo/ }));
    expect(screen.getByRole("button", { name: /a\.ts/ })).toBeInTheDocument();
  });

  it("calls onSelect with the file path when a file row is activated", () => {
    const onSelect = vi.fn();
    render(<FileTree files={files} selected={null} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole("button", { name: /a\.ts/ }));
    expect(onSelect).toHaveBeenCalledWith("src/foo/a.ts");
  });

  it("marks the selected file with aria-current", () => {
    render(<FileTree files={files} selected="src/foo/a.ts" onSelect={vi.fn()} />);

    expect(screen.getByRole("button", { name: /a\.ts/ })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: /b\.ts/ })).not.toHaveAttribute("aria-current");
  });

  it("shows compact change-size indicators per file row", () => {
    render(<FileTree files={files} selected={null} onSelect={vi.fn()} />);

    const row = screen.getByRole("button", { name: /a\.ts/ });
    expect(row).toHaveTextContent("+3");
    expect(row).toHaveTextContent("-1");
  });

  it("moves focus between visible rows with ArrowDown/ArrowUp", () => {
    render(<FileTree files={files} selected={null} onSelect={vi.fn()} />);

    const rows = screen.getAllByRole("button");
    rows[0].focus();
    fireEvent.keyDown(rows[0], { key: "ArrowDown" });
    expect(document.activeElement).toBe(rows[1]);

    fireEvent.keyDown(rows[1], { key: "ArrowUp" });
    expect(document.activeElement).toBe(rows[0]);
  });
});
