import { preprocessPatch, type PreparedPatch } from "../review/patch";

export interface PatchWorkerLike {
  postMessage(message: PatchWorkerRequest): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<PatchWorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
}

interface PatchWorkerRequest {
  readonly type: "preprocess";
  readonly id: string;
  readonly patch: string;
}

export interface PatchWorkerSuccess {
  readonly type: "success";
  readonly id: string;
  readonly result: PreparedPatch;
}

interface PatchWorkerError {
  readonly type: "error";
  readonly id: string;
  readonly error: string;
}

type PatchWorkerResponse = PatchWorkerSuccess | PatchWorkerError;

export interface PreprocessPatchAsyncOptions {
  readonly signal?: AbortSignal;
  readonly workerThresholdBytes?: number;
  readonly workerFactory?: () => PatchWorkerLike;
}

const DEFAULT_WORKER_THRESHOLD_BYTES = 2_048;
let requestSequence = 0;

const createWorker = (): PatchWorkerLike => {
  return new Worker(new URL("./patch.worker.ts", import.meta.url), {
    type: "module",
  });
};

export function preprocessPatchAsync(
  patch: string,
  options: PreprocessPatchAsyncOptions = {},
): Promise<PreparedPatch> {
  const inputBytes = new TextEncoder().encode(patch).byteLength;
  const threshold = options.workerThresholdBytes ?? DEFAULT_WORKER_THRESHOLD_BYTES;
  if (inputBytes <= threshold) {
    if (options.signal?.aborted) return Promise.reject(createAbortError());
    return Promise.resolve().then(() => preprocessPatch(patch));
  }

  if (options.signal?.aborted) return Promise.reject(createAbortError());

  const worker = options.workerFactory?.() ?? createWorker();
  const id = `patch-${++requestSequence}`;
  return new Promise<PreparedPatch>((resolve, reject) => {
    let settled = false;
    const settle = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener("abort", onAbort);
      worker.onmessage = null;
      worker.onerror = null;
      callback();
    };
    const fallback = (): void => {
      try {
        settle(() => resolve(preprocessPatch(patch)));
      } catch (error) {
        settle(() => reject(error));
      }
    };
    const onAbort = (): void => {
      worker.terminate();
      settle(() => reject(createAbortError()));
    };
    worker.onmessage = (event): void => {
      const response = event.data;
      if (response.id !== id) return;
      if (response.type === "success") {
        settle(() => resolve(response.result));
      } else {
        worker.terminate();
        fallback();
      }
    };
    worker.onerror = (): void => {
      worker.terminate();
      fallback();
    };
    options.signal?.addEventListener("abort", onAbort, { once: true });
    worker.postMessage({ type: "preprocess", id, patch });
  });
}

function createAbortError(): DOMException {
  return new DOMException("Patch preprocessing was aborted", "AbortError");
}
