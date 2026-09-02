import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RepositoryRef } from "../providers/contracts";
import { RepositorySelectionScreen } from "./RepositorySelectionScreen";
import type { RepositoryScope } from "./repository-scope";

const alphaOne: RepositoryRef = { workspace: "alpha", slug: "one" };
const alphaTwo: RepositoryRef = { workspace: "alpha", slug: "two" };
const betaThree: RepositoryRef = { workspace: "beta", slug: "three" };

const emptyScope: RepositoryScope = { selectedWorkspaces: [], selectedRepositories: [] };

describe("RepositorySelectionScreen", () => {
  afterEach(() => cleanup());

  it("disables Continue when nothing is selected", () => {
    render(
      <RepositorySelectionScreen
        workspaces={["alpha", "beta"]}
        repositories={[alphaOne, alphaTwo, betaThree]}
        initialScope={emptyScope}
        discovery={{ completed: 3, total: 3, isComplete: true }}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("saves only the selected workspace with no redundant repository refs", () => {
    const onSave = vi.fn();
    render(
      <RepositorySelectionScreen
        workspaces={["alpha", "beta"]}
        repositories={[alphaOne, alphaTwo, betaThree]}
        initialScope={emptyScope}
        discovery={{ completed: 3, total: 3, isComplete: true }}
        onSave={onSave}
      />,
    );

    fireEvent.click(screen.getByLabelText("alpha"));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(onSave).toHaveBeenCalledWith({
      selectedWorkspaces: ["alpha"],
      selectedRepositories: [],
    });
  });

  it("saves exactly the selected repository when no workspace is checked", () => {
    const onSave = vi.fn();
    render(
      <RepositorySelectionScreen
        workspaces={["alpha", "beta"]}
        repositories={[alphaOne, alphaTwo, betaThree]}
        initialScope={emptyScope}
        discovery={{ completed: 3, total: 3, isComplete: true }}
        onSave={onSave}
      />,
    );

    fireEvent.click(screen.getByLabelText("beta/three"));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(onSave).toHaveBeenCalledWith({
      selectedWorkspaces: [],
      selectedRepositories: [betaThree],
    });
  });

  it("shows literal discovery progress while repository pages are still loading", () => {
    render(
      <RepositorySelectionScreen
        workspaces={["alpha"]}
        repositories={[alphaOne]}
        initialScope={emptyScope}
        discovery={{ completed: 100, total: 168, isComplete: false }}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Loading repositories 100 of 168");
  });

  it("preserves a checked repository selection as later repository pages arrive", () => {
    const onSave = vi.fn();
    const { rerender } = render(
      <RepositorySelectionScreen
        workspaces={[]}
        repositories={[alphaOne]}
        initialScope={emptyScope}
        discovery={{ completed: 1, total: 3, isComplete: false }}
        onSave={onSave}
      />,
    );

    fireEvent.click(screen.getByLabelText("alpha/one"));

    rerender(
      <RepositorySelectionScreen
        workspaces={[]}
        repositories={[alphaOne, alphaTwo, betaThree]}
        initialScope={emptyScope}
        discovery={{ completed: 3, total: 3, isComplete: true }}
        onSave={onSave}
      />,
    );

    expect(screen.getByLabelText("alpha/one")).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onSave).toHaveBeenCalledWith({
      selectedWorkspaces: [],
      selectedRepositories: [alphaOne],
    });
  });

  it("calls onCancel when provided and Cancel is pressed", () => {
    const onCancel = vi.fn();
    render(
      <RepositorySelectionScreen
        workspaces={["alpha"]}
        repositories={[alphaOne]}
        initialScope={emptyScope}
        discovery={{ completed: 1, total: 1, isComplete: true }}
        onSave={vi.fn()}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });
});
