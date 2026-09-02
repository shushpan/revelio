import { Button } from "@heroui/react/button";
import { Card } from "@heroui/react/card";
import { Input } from "@heroui/react/input";
import { Label } from "@heroui/react/label";
import { TextField } from "@heroui/react/textfield";
import type { JSX } from "react";
import { useState } from "react";
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
        <Card.Header className="connection-heading">
          <div>
            <Card.Title>{isSetup ? "Keep Revelio ready" : "Unlock Revelio"}</Card.Title>
            <Card.Description className="connection-copy">
              {isSetup
                ? "Save an encrypted local vault to reopen Revelio without entering your token for one week."
                : "The trusted browser window expired or was locked. Unlock the local vault to continue."}
            </Card.Description>
          </div>
        </Card.Header>
        <Card.Content>
          <div className="vault-actions">
            <Button variant="primary" onPress={onPasskey} isDisabled={isLoading}>
              {isSetup ? "Use passkey" : "Unlock with passkey"}
            </Button>
            <TextField name="vaultPassphrase" fullWidth>
              <Label>Vault passphrase</Label>
              <Input
                type="password"
                autoComplete={isSetup ? "new-password" : "current-password"}
                value={passphrase}
                onChange={(event) => setPassphrase(event.target.value)}
              />
            </TextField>
            <Button
              variant="secondary"
              onPress={() => onPassphrase(passphrase)}
              isDisabled={isLoading || !canUsePassphrase}
            >
              {isSetup ? "Use passphrase" : "Unlock with passphrase"}
            </Button>
            <p className="vault-note">
              Passphrase must be at least {MIN_VAULT_PASSPHRASE_LENGTH} characters.
            </p>
            {onSessionOnly ? (
              <Button variant="secondary" onPress={onSessionOnly} isDisabled={isLoading}>
                This session only
              </Button>
            ) : null}
            {!isSetup && onReconnect ? (
              <Button variant="secondary" onPress={onReconnect} isDisabled={isLoading}>
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
        </Card.Content>
      </Card>
    </main>
  );
}
