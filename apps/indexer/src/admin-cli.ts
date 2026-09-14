#!/usr/bin/env node
import { readProtectedToken, readSanitizedResult, resolveAdminUrl, validateAdminTxid } from "./admin-client.js";

async function main(): Promise<void> {
  if (process.argv.length !== 3) {
    throw new Error("Usage: tonalli-index-tx <lowercase-64-hex-txid>");
  }
  const txid = validateAdminTxid(process.argv[2]);

  const token = await readProtectedToken(process.env);
  const url = resolveAdminUrl(process.env.INDEX_API_URL);
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ txid }),
      signal: AbortSignal.timeout(15_000)
    });
  } catch {
    throw new Error("Administrative indexing request could not reach the server.");
  }

  const result = await readSanitizedResult(response, txid);
  console.log(JSON.stringify(result));
  if (!response.ok) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Administrative indexing failed.");
  process.exitCode = 1;
});
