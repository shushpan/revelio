import {
  getOrCreateWorkerPoolSingleton,
  terminateWorkerPoolSingleton,
  type WorkerPoolManager,
} from "@pierre/diffs/worker";

export interface DiffsWorkerGateOptions {
  readonly workerFactory?: () => Worker;
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 2_000;

const createDiffsWorker = (): Worker =>
  new Worker(new URL("@pierre/diffs/worker/worker.js", import.meta.url), {
    type: "module",
  });

let cached: Promise<boolean> | undefined;

export function shouldUseDiffsWorkerPool(options: DiffsWorkerGateOptions = {}): Promise<boolean> {
  if (!cached) cached = probe(options);
  return cached;
}

export function resetDiffsWorkerPoolGateForTests(): void {
  cached = undefined;
}

async function probe(options: DiffsWorkerGateOptions): Promise<boolean> {
  const workerFactory = options.workerFactory ?? createDiffsWorker;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let pool: WorkerPoolManager | undefined;
  try {
    pool = getOrCreateWorkerPoolSingleton({
      poolOptions: { workerFactory, poolSize: 1 },
      highlighterOptions: {},
    });
    await withTimeout(pool.initialize(), timeoutMs);
    return pool.isWorkingPool();
  } catch {
    return false;
  } finally {
    terminateWorkerPoolSingleton();
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("diffs worker pool probe timed out")), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
