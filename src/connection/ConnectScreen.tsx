import type { FormEvent, JSX } from "react";
import { useRef, useState } from "react";
import type { BitbucketCredentials } from "../providers/bitbucket-cloud/auth";
import type { CodeReviewProvider, ProviderUser } from "../providers/contracts";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { TextField } from "../ui/TextField";

export interface ConnectScreenProps {
  readonly onConnected: (
    credentials: BitbucketCredentials,
    provider: CodeReviewProvider,
    user: ProviderUser,
  ) => void;
}

export function ConnectScreen({ onConnected }: ConnectScreenProps): JSX.Element {
  const [email, setEmail] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const runId = useRef(0);

  const connect = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (email.trim() === "" || apiToken === "") return;
    const requestId = ++runId.current;
    const credentials: BitbucketCredentials = {
      provider: "bitbucket-cloud",
      payload: { email: email.trim(), apiToken },
    };
    setStatus("loading");
    setError(null);
    void Promise.all([import("effect/Effect"), import("../providers/bitbucket-cloud/client")])
      .then(([Effect, { makeBitbucketClient }]) => {
        const provider = makeBitbucketClient(credentials);
        return Effect.runPromise(provider.getCurrentUser).then((user) => ({ provider, user }));
      })
      .then(({ provider, user }) => {
        if (requestId !== runId.current) return;
        onConnected(credentials, provider, user);
      })
      .catch(() => {
        if (requestId !== runId.current) return;
        setStatus("error");
        setError("Unable to connect to Bitbucket. Check your email, token, and access.");
      });
  };

  return (
    <main className="app-shell connection-page">
      <Card className="connection-card">
        <div className="connection-heading">
          <h2 id="connection-title">Connect to Bitbucket Cloud</h2>
          <p className="connection-copy">
            Use your Atlassian email and Bitbucket API token to load your open pull requests.
          </p>
        </div>
        <form onSubmit={connect} className="connection-form">
          <TextField
            label="Atlassian email"
            name="revelioAtlassianEmail"
            type="email"
            autoComplete="off"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <TextField
            label="Bitbucket API token"
            name="revelioBitbucketApiToken"
            type="password"
            autoComplete="new-password"
            value={apiToken}
            onChange={(event) => setApiToken(event.target.value)}
          />
          <Button
            type="submit"
            variant="primary"
            disabled={status === "loading" || email.trim() === "" || apiToken === ""}
          >
            {status === "loading" ? "Connecting…" : "Connect"}
          </Button>
        </form>
        {error ? (
          <p className="connection-error" role="alert">
            {error}
          </p>
        ) : null}
      </Card>
    </main>
  );
}
