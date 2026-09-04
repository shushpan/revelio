import type { InputHTMLAttributes, JSX } from "react";
import { useId } from "react";
import { cn } from "./cn";

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly label: string;
  readonly errorMessage?: string;
}

export function TextField({
  label,
  errorMessage,
  className,
  id,
  ...props
}: TextFieldProps): JSX.Element {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;

  return (
    <div className="grid gap-1">
      <label
        htmlFor={inputId}
        className="text-[length:var(--text-xs)] font-medium text-[var(--fg-muted)]"
      >
        {label}
      </label>
      <input
        id={inputId}
        className={cn(
          "h-[var(--control-md)] rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg)] px-2 text-[length:var(--text-sm)] text-[var(--fg)]",
          className,
        )}
        aria-invalid={errorMessage ? true : undefined}
        aria-describedby={errorMessage ? errorId : undefined}
        {...props}
      />
      {errorMessage ? (
        <p id={errorId} className="text-[length:var(--text-xs)] text-[var(--danger)]">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
