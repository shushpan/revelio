export type ProviderError =
  | {
      readonly _tag: "BadRequest";
      readonly message: "Provider rejected the request";
      readonly operation: string;
      readonly endpoint?: string;
      readonly status: 400;
    }
  | {
      readonly _tag: "Unauthorized";
      readonly message: "Provider rejected the credentials";
      readonly operation: string;
      readonly endpoint?: string;
      readonly status: 401;
    }
  | {
      readonly _tag: "Forbidden";
      readonly message: "Provider denied the requested permission";
      readonly operation: string;
      readonly endpoint?: string;
      readonly status: 403;
    }
  | {
      readonly _tag: "NotFound";
      readonly message: "Provider resource was not found";
      readonly operation: string;
      readonly endpoint?: string;
      readonly status: 404;
    }
  | {
      readonly _tag: "Gone";
      readonly message: "Provider endpoint is no longer available";
      readonly operation: string;
      readonly endpoint?: string;
      readonly status: 410;
    }
  | {
      readonly _tag: "RateLimited";
      readonly message: "Provider rate limit was reached";
      readonly operation: string;
      readonly endpoint?: string;
      readonly status: 429;
      readonly retryAfterSeconds?: number;
    }
  | {
      readonly _tag: "NetworkError";
      readonly message: "Provider could not be reached";
      readonly operation: string;
      readonly endpoint?: string;
    }
  | {
      readonly _tag: "DecodeError";
      readonly message: "Provider returned invalid data";
      readonly operation: string;
      readonly endpoint?: string;
    }
  | {
      readonly _tag: "ServerError";
      readonly message: "Provider returned a server error";
      readonly operation: string;
      readonly endpoint?: string;
      readonly status: number;
    }
  | {
      readonly _tag: "UnexpectedHttpError";
      readonly message: "Provider returned an unexpected HTTP error";
      readonly operation: string;
      readonly endpoint?: string;
      readonly status: number;
    }
  | {
      readonly _tag: "PaginationError";
      readonly message:
        | "Provider pagination repeated a page marker"
        | "Provider pagination exceeded its safety limit"
        | "Provider pagination returned an unsafe next link";
      readonly operation: string;
    };

export const decodeError = (operation: string, endpoint: string): ProviderError => ({
  _tag: "DecodeError",
  message: "Provider returned invalid data",
  operation,
  endpoint,
});
