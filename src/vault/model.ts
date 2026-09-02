import type { BitbucketCredentials } from "../providers/bitbucket-cloud/auth";

export const TRUSTED_BROWSER_TTL_MS = 604_800_000;

export const MIN_VAULT_PASSPHRASE_LENGTH = 12;

export const VAULT_UNLOCK_ERROR_MESSAGE = "Unable to unlock the local vault";

export interface VaultService {
  enrollPasskey(credentials: BitbucketCredentials): Promise<void>;
  enrollPassphrase(credentials: BitbucketCredentials, passphrase: string): Promise<void>;
  unlockPasskey(): Promise<BitbucketCredentials>;
  unlockPassphrase(passphrase: string): Promise<BitbucketCredentials>;
  resumeTrustedBrowser(now: number): Promise<BitbucketCredentials | undefined>;
  clearTrustedBrowser(): Promise<void>;
  hasVault(): Promise<boolean>;
}
