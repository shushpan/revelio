import type { BitbucketCredentials } from "./auth";
import { encodeBasicAuthorization } from "./auth";

export const BITBUCKET_API_BASE = "https://api.bitbucket.org/2.0";
const BITBUCKET_API_ORIGIN = new URL(BITBUCKET_API_BASE).origin;

export interface ReadRequestOptions {
  readonly signal?: AbortSignal;
}

const buildAuthenticatedGet = (
  url: URL,
  credentials: BitbucketCredentials,
  options: ReadRequestOptions,
): Request => {
  const headers = new Headers();
  headers.set("Accept", "application/json");
  headers.set("Authorization", encodeBasicAuthorization(credentials));
  return new Request(url, { method: "GET", headers, signal: options.signal, cache: "no-store" });
};

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
  return buildAuthenticatedGet(url, credentials, options);
};

/** Build an authenticated request for a previously validated opaque Bitbucket URL. */
export const buildBitbucketRequestForUrl = (
  value: string | URL,
  credentials: BitbucketCredentials,
  options: ReadRequestOptions = {},
): Request => {
  const url = typeof value === "string" ? new URL(value) : value;
  if (url.origin !== BITBUCKET_API_ORIGIN || !url.pathname.startsWith("/2.0/")) {
    throw new TypeError("Bitbucket API URLs must use the fixed API origin");
  }
  return buildAuthenticatedGet(url, credentials, options);
};
