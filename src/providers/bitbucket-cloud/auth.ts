import type { ProviderCredentials } from "../contracts";

export interface BitbucketCredentialPayload {
  readonly email: string;
  readonly apiToken: string;
}

export type BitbucketCredentials = ProviderCredentials<
  "bitbucket-cloud",
  BitbucketCredentialPayload
>;

const encodeUtf8AsBase64 = (value: string): string => {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

export const encodeBasicAuthorization = (credentials: BitbucketCredentials): string =>
  `Basic ${encodeUtf8AsBase64(`${credentials.payload.email}:${credentials.payload.apiToken}`)}`;
