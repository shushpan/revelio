import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VaultScreen } from "./VaultScreen";

describe("VaultScreen", () => {
  afterEach(() => cleanup());

  it("offers saved-vault setup plus session-only access after sign-in", () => {
    const onPasskey = vi.fn();
    const onPassphrase = vi.fn();
    const onSessionOnly = vi.fn();
    render(
      <VaultScreen
        mode="setup"
        status="idle"
        onPasskey={onPasskey}
        onPassphrase={onPassphrase}
        onSessionOnly={onSessionOnly}
      />,
    );

    expect(screen.getByRole("heading", { name: "Keep Revelio ready" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Vault passphrase"), {
      target: { value: "secret passphrase" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Use passphrase" }));
    fireEvent.click(screen.getByRole("button", { name: "This session only" }));

    expect(onPassphrase).toHaveBeenCalledWith("secret passphrase");
    expect(onSessionOnly).toHaveBeenCalled();
  });

  it("requires at least twelve passphrase characters before submitting", () => {
    const onPassphrase = vi.fn();
    render(
      <VaultScreen
        mode="setup"
        status="idle"
        onPasskey={vi.fn()}
        onPassphrase={onPassphrase}
        onSessionOnly={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Use passphrase" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Vault passphrase"), { target: { value: "short" } });
    expect(screen.getByRole("button", { name: "Use passphrase" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Vault passphrase"), {
      target: { value: "long enough!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Use passphrase" }));

    expect(onPassphrase).toHaveBeenCalledWith("long enough!");
  });

  it("offers token reconnect as an unlock recovery path", () => {
    const onReconnect = vi.fn();
    render(
      <VaultScreen
        mode="unlock"
        status="idle"
        onPasskey={vi.fn()}
        onPassphrase={vi.fn()}
        onReconnect={onReconnect}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Use token instead" }));

    expect(onReconnect).toHaveBeenCalled();
  });

  it("allows shorter legacy passphrases when unlocking an existing vault", () => {
    const onPassphrase = vi.fn();
    render(
      <VaultScreen mode="unlock" status="idle" onPasskey={vi.fn()} onPassphrase={onPassphrase} />,
    );

    fireEvent.change(screen.getByLabelText("Vault passphrase"), { target: { value: "legacy" } });
    fireEvent.click(screen.getByRole("button", { name: "Unlock with passphrase" }));

    expect(onPassphrase).toHaveBeenCalledWith("legacy");
  });

  it("shows unlock copy without session-only access after the trusted week expires", () => {
    render(<VaultScreen mode="unlock" status="idle" onPasskey={vi.fn()} onPassphrase={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Unlock Revelio" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "This session only" })).not.toBeInTheDocument();
  });

  it("disables vault actions while loading and surfaces sanitized errors", () => {
    render(
      <VaultScreen
        mode="unlock"
        status="error"
        error="Unable to unlock the local vault"
        onPasskey={vi.fn()}
        onPassphrase={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Unable to unlock the local vault");
  });
});
