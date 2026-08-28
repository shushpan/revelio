import { CodeView, type CodeViewItem } from "@pierre/diffs/react";
import { useEffect, useMemo, useState, type JSX } from "react";
import {
  preprocessPatchAsync,
  type PreprocessPatchAsyncOptions,
} from "../workers/patch-worker-client";
import type { PreparedPatch } from "./patch";

export interface InlineCommentIntent {
  readonly path: string;
  readonly line: number;
  readonly side: "additions" | "deletions";
}

export interface DiffReviewProps {
  readonly patch: string;
  readonly onInlineComment?: (intent: InlineCommentIntent) => void;
  readonly preprocessOptions?: PreprocessPatchAsyncOptions;
}

export function DiffReview({
  patch,
  onInlineComment,
  preprocessOptions,
}: DiffReviewProps): JSX.Element {
  const [prepared, setPrepared] = useState<PreparedPatch | null>(null);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [layout, setLayout] = useState<"unified" | "split">("unified");
  const [error, setError] = useState<string | null>(null);
  const [lastIntent, setLastIntent] = useState<InlineCommentIntent | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setPrepared(null);
    setActivePath(null);
    setError(null);
    setLastIntent(null);
    void preprocessPatchAsync(patch, { ...preprocessOptions, signal: controller.signal })
      .then((nextPrepared) => {
        setPrepared(nextPrepared);
        setActivePath(nextPrepared.files[0]?.path ?? null);
      })
      .catch((nextError: unknown) => {
        if (controller.signal.aborted) return;
        setError(nextError instanceof Error ? nextError.message : "Unable to render patch");
      });
    return () => controller.abort();
  }, [patch, preprocessOptions]);

  const items = useMemo<readonly CodeViewItem<InlineCommentIntent>[]>(() => {
    if (!prepared) return [];
    return prepared.files.map((file) => ({
      id: file.id,
      type: "diff",
      fileDiff: file.fileDiff,
      annotations: [
        {
          side: "additions",
          lineNumber: 1,
          metadata: {
            path: file.path,
            line: 1,
            side: "additions",
          },
        },
      ],
    }));
  }, [prepared]);

  const activeFile = prepared?.files.find((file) => file.path === activePath) ?? prepared?.files[0];
  const inlineComment = activeFile
    ? { path: activeFile.path, line: 1, side: "additions" as const }
    : null;

  return (
    <section className="review-card" aria-labelledby="changes-title">
      <div className="review-header">
        <div>
          <p className="eyebrow">Diff-first review</p>
          <h2 id="changes-title">Changes</h2>
        </div>
        <div className="layout-toggle">
          <button
            type="button"
            className="secondary-button"
            aria-pressed={layout === "unified"}
            onClick={() => setLayout("unified")}
          >
            Unified
          </button>
          <button
            type="button"
            className="secondary-button"
            aria-pressed={layout === "split"}
            onClick={() => setLayout("split")}
          >
            Split
          </button>
        </div>
      </div>
      {prepared ? (
        <>
          <div className="review-summary" role="status">
            {prepared.metadata.fileCount} files · {prepared.metadata.additions} additions ·{" "}
            {prepared.metadata.deletions} deletions
          </div>
          <nav className="review-file-nav" aria-label="Changed files">
            {prepared.files.map((file) => (
              <button
                type="button"
                key={file.id}
                className="file-nav-button"
                aria-current={file.path === activeFile?.path ? "page" : undefined}
                onClick={() => setActivePath(file.path)}
              >
                {file.path}
              </button>
            ))}
          </nav>
          {inlineComment ? (
            <button
              type="button"
              className="inline-comment-button"
              onClick={() => {
                setLastIntent(inlineComment);
                onInlineComment?.(inlineComment);
              }}
            >
              Comment on {inlineComment.path} line {inlineComment.line}
            </button>
          ) : null}
          {lastIntent ? (
            <p className="inline-comment-status" role="status">
              Local inline-comment intent: {lastIntent.path}:{lastIntent.line} ({lastIntent.side})
            </p>
          ) : null}
          <div className="diff-view" data-virtualized="true">
            <CodeView
              items={items}
              disableWorkerPool
              options={{
                diffStyle: layout,
                themeType: "light",
                theme: "github-light",
                lineDiffType: "none",
                layout: { paddingTop: 0, paddingBottom: 0, gap: 12 },
              }}
            />
          </div>
        </>
      ) : (
        <p className="review-status" role="status">
          {error ?? "Preparing synthetic review patch…"}
        </p>
      )}
    </section>
  );
}
