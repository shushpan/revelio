import type { ProviderError } from "../errors";

export const mapBitbucketHttpError = (
  status: number,
  operation: string,
  endpoint: string,
  retryAfter: string | null,
): ProviderError => {
  if (status === 400) {
    return {
      _tag: "BadRequest",
      message: "Provider rejected the request",
      operation,
      endpoint,
      status,
    };
  }
  if (status === 401) {
    return {
      _tag: "Unauthorized",
      message: "Provider rejected the credentials",
      operation,
      endpoint,
      status,
    };
  }
  if (status === 403) {
    return {
      _tag: "Forbidden",
      message: "Provider denied the requested permission",
      operation,
      endpoint,
      status,
    };
  }
  if (status === 404) {
    return {
      _tag: "NotFound",
      message: "Provider resource was not found",
      operation,
      endpoint,
      status,
    };
  }
  if (status === 410) {
    return {
      _tag: "Gone",
      message: "Provider endpoint is no longer available",
      operation,
      endpoint,
      status,
    };
  }
  if (status === 429) {
    const parsed = retryAfter === null ? undefined : Number.parseInt(retryAfter, 10);
    return {
      _tag: "RateLimited",
      message: "Provider rate limit was reached",
      operation,
      endpoint,
      status,
      ...(parsed !== undefined && Number.isFinite(parsed) ? { retryAfterSeconds: parsed } : {}),
    };
  }
  if (status >= 500) {
    return {
      _tag: "ServerError",
      message: "Provider returned a server error",
      operation,
      endpoint,
      status,
    };
  }
  return {
    _tag: "UnexpectedHttpError",
    message: "Provider returned an unexpected HTTP error",
    operation,
    endpoint,
    status,
  };
};
