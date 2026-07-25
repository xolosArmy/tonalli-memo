import { describe, expect, it } from "vitest";
import { ConfigError, parseIndexerCliConfig } from "../../src/cli/config.js";
import { closeIndexerResources } from "../../src/cli/run.js";
import type { FastifyInstance } from "fastify";

describe("indexer CLI configuration", () => {
  it("defaults HOST and parses explicit environment values", () => {
    expect(
      parseIndexerCliConfig({
        DB_PATH: "/tmp/tonalli.sqlite",
        PORT: "3015",
        CHRONIK_URLS: "https://chronik1.example, https://chronik2.example",
        CORS_ORIGINS: "https://app.example",
        INDEX_API_TOKEN: "secret"
      })
    ).toEqual({
      host: "127.0.0.1",
      port: 3015,
      dbPath: "/tmp/tonalli.sqlite",
      chronikUrls: ["https://chronik1.example", "https://chronik2.example"],
      corsOrigins: ["https://app.example"],
      indexApiToken: "secret"
    });
  });

  it("requires DB_PATH and validates PORT", () => {
    expect(() => parseIndexerCliConfig({})).toThrow(ConfigError);
    expect(() => parseIndexerCliConfig({ DB_PATH: ":memory:", PORT: "0" })).toThrow(ConfigError);
    expect(() => parseIndexerCliConfig({ DB_PATH: ":memory:", PORT: "not-a-port" })).toThrow(ConfigError);
  });

  it("requires CHRONIK_URLS only when administrative indexing is enabled", () => {
    expect(parseIndexerCliConfig({ DB_PATH: ":memory:" })).toMatchObject({ chronikUrls: [] });
    expect("indexApiToken" in parseIndexerCliConfig({ DB_PATH: ":memory:" })).toBe(false);
    expect(() => parseIndexerCliConfig({ DB_PATH: ":memory:", INDEX_API_TOKEN: "secret" })).toThrow(ConfigError);
  });

  it("closes Fastify before closing the database", async () => {
    const events: string[] = [];
    await closeIndexerResources(
      {
        async close(): Promise<undefined> {
          events.push("server.close");
          return undefined;
        }
      } as Pick<FastifyInstance, "close">,
      {
        close() {
          events.push("database.close");
        }
      }
    );
    expect(events).toEqual(["server.close", "database.close"]);
  });
});
