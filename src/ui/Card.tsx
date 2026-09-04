import type { HTMLAttributes, JSX } from "react";
import { cn } from "./cn";

export type CardProps = HTMLAttributes<HTMLDivElement>;

export function Card({ className, ...props }: CardProps): JSX.Element {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg)] p-4",
        className,
      )}
      {...props}
    />
  );
}
