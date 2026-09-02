import { describe, expect, it } from "vitest";
import type { KeyValueStore } from "../persistence/indexed-db";
import type { BitbucketCredentials } from "../providers/bitbucket-cloud/auth";
import { TRUSTED_BROWSER_TTL_MS, VAULT_UNLOCK_ERROR_MESSAGE } from "./model";
import { makeVaultService, type PasskeyPrfPort } from "./store";

const credentials: BitbucketCredentials = {
  provider: "bitbucket-cloud",
  payload: { email: "reviewer@example.test", apiToken: "synthetic-token-value" },
};

const makeFakeKeyValueStore = (): {
  store: KeyValueStore;
  stores: Record<string, Map<IDBValidKey, unknown>>;
} => {
  const stores = {
    settings: new Map<IDBValidKey, unknown>(),
    vault: new Map<IDBValidKey, unknown>(),
  };
  const store: KeyValueStore = {
    get: async <A>(name: "settings" | "vault", key: IDBValidKey) =>
      stores[name].get(key) as A | undefined,
    put: async (name, value, key) => {
      stores[name].set(key, value);
    },
    delete: async (name, key) => {
      stores[name].delete(key);
    },
  };
  return { store, stores };
};

const defaultCredentialId = new Uint8Array([1, 2, 3]);

const makeFakePrfPort = (
  output: Uint8Array = new Uint8Array(32).fill(7),
  credentialId: Uint8Array = defaultCredentialId,
): PasskeyPrfPort => ({
  enroll: async () => ({ credentialId, prfOutput: output }),
  authenticate: async () => output,
});

describe("makeVaultService enrollment and unlock", () => {
  it("reports no vault until credentials are enrolled", async () => {
    const { store } = makeFakeKeyValueStore();
    const service = makeVaultService(store, makeFakePrfPort());

    await expect(service.hasVault()).resolves.toBe(false);
    await service.enrollPassphrase(credentials, "a-strong-passphrase");
    await expect(service.hasVault()).resolves.toBe(true);
  });

  it("round-trips credentials sealed with a passphrase", async () => {
    const { store } = makeFakeKeyValueStore();
    const service = makeVaultService(store, makeFakePrfPort());

    await service.enrollPassphrase(credentials, "a-strong-passphrase");

    await expect(service.unlockPassphrase("a-strong-passphrase")).resolves.toEqual(credentials);
  });

  it("rejects the wrong passphrase with a sanitized error", async () => {
    const { store } = makeFakeKeyValueStore();
    const service = makeVaultService(store, makeFakePrfPort());
    await service.enrollPassphrase(credentials, "a-strong-passphrase");

    await expect(service.unlockPassphrase("wrong-passphrase")).rejects.toEqual(
      new Error(VAULT_UNLOCK_ERROR_MESSAGE),
    );
  });

  it("rejects passphrase enrollment below twelve non-whitespace characters", async () => {
    const { store } = makeFakeKeyValueStore();
    const service = makeVaultService(store, makeFakePrfPort());

    await expect(service.enrollPassphrase(credentials, "short")).rejects.toEqual(
      new Error(VAULT_UNLOCK_ERROR_MESSAGE),
    );
    await expect(service.hasVault()).resolves.toBe(false);
  });

  it("round-trips credentials sealed with a passkey PRF output", async () => {
    const { store } = makeFakeKeyValueStore();
    const service = makeVaultService(store, makeFakePrfPort());

    await service.enrollPasskey(credentials);

    await expect(service.unlockPasskey()).resolves.toEqual(credentials);
  });

  it("stores the passkey credential id and uses it for later unlock", async () => {
    const { store } = makeFakeKeyValueStore();
    const credentialId = new Uint8Array([8, 7, 6]);
    let authenticatedCredentialId: Uint8Array | undefined;
    const prfPort: PasskeyPrfPort = {
      enroll: async () => ({ credentialId, prfOutput: new Uint8Array(32).fill(4) }),
      authenticate: async (id) => {
        authenticatedCredentialId = id;
        return new Uint8Array(32).fill(4);
      },
    };
    const service = makeVaultService(store, prfPort);

    await service.enrollPasskey(credentials);
    await expect(service.unlockPasskey()).resolves.toEqual(credentials);

    expect(Array.from(authenticatedCredentialId ?? [])).toEqual([8, 7, 6]);
  });

  it("rejects unlocking a passphrase vault with the passkey method", async () => {
    const { store } = makeFakeKeyValueStore();
    const service = makeVaultService(store, makeFakePrfPort());
    await service.enrollPassphrase(credentials, "a-strong-passphrase");

    await expect(service.unlockPasskey()).rejects.toEqual(new Error(VAULT_UNLOCK_ERROR_MESSAGE));
  });

  it("rejects unlocking a passkey vault with the passphrase method", async () => {
    const { store } = makeFakeKeyValueStore();
    const service = makeVaultService(store, makeFakePrfPort());
    await service.enrollPasskey(credentials);

    await expect(service.unlockPassphrase("anything")).rejects.toEqual(
      new Error(VAULT_UNLOCK_ERROR_MESSAGE),
    );
  });

  it("rejects unlocking when no vault has been enrolled", async () => {
    const { store } = makeFakeKeyValueStore();
    const service = makeVaultService(store, makeFakePrfPort());

    await expect(service.unlockPassphrase("anything")).rejects.toEqual(
      new Error(VAULT_UNLOCK_ERROR_MESSAGE),
    );
  });

  it("sanitizes a passkey port failure during enrollment, hiding any DOMException detail", async () => {
    const { store } = makeFakeKeyValueStore();
    const failingPort: PasskeyPrfPort = {
      enroll: async () => {
        throw new DOMException("cancelled", "NotAllowedError");
      },
      authenticate: async () => {
        throw new DOMException("cancelled", "NotAllowedError");
      },
    };
    const service = makeVaultService(store, failingPort);

    await expect(service.enrollPasskey(credentials)).rejects.toEqual(
      new Error(VAULT_UNLOCK_ERROR_MESSAGE),
    );
  });

  it("sanitizes a storage failure during enrollment, hiding any DOMException detail", async () => {
    const failingStore: KeyValueStore = {
      get: async () => undefined,
      put: async () => {
        throw new DOMException("aborted", "AbortError");
      },
      delete: async () => undefined,
    };
    const service = makeVaultService(failingStore, makeFakePrfPort());

    await expect(service.enrollPassphrase(credentials, "a-strong-passphrase")).rejects.toEqual(
      new Error(VAULT_UNLOCK_ERROR_MESSAGE),
    );
  });
});

