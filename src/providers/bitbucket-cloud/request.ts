import type { BitbucketCredentials } from "./auth";
import { encodeBasicAuthorization } from "./auth";

export const BITBUCKET_API_BASE = "https://api.bitbucket.org/2.0";
const BITBUCKET_API_ORIGIN = new URL(BITBUCKET_API_BASE).origin;

export interface ReadRequestOptions {
  readonly signal?: AbortSignal;
}

const buildApiUrl = (path: string): URL => {
  if (!path.startsWith("/") && path.includes("://")) {
    throw new TypeError("Bitbucket API paths must be relative");
  }
  if (path.startsWith("//") || path.includes("\\")) {
    throw new TypeError("Bitbucket API paths must be relative");
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return new URL(`${BITBUCKET_API_BASE}${normalizedPath}`);
};

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

const buildAuthenticatedMutation = (
  url: URL,
  credentials: BitbucketCredentials,
  body: unknown,
  options: ReadRequestOptions,
): Request => {
  const headers = new Headers();
  headers.set("Accept", "application/json");
  headers.set("Authorization", encodeBasicAuthorization(credentials));
  const hasBody = body !== undefined;
  if (hasBody) headers.set("Content-Type", "application/json");
  return new Request(url, {
    method: "POST",
    headers,
    signal: options.signal,
    cache: "no-store",
    ...(hasBody ? { body: JSON.stringify(body) } : {}),
  });
};

export const buildBitbucketRequest = (
  path: string,
  credentials: BitbucketCredentials,
  options: ReadRequestOptions = {},
): Request => {
  return buildAuthenticatedGet(buildApiUrl(path), credentials, options);
};

export const buildBitbucketMutationRequest = (
  path: string,
  credentials: BitbucketCredentials,
  body?: unknown,
  options: ReadRequestOptions = {},
): Request => buildAuthenticatedMutation(buildApiUrl(path), credentials, body, options);

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
