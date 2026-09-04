import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import type { JSX, ReactNode } from "react";
import { cn } from "./cn";

export interface TooltipProps {
  readonly content: ReactNode;
  readonly children: ReactNode;
}

export function Tooltip({ content, children }: TooltipProps): JSX.Element {
  return (
    <TooltipPrimitive.Provider delayDuration={0}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            sideOffset={4}
            className={cn(
              "rounded-[var(--radius-sm)] bg-[var(--fg)] px-2 py-1 text-[length:var(--text-xs)] text-[var(--bg)]",
            )}
          >
            {content}
            <TooltipPrimitive.Arrow className="fill-[var(--fg)]" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
