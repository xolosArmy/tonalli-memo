import { readFile, stat } from "node:fs/promises";

const TXID_PATTERN = /^[0-9a-f]{64}$/u;
export const DEFAULT_ADMIN_URL = "http://127.0.0.1:3000/api/v1/admin/index";
const SAFE_VERIFICATION_STATUSES = new Set([
  "VERIFIED",
  "VERIFIED_TM1",
  "UNAUTHORIZED",
  "NO_MEMO",
  "INVALID_MEMO",
  "INVALID_TM1",
  "MULTIPLE_MEMOS",
  "MEMPOOL_TIP_REQUIRED",
  "INVALID_VERIFICATION_CONTEXT",
  "INVALID_TXID",
  "TRANSACTION_NOT_FOUND",
  "CHRONIK_UNAVAILABLE",
  "INVALID_CHRONIK_RESPONSE"
]);
const SAFE_ERROR_CODES = new Set([
  "BAD_REQUEST",
  "UNAUTHORIZED",
  "NOT_FOUND",
  "INDEX_QUEUE_FULL",
  "INDEXER_NOT_READY",
  "INTERNAL_ERROR"
]);

export function validateAdminTxid(value: string | undefined): string {
  if (value === undefined || !TXID_PATTERN.test(value)) {
    throw new Error("Usage: tonalli-index-tx <lowercase-64-hex-txid>");
  }
  return value;
}

export async function readProtectedToken(env: NodeJS.ProcessEnv): Promise<string> {
  const direct = nonEmpty(env.INDEX_API_TOKEN);
  const filename = nonEmpty(env.INDEX_API_TOKEN_FILE);
  if (direct !== undefined && filename !== undefined) {
    throw new Error("Configure only one of INDEX_API_TOKEN or INDEX_API_TOKEN_FILE.");
  }
  if (direct !== undefined) {
    return direct;
  }
  if (filename === undefined) {
    throw new Error("INDEX_API_TOKEN or INDEX_API_TOKEN_FILE is required.");
  }
  let metadata: Awaited<ReturnType<typeof stat>>;
  try {
    metadata = await stat(filename);
  } catch {
    throw new Error("INDEX_API_TOKEN_FILE could not be read.");
  }
  if (!metadata.isFile() || (metadata.mode & 0o077) !== 0) {
    throw new Error("INDEX_API_TOKEN_FILE must be a regular file with no group or other permissions.");
  }
  let contents: string;
  try {
    contents = await readFile(filename, "utf8");
  } catch {
    throw new Error("INDEX_API_TOKEN_FILE could not be read.");
  }
  const token = nonEmpty(contents);
  if (token === undefined) {
    throw new Error("INDEX_API_TOKEN_FILE is empty.");
  }
  return token;
}

export function resolveAdminUrl(value: string | undefined): string {
  const candidate = nonEmpty(value) ?? DEFAULT_ADMIN_URL;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error("INDEX_API_URL must be an absolute HTTP(S) URL.");
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username.length > 0 || url.password.length > 0) {
    throw new Error("INDEX_API_URL must be an absolute HTTP(S) URL without embedded credentials.");
  }
  return url.toString();
}

export async function readSanitizedResult(
  response: Response,
  requestedTxid: string
): Promise<Readonly<Record<string, unknown>>> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, httpStatus: response.status, txid: requestedTxid, code: "INVALID_SERVER_RESPONSE" };
  }
  if (!isRecord(body)) {
    return { ok: false, httpStatus: response.status, txid: requestedTxid, code: "INVALID_SERVER_RESPONSE" };
  }
  if (isRecord(body.verification)) {
    const status = typeof body.verification.status === "string" && SAFE_VERIFICATION_STATUSES.has(body.verification.status)
      ? body.verification.status
      : "UNKNOWN";
    return {
      ok: response.ok,
      httpStatus: response.status,
      txid: requestedTxid,
      attemptId: typeof body.attemptId === "number" ? body.attemptId : null,
      persistedRecord: body.persistedRecord === true,
      status
    };
  }
  const rawCode = isRecord(body.error) && typeof body.error.code === "string" ? body.error.code : null;
  const code = rawCode !== null && SAFE_ERROR_CODES.has(rawCode) ? rawCode : "REQUEST_FAILED";
  return { ok: false, httpStatus: response.status, txid: requestedTxid, code };
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
