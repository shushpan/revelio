import * as DialogPrimitive from "@radix-ui/react-dialog";
import type { ComponentPropsWithoutRef, JSX, ReactNode } from "react";
import { Button } from "./Button";
import { cn } from "./cn";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;

export interface DialogContentProps
  extends Omit<ComponentPropsWithoutRef<typeof DialogPrimitive.Content>, "title"> {
  readonly heading: ReactNode;
  readonly cancelLabel?: string;
}

export function DialogContent({
  heading,
  cancelLabel = "Cancel",
  className,
  children,
  ...props
}: DialogContentProps): JSX.Element {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 bg-black/40" />
      <DialogPrimitive.Content
        aria-modal="true"
        className={cn(
          "fixed left-1/2 top-1/2 w-[min(90vw,28rem)] -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg)] p-4",
          className,
        )}
        {...props}
      >
        <DialogPrimitive.Title className="text-[length:var(--text-sm)] font-semibold">
          {heading}
        </DialogPrimitive.Title>
        {children}
        <DialogPrimitive.Close asChild>
          <Button variant="ghost" size="sm" className="mt-3">
            {cancelLabel}
          </Button>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
