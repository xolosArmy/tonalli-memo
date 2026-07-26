import { describe, expect, it } from "vitest";
import { ConfigError, parseIndexerCliConfig } from "../../src/cli/config.js";
import { closeIndexerResources, runIndexerCli } from "../../src/cli/run.js";
import type { FastifyInstance } from "fastify";

describe("indexer CLI configuration", () => {
  it("defaults HOST and DAEMON_ENABLED and parses explicit environment values", () => {
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
      indexApiToken: "secret",
      daemonEnabled: false
    });
  });

  it("parses DAEMON_ENABLED true and false exactly", () => {
    expect(parseIndexerCliConfig({ DB_PATH: ":memory:", DAEMON_ENABLED: "false" }).daemonEnabled).toBe(false);
    expect(parseIndexerCliConfig({ DB_PATH: ":memory:", DAEMON_ENABLED: "true", CHRONIK_URLS: "https://chronik.example" }).daemonEnabled).toBe(true);
    expect(() => parseIndexerCliConfig({ DB_PATH: ":memory:", DAEMON_ENABLED: "TRUE", CHRONIK_URLS: "https://chronik.example" })).toThrow(ConfigError);
  });

  it("requires DB_PATH and validates PORT", () => {
    expect(() => parseIndexerCliConfig({})).toThrow(ConfigError);
    expect(() => parseIndexerCliConfig({ DB_PATH: ":memory:", PORT: "0" })).toThrow(ConfigError);
    expect(() => parseIndexerCliConfig({ DB_PATH: ":memory:", PORT: "not-a-port" })).toThrow(ConfigError);
  });

  it("requires CHRONIK_URLS only when administrative indexing or daemon is enabled", () => {
    expect(parseIndexerCliConfig({ DB_PATH: ":memory:" })).toMatchObject({ chronikUrls: [], daemonEnabled: false });
    expect("indexApiToken" in parseIndexerCliConfig({ DB_PATH: ":memory:" })).toBe(false);
    expect(() => parseIndexerCliConfig({ DB_PATH: ":memory:", INDEX_API_TOKEN: "secret" })).toThrow(ConfigError);
    expect(() => parseIndexerCliConfig({ DB_PATH: ":memory:", DAEMON_ENABLED: "true" })).toThrow(ConfigError);
  });

  it("daemon can run without INDEX_API_TOKEN and is not constructed when disabled", async () => {
    const events: string[] = [];
    const app = {
      async listen(): Promise<string> {
        events.push("listen");
        return "http://127.0.0.1:0";
      },
      async close(): Promise<void> {
        events.push("app.close");
      }
    } as Pick<FastifyInstance, "listen" | "close">;
    const database = { connection: {}, close: () => events.push("database.close") };
    await runIndexerCli({
      env: { DB_PATH: ":memory:", DAEMON_ENABLED: "false" },
      factories: {
        openDatabase: () => database as never,
        createApi: async () => app as FastifyInstance,
        createDaemon: () => {
          throw new Error("daemon should not be constructed");
        }
      }
    });
    expect(events).toEqual(["listen"]);
  });

  it("starts one daemon without requiring INDEX_API_TOKEN", async () => {
    const events: string[] = [];
    await runIndexerCli({
      env: { DB_PATH: ":memory:", DAEMON_ENABLED: "true", CHRONIK_URLS: "https://chronik.example" },
      factories: {
        openDatabase: () => ({ connection: {}, close: () => events.push("database.close") }) as never,
        createApi: async (options) => {
          expect(options.indexingEngine).toBeDefined();
          expect(options.indexApiToken).toBeUndefined();
          return {
            async listen(): Promise<string> {
              events.push("listen");
              return "http://127.0.0.1:0";
            },
            async close(): Promise<void> {
              events.push("app.close");
            }
          } as FastifyInstance;
        },
        createDaemon: () => ({
          async start(): Promise<void> {
            events.push("daemon.start");
          },
          async stop(): Promise<void> {
            events.push("daemon.stop");
          }
        })
      }
    });
    expect(events).toEqual(["daemon.start", "listen"]);
  });

  it("startup failure cleans all resources", async () => {
    const events: string[] = [];
    await expect(
      runIndexerCli({
        env: { DB_PATH: ":memory:", DAEMON_ENABLED: "true", CHRONIK_URLS: "https://chronik.example" },
        factories: {
          openDatabase: () => ({ connection: {}, close: () => events.push("database.close") }) as never,
          createApi: async () => ({ close: async () => events.push("app.close") }) as unknown as FastifyInstance,
          createDaemon: () => ({
            async start(): Promise<void> {
              events.push("daemon.start");
              throw new Error("start failed");
            },
            async stop(): Promise<void> {
              events.push("daemon.stop");
            }
          })
        }
      })
    ).rejects.toThrow("start failed");
    expect(events).toEqual(["daemon.start", "daemon.stop", "app.close", "database.close"]);
  });

  it("closes daemon, Fastify, and database in order and attempts all after failures", async () => {
    const events: string[] = [];
    await expect(
      closeIndexerResources({
        daemon: {
          async stop(): Promise<void> {
            events.push("daemon.stop");
            throw new Error("daemon close failed");
          }
        },
        app: {
          async close(): Promise<undefined> {
            events.push("server.close");
            throw new Error("server close failed");
          }
        } as Pick<FastifyInstance, "close">,
        database: {
          close() {
            events.push("database.close");
          }
        }
      })
    ).rejects.toThrow(AggregateError);
    expect(events).toEqual(["daemon.stop", "server.close", "database.close"]);
  });
});
