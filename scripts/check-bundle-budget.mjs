import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { accountBundleAssets } from "./check-bundle-budget-lib.mjs";

const distDirectory = new URL("../dist/", import.meta.url);
const index = await readFile(new URL("index.html", distDirectory), "utf8");
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
const { initialBytes, largestLazy } = accountBundleAssets(index, javascriptAssets);

const initialBudget = 350_000;
const largestLazyBudget = 820_000;
console.log(
  `Bundle budget: initial ${initialBytes} bytes / ${initialBudget}; largest lazy ${largestLazy.name} ${largestLazy.bytes} bytes / ${largestLazyBudget}`,
);
if (initialBytes > initialBudget || largestLazy.bytes > largestLazyBudget) {
  throw new Error("Bundle budget exceeded");
}
