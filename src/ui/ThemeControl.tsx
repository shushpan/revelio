import { Button } from "@heroui/react/button";
import { ButtonGroup } from "@heroui/react/button-group";
import type { JSX } from "react";

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
    <ButtonGroup aria-label={`Color theme (${resolvedTheme})`} className="theme-control" size="sm">
      {choices.map(({ label, value }) => (
        <Button
          key={value}
          aria-pressed={theme === value}
          aria-label={label}
          variant={theme === value ? "primary" : "secondary"}
          onPress={() => onThemeChange(value)}
        >
          {label}
        </Button>
      ))}
    </ButtonGroup>
  );
}
