import "../styles.css";
import type { JSX } from "react";
import { lazy, Suspense, useState } from "react";
import { ConnectionDiagnostics } from "../connection/ConnectionDiagnostics";

const DiffDemo = lazy(() =>
  import("../review/DiffDemo").then(({ DiffDemo: demo }) => ({ default: demo })),
);

export function App(): JSX.Element {
  const largeFixture = new URLSearchParams(window.location.search).get("fixture") === "large";
  const [isDiffDemoOpen, setIsDiffDemoOpen] = useState(largeFixture);
  return (
    <>
      <ConnectionDiagnostics />
      <div className="app-shell review-shell">
        {isDiffDemoOpen ? (
          <Suspense
            fallback={
              <p className="review-status" role="status">
                Loading diff demo…
              </p>
            }
          >
            <DiffDemo large={largeFixture} />
          </Suspense>
        ) : (
          <button type="button" className="primary-button" onClick={() => setIsDiffDemoOpen(true)}>
            Open diff demo
          </button>
        )}
      </div>
    </>
  );
}
