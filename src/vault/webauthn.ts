import { VAULT_UNLOCK_ERROR_MESSAGE } from "./model";

export interface CredentialPort {
  create(options: CredentialCreationOptions): Promise<Credential | null>;
  get(options: CredentialRequestOptions): Promise<Credential | null>;
}

export interface EnrolledPasskey {
  readonly credentialId: Uint8Array;
}

export interface PasskeyPrfEnrollment extends EnrolledPasskey {
  readonly prfOutput: Uint8Array;
}

export interface WebAuthnPrfPort {
  enroll(): Promise<PasskeyPrfEnrollment>;
  authenticate(credentialId: Uint8Array): Promise<Uint8Array>;
}

export interface PasskeyEnrollmentOptions {
  readonly rp: PublicKeyCredentialRpEntity;
  readonly user: PublicKeyCredentialUserEntity;
}

const PRF_DOMAIN_INPUT = new TextEncoder().encode("revelio:v1:vault");

const DEFAULT_PUB_KEY_CRED_PARAMS: PublicKeyCredentialParameters[] = [
  { alg: -7, type: "public-key" },
  { alg: -257, type: "public-key" },
];

export const createNavigatorCredentialPort = (): CredentialPort | undefined => {
  if (typeof navigator === "undefined" || !navigator.credentials) return undefined;
  if (typeof PublicKeyCredential === "undefined") return undefined;
  return {
    create: (options) => navigator.credentials.create(options),
    get: (options) => navigator.credentials.get(options),
  };
};

const isPublicKeyCredential = (credential: Credential): credential is PublicKeyCredential =>
  typeof (credential as PublicKeyCredential).getClientExtensionResults === "function";

const toArrayBufferBytes = (bytes: Uint8Array): Uint8Array<ArrayBuffer> => new Uint8Array(bytes);

const toFixedLengthBytes = (source: BufferSource | undefined, length: number): Uint8Array => {
  if (source === undefined) throw new Error(VAULT_UNLOCK_ERROR_MESSAGE);
  const bytes = ArrayBuffer.isView(source)
    ? new Uint8Array(source.buffer as ArrayBuffer, source.byteOffset, source.byteLength)
    : new Uint8Array(source);
  if (bytes.length !== length) throw new Error(VAULT_UNLOCK_ERROR_MESSAGE);
  return bytes;
};

export const enrollPasskey = async (
  port: CredentialPort | undefined,
  options: PasskeyEnrollmentOptions,
): Promise<EnrolledPasskey> => {
  if (!port) throw new Error(VAULT_UNLOCK_ERROR_MESSAGE);

  let credential: Credential | null;
  try {
    credential = await port.create({
      publicKey: {
        rp: options.rp,
        user: options.user,
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        pubKeyCredParams: DEFAULT_PUB_KEY_CRED_PARAMS,
        authenticatorSelection: { userVerification: "required" },
        extensions: { prf: { eval: { first: PRF_DOMAIN_INPUT } } },
      },
    });
  } catch {
    throw new Error(VAULT_UNLOCK_ERROR_MESSAGE);
  }

  if (!credential || !isPublicKeyCredential(credential)) {
    throw new Error(VAULT_UNLOCK_ERROR_MESSAGE);
  }
  if (credential.getClientExtensionResults().prf?.enabled !== true) {
    throw new Error(VAULT_UNLOCK_ERROR_MESSAGE);
  }

  return { credentialId: new Uint8Array(credential.rawId) };
};

export const authenticateWithPrf = async (
  port: CredentialPort | undefined,
  credentialId: Uint8Array,
): Promise<Uint8Array> => {
  if (!port) throw new Error(VAULT_UNLOCK_ERROR_MESSAGE);

  let credential: Credential | null;
  try {
    credential = await port.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ id: toArrayBufferBytes(credentialId), type: "public-key" }],
        userVerification: "required",
        extensions: { prf: { eval: { first: PRF_DOMAIN_INPUT } } },
      },
    });
  } catch {
    throw new Error(VAULT_UNLOCK_ERROR_MESSAGE);
  }

  if (!credential || !isPublicKeyCredential(credential)) {
    throw new Error(VAULT_UNLOCK_ERROR_MESSAGE);
  }

  return toFixedLengthBytes(credential.getClientExtensionResults().prf?.results?.first, 32);
};

export const makeWebAuthnPrfPort = (
  port: CredentialPort | undefined,
  options?: PasskeyEnrollmentOptions,
): WebAuthnPrfPort => ({
  enroll: async () => {
    if (!options) throw new Error(VAULT_UNLOCK_ERROR_MESSAGE);
    const enrolled = await enrollPasskey(port, options);
    const prfOutput = await authenticateWithPrf(port, enrolled.credentialId);
    return { ...enrolled, prfOutput };
  },
  authenticate: (credentialId) => authenticateWithPrf(port, credentialId),
});
