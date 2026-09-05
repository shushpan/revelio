import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { forwardRef, type Ref, useImperativeHandle } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DiffReview } from "./DiffReview";

const scrollToCalls: unknown[] = [];

vi.mock("@pierre/diffs/react", () => ({
  CodeView: forwardRef(function CodeView(
    {
      options,
      items,
      disableWorkerPool,
    }: {
      options: unknown;
      items: unknown;
      disableWorkerPool: unknown;
    },
    ref: Ref<{ scrollTo: (target: unknown) => void }>,
  ) {
    useImperativeHandle(ref, () => ({
      scrollTo: (target: unknown) => scrollToCalls.push(target),
    }));
    return (
      <div
        data-options={JSON.stringify(options)}
        data-items={JSON.stringify(items)}
        data-disable-worker-pool={JSON.stringify(disableWorkerPool)}
        data-testid="code-view"
      />
    );
  }),
}));

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

async function readOptions(): Promise<Record<string, unknown>> {
  return JSON.parse(
    (await screen.findByTestId("code-view")).getAttribute("data-options") ?? "{}",
  ) as Record<string, unknown>;
}

async function readItems(): Promise<Array<Record<string, unknown>>> {
  return JSON.parse(
    (await screen.findByTestId("code-view")).getAttribute("data-items") ?? "[]",
  ) as Array<Record<string, unknown>>;
}

describe("DiffReview", () => {
  afterEach(() => {
    cleanup();
    scrollToCalls.length = 0;
  });

  it("renders a dense CodeView with a 1px inter-file gap and the controlled layout", async () => {
    render(<DiffReview patch={patch} themeType="light" layout="split" />);

    const options = await readOptions();
    expect(options).toMatchObject({
      diffStyle: "split",
      layout: { paddingTop: 0, paddingBottom: 0, gap: 1 },
    });
  });

  it("forwards line-number, wrap, and diff-indicator display options to the CodeView", async () => {
    render(
      <DiffReview
        patch={patch}
        themeType="light"
        layout="unified"
        lineNumbers={false}
        wrapLines
        diffIndicators="none"
      />,
    );

    const options = await readOptions();
    expect(options).toMatchObject({
      disableLineNumbers: true,
      overflow: "wrap",
      diffIndicators: "none",
    });
  });

  it("defaults to shown line numbers, no wrap, and classic diff indicators", async () => {
    render(<DiffReview patch={patch} themeType="light" layout="unified" />);

    const options = await readOptions();
    expect(options).toMatchObject({
      disableLineNumbers: false,
      overflow: "scroll",
      diffIndicators: "classic",
    });
  });

  it("collapses every diff item when collapsedAll is true", async () => {
    render(<DiffReview patch={patch} themeType="light" layout="unified" collapsedAll />);

    const items = await readItems();
    expect(items).toHaveLength(2);
    expect(items.every((item) => item.collapsed === true)).toBe(true);
  });

  it("preserves disableWorkerPool exactly as passed", async () => {
    render(
      <DiffReview patch={patch} themeType="light" layout="unified" disableWorkerPool={false} />,
    );

    expect(await screen.findByTestId("code-view")).toHaveAttribute(
      "data-disable-worker-pool",
      "false",
    );
  });

  it("emits only a local stable inline-comment intent", async () => {
    const onInlineComment = vi.fn();
    render(
      <DiffReview
        patch={patch}
        themeType="light"
        layout="unified"
        onInlineComment={onInlineComment}
      />,
    );

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

  it("anchors the inline-comment intent to the externally controlled active file", async () => {
    const onInlineComment = vi.fn();
    const { rerender } = render(
      <DiffReview
        patch={anchoredPatch}
        themeType="light"
        layout="unified"
        onInlineComment={onInlineComment}
        activePath={null}
      />,
    );

    await screen.findByRole("button", { name: "Comment on src/alpha.ts line 3" });

    rerender(
      <DiffReview
        patch={anchoredPatch}
        themeType="light"
        layout="unified"
        onInlineComment={onInlineComment}
        activePath="src/zeta.ts"
      />,
    );

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

  it("does not echo a redundant scroll when the parent feeds its own reported active path back in", async () => {
    const onActivePathChange = vi.fn();
    const { rerender } = render(
      <DiffReview
        patch={patch}
        themeType="light"
        layout="unified"
        activePath={null}
        onActivePathChange={onActivePathChange}
      />,
    );

    await waitFor(() => expect(onActivePathChange).toHaveBeenCalledWith("src/alpha.ts"));
    const scrollsAfterInitialReport = scrollToCalls.length;

    // Simulates ReviewScreen echoing DiffReview's own reported path straight back in.
    rerender(
      <DiffReview
        patch={patch}
        themeType="light"
        layout="unified"
        activePath="src/alpha.ts"
        onActivePathChange={onActivePathChange}
      />,
    );

    expect(scrollToCalls).toHaveLength(scrollsAfterInitialReport);

    // A genuinely externally originated change (e.g. a Tree row click) still scrolls.
    rerender(
      <DiffReview
        patch={patch}
        themeType="light"
        layout="unified"
        activePath="src/zeta.ts"
        onActivePathChange={onActivePathChange}
      />,
    );

    expect(scrollToCalls.length).toBeGreaterThan(scrollsAfterInitialReport);
  });

  it("passes the resolved native theme type without a custom theme marker", async () => {
    render(<DiffReview patch={patch} themeType="dark" layout="unified" />);

    const options = await readOptions();
    expect(options).toMatchObject({ themeType: "dark" });
    expect(options).not.toHaveProperty("theme");
  });
});
