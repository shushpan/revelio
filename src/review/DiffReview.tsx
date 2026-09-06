import { CodeView, type CodeViewHandle, type CodeViewItem } from "@pierre/diffs/react";
import { type JSX, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../ui/Button";
import {
  type PreprocessPatchAsyncOptions,
  preprocessPatchAsync,
} from "../workers/patch-worker-client";
import type { PreparedPatch } from "./patch";

export interface InlineCommentIntent {
  readonly path: string;
  readonly line: number;
  readonly side: "additions" | "deletions";
}

export type DiffLayout = "unified" | "split";
export type DiffIndicatorsOption = "classic" | "none";

export interface DiffReviewProps {
  readonly patch: string;
  readonly themeType: "light" | "dark";
  readonly layout: DiffLayout;
  readonly collapsedAll?: boolean;
  readonly lineNumbers?: boolean;
  readonly wrapLines?: boolean;
  readonly diffIndicators?: DiffIndicatorsOption;
  readonly onInlineComment?: (intent: InlineCommentIntent) => void;
  readonly preprocessOptions?: PreprocessPatchAsyncOptions;
  readonly activePath?: string | null;
  readonly onActivePathChange?: (path: string) => void;
  readonly onFilesChange?: (files: PreparedPatch["files"]) => void;
  readonly disableWorkerPool?: boolean;
}

export function DiffReview({
  patch,
  themeType,
  layout,
  collapsedAll = false,
  lineNumbers = true,
  wrapLines = false,
  diffIndicators = "classic",
  onInlineComment,
  preprocessOptions,
  activePath: controlledActivePath,
  onActivePathChange,
  onFilesChange,
  disableWorkerPool = true,
}: DiffReviewProps): JSX.Element {
  const [prepared, setPrepared] = useState<PreparedPatch | null>(null);
  const [internalActivePath, setInternalActivePath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastIntent, setLastIntent] = useState<InlineCommentIntent | null>(null);
  const codeViewRef = useRef<CodeViewHandle<InlineCommentIntent>>(null);
  const activePath = controlledActivePath ?? internalActivePath;
  // Guards the tree/diff selection loop (spec §11.1, §23): a path this
  // component itself reported via onActivePathChange must not, once echoed
  // back in as `activePath`, cause a redundant scrollTo — only a path change
  // that originated elsewhere (e.g. a Tree row click) should scroll.
  const lastReportedPathRef = useRef<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setPrepared(null);
    setInternalActivePath(null);
    setError(null);
    setLastIntent(null);
    void preprocessPatchAsync(patch, { ...preprocessOptions, signal: controller.signal })
      .then((nextPrepared) => {
        setPrepared(nextPrepared);
        const firstPath = nextPrepared.files[0]?.path ?? null;
        setInternalActivePath(firstPath);
        if (firstPath) {
          lastReportedPathRef.current = firstPath;
          onActivePathChange?.(firstPath);
        }
        onFilesChange?.(nextPrepared.files);
      })
      .catch((nextError: unknown) => {
        if (controller.signal.aborted) return;
        setError(nextError instanceof Error ? nextError.message : "Unable to render patch");
      });
    return () => controller.abort();
  }, [patch, preprocessOptions, onActivePathChange, onFilesChange]);

  useEffect(() => {
    if (!prepared || controlledActivePath == null) return;
    if (controlledActivePath === lastReportedPathRef.current) return;
    const file = prepared.files.find((candidate) => candidate.path === controlledActivePath);
    if (!file) return;
    codeViewRef.current?.scrollTo({
      type: "item",
      id: file.id,
      align: "start",
      behavior: "instant",
    });
  }, [controlledActivePath, prepared]);

  const items = useMemo<readonly CodeViewItem<InlineCommentIntent>[]>(() => {
    if (!prepared) return [];
    return prepared.files.map((file) => ({
      id: file.id,
      type: "diff",
      fileDiff: file.fileDiff,
      collapsed: collapsedAll,
      annotations:
        file.firstChangedLine !== undefined && file.firstChangedSide !== undefined
          ? [
              {
                side: file.firstChangedSide,
                lineNumber: file.firstChangedLine,
                metadata: {
                  path: file.path,
                  line: file.firstChangedLine,
                  side: file.firstChangedSide,
                },
              },
            ]
          : undefined,
    }));
  }, [prepared, collapsedAll]);

  // Diff-to-tree sync (§11.1 fix round item 1): derive the file at the top of the
  // viewport from the real CodeView scroll position via the documented
  // `getTopForItem` API, rather than a synthetic test-only trigger. Guarded by the
  // same `lastReportedPathRef` used for the tree-to-diff direction, so this can
  // never itself cause a redundant scrollTo when echoed back in as `activePath`.
  const handleScroll = (
    scrollTop: number,
    viewer: { getTopForItem(id: string): number | undefined },
  ): void => {
    if (!prepared) return;
    let currentPath: string | null = null;
    for (const file of prepared.files) {
      const top = viewer.getTopForItem(file.id);
      if (top === undefined) continue;
      if (top <= scrollTop) currentPath = file.path;
      else break;
    }
    currentPath ??= prepared.files[0]?.path ?? null;
    if (currentPath === null || currentPath === lastReportedPathRef.current) return;
    lastReportedPathRef.current = currentPath;
    setInternalActivePath(currentPath);
    onActivePathChange?.(currentPath);
  };

  const activeFile = prepared?.files.find((file) => file.path === activePath) ?? prepared?.files[0];
  const inlineComment =
    activeFile?.firstChangedLine !== undefined && activeFile.firstChangedSide !== undefined
      ? {
          path: activeFile.path,
          line: activeFile.firstChangedLine,
          side: activeFile.firstChangedSide,
        }
      : null;

  return (
    <div className="diff-canvas">
      {prepared ? (
        <>
          {inlineComment ? (
            <Button
              variant="secondary"
              className="inline-comment-button"
              onClick={() => {
                setLastIntent(inlineComment);
                onInlineComment?.(inlineComment);
              }}
            >
              Comment on {inlineComment.path} line {inlineComment.line}
            </Button>
          ) : null}
          {lastIntent ? (
            <p className="inline-comment-status" role="status">
              Local inline-comment intent: {lastIntent.path}:{lastIntent.line} ({lastIntent.side})
            </p>
          ) : null}
          <div className="diff-view">
            <CodeView
              ref={codeViewRef}
              items={items}
              disableWorkerPool={disableWorkerPool}
              onScroll={handleScroll}
              options={{
                diffStyle: layout,
                themeType,
                lineDiffType: "none",
                layout: { paddingTop: 0, paddingBottom: 0, gap: 1 },
                disableLineNumbers: !lineNumbers,
                overflow: wrapLines ? "wrap" : "scroll",
                diffIndicators,
              }}
            />
          </div>
        </>
      ) : (
        <p className="review-status" role="status">
          {error ?? "Preparing review patch…"}
        </p>
      )}
    </div>
  );
}
