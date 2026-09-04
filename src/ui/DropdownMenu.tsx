import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import type { ComponentPropsWithoutRef, JSX } from "react";
import { cn } from "./cn";

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

export function DropdownMenuContent({
  className,
  sideOffset = 4,
  ...props
}: ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>): JSX.Element {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          "min-w-[10rem] rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg)] p-1 shadow-md",
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item>): JSX.Element {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(
        "cursor-pointer rounded-[var(--radius-sm)] px-2 py-1 text-[length:var(--text-sm)] outline-none data-[highlighted]:bg-[var(--bg-muted)]",
        className,
      )}
      {...props}
    />
  );
}
