import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const distDirectory = new URL("../dist/", import.meta.url);
const index = await readFile(new URL("index.html", distDirectory), "utf8");
const initialAssets = [...index.matchAll(/src="([^"]+\.js)"/g)].map((match) => match[1]);
const assetsDirectory = new URL("assets/", distDirectory);
const assetNames = await readdir(assetsDirectory);
const javascriptAssets = await Promise.all(
  assetNames
    .filter((name) => name.endsWith(".js"))
    .map(async (name) => ({
      name,
      bytes: (await stat(join(assetsDirectory.pathname, name))).size,
    })),
);
const initialNames = new Set(initialAssets.map((asset) => asset.split("/").at(-1)));
const initialBytes = javascriptAssets
  .filter(({ name }) => initialNames.has(name))
  .reduce((total, asset) => total + asset.bytes, 0);
const lazyAssets = javascriptAssets.filter(({ name }) => !initialNames.has(name));
const largestLazy = lazyAssets.reduce(
  (largest, asset) => (asset.bytes > largest.bytes ? asset : largest),
  { name: "(none)", bytes: 0 },
);

const initialBudget = 350_000;
const largestLazyBudget = 820_000;
console.log(
  `Bundle budget: initial ${initialBytes} bytes / ${initialBudget}; largest lazy ${largestLazy.name} ${largestLazy.bytes} bytes / ${largestLazyBudget}`,
);
if (initialBytes > initialBudget || largestLazy.bytes > largestLazyBudget) {
  throw new Error("Bundle budget exceeded");
}
