import { Button } from "@heroui/react/button";
import type { JSX } from "react";
import { useState } from "react";
import type { RepositoryRef } from "../providers/contracts";
import type { RepositoryScope } from "./repository-scope";
import { normalizeRepositoryScope } from "./repository-scope";

export interface RepositorySelectionScreenProps {
  readonly workspaces: ReadonlyArray<string>;
  readonly repositories: ReadonlyArray<RepositoryRef>;
  readonly initialScope: RepositoryScope;
  readonly discovery: {
    readonly completed: number;
    readonly total: number;
    readonly isComplete: boolean;
  };
  readonly onSave: (scope: RepositoryScope) => void;
  readonly onCancel?: () => void;
}

const KEY_DELIMITER = String.fromCodePoint(0);

const repositoryKey = (repository: RepositoryRef): string =>
  [repository.workspace, repository.slug].join(KEY_DELIMITER);

export function RepositorySelectionScreen({
  workspaces,
  repositories,
  initialScope,
  discovery,
  onSave,
  onCancel,
}: RepositorySelectionScreenProps): JSX.Element {
  const [selectedWorkspaces, setSelectedWorkspaces] = useState(
    () => new Set(initialScope.selectedWorkspaces),
  );
  const [selectedRepositories, setSelectedRepositories] = useState(
    () =>
      new Map(
        initialScope.selectedRepositories.map((repository) => [
          repositoryKey(repository),
          repository,
        ]),
      ),
  );

  const toggleWorkspace = (workspace: string, checked: boolean): void => {
    setSelectedWorkspaces((current) => {
      const next = new Set(current);
      if (checked) next.add(workspace);
      else next.delete(workspace);
      return next;
    });
  };

  const toggleRepository = (repository: RepositoryRef, checked: boolean): void => {
    setSelectedRepositories((current) => {
      const next = new Map(current);
      if (checked) next.set(repositoryKey(repository), repository);
      else next.delete(repositoryKey(repository));
      return next;
    });
  };

  const isEmpty = selectedWorkspaces.size === 0 && selectedRepositories.size === 0;

  const save = (): void => {
    onSave(
      normalizeRepositoryScope({
        selectedWorkspaces: [...selectedWorkspaces],
        selectedRepositories: [...selectedRepositories.values()],
      }),
    );
  };

  return (
    <main className="app-shell selection-page">
      <p className="eyebrow">Choose repository sources</p>
      <h2>Select workspaces and repositories</h2>
      <p className="selection-progress" role="status">
        {discovery.isComplete
          ? `Loaded ${discovery.total} repositories.`
          : `Loading repositories ${discovery.completed} of ${discovery.total}`}
      </p>
      <fieldset className="selection-fieldset">
        <legend>Workspaces</legend>
        {workspaces.map((workspace) => (
          <label className="selection-option" key={workspace}>
            <input
              type="checkbox"
              checked={selectedWorkspaces.has(workspace)}
              onChange={(event) => toggleWorkspace(workspace, event.target.checked)}
            />
            {workspace}
          </label>
        ))}
      </fieldset>
      <fieldset className="selection-fieldset">
        <legend>Repositories</legend>
        {repositories.map((repository) => {
          const key = repositoryKey(repository);
          return (
            <label className="selection-option" key={key}>
              <input
                type="checkbox"
                checked={selectedRepositories.has(key)}
                onChange={(event) => toggleRepository(repository, event.target.checked)}
              />
              {repository.workspace}/{repository.slug}
            </label>
          );
        })}
      </fieldset>
      <div className="selection-actions">
        {onCancel ? (
          <Button variant="secondary" onPress={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button variant="primary" onPress={save} isDisabled={isEmpty}>
          Continue
        </Button>
      </div>
    </main>
  );
}
