import { describe, expect, it, vi } from "vitest";
import { VAULT_UNLOCK_ERROR_MESSAGE } from "./model";
import {
  authenticateWithPrf,
  type CredentialPort,
  createNavigatorCredentialPort,
  enrollPasskey,
  makeWebAuthnPrfPort,
} from "./webauthn";

const domainSeparatedInput = new TextEncoder().encode("revelio:v1:vault");

const fakePublicKeyCredential = (
  rawId: Uint8Array,
  extensionResults: AuthenticationExtensionsClientOutputs,
): PublicKeyCredential =>
  ({
    rawId: rawId.buffer,
    getClientExtensionResults: () => extensionResults,
  }) as unknown as PublicKeyCredential;

const enrollmentOptions = {
  rp: { id: "revelio.test", name: "Revelio" },
  user: { id: new Uint8Array([9, 9, 9]), name: "reviewer", displayName: "Reviewer" },
};

describe("enrollPasskey", () => {
  it("returns the credential id and requests required verification with the domain-separated PRF input", async () => {
    const rawId = new Uint8Array([1, 2, 3]);
    const create = vi.fn(async (_options: CredentialCreationOptions) =>
      fakePublicKeyCredential(rawId, { prf: { enabled: true } }),
    );
    const port: CredentialPort = { create, get: vi.fn() };

    const enrolled = await enrollPasskey(port, enrollmentOptions);

    expect(Array.from(enrolled.credentialId)).toEqual([1, 2, 3]);
    const requestedOptions = create.mock.calls[0][0].publicKey;
    expect(requestedOptions?.authenticatorSelection?.userVerification).toBe("required");
    expect(
      Array.from(new Uint8Array(requestedOptions?.extensions?.prf?.eval?.first as ArrayBuffer)),
    ).toEqual(Array.from(domainSeparatedInput));
  });

  it("rejects with a sanitized error when the authenticator reports prf.enabled as false", async () => {
    const create = vi.fn(async () =>
      fakePublicKeyCredential(new Uint8Array([1]), { prf: { enabled: false } }),
    );
    const port: CredentialPort = { create, get: vi.fn() };

    await expect(enrollPasskey(port, enrollmentOptions)).rejects.toEqual(
      new Error(VAULT_UNLOCK_ERROR_MESSAGE),
    );
  });

  it("rejects with a sanitized error when the prf extension result is missing", async () => {
    const create = vi.fn(async () => fakePublicKeyCredential(new Uint8Array([1]), {}));
    const port: CredentialPort = { create, get: vi.fn() };

    await expect(enrollPasskey(port, enrollmentOptions)).rejects.toEqual(
      new Error(VAULT_UNLOCK_ERROR_MESSAGE),
    );
  });
});

describe("authenticateWithPrf", () => {
  const credentialId = new Uint8Array([4, 5, 6]);

  it("returns the 32-byte prf output and requests required verification with the domain-separated input", async () => {
    const prfOutput = new Uint8Array(32).fill(7);
    const get = vi.fn(async (_options: CredentialRequestOptions) =>
      fakePublicKeyCredential(credentialId, { prf: { results: { first: prfOutput.buffer } } }),
    );
    const port: CredentialPort = { create: vi.fn(), get };

    const output = await authenticateWithPrf(port, credentialId);

    expect(output).toEqual(prfOutput);
    const requestedOptions = get.mock.calls[0][0].publicKey;
    expect(requestedOptions?.userVerification).toBe("required");
    expect(
      Array.from(new Uint8Array(requestedOptions?.allowCredentials?.[0]?.id as ArrayBuffer)),
    ).toEqual(Array.from(credentialId));
    expect(
      Array.from(new Uint8Array(requestedOptions?.extensions?.prf?.eval?.first as ArrayBuffer)),
    ).toEqual(Array.from(domainSeparatedInput));
  });

  it("rejects with a sanitized error when the prf output is not 32 bytes", async () => {
    const get = vi.fn(async () =>
      fakePublicKeyCredential(credentialId, {
        prf: { results: { first: new Uint8Array(16).buffer } },
      }),
    );
    const port: CredentialPort = { create: vi.fn(), get };

    await expect(authenticateWithPrf(port, credentialId)).rejects.toEqual(
      new Error(VAULT_UNLOCK_ERROR_MESSAGE),
    );
  });

  it("rejects with a sanitized error and no DOMException detail when the user cancels", async () => {
    const get = vi.fn(async () => {
      throw new DOMException(
        "The operation either timed out or was not allowed.",
        "NotAllowedError",
      );
    });
    const port: CredentialPort = { create: vi.fn(), get };

    await expect(authenticateWithPrf(port, credentialId)).rejects.toEqual(
      new Error(VAULT_UNLOCK_ERROR_MESSAGE),
    );
  });

  it("rejects with a sanitized error when WebAuthn is unavailable and never calls the port", async () => {
    const unavailablePort = createNavigatorCredentialPort();
    expect(unavailablePort).toBeUndefined();

    await expect(authenticateWithPrf(unavailablePort, credentialId)).rejects.toEqual(
      new Error(VAULT_UNLOCK_ERROR_MESSAGE),
    );
  });
});

describe("makeWebAuthnPrfPort", () => {
  it("enrolls a credential and immediately authenticates it to return PRF key material", async () => {
    const rawId = new Uint8Array([3, 2, 1]);
    const prfOutput = new Uint8Array(32).fill(5);
    const create = vi.fn(async () => fakePublicKeyCredential(rawId, { prf: { enabled: true } }));
    const get = vi.fn(async () =>
      fakePublicKeyCredential(rawId, { prf: { results: { first: prfOutput.buffer } } }),
    );
    const port: CredentialPort = { create, get };

    const result = await makeWebAuthnPrfPort(port, enrollmentOptions).enroll();

    expect(Array.from(result.credentialId)).toEqual([3, 2, 1]);
    expect(result.prfOutput).toEqual(prfOutput);
    const calls = get.mock.calls as unknown as Array<[CredentialRequestOptions]>;
    const requestedCredential = calls[0]?.[0].publicKey?.allowCredentials?.[0];
    expect(requestedCredential).toBeDefined();
    expect(Array.from(new Uint8Array(requestedCredential?.id as ArrayBuffer))).toEqual([3, 2, 1]);
  });
});
