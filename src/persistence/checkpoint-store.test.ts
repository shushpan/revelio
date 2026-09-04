import { describe, expect, it } from "vitest";
import type { Checkpoint } from "../inbox/checkpoint";
import { makeCheckpointStore } from "./checkpoint-store";
import type { KeyValueStore } from "./indexed-db";

const first: Checkpoint = {
  pullRequestKey: "acme/repo#1",
  reviewedHeadCommit: "head-1",
  watermark: "2026-01-10T00:00:00Z",
  outcome: "reviewed",
  finishedAt: "2026-01-10T00:01:00Z",
};

const second: Checkpoint = {
  pullRequestKey: "acme/repo#2",
  reviewedHeadCommit: "head-2",
  watermark: "2026-01-11T00:00:00Z",
  outcome: "approved",
  finishedAt: "2026-01-11T00:01:00Z",
};

const makeFakeKeyValueStore = (): {
  readonly store: KeyValueStore;
  readonly settings: Map<IDBValidKey, unknown>;
} => {
  const settings = new Map<IDBValidKey, unknown>();
  const vault = new Map<IDBValidKey, unknown>();
  return {
    store: {
      get: async <A>(store: "settings" | "vault", key: IDBValidKey) =>
        (store === "settings" ? settings : vault).get(key) as A | undefined,
      put: async (store, value, key) => {
        (store === "settings" ? settings : vault).set(key, value);
      },
      delete: async (store, key) => {
        (store === "settings" ? settings : vault).delete(key);
      },
    },
    settings,
  };
};

