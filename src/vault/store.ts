import type { KeyValueStore } from "../persistence/indexed-db";
import type {
  BitbucketCredentialPayload,
  BitbucketCredentials,
} from "../providers/bitbucket-cloud/auth";
import {
  decryptJson,
  encryptJson,
  generateRandomBytes,
  generateTrustedBrowserKey,
  openWithPassphrase,
  openWithPrfOutput,
  sealWithPassphrase,
  sealWithPrfOutput,
  type CredentialEnvelope,
} from "./crypto";
import {
  MIN_VAULT_PASSPHRASE_LENGTH,
  TRUSTED_BROWSER_TTL_MS,
  VAULT_UNLOCK_ERROR_MESSAGE,
  type VaultService,
} from "./model";

export interface PasskeyPrfPort {
  enroll(): Promise<{ readonly credentialId: Uint8Array; readonly prfOutput: Uint8Array }>;
  authenticate(credentialId: Uint8Array): Promise<Uint8Array>;
}

interface TrustedBrowserRecord {
  readonly version: 1;
  readonly key: CryptoKey;
  readonly ciphertext: Uint8Array;
  readonly nonce: Uint8Array;
  readonly createdAt: number;
  readonly expiresAt: number;
}

const ENVELOPE_KEY = "envelope";
const TRUSTED_BROWSER_KEY = "trusted-browser";
const TRUSTED_BROWSER_TAG = "trusted-browser";

const unlockFailure = (): Error => new Error(VAULT_UNLOCK_ERROR_MESSAGE);

const toCredentials = (payload: BitbucketCredentialPayload): BitbucketCredentials => ({
  provider: "bitbucket-cloud",
  payload,
});

const runOrFail = async <A>(operation: () => Promise<A>): Promise<A> => {
  try {
    return await operation();
  } catch {
    throw unlockFailure();
  }
};

export const makeVaultService = (
  kv: KeyValueStore,
  prf: PasskeyPrfPort,
  now: () => number = () => Date.now(),
): VaultService => {
  const createTrustedBrowserRecord = async (payload: BitbucketCredentialPayload): Promise<void> => {
    const createdAt = now();
    const key = await generateTrustedBrowserKey();
    const nonce = generateRandomBytes(12);
    const ciphertext = await encryptJson(key, TRUSTED_BROWSER_TAG, nonce, payload);
    const record: TrustedBrowserRecord = {
      version: 1,
      key,
      ciphertext,
      nonce,
      createdAt,
      expiresAt: createdAt + TRUSTED_BROWSER_TTL_MS,
    };
    await kv.put("vault", record, TRUSTED_BROWSER_KEY);
  };

  const loadEnvelope = async <Mode extends CredentialEnvelope["mode"]>(
    mode: Mode,
  ): Promise<Extract<CredentialEnvelope, { readonly mode: Mode }>> => {
    const envelope = await kv.get<CredentialEnvelope>("vault", ENVELOPE_KEY);
    if (!envelope || envelope.mode !== mode) throw unlockFailure();
    return envelope as Extract<CredentialEnvelope, { readonly mode: Mode }>;
  };

  return {
    hasVault: () => runOrFail(async () => (await kv.get("vault", ENVELOPE_KEY)) !== undefined),

    enrollPassphrase: (credentials, passphrase) =>
      runOrFail(async () => {
        if (passphrase.trim().length < MIN_VAULT_PASSPHRASE_LENGTH) throw unlockFailure();
        const envelope = await sealWithPassphrase(credentials.payload, passphrase);
        await kv.put("vault", envelope, ENVELOPE_KEY);
        await createTrustedBrowserRecord(credentials.payload);
      }),

    enrollPasskey: (credentials) =>
      runOrFail(async () => {
        const { credentialId, prfOutput } = await prf.enroll();
        const envelope = await sealWithPrfOutput(credentials.payload, prfOutput, credentialId);
        await kv.put("vault", envelope, ENVELOPE_KEY);
        await createTrustedBrowserRecord(credentials.payload);
      }),

    unlockPassphrase: (passphrase) =>
      runOrFail(async () => {
        const envelope = await loadEnvelope("passphrase");
        const payload = await openWithPassphrase(envelope, passphrase);
        await createTrustedBrowserRecord(payload);
        return toCredentials(payload);
      }),

    unlockPasskey: () =>
      runOrFail(async () => {
        const envelope = await loadEnvelope("passkey");
        const prfOutput = await prf.authenticate(envelope.credentialId);
        const payload = await openWithPrfOutput(envelope, prfOutput);
        await createTrustedBrowserRecord(payload);
        return toCredentials(payload);
      }),

    resumeTrustedBrowser: async (nowMs) => {
      try {
        const record = await kv.get<TrustedBrowserRecord>("vault", TRUSTED_BROWSER_KEY);
        if (!record) return undefined;
        if (nowMs >= record.expiresAt) {
          await kv.delete("vault", TRUSTED_BROWSER_KEY);
          return undefined;
        }
        const payload = await decryptJson<BitbucketCredentialPayload>(
          record.key,
          TRUSTED_BROWSER_TAG,
          record.nonce,
          record.ciphertext,
        );
        return toCredentials(payload);
      } catch {
        await kv.delete("vault", TRUSTED_BROWSER_KEY).catch(() => undefined);
        return undefined;
      }
    },

    clearTrustedBrowser: () => runOrFail(() => kv.delete("vault", TRUSTED_BROWSER_KEY)),
  };
};
