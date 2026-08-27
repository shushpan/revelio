import type { BitbucketCredentials } from "./auth";
import { encodeBasicAuthorization } from "./auth";

export const BITBUCKET_API_BASE = "https://api.bitbucket.org/2.0";

export interface ReadRequestOptions {
  readonly signal?: AbortSignal;
}

export const buildBitbucketRequest = (
  path: string,
  credentials: BitbucketCredentials,
  options: ReadRequestOptions = {},
): Request => {
  if (!path.startsWith("/") && path.includes("://")) {
    throw new TypeError("Bitbucket API paths must be relative");
  }
  if (path.startsWith("//") || path.includes("\\")) {
    throw new TypeError("Bitbucket API paths must be relative");
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${BITBUCKET_API_BASE}${normalizedPath}`);
  const headers = new Headers();
  headers.set("Accept", "application/json");
  headers.set("Authorization", encodeBasicAuthorization(credentials));

  return new Request(url, { method: "GET", headers, signal: options.signal });
};
