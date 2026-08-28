import { describe, expect, it, vi } from "vitest";
import { preprocessPatch } from "../review/patch";
import { preprocessPatchAsync, type PatchWorkerLike } from "./patch-worker-client";

const largePatch = [
  "diff --git a/src/large.ts b/src/large.ts",
  "index 1111111..2222222 100644",
  "--- a/src/large.ts",
  "+++ b/src/large.ts",
  "@@ -1 +1,2 @@",
  "-export const value = 1;",
  "+export const value = 2;",
  "+export const extra = 3;",
  "",
].join("\n");

class FakeWorker implements PatchWorkerLike {
  readonly posted: unknown[] = [];
  readonly terminate = vi.fn();
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;

  postMessage(message: unknown): void {
    this.posted.push(message);
  }

  emitResult(result: ReturnType<typeof preprocessPatch>): void {
    const request = this.posted[0] as { id: string };
    this.onmessage?.({ data: { type: "success", id: request.id, result } } as MessageEvent);
  }

  emitError(): void {
    this.onerror?.({ error: new Error("synthetic worker failure") } as ErrorEvent);
  }
}

describe("preprocessPatchAsync", () => {
  it("keeps small patches on the main thread", async () => {
    const workerFactory = vi.fn(() => new FakeWorker());

    const result = await preprocessPatchAsync(largePatch, {
      workerFactory,
      workerThresholdBytes: Number.MAX_SAFE_INTEGER,
    });

    expect(workerFactory).not.toHaveBeenCalled();
    expect(result.metadata.fileCount).toBe(1);
  });

  it("uses the module worker for large patches and returns its serializable result", async () => {
    const worker = new FakeWorker();
    const promise = preprocessPatchAsync(largePatch, {
      workerFactory: () => worker,
      workerThresholdBytes: 1,
    });

    expect(worker.posted).toHaveLength(1);
    expect(worker.posted[0]).toMatchObject({ type: "preprocess", patch: largePatch });
    worker.emitResult(preprocessPatch(largePatch));

    await expect(promise).resolves.toMatchObject({ metadata: { fileCount: 1 } });
  });

  it("terminates pending work when the caller aborts", async () => {
    const worker = new FakeWorker();
    const controller = new AbortController();
    const promise = preprocessPatchAsync(largePatch, {
      workerFactory: () => worker,
      workerThresholdBytes: 1,
      signal: controller.signal,
    });

    controller.abort();

    expect(worker.terminate).toHaveBeenCalledTimes(1);
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });

  it("falls back to local preprocessing on worker failure without losing content", async () => {
    const worker = new FakeWorker();
    const promise = preprocessPatchAsync(largePatch, {
      workerFactory: () => worker,
      workerThresholdBytes: 1,
    });

    worker.emitError();

    await expect(promise).resolves.toEqual(preprocessPatch(largePatch));
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });
});
