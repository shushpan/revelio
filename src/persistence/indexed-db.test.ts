import { describe, expect, it } from "vitest";
import { makeIndexedDbKeyValueStore } from "./indexed-db";

type FakeStoreName = "settings" | "vault";

class FakeRequest<A> {
  result: A | undefined;
  onsuccess: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(private readonly onSettled: () => void) {}

  succeed(result: A | undefined): void {
    this.result = result;
    queueMicrotask(() => {
      this.onsuccess?.();
      this.onSettled();
    });
  }

  fail(): void {
    queueMicrotask(() => {
      this.onerror?.();
      this.onSettled();
    });
  }
}

class FakeObjectStore {
  constructor(
    private readonly map: Map<IDBValidKey, unknown>,
    private readonly shouldFail: () => boolean,
    private readonly onSettled: () => void,
  ) {}

  get(key: IDBValidKey): FakeRequest<unknown> {
    const request = new FakeRequest<unknown>(this.onSettled);
    if (this.shouldFail()) request.fail();
    else request.succeed(this.map.get(key));
    return request;
  }

  put(value: unknown, key: IDBValidKey): FakeRequest<IDBValidKey> {
    const request = new FakeRequest<IDBValidKey>(this.onSettled);
    if (this.shouldFail()) request.fail();
    else {
      this.map.set(key, value);
      request.succeed(key);
    }
    return request;
  }

  delete(key: IDBValidKey): FakeRequest<undefined> {
    const request = new FakeRequest<undefined>(this.onSettled);
    if (this.shouldFail()) request.fail();
    else {
      this.map.delete(key);
      request.succeed(undefined);
    }
    return request;
  }
}

class FakeTransaction {
  oncomplete: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  private settled = false;
  private pending = 0;

  constructor(
    private readonly stores: Record<FakeStoreName, Map<IDBValidKey, unknown>>,
    private readonly shouldFail: () => boolean,
  ) {}

  objectStore(name: FakeStoreName): FakeObjectStore {
    this.pending += 1;
    return new FakeObjectStore(this.stores[name], this.shouldFail, () => this.onRequestSettled());
  }

  private onRequestSettled(): void {
    this.pending -= 1;
    if (this.pending > 0) return;
    setTimeout(() => {
      if (this.settled) return;
      this.settled = true;
      if (this.shouldFail()) this.onabort?.();
      else this.oncomplete?.();
    }, 0);
  }
}

class FakeDatabase {
  readonly objectStoreNames = {
    contains: (name: string) => name in this.stores,
  };
  readonly stores: Record<FakeStoreName, Map<IDBValidKey, unknown>> = {
    settings: new Map(),
    vault: new Map(),
  };

  createObjectStore(name: FakeStoreName): void {
    this.stores[name] = new Map();
  }

  transaction(_names: ReadonlyArray<FakeStoreName>, _mode: IDBTransactionMode): FakeTransaction {
    return new FakeTransaction(this.stores, this.shouldFail);
  }

  constructor(private readonly shouldFail: () => boolean) {}
}

interface FakeFactoryOptions {
  readonly failOpen?: boolean;
  readonly failRequests?: boolean;
}

const makeFakeIndexedDbFactory = (options: FakeFactoryOptions = {}) => {
  let failRequests = options.failRequests ?? false;
  const db = new FakeDatabase(() => failRequests);
  const factory = {
    open: (_name: string, _version: number) => {
      const request = {
        result: db,
        onupgradeneeded: null as (() => void) | null,
        onsuccess: null as (() => void) | null,
        onerror: null as (() => void) | null,
      };
      queueMicrotask(() => {
        if (options.failOpen) {
          request.onerror?.();
          return;
        }
        for (const name of ["settings", "vault"] as const) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
        }
        request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    },
  };
  return {
    factory: factory as unknown as IDBFactory,
    setFailRequests: (value: boolean) => {
      failRequests = value;
    },
  };
};

describe("makeIndexedDbKeyValueStore", () => {
  it("creates settings and vault object stores and round trips values within each", async () => {
    const { factory } = makeFakeIndexedDbFactory();
    const store = makeIndexedDbKeyValueStore(factory);

    await store.put("settings", "a", "k1");
    await store.put("vault", "b", "k1");

    await expect(store.get("settings", "k1")).resolves.toBe("a");
    await expect(store.get("vault", "k1")).resolves.toBe("b");
  });

  it("returns undefined for a missing key", async () => {
    const { factory } = makeFakeIndexedDbFactory();
    const store = makeIndexedDbKeyValueStore(factory);

    await expect(store.get("settings", "missing")).resolves.toBeUndefined();
  });

  it("deletes a stored value", async () => {
    const { factory } = makeFakeIndexedDbFactory();
    const store = makeIndexedDbKeyValueStore(factory);

    await store.put("settings", "a", "k1");
    await store.delete("settings", "k1");

    await expect(store.get("settings", "k1")).resolves.toBeUndefined();
  });

  it("resolves only once the transaction completes, not merely when the request succeeds", async () => {
    const { factory } = makeFakeIndexedDbFactory();
    const store = makeIndexedDbKeyValueStore(factory);

    let resolved = false;
    const promise = store.put("settings", "a", "k1").then(() => {
      resolved = true;
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(resolved).toBe(false);

    await promise;
    expect(resolved).toBe(true);
  });

  it("rejects with a sanitized error and no DOMException detail when opening fails", async () => {
    const { factory } = makeFakeIndexedDbFactory({ failOpen: true });
    const store = makeIndexedDbKeyValueStore(factory);

    await expect(store.get("settings", "k1")).rejects.toEqual(
      new Error("Local storage is unavailable"),
    );
  });

  it("rejects with a sanitized error and no DOMException detail when a request fails", async () => {
    const { factory, setFailRequests } = makeFakeIndexedDbFactory();
    const store = makeIndexedDbKeyValueStore(factory);
    setFailRequests(true);

    await expect(store.get("settings", "k1")).rejects.toEqual(
      new Error("Local storage is unavailable"),
    );
  });
});
