export interface BitbucketCredentials {
  readonly email: string;
  readonly token: string;
}

const encodeUtf8AsBase64 = (value: string): string => {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

export const encodeBasicAuthorization = (credentials: BitbucketCredentials): string =>
  `Basic ${encodeUtf8AsBase64(`${credentials.email}:${credentials.token}`)}`;