describe("makeVaultService long-term storage shape", () => {
  it("stores the long-term envelope and trusted-browser record only in the vault object store", async () => {
    const { store, stores } = makeFakeKeyValueStore();
    const service = makeVaultService(store, makeFakePrfPort(), () => 1000);

    await service.enrollPassphrase(credentials, "a-strong-passphrase");

    expect(stores.settings.size).toBe(0);
    expect(stores.vault.size).toBe(2);
  });

  it("stores a non-extractable trusted-browser AES key with a fixed createdAt/expiresAt window", async () => {
    const { store, stores } = makeFakeKeyValueStore();
    const service = makeVaultService(store, makeFakePrfPort(), () => 1000);

    await service.enrollPassphrase(credentials, "a-strong-passphrase");

    const record = stores.vault.get("trusted-browser") as {
      key: CryptoKey;
      createdAt: number;
      expiresAt: number;
    };
    expect(record.key.extractable).toBe(false);
    expect(record.createdAt).toBe(1000);
    expect(record.expiresAt).toBe(1000 + TRUSTED_BROWSER_TTL_MS);
  });

  it("never serializes the plaintext credential into the trusted-browser ciphertext", async () => {
    const { store, stores } = makeFakeKeyValueStore();
    const service = makeVaultService(store, makeFakePrfPort(), () => 1000);

    await service.enrollPassphrase(credentials, "a-strong-passphrase");

    const record = stores.vault.get("trusted-browser") as { ciphertext: Uint8Array };
    const serialized = JSON.stringify(Array.from(record.ciphertext));
    expect(serialized).not.toContain(credentials.payload.email);
    expect(serialized).not.toContain(credentials.payload.apiToken);
  });

  it("creates a fresh trusted-browser window on unlock rather than reusing the enrollment window", async () => {
    const { store, stores } = makeFakeKeyValueStore();
    let currentTime = 1000;
    const service = makeVaultService(store, makeFakePrfPort(), () => currentTime);
    await service.enrollPassphrase(credentials, "a-strong-passphrase");

    currentTime = 5000;
    await service.unlockPassphrase("a-strong-passphrase");

    const record = stores.vault.get("trusted-browser") as { createdAt: number; expiresAt: number };
    expect(record.createdAt).toBe(5000);
    expect(record.expiresAt).toBe(5000 + TRUSTED_BROWSER_TTL_MS);
  });
});

