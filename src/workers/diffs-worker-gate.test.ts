import { afterEach, describe, expect, it } from "vitest";
import {
  resetDiffsWorkerPoolGateForTests,
  shouldUseDiffsWorkerPool,
} from "./diffs-worker-gate";

class FakeInitializingWorker {
  private listeners = new Map<string, Set<(event: unknown) => void>>();

  addEventListener(type: string, listener: (event: unknown) => void): void {
    (this.listeners.get(type) ?? this.listeners.set(type, new Set()).get(type)!).add(listener);
  }

  removeEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  postMessage(request: { type: string; id: string }): void {
    if (request.type !== "initialize") return;
    for (const listener of this.listeners.get("message") ?? []) {
      listener({
        data: { type: "success", requestType: "initialize", id: request.id, sentAt: 0 },
      });
    }
  }

  terminate(): void {}
}

class FakeFailingWorker {
  addEventListener(): void {}
  removeEventListener(): void {}
  postMessage(): void {
    throw new Error("worker unavailable");
  }
  terminate(): void {}
}

class FakeHangingWorker {
  addEventListener(): void {}
  removeEventListener(): void {}
  postMessage(): void {
    // never responds
  }
  terminate(): void {}
}

describe("shouldUseDiffsWorkerPool", () => {
  afterEach(() => resetDiffsWorkerPoolGateForTests());

  it("resolves true when the pool initializes successfully", async () => {
    const result = await shouldUseDiffsWorkerPool({
      workerFactory: () => new FakeInitializingWorker() as unknown as Worker,
    });
    expect(result).toBe(true);
  });

  it("resolves false when worker construction/postMessage fails", async () => {
    const result = await shouldUseDiffsWorkerPool({
      workerFactory: () => new FakeFailingWorker() as unknown as Worker,
    });
    expect(result).toBe(false);
  });

  it("resolves false on timeout against a non-responding worker", async () => {
    const result = await shouldUseDiffsWorkerPool({
      workerFactory: () => new FakeHangingWorker() as unknown as Worker,
      timeoutMs: 20,
    });
    expect(result).toBe(false);
  });

  it("memoizes the result after the first check", async () => {
    let calls = 0;
    const workerFactory = (): Worker => {
      calls += 1;
      return new FakeInitializingWorker() as unknown as Worker;
    };

    await shouldUseDiffsWorkerPool({ workerFactory });
    await shouldUseDiffsWorkerPool({ workerFactory });

    expect(calls).toBe(1);
  });
});
