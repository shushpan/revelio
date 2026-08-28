import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DiffReview } from "./DiffReview";

const patch = [
  "diff --git a/src/alpha.ts b/src/alpha.ts",
  "index 1111111..2222222 100644",
  "--- a/src/alpha.ts",
  "+++ b/src/alpha.ts",
  "@@ -1 +1 @@",
  "-export const alpha = 1;",
  "+export const alpha = 2;",
  "diff --git a/src/zeta.ts b/src/zeta.ts",
  "index 3333333..4444444 100644",
  "--- a/src/zeta.ts",
  "+++ b/src/zeta.ts",
  "@@ -1 +1 @@",
  "-export const zeta = 1;",
  "+export const zeta = 2;",
  "",
].join("\n");

const anchoredPatch = [
  "diff --git a/src/alpha.ts b/src/alpha.ts",
  "index 1111111..2222222 100644",
  "--- a/src/alpha.ts",
  "+++ b/src/alpha.ts",
  "@@ -1,2 +1,3 @@",
  " one",
  " two",
  "+three",
  "diff --git a/src/zeta.ts b/src/zeta.ts",
  "index 3333333..4444444 100644",
  "--- a/src/zeta.ts",
  "+++ b/src/zeta.ts",
  "@@ -1 +1,2 @@",
  " keep",
  "+second",
  "",
].join("\n");

describe("DiffReview", () => {
  afterEach(() => cleanup());

  it("renders a multi-file diff with layout toggle and file navigation", async () => {
    render(<DiffReview patch={patch} />);

    expect(await screen.findByRole("heading", { name: "Changes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unified" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Split" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "src/alpha.ts" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "src/zeta.ts" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Split" }));
    expect(screen.getByRole("button", { name: "Split" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "src/zeta.ts" }));
    expect(
      screen.getByRole("button", { name: "Comment on src/zeta.ts line 1" }),
    ).toBeInTheDocument();
  });

  it("emits only a local stable inline-comment intent", async () => {
    const onInlineComment = vi.fn();
    render(<DiffReview patch={patch} onInlineComment={onInlineComment} />);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Comment on src/alpha.ts line 1" }),
      ).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Comment on src/alpha.ts line 1" }));

    expect(onInlineComment).toHaveBeenCalledWith({
      path: "src/alpha.ts",
      line: 1,
      side: "additions",
    });
  });

  it("navigates the rendered diff and anchors the local intent to changed coordinates", async () => {
    const onInlineComment = vi.fn();
    render(<DiffReview patch={anchoredPatch} onInlineComment={onInlineComment} />);

    await screen.findByRole("button", { name: "Comment on src/alpha.ts line 3" });
    fireEvent.click(screen.getByRole("button", { name: "src/zeta.ts" }));
    expect(
      screen.getByRole("button", { name: "Comment on src/zeta.ts line 2" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Comment on src/zeta.ts line 2" }));

    expect(onInlineComment).toHaveBeenCalledWith({
      path: "src/zeta.ts",
      line: 2,
      side: "additions",
    });
  });
});
