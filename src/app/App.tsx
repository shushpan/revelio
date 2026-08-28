import "../styles.css";
import type { JSX } from "react";
import { ConnectionDiagnostics } from "../connection/ConnectionDiagnostics";
import { DiffReview } from "../review/DiffReview";
import smallPatch from "../review/__fixtures__/small.patch?raw";
import largePatch from "../review/__fixtures__/large.patch?raw";

export function App(): JSX.Element {
  const patch =
    new URLSearchParams(window.location.search).get("fixture") === "large"
      ? largePatch
      : smallPatch;
  return (
    <>
      <ConnectionDiagnostics />
      <main className="app-shell review-shell">
        <DiffReview patch={patch} />
      </main>
    </>
  );
}
