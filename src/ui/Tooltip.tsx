import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { createContext, useContext, type JSX, type ReactNode } from "react";
import { cn } from "./cn";

export interface TooltipProps {
  readonly content: ReactNode;
  readonly children: ReactNode;
}

const hasSharedProvider = createContext(false);

/** Wrap a group of adjacent Tooltips (e.g. a toolbar) in one Provider instead of one per icon. */
export function TooltipProvider({ children }: { readonly children: ReactNode }): JSX.Element {
  return (
    <hasSharedProvider.Provider value={true}>
      <TooltipPrimitive.Provider delayDuration={0}>{children}</TooltipPrimitive.Provider>
    </hasSharedProvider.Provider>
  );
}

export function Tooltip({ content, children }: TooltipProps): JSX.Element {
  const isInsideSharedProvider = useContext(hasSharedProvider);
  const root = (
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
  );
  if (isInsideSharedProvider) return root;
  return <TooltipPrimitive.Provider delayDuration={0}>{root}</TooltipPrimitive.Provider>;
}