describe("makeCheckpointStore", () => {
  it("isolates checkpoints by provider and user identity", async () => {
    const { store } = makeFakeKeyValueStore();
    const checkpoints = makeCheckpointStore(store);

    await checkpoints.save("bitbucket-cloud", "user-a", first);
    await checkpoints.save("bitbucket-cloud", "user-b", second);
    await checkpoints.save("other-provider", "user-a", second);

    await expect(checkpoints.load("bitbucket-cloud", "user-a")).resolves.toEqual([first]);
    await expect(checkpoints.load("bitbucket-cloud", "user-b")).resolves.toEqual([second]);
    await expect(checkpoints.load("other-provider", "user-a")).resolves.toEqual([second]);
  });

  it("keeps identities with delimiter characters isolated", async () => {
    const { store } = makeFakeKeyValueStore();
    const checkpoints = makeCheckpointStore(store);

    await checkpoints.save("a:b", "c", first);
    await checkpoints.save("a", "b:c", second);

    await expect(checkpoints.load("a:b", "c")).resolves.toEqual([first]);
    await expect(checkpoints.load("a", "b:c")).resolves.toEqual([second]);
  });

  it("upserts by pull request key and returns a sorted copy", async () => {
    const { store } = makeFakeKeyValueStore();
    const checkpoints = makeCheckpointStore(store);
    const replacement = {
      ...first,
      reviewedHeadCommit: "head-3",
      outcome: "changes_requested",
    } as const;

    await checkpoints.save("bitbucket-cloud", "user-a", second);
    await checkpoints.save("bitbucket-cloud", "user-a", first);
    await checkpoints.save("bitbucket-cloud", "user-a", replacement);

    const loaded = await checkpoints.load("bitbucket-cloud", "user-a");
    expect(loaded).toEqual([replacement, second]);
    expect(() => (loaded as Checkpoint[]).push(first)).toThrow(TypeError);
    expect(() => {
      (loaded[0] as { outcome: Checkpoint["outcome"] }).outcome = "approved";
    }).toThrow(TypeError);
    await expect(checkpoints.load("bitbucket-cloud", "user-a")).resolves.toEqual([
      replacement,
      second,
    ]);
  });

  it("stores one versioned record in settings without using localStorage", async () => {
    const { store, settings } = makeFakeKeyValueStore();
    const checkpoints = makeCheckpointStore(store);
    const localStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get: () => {
        throw new Error("localStorage must not be accessed");
      },
    });

    try {
      await checkpoints.save("bitbucket-cloud", "user-a", first);
    } finally {
      if (localStorage) Object.defineProperty(globalThis, "localStorage", localStorage);
      else delete (globalThis as { localStorage?: Storage }).localStorage;
    }

    expect(settings).toEqual(
      new Map([["checkpoints:bitbucket-cloud:user-a", { version: 1, checkpoints: [first] }]]),
    );
  });

  it("removes only the requested checkpoint", async () => {
    const { store } = makeFakeKeyValueStore();
    const checkpoints = makeCheckpointStore(store);

    await checkpoints.save("bitbucket-cloud", "user-a", first);
    await checkpoints.save("bitbucket-cloud", "user-a", second);
    await checkpoints.remove("bitbucket-cloud", "user-a", first.pullRequestKey);

    await expect(checkpoints.load("bitbucket-cloud", "user-a")).resolves.toEqual([second]);
  });

  it("returns an empty array when stored data is malformed", async () => {
    const { store } = makeFakeKeyValueStore();
    await store.put(
      "settings",
      { version: 1, checkpoints: [{ ...first, outcome: "unknown" }] },
      "checkpoints:bitbucket-cloud:user-a",
    );

    await expect(makeCheckpointStore(store).load("bitbucket-cloud", "user-a")).resolves.toEqual([]);
  });

  it.each([
    ["watermark", { ...first, watermark: "not-a-timestamp" }],
    ["finishedAt", { ...first, finishedAt: "not-a-timestamp" }],
  ] as const)("returns an empty array when a persisted %s is malformed", async (_field, value) => {
    const { store } = makeFakeKeyValueStore();
    await store.put(
      "settings",
      { version: 1, checkpoints: [value] },
      "checkpoints:bitbucket-cloud:user-a",
    );

    await expect(makeCheckpointStore(store).load("bitbucket-cloud", "user-a")).resolves.toEqual([]);
  });

  it("loads persisted RFC3339 offsets and fractional seconds for both checkpoint timestamps", async () => {
    const { store } = makeFakeKeyValueStore();
    const checkpoint = {
      ...first,
      watermark: "2026-01-10T00:00:00.123456789+05:30",
      finishedAt: "2026-01-10T00:01:00.1-00:00",
    };
    await store.put(
      "settings",
      { version: 1, checkpoints: [checkpoint] },
      "checkpoints:bitbucket-cloud:user-a",
    );

    await expect(makeCheckpointStore(store).load("bitbucket-cloud", "user-a")).resolves.toEqual([
      checkpoint,
    ]);
  });

  it.each([
    ["watermark", "a date-only value", "2026-01-10"],
    ["watermark", "a locale-specific value", "January 10, 2026 00:00:00 UTC"],
    ["watermark", "an impossible calendar date", "2026-02-30T00:00:00Z"],
    ["watermark", "a normalized-invalid hour", "2026-01-10T24:00:00Z"],
    ["finishedAt", "a date-only value", "2026-01-10"],
    ["finishedAt", "a locale-specific value", "January 10, 2026 00:00:00 UTC"],
    ["finishedAt", "an impossible calendar date", "2026-02-30T00:00:00Z"],
    ["finishedAt", "a normalized-invalid hour", "2026-01-10T24:00:00Z"],
  ] as const)("fails closed for a persisted %s with %s", async (field, _description, timestamp) => {
    const { store } = makeFakeKeyValueStore();
    const checkpoint =
      field === "watermark"
        ? { ...first, watermark: timestamp }
        : { ...first, finishedAt: timestamp };
    await store.put(
      "settings",
      { version: 1, checkpoints: [checkpoint] },
      "checkpoints:bitbucket-cloud:user-a",
    );

    await expect(makeCheckpointStore(store).load("bitbucket-cloud", "user-a")).resolves.toEqual([]);
  });
});
