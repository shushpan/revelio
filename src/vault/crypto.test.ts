import { describe, expect, it } from "vitest";
import {
  deriveKeyMaterialFromPassphrase,
  openWithPassphrase,
  openWithPrfOutput,
  sealWithPassphrase,
  sealWithPrfOutput,
} from "./crypto";
import { VAULT_UNLOCK_ERROR_MESSAGE } from "./model";

const payload = { email: "reviewer@example.test", apiToken: "synthetic-token-value" };

const deterministicRandomBytes = (): ((length: number) => Uint8Array) => {
  let counter = 0;
  return (length: number) => {
    const bytes = new Uint8Array(length);
    for (let index = 0; index < length; index++) bytes[index] = (counter + index) % 256;
    counter += 1;
    return bytes;
  };
};

const serializeEnvelope = (envelope: unknown): string =>
  JSON.stringify(envelope, (_key, value) =>
    value instanceof Uint8Array ? Array.from(value) : value,
  );

describe("passphrase-sealed credential envelope", () => {
  it("round-trips credentials without exposing them in the serialized envelope", async () => {
    const envelope = await sealWithPassphrase(
      payload,
      "correct-passphrase",
      deterministicRandomBytes(),
    );
    const serialized = serializeEnvelope(envelope);
    expect(serialized).not.toContain(payload.email);
    expect(serialized).not.toContain(payload.apiToken);

    await expect(openWithPassphrase(envelope, "correct-passphrase")).resolves.toEqual(payload);
  });

  it("rejects a wrong passphrase with a sanitized error", async () => {
    const envelope = await sealWithPassphrase(
      payload,
      "correct-passphrase",
      deterministicRandomBytes(),
    );

    await expect(openWithPassphrase(envelope, "wrong-passphrase")).rejects.toThrow(
      VAULT_UNLOCK_ERROR_MESSAGE,
    );
  });

  it("rejects tampered ciphertext with a sanitized error and no DOMException detail", async () => {
    const envelope = await sealWithPassphrase(
      payload,
      "correct-passphrase",
      deterministicRandomBytes(),
    );
    const tamperedCiphertext = Uint8Array.from(envelope.ciphertext);
    tamperedCiphertext[0] = tamperedCiphertext[0] ^ 0xff;
    const tampered = { ...envelope, ciphertext: tamperedCiphertext };

    await expect(openWithPassphrase(tampered, "correct-passphrase")).rejects.toEqual(
      new Error(VAULT_UNLOCK_ERROR_MESSAGE),
    );
  });
});

describe("passkey PRF-sealed credential envelope", () => {
  it("round-trips credentials using the PRF output as key material", async () => {
    const prfOutput = new Uint8Array(32).fill(9);
    const envelope = await sealWithPrfOutput(
      payload,
      prfOutput,
      new Uint8Array([1, 2, 3]),
      deterministicRandomBytes(),
    );
    const serialized = serializeEnvelope(envelope);
    expect(serialized).not.toContain(payload.email);
    expect(serialized).not.toContain(payload.apiToken);

    await expect(openWithPrfOutput(envelope, prfOutput)).resolves.toEqual(payload);
  });

  it("rejects a mismatched PRF output with a sanitized error", async () => {
    const envelope = await sealWithPrfOutput(
      payload,
      new Uint8Array(32).fill(9),
      new Uint8Array([1, 2, 3]),
      deterministicRandomBytes(),
    );

    await expect(openWithPrfOutput(envelope, new Uint8Array(32).fill(1))).rejects.toThrow(
      VAULT_UNLOCK_ERROR_MESSAGE,
    );
  });
});

describe("deriveKeyMaterialFromPassphrase", () => {
  it("is deterministic for the same passphrase and salt", async () => {
    const salt = new Uint8Array(32).fill(3);
    const first = await deriveKeyMaterialFromPassphrase("a-passphrase", salt);
    const second = await deriveKeyMaterialFromPassphrase("a-passphrase", salt);

    expect(Array.from(first)).toEqual(Array.from(second));
    expect(first.length).toBe(32);
  });

  it("produces different key material for a different salt", async () => {
    const first = await deriveKeyMaterialFromPassphrase("a-passphrase", new Uint8Array(32).fill(3));
    const second = await deriveKeyMaterialFromPassphrase(
      "a-passphrase",
      new Uint8Array(32).fill(4),
    );

    expect(Array.from(first)).not.toEqual(Array.from(second));
  });
});
