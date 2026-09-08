import type { JSX } from "react";
import { useState } from "react";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { TextField } from "../ui/TextField";
import { MIN_VAULT_PASSPHRASE_LENGTH } from "./model";

export interface VaultScreenProps {
  readonly mode: "setup" | "unlock";
  readonly status: "idle" | "loading" | "error";
  readonly error?: string;
  readonly onPasskey: () => void;
  readonly onPassphrase: (passphrase: string) => void;
  readonly onSessionOnly?: () => void;
  readonly onReconnect?: () => void;
}

export function VaultScreen({
  mode,
  status,
  error,
  onPasskey,
  onPassphrase,
  onSessionOnly,
  onReconnect,
}: VaultScreenProps): JSX.Element {
  const [passphrase, setPassphrase] = useState("");
  const isLoading = status === "loading";
  const isSetup = mode === "setup";
  const canUsePassphrase = isSetup
    ? passphrase.trim().length >= MIN_VAULT_PASSPHRASE_LENGTH
    : passphrase.trim() !== "";

  return (
    <main className="app-shell vault-page">
      <Card className="vault-card">
        <div className="connection-heading">
          <h2>{isSetup ? "Keep Revelio ready" : "Unlock Revelio"}</h2>
          <p className="connection-copy">
            {isSetup
              ? "Save an encrypted local vault to reopen Revelio without entering your token for one week. An open session still locks automatically after 15 minutes of inactivity."
              : "The trusted browser window expired, the session locked after 15 minutes of inactivity, or you chose Lock. Unlock the local vault to continue."}
          </p>
        </div>
        <div className="vault-actions">
          <Button variant="primary" onClick={onPasskey} disabled={isLoading}>
            {isSetup ? "Use passkey" : "Unlock with passkey"}
          </Button>
          <TextField
            label="Vault passphrase"
            name="vaultPassphrase"
            type="password"
            autoComplete={isSetup ? "new-password" : "current-password"}
            value={passphrase}
            onChange={(event) => setPassphrase(event.target.value)}
          />
          <Button
            variant="secondary"
            onClick={() => onPassphrase(passphrase)}
            disabled={isLoading || !canUsePassphrase}
          >
            {isSetup ? "Use passphrase" : "Unlock with passphrase"}
          </Button>
          <p className="vault-note">
            Passphrase must be at least {MIN_VAULT_PASSPHRASE_LENGTH} characters.
          </p>
          {onSessionOnly ? (
            <Button variant="secondary" onClick={onSessionOnly} disabled={isLoading}>
              This session only
            </Button>
          ) : null}
          {!isSetup && onReconnect ? (
            <Button variant="secondary" onClick={onReconnect} disabled={isLoading}>
              Use token instead
            </Button>
          ) : null}
        </div>
        <p className="vault-note">
          Browser password prompts are separate from Revelio's encrypted vault and may still be
          offered by Chrome.
        </p>
        {error ? (
          <p className="connection-error" role="alert">
            {error}
          </p>
        ) : null}
      </Card>
    </main>
  );
}
