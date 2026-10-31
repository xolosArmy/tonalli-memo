import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

/**
 * Executes the candidate TypeScript sources. The package export map points at
 * dist, which CI builds only after the test step. Aliases keep this suite on
 * the same sources the package tests already execute.
 */
export default defineConfig({
  root: repoRoot,
  resolve: {
    alias: {
      "@xolosarmy/tonalli-memo-protocol": fileURLToPath(
        new URL("../../packages/protocol/src/index.ts", import.meta.url)
      ),
      "@tonalli-memo/registry": fileURLToPath(
        new URL("../../packages/registry/src/index.ts", import.meta.url)
      )
    }
  },
  test: {
    environment: "node",
    include: [
      "tests/protocol/rfc0001_s0_07_historical.test.ts",
      "tests/protocol/rfc0001_empp_tmm.test.ts"
    ],
    hookTimeout: 120000,
    testTimeout: 120000
  }
});
