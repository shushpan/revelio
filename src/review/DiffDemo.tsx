import type { JSX } from "react";
import smallPatch from "./__fixtures__/small.patch?raw";
import largePatch from "./__fixtures__/large.patch?raw";
import { DiffReview } from "./DiffReview";

export function DiffDemo({ large = false }: { readonly large?: boolean }): JSX.Element {
  return <DiffReview patch={large ? largePatch : smallPatch} />;
}
