import type { JSX } from "react";
import largePatch from "./__fixtures__/large.patch?raw";
import smallPatch from "./__fixtures__/small.patch?raw";
import { DiffReview } from "./DiffReview";

export function DiffDemo({
  large = false,
  themeType,
}: {
  readonly large?: boolean;
  readonly themeType: "light" | "dark";
}): JSX.Element {
  return (
    <DiffReview patch={large ? largePatch : smallPatch} themeType={themeType} layout="unified" />
  );
}
