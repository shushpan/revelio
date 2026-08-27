export type ProviderError =
  | {
      readonly _tag: "Unauthorized";
      readonly message: "Bitbucket rejected the credentials";
      readonly endpoint?: string;
      readonly status: 401;
    }
  | {
      readonly _tag: "Forbidden";
      readonly message: "Bitbucket denied the requested permission";
      readonly endpoint?: string;
      readonly status: 403;
    }
  | {
      readonly _tag: "RateLimited";
      readonly message: "Bitbucket rate limit was reached";
      readonly endpoint?: string;
      readonly status: 429;
      readonly retryAfterSeconds?: number;
    }
  | {
      readonly _tag: "NetworkError";
      readonly message: "Bitbucket could not be reached";
      readonly endpoint?: string;
    }
  | {
      readonly _tag: "DecodeError";
      readonly message:
        | "Bitbucket returned an unreadable user response"
        | "Bitbucket returned an unreadable pull-request response"
        | "Bitbucket returned unreadable review activity";
      readonly endpoint?: string;
    }
  | {
      readonly _tag: "ServerError";
      readonly message: "Bitbucket returned a server error";
      readonly endpoint?: string;
      readonly status: number;
    };

export const decodeError = (
  message: Extract<ProviderError, { readonly _tag: "DecodeError" }>["message"],
  endpoint: string,
): ProviderError => ({ _tag: "DecodeError", message, endpoint });