describe("makeVaultService trusted-browser resumption", () => {
  it("returns undefined when no trusted-browser session exists", async () => {
    const { store } = makeFakeKeyValueStore();
    const service = makeVaultService(store, makeFakePrfPort(), () => 1000);

    await expect(service.resumeTrustedBrowser(1000)).resolves.toBeUndefined();
  });

  it("resumes trusted-browser credentials up to one millisecond before the fixed expiry", async () => {
    const { store, stores } = makeFakeKeyValueStore();
    const service = makeVaultService(store, makeFakePrfPort(), () => 1000);
    await service.enrollPassphrase(credentials, "a-strong-passphrase");

    await expect(service.resumeTrustedBrowser(1000 + TRUSTED_BROWSER_TTL_MS - 1)).resolves.toEqual(
      credentials,
    );
    expect(stores.vault.has("trusted-browser")).toBe(true);
  });

  it("deletes the trusted-browser record and returns undefined at the exact fixed expiry", async () => {
    const { store, stores } = makeFakeKeyValueStore();
    const service = makeVaultService(store, makeFakePrfPort(), () => 1000);
    await service.enrollPassphrase(credentials, "a-strong-passphrase");

    await expect(
      service.resumeTrustedBrowser(1000 + TRUSTED_BROWSER_TTL_MS),
    ).resolves.toBeUndefined();
    expect(stores.vault.has("trusted-browser")).toBe(false);
  });

  it("never rolls the fixed expiry forward on repeated resumes", async () => {
    const { store, stores } = makeFakeKeyValueStore();
    const service = makeVaultService(store, makeFakePrfPort(), () => 1000);
    await service.enrollPassphrase(credentials, "a-strong-passphrase");

    await service.resumeTrustedBrowser(2000);
    await service.resumeTrustedBrowser(3000);

    const record = stores.vault.get("trusted-browser") as { expiresAt: number };
    expect(record.expiresAt).toBe(1000 + TRUSTED_BROWSER_TTL_MS);
  });

  it("discards a tampered trusted-browser ciphertext instead of throwing or leaking detail", async () => {
    const { store, stores } = makeFakeKeyValueStore();
    const service = makeVaultService(store, makeFakePrfPort(), () => 1000);
    await service.enrollPassphrase(credentials, "a-strong-passphrase");

    const record = stores.vault.get("trusted-browser") as { ciphertext: Uint8Array };
    record.ciphertext[0] = record.ciphertext[0] ^ 0xff;

    await expect(service.resumeTrustedBrowser(1000)).resolves.toBeUndefined();
    expect(stores.vault.has("trusted-browser")).toBe(false);
  });

  it("sanitizes a storage failure during resume by returning undefined instead of leaking detail", async () => {
    const failingStore: KeyValueStore = {
      get: async () => {
        throw new DOMException("aborted", "AbortError");
      },
      put: async () => undefined,
      delete: async () => undefined,
    };
    const service = makeVaultService(failingStore, makeFakePrfPort(), () => 1000);

    await expect(service.resumeTrustedBrowser(1000)).resolves.toBeUndefined();
  });

  it("clears the trusted-browser key and ciphertext on explicit clear", async () => {
    const { store, stores } = makeFakeKeyValueStore();
    const service = makeVaultService(store, makeFakePrfPort(), () => 1000);
    await service.enrollPassphrase(credentials, "a-strong-passphrase");

    await service.clearTrustedBrowser();

    expect(stores.vault.has("trusted-browser")).toBe(false);
    await expect(service.resumeTrustedBrowser(1000)).resolves.toBeUndefined();
  });
});
