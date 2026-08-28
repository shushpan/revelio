const moduleEntryPattern =
  /<script\b(?=[^>]*\btype\s*=\s*["']module["'])[^>]*\bsrc\s*=\s*["']([^"']+\.js(?:[?#][^"']*)?)["'][^>]*>/gi;
const modulePreloadPattern =
  /<link\b(?=[^>]*\brel\s*=\s*["']modulepreload["'])[^>]*\bhref\s*=\s*["']([^"']+\.js(?:[?#][^"']*)?)["'][^>]*>/gi;

export function accountBundleAssets(indexHtml, javascriptAssets) {
  const entryReferences = [...indexHtml.matchAll(moduleEntryPattern)].map((match) =>
    assetName(match[1]),
  );
  if (entryReferences.length !== 1) {
    throw new Error(`Expected exactly one module entry script, found ${entryReferences.length}`);
  }
  const initialReferences = [
    ...entryReferences,
    ...[...indexHtml.matchAll(modulePreloadPattern)].map((match) => assetName(match[1])),
  ];
  const uniqueInitialReferences = [...new Set(initialReferences)];
  const assetsByName = new Map(javascriptAssets.map((asset) => [asset.name, asset.bytes]));
  for (const name of uniqueInitialReferences) {
    if (!assetsByName.has(name)) throw new Error(`Missing initial JavaScript asset: ${name}`);
  }
  const initialBytes = uniqueInitialReferences.reduce(
    (total, name) => total + assetsByName.get(name),
    0,
  );
  const lazyAssets = javascriptAssets.filter(({ name }) => !uniqueInitialReferences.includes(name));
  const largestLazy = lazyAssets.reduce(
    (largest, asset) => (asset.bytes > largest.bytes ? asset : largest),
    { name: "(none)", bytes: 0 },
  );
  return {
    initialBytes,
    initialNames: uniqueInitialReferences,
    largestLazy,
  };
}

function assetName(reference) {
  const path = reference.split(/[?#]/, 1)[0];
  return path.slice(path.lastIndexOf("/") + 1);
}
