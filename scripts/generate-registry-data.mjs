import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const registryPath = resolve(root, "data/registry.json");
const outputPath = resolve(root, "packages/registry/src/registry-data.ts");

const registryText = await readFile(registryPath, "utf8");
const registryData = JSON.parse(registryText);
const generated = `// Generated from data/registry.json. Do not edit by hand.
// Run \`pnpm registry:generate\` after changing the canonical registry.

export const REGISTRY_DATA = ${JSON.stringify(registryData, null, 2)} as const;
`;

await writeFile(outputPath, generated, "utf8");
