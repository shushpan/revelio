import "../styles.css";
import type { JSX } from "react";

export function App(): JSX.Element {
  return (
    <main className="app-shell">
      <header className="app-header">
        <p className="eyebrow">Personal review workspace</p>
        <h1>Fast Review</h1>
      </header>
      <section className="readiness-card" aria-labelledby="readiness-title">
        <p className="status-dot" aria-hidden="true" />
        <div>
          <h2 id="readiness-title">Phase 0 readiness</h2>
          <p>Verification harness ready for provider and review-flow checks.</p>
        </div>
      </section>
    </main>
  );
}
