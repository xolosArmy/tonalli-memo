import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_ADMIN_URL,
  readProtectedToken,
  readSanitizedResult,
  resolveAdminUrl,
  validateAdminTxid
} from "../../src/admin-client.js";

const TXID = "d1e819aefaa3610286df4f8534129a1e6afe166e07f29236acb85df3f147dabd";
const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("tonalli-index-tx administrative client", () => {
  it("accepts exactly one canonical lowercase eCash txid", () => {
    expect(validateAdminTxid(TXID)).toBe(TXID);
    for (const invalid of [undefined, TXID.toUpperCase(), "0".repeat(63), "g".repeat(64)]) {
      expect(() => validateAdminTxid(invalid)).toThrow("Usage");
    }
  });

  it("reads a token from the environment or a restrictively permissioned file", async () => {
    await expect(readProtectedToken({ INDEX_API_TOKEN: "protected-token" })).resolves.toBe("protected-token");

    const directory = mkdtempSync(join(tmpdir(), "tonalli-index-token-"));
    directories.push(directory);
    const filename = join(directory, "token");
    writeFileSync(filename, "file-token\n", { mode: 0o600 });
    await expect(readProtectedToken({ INDEX_API_TOKEN_FILE: filename })).resolves.toBe("file-token");

    chmodSync(filename, 0o640);
    await expect(readProtectedToken({ INDEX_API_TOKEN_FILE: filename })).rejects.toThrow("no group or other permissions");
    await expect(readProtectedToken({ INDEX_API_TOKEN_FILE: join(directory, "missing") })).rejects.toThrow("could not be read");
    await expect(readProtectedToken({ INDEX_API_TOKEN: "one", INDEX_API_TOKEN_FILE: filename })).rejects.toThrow("only one");
  });

  it("rejects credential-bearing or non-HTTP server URLs", () => {
    expect(resolveAdminUrl(undefined)).toBe(DEFAULT_ADMIN_URL);
    expect(resolveAdminUrl("https://memo.example/api/v1/admin/index")).toBe("https://memo.example/api/v1/admin/index");
    expect(() => resolveAdminUrl("file:///tmp/token")).toThrow("HTTP(S)");
    expect(() => resolveAdminUrl("https://user:secret@memo.example/index")).toThrow("without embedded credentials");
  });

  it("prints only allow-listed status fields from server responses", async () => {
    const accepted = await readSanitizedResult(
      new Response(JSON.stringify({ attemptId: 14, persistedRecord: true, verification: { status: "VERIFIED_TM1", raw: "secret" } }), {
        status: 200,
        headers: { "content-type": "application/json" }
      }),
      TXID
    );
    expect(accepted).toEqual({
      ok: true,
      httpStatus: 200,
      txid: TXID,
      attemptId: 14,
      persistedRecord: true,
      status: "VERIFIED_TM1"
    });
    expect(JSON.stringify(accepted)).not.toContain("secret");

    await expect(
      readSanitizedResult(
        new Response(JSON.stringify({ error: { code: "protected-token", message: "protected-token" } }), {
          status: 500,
          headers: { "content-type": "application/json" }
        }),
        TXID
      )
    ).resolves.toMatchObject({ code: "REQUEST_FAILED" });
  });
});
