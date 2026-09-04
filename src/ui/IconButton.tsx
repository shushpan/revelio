import type { ButtonHTMLAttributes, JSX, ReactNode } from "react";
import { Button, type ButtonProps } from "./Button";
import { Tooltip } from "./Tooltip";

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label">,
    Pick<ButtonProps, "variant"> {
  readonly label: string;
  readonly tooltip: ReactNode;
  readonly children: ReactNode;
}

export function IconButton({
  label,
  tooltip,
  children,
  variant = "ghost",
  ...props
}: IconButtonProps): JSX.Element {
  return (
    <Tooltip content={tooltip}>
      <Button size="icon" variant={variant} aria-label={label} {...props}>
        {children}
      </Button>
    </Tooltip>
  );
}
