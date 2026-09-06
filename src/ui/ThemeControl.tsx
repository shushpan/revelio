import type { JSX } from "react";
import { Button } from "./Button";

export type ThemeChoice = "system" | "light" | "dark";

export interface ThemeControlProps {
  readonly theme: ThemeChoice;
  readonly resolvedTheme: "light" | "dark";
  readonly onThemeChange: (theme: ThemeChoice) => void;
}

const choices: ReadonlyArray<{ readonly label: string; readonly value: ThemeChoice }> = [
  { label: "System", value: "system" },
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
];

export function ThemeControl({
  theme,
  resolvedTheme,
  onThemeChange,
}: ThemeControlProps): JSX.Element {
  return (
    <fieldset aria-label={`Color theme (${resolvedTheme})`} className="theme-control">
      {choices.map(({ label, value }) => (
        <Button
          key={value}
          size="md"
          aria-pressed={theme === value}
          variant={theme === value ? "primary" : "secondary"}
          onClick={() => onThemeChange(value)}
        >
          {label}
        </Button>
      ))}
    </fieldset>
  );
}
