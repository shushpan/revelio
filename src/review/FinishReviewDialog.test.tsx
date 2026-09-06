import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PendingReviewComment } from "./finish-review";
import { FinishReviewDialog } from "./FinishReviewDialog";

function baseProps() {
  return {
    isOpen: true,
    onClose: vi.fn(),
    canWriteReviews: true,
    busy: false,
    drafts: [] as ReadonlyArray<PendingReviewComment>,
    comment: "",
    onCommentChange: vi.fn(),
    inlineIntent: null,
    onAddDraft: vi.fn(),
    onSendDraftNow: vi.fn(),
    onFinish: vi.fn(),
    notice: null,
  };
}

describe("FinishReviewDialog", () => {
  afterEach(() => cleanup());

  it("renders nothing accessible when closed", () => {
    render(<FinishReviewDialog {...baseProps()} isOpen={false} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens as an aria-modal dialog named Finish Review", () => {
    render(<FinishReviewDialog {...baseProps()} />);
    expect(screen.getByRole("dialog", { name: "Finish Review" })).toHaveAttribute(
      "aria-modal",
      "true",
    );
  });

  it("shows honest decision availability when remote decisions are unavailable", () => {
    render(<FinishReviewDialog {...baseProps()} canWriteReviews={false} />);
    expect(
      screen.getByText("Remote review decisions are unavailable for this connection."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Request changes" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reviewed" })).toBeInTheDocument();
  });

  it("calls onFinish with the chosen outcome", () => {
    const onFinish = vi.fn();
    render(<FinishReviewDialog {...baseProps()} onFinish={onFinish} />);
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(onFinish).toHaveBeenCalledWith("approved");
    fireEvent.click(screen.getByRole("button", { name: "Request changes" }));
    expect(onFinish).toHaveBeenCalledWith("changes_requested");
    fireEvent.click(screen.getByRole("button", { name: "Reviewed" }));
    expect(onFinish).toHaveBeenCalledWith("reviewed");
  });

  it("shows an empty pending state, then renders general and inline draft summaries with Send now", () => {
    const onSendDraftNow = vi.fn();
    const { rerender } = render(<FinishReviewDialog {...baseProps()} />);
    expect(screen.getByText("No pending comments.")).toBeInTheDocument();

    const drafts: PendingReviewComment[] = [
      { id: "1", text: "General note" },
      { id: "2", text: "Inline note", anchor: { path: "src/a.ts", line: 3, side: "new" } },
    ];
    rerender(
      <FinishReviewDialog {...baseProps()} drafts={drafts} onSendDraftNow={onSendDraftNow} />,
    );

    expect(screen.getByText("General note")).toBeInTheDocument();
    expect(screen.getByText("Inline note")).toBeInTheDocument();
    expect(screen.getByText("src/a.ts:3")).toBeInTheDocument();

    const sendNowButtons = screen.getAllByRole("button", { name: "Send now" });
    expect(sendNowButtons).toHaveLength(2);
    fireEvent.click(sendNowButtons[1]);
    expect(onSendDraftNow).toHaveBeenCalledWith(drafts[1]);
  });

  it("disables Add comment when the composer is empty", () => {
    render(<FinishReviewDialog {...baseProps()} />);
    expect(screen.getByRole("button", { name: "Add comment" })).toBeDisabled();
  });

  it("reports composer text changes and adds a draft on click once populated", () => {
    const onCommentChange = vi.fn();
    const onAddDraft = vi.fn();
    const { rerender } = render(
      <FinishReviewDialog
        {...baseProps()}
        onCommentChange={onCommentChange}
        onAddDraft={onAddDraft}
      />,
    );
    fireEvent.change(screen.getByRole("textbox", { name: "General comment" }), {
      target: { value: "Looks good" },
    });
    expect(onCommentChange).toHaveBeenCalledWith("Looks good");

    rerender(
      <FinishReviewDialog
        {...baseProps()}
        comment="Looks good"
        onCommentChange={onCommentChange}
        onAddDraft={onAddDraft}
      />,
    );
    expect(screen.getByRole("button", { name: "Add comment" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Add comment" }));
    expect(onAddDraft).toHaveBeenCalled();
  });

  it("labels the composer as an inline comment with anchor context when inlineIntent is set", () => {
    render(
      <FinishReviewDialog
        {...baseProps()}
        comment="text"
        inlineIntent={{ path: "src/a.ts", line: 3, side: "new" }}
      />,
    );
    expect(screen.getByText("Commenting on src/a.ts:3")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Inline comment" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add inline comment" })).toBeEnabled();
  });

  it("disables decision, draft, and cancel actions while busy", () => {
    const drafts: PendingReviewComment[] = [{ id: "1", text: "General note" }];
    render(<FinishReviewDialog {...baseProps()} busy={true} drafts={drafts} comment="x" />);
    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Request changes" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reviewed" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send now" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add comment" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });

  it("shows a stage-failure notice inside the dialog", () => {
    render(
      <FinishReviewDialog
        {...baseProps()}
        notice="The review was sent but could not be saved locally. Retry Finish Review to complete it."
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("could not be saved locally");
  });

  it("closes without submitting on Cancel click", () => {
    const onClose = vi.fn();
    const onFinish = vi.fn();
    render(<FinishReviewDialog {...baseProps()} onClose={onClose} onFinish={onFinish} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
    expect(onFinish).not.toHaveBeenCalled();
  });

  it("closes without submitting on Escape", () => {
    const onClose = vi.fn();
    const onFinish = vi.fn();
    render(<FinishReviewDialog {...baseProps()} onClose={onClose} onFinish={onFinish} />);

    const dialog = screen.getByRole("dialog", { name: "Finish Review" });
    fireEvent.keyDown(dialog, { key: "Escape" });

    expect(onClose).toHaveBeenCalled();
    expect(onFinish).not.toHaveBeenCalled();
  });

  it("does not close on Escape or outside pointer down while busy", () => {
    const onClose = vi.fn();
    render(<FinishReviewDialog {...baseProps()} onClose={onClose} busy={true} />);
    const dialog = screen.getByRole("dialog", { name: "Finish Review" });
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("traps focus so Tab cycles within the dialog", async () => {
    render(<FinishReviewDialog {...baseProps()} />);
    const dialog = screen.getByRole("dialog", { name: "Finish Review" });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
  });
});
