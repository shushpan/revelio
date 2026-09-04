import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "./Button";
import { Card } from "./Card";
import { Chip } from "./Chip";
import { cn } from "./cn";
import { Dialog, DialogContent, DialogTrigger } from "./Dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./DropdownMenu";
import { IconButton } from "./IconButton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./Tabs";
import { TextField } from "./TextField";
import { Tooltip } from "./Tooltip";

describe("cn", () => {
  it("merges variants without duplicate Tailwind conflicts", () => {
    expect(cn("px-2", false && "hidden", "px-3")).toBe("px-3");
  });
});

describe("Button", () => {
  afterEach(() => cleanup());

  it("renders a disabled native button with the selected variant", () => {
    render(
      <Button variant="primary" disabled>
        Save
      </Button>,
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("renders as a native anchor via asChild instead of preserving an HeroUI-style alias", () => {
    render(
      <Button asChild variant="ghost">
        <a href="/inbox">Back</a>
      </Button>,
    );
    expect(screen.getByRole("link", { name: "Back" })).toBeInTheDocument();
  });
});

describe("IconButton", () => {
  afterEach(() => cleanup());

  it("requires a label and tooltip and exposes the label as the accessible name", () => {
    render(
      <IconButton label="Collapse all" tooltip="Collapse all files">
        <span aria-hidden="true">-</span>
      </IconButton>,
    );
    expect(screen.getByRole("button", { name: "Collapse all" })).toBeInTheDocument();
  });
});

describe("Card", () => {
  afterEach(() => cleanup());

  it("renders children inside a bordered container", () => {
    render(<Card>content</Card>);
    expect(screen.getByText("content")).toBeInTheDocument();
  });
});

describe("TextField", () => {
  afterEach(() => cleanup());

  it("associates its label with the input and reports an error message", () => {
    render(<TextField label="Workspace" errorMessage="Required" />);
    const input = screen.getByLabelText("Workspace");
    expect(input).toHaveAccessibleDescription("Required");
  });
});

describe("Chip", () => {
  afterEach(() => cleanup());

  it("renders label text with the selected variant", () => {
    render(<Chip variant="danger">Failed</Chip>);
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });
});

describe("Tabs", () => {
  afterEach(() => cleanup());

  it("exposes aria-selected on the active tab and switches panels on click", () => {
    render(
      <Tabs defaultValue="tree">
        <TabsList>
          <TabsTrigger value="tree">Tree</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>
        <TabsContent value="tree">Tree panel</TabsContent>
        <TabsContent value="activity">Activity panel</TabsContent>
      </Tabs>,
    );

    expect(screen.getByRole("tab", { name: "Tree" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Activity" })).toHaveAttribute("aria-selected", "false");

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Activity" }), { button: 0 });

    expect(screen.getByRole("tab", { name: "Activity" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Activity panel")).toBeInTheDocument();
  });
});

describe("Dialog", () => {
  afterEach(() => cleanup());

  it("opens as an aria-modal dialog and closes on Escape", async () => {
    render(
      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent heading="Finish review">Draft summary</DialogContent>
      </Dialog>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");

    fireEvent.keyDown(dialog, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});

describe("DropdownMenu", () => {
  afterEach(() => cleanup());

  it("opens a menu with items on trigger click", async () => {
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Display</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={vi.fn()}>Line numbers</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    fireEvent.pointerDown(screen.getByRole("button", { name: "Display" }), { button: 0 });

    expect(await screen.findByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Line numbers" })).toBeInTheDocument();
  });
});

describe("Tooltip", () => {
  afterEach(() => cleanup());

  it("shows tooltip content accessibly associated with the trigger on focus", async () => {
    render(
      <Tooltip content="Back to inbox">
        <button type="button">Back</button>
      </Tooltip>,
    );

    fireEvent.focus(screen.getByRole("button", { name: "Back" }));

    expect(await screen.findByRole("tooltip", { name: "Back to inbox" })).toBeInTheDocument();
  });
});
