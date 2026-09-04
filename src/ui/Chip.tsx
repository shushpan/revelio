import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes, JSX } from "react";
import { cn } from "./cn";

export const chipVariants = cva(
  "inline-flex items-center rounded-full px-2 py-0.5 text-[length:var(--text-xs)] font-medium",
  {
    variants: {
      variant: {
        neutral: "bg-[var(--bg-muted)] text-[var(--fg-muted)]",
        accent: "bg-[var(--accent)] text-white",
        danger: "bg-[var(--danger)] text-white",
        success: "bg-[var(--success)] text-white",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export type ChipProps = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof chipVariants>;

export function Chip({ className, variant, ...props }: ChipProps): JSX.Element {
  return <span className={cn(chipVariants({ variant }), className)} {...props} />;
}
