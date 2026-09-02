import { describe, expect, it } from "vitest";
import type { KeyValueStore } from "../persistence/indexed-db";
import type { RepositoryRef } from "../providers/contracts";
import type { RepositoryScope } from "./repository-scope";
import { makeScopeStore, normalizeRepositoryScope, resolveRepositories } from "./repository-scope";

const alphaOne: RepositoryRef = { workspace: "alpha", slug: "one" };
const alphaTwo: RepositoryRef = { workspace: "alpha", slug: "two" };
const alphaNew: RepositoryRef = { workspace: "alpha", slug: "new" };
const betaOne: RepositoryRef = { workspace: "beta", slug: "one" };
const betaTwo: RepositoryRef = { workspace: "beta", slug: "two" };
const betaThree: RepositoryRef = { workspace: "beta", slug: "three" };

const discovered: ReadonlyArray<RepositoryRef> = [
  alphaOne,
  alphaTwo,
  alphaNew,
  betaOne,
  betaTwo,
  betaThree,
];

describe("resolveRepositories", () => {
  it("includes every current and newly discovered repository for a selected workspace", () => {
    const scope: RepositoryScope = { selectedWorkspaces: ["alpha"], selectedRepositories: [] };

    expect(resolveRepositories(scope, discovered)).toEqual([alphaNew, alphaOne, alphaTwo]);
  });

  it("resolves an explicit repository selection to exactly that repository, excluding its siblings", () => {
    const scope: RepositoryScope = { selectedWorkspaces: [], selectedRepositories: [betaThree] };

    expect(resolveRepositories(scope, discovered)).toEqual([betaThree]);
  });
});

describe("normalizeRepositoryScope", () => {
  it("sorts and deduplicates workspaces and repositories, dropping explicit repos already covered by a selected workspace", () => {
    const scope: RepositoryScope = {
      selectedWorkspaces: ["alpha", "alpha"],
      selectedRepositories: [alphaOne, betaThree, betaThree],
    };

    expect(normalizeRepositoryScope(scope)).toEqual({
      selectedWorkspaces: ["alpha"],
      selectedRepositories: [betaThree],
    });
  });
});

const makeFakeKeyValueStore = (): KeyValueStore => {
  const stores = {
    settings: new Map<IDBValidKey, unknown>(),
    vault: new Map<IDBValidKey, unknown>(),
  };
  return {
    get: async <A>(store: "settings" | "vault", key: IDBValidKey) =>
      stores[store].get(key) as A | undefined,
    put: async (store, value, key) => {
      stores[store].set(key, value);
    },
    delete: async (store, key) => {
      stores[store].delete(key);
    },
  };
};

describe("makeScopeStore", () => {
  it("isolates saved scope by provider and user identity and round trips normalized values", async () => {
    const scopeStore = makeScopeStore(makeFakeKeyValueStore());

    await scopeStore.save("bitbucket-cloud", "user-a", {
      selectedWorkspaces: ["alpha", "alpha"],
      selectedRepositories: [betaThree],
    });
    await scopeStore.save("bitbucket-cloud", "user-b", {
      selectedWorkspaces: [],
      selectedRepositories: [betaOne],
    });

    await expect(scopeStore.load("bitbucket-cloud", "user-a")).resolves.toEqual({
      selectedWorkspaces: ["alpha"],
      selectedRepositories: [betaThree],
    });
    await expect(scopeStore.load("bitbucket-cloud", "user-b")).resolves.toEqual({
      selectedWorkspaces: [],
      selectedRepositories: [betaOne],
    });
  });

  it("returns undefined when no scope has been saved for that identity", async () => {
    const scopeStore = makeScopeStore(makeFakeKeyValueStore());

    await expect(scopeStore.load("bitbucket-cloud", "user-a")).resolves.toBeUndefined();
  });

  it("decodes a corrupted record as undefined instead of throwing", async () => {
    const store = makeFakeKeyValueStore();
    await store.put("settings", { garbage: true }, "scope:bitbucket-cloud:user-a");
    const scopeStore = makeScopeStore(store);

    await expect(scopeStore.load("bitbucket-cloud", "user-a")).resolves.toBeUndefined();
  });
});
