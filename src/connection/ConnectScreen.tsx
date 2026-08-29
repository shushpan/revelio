import { Button } from "@heroui/react/button";
import { Card } from "@heroui/react/card";
import { Input } from "@heroui/react/input";
import { Label } from "@heroui/react/label";
import { TextField } from "@heroui/react/textfield";
import type { FormEvent, JSX } from "react";
import { useRef, useState } from "react";
import type { ProviderUser, CodeReviewProvider } from "../providers/contracts";
import type { BitbucketCredentials } from "../providers/bitbucket-cloud/auth";
import type { InboxLoadResult } from "../inbox/load-inbox";

export interface ConnectScreenProps {
  readonly onConnected: (
    provider: CodeReviewProvider,
    user: ProviderUser,
    inbox: InboxLoadResult,
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
    void Promise.all([
      import("effect/Effect"),
      import("../providers/bitbucket-cloud/client"),
      import("../inbox/load-inbox"),
    ])
      .then(([Effect, { makeBitbucketClient }, { loadInbox }]) => {
        const provider = makeBitbucketClient(credentials);
        return Effect.runPromise(
          Effect.gen(function* () {
            const user = yield* provider.getCurrentUser;
            const inbox = yield* loadInbox(provider);
            return { provider, user, inbox };
          }),
        );
      })
      .then(({ provider, user, inbox }) => {
        if (requestId !== runId.current) return;
        onConnected(provider, user, inbox);
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
        <Card.Header className="connection-heading">
          <div>
            <Card.Title id="connection-title">Connect to Bitbucket Cloud</Card.Title>
            <Card.Description className="connection-copy">
              Use your Atlassian email and Bitbucket API token to load your open pull requests.
            </Card.Description>
          </div>
        </Card.Header>
        <Card.Content>
          <form onSubmit={connect} className="connection-form">
            <TextField name="email" fullWidth>
              <Label>Atlassian email</Label>
              <Input
                type="email"
                autoComplete="off"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </TextField>
            <TextField name="apiToken" fullWidth>
              <Label>Bitbucket API token</Label>
              <Input
                type="password"
                autoComplete="off"
                value={apiToken}
                onChange={(event) => setApiToken(event.target.value)}
              />
            </TextField>
            <Button
              type="submit"
              variant="primary"
              isDisabled={status === "loading" || email.trim() === "" || apiToken === ""}
            >
              {status === "loading" ? "Connecting…" : "Connect"}
            </Button>
          </form>
          {error ? (
            <p className="connection-error" role="alert">
              {error}
            </p>
          ) : null}
        </Card.Content>
      </Card>
    </main>
  );
}
