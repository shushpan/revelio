import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConnectionDiagnostics } from "./ConnectionDiagnostics";

describe("Connection diagnostics", () => {
  afterEach(() => cleanup());
  it("keeps credentials in controlled memory fields and clears them on Lock", () => {
    render(<ConnectionDiagnostics />);
    expect(screen.getByRole("region", { name: "Connect to Bitbucket Cloud" })).toBeInTheDocument();
    const email = screen.getByLabelText("Atlassian email");
    const token = screen.getByLabelText("Bitbucket API token");
    fireEvent.change(email, { target: { value: "reviewer@example.test" } });
    fireEvent.change(token, { target: { value: "synthetic-token" } });

    expect(token).toHaveAttribute("type", "password");
    expect(window.location.href).not.toContain("synthetic-token");
    expect(window.location.href).not.toContain("reviewer@example.test");
    fireEvent.click(screen.getByRole("button", { name: "Lock" }));
    expect(email).toHaveValue("");
    expect(token).toHaveValue("");
    expect(screen.queryByText("synthetic-token")).not.toBeInTheDocument();
  });

  it("clears controlled credentials on a browser reload", () => {
    const { unmount } = render(<ConnectionDiagnostics />);
    fireEvent.change(screen.getByLabelText("Atlassian email"), {
      target: { value: "reviewer@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Bitbucket API token"), {
      target: { value: "synthetic-token" },
    });
    unmount();
    render(<ConnectionDiagnostics />);
    expect(screen.getByLabelText("Atlassian email")).toHaveValue("");
    expect(screen.getByLabelText("Bitbucket API token")).toHaveValue("");
  });

  it("does not use browser storage or send diagnostics without credentials", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const fetch = vi.spyOn(globalThis, "fetch");
    render(<ConnectionDiagnostics />);
    fireEvent.click(screen.getByRole("button", { name: "Run diagnostics" }));
    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    getItem.mockRestore();
    setItem.mockRestore();
    fetch.mockRestore();
  });
});
