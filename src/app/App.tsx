import "../styles.css";
import { useTheme } from "@heroui/react";
import { Button } from "@heroui/react/button";
import type { JSX } from "react";
import { lazy, Suspense, useState } from "react";
import { type ThemeChoice, ThemeControl } from "../ui/ThemeControl";

const ConnectionDiagnostics = lazy(() =>
  import("../connection/ConnectionDiagnostics").then(({ ConnectionDiagnostics: diagnostics }) => ({
    default: diagnostics,
  })),
);
const DiffDemo = lazy(() =>
  import("../review/DiffDemo").then(({ DiffDemo: demo }) => ({ default: demo })),
);

export function App(): JSX.Element {
  const largeFixture = new URLSearchParams(window.location.search).get("fixture") === "large";
  const [isDiffDemoOpen, setIsDiffDemoOpen] = useState(largeFixture);
  const { theme, resolvedTheme, setTheme } = useTheme("system");
  const selectedTheme: ThemeChoice = theme === "light" || theme === "dark" ? theme : "system";
  const diffTheme = resolvedTheme === "dark" ? "dark" : "light";
  return (
    <>
      <header className="app-shell app-header">
        <div>
          <p className="eyebrow">Personal review workspace</p>
          <h1>Revelio</h1>
          <p className="phase-label">Phase 0 readiness</p>
        </div>
        <ThemeControl theme={selectedTheme} resolvedTheme={diffTheme} onThemeChange={setTheme} />
      </header>
      <Suspense
        fallback={
          <p className="app-shell review-status" role="status">
            Loading connection diagnostics…
          </p>
        }
      >
        <ConnectionDiagnostics />
      </Suspense>
      <div className="app-shell review-shell">
        {isDiffDemoOpen ? (
          <Suspense
            fallback={
              <p className="review-status" role="status">
                Loading diff demo…
              </p>
            }
          >
            <DiffDemo large={largeFixture} themeType={diffTheme} />
          </Suspense>
        ) : (
          <Button variant="primary" onPress={() => setIsDiffDemoOpen(true)}>
            Open diff demo
          </Button>
        )}
      </div>
    </>
  );
}
