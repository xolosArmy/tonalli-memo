import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const webDist = join(repoRoot, "apps", "web", "dist");
const indexPath = join(webDist, "index.html");

const indexHtml = await readFile(indexPath, "utf8");
assert.match(indexHtml, /<script[^>]+type="module"[^>]+src="\/assets\/[^"]+\.js"/u, "index.html must reference a generated application asset.");

const assetMatches = [...indexHtml.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/gu)].map((match) => match[1]);
assert.ok(assetMatches.length > 0, "Expected production assets referenced from index.html.");

for (const assetPath of assetMatches) {
  const absoluteAssetPath = join(webDist, assetPath.slice(1));
  const assetStat = await stat(absoluteAssetPath);
  assert.ok(assetStat.size > 0, `${assetPath} must exist and be non-empty.`);
}

const bundledText = [
  indexHtml,
  ...(await Promise.all(assetMatches.map((assetPath) => readFile(join(webDist, assetPath.slice(1)), "utf8"))))
].join("\n");

assert.equal(bundledText.includes("INDEX_API_TOKEN"), false, "Production web bundle must not contain INDEX_API_TOKEN.");
assert.equal(bundledText.includes("http://127.0.0.1:3000"), false, "Production web bundle must not embed the local indexer URL.");
assert.equal(bundledText.includes("http://localhost:3000"), false, "Production web bundle must not embed localhost API URLs.");
assert.equal(bundledText.includes("http://localhost/api"), false, "Production web bundle must not embed localhost API URLs.");
assert.equal(bundledText.includes("/api/v1/admin/index"), false, "Production web bundle must not access the administrative indexing endpoint.");
