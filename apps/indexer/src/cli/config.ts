export interface IndexerCliConfig {
  readonly host: string;
  readonly port: number;
  readonly dbPath: string;
  readonly chronikUrls: readonly string[];
  readonly corsOrigins: readonly string[];
  readonly trustProxy: boolean;
  readonly indexApiToken?: string;
  readonly daemonEnabled: boolean;
  readonly queueLimit: number;
  readonly backfillIntervalMs: number;
  readonly backfillPageSize: number;
  readonly backfillMaxPagesPerRun: number;
  readonly backfillOverlapPages: number;
  readonly readinessMaxLagBlocks: number;
  readonly publicIndexRateLimitMax: number;
  readonly publicIndexRateLimitWindowMs: number;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export function parseIndexerCliConfig(env: NodeJS.ProcessEnv): IndexerCliConfig {
  const host = nonEmpty(env.HOST) ?? "127.0.0.1";
  const port = parsePort(env.PORT);
  const dbPath = nonEmpty(env.DB_PATH);
  if (dbPath === undefined) {
    throw new ConfigError("DB_PATH is required.");
  }

  const indexApiToken = nonEmpty(env.INDEX_API_TOKEN);
  const daemonEnabled = parseBoolean(env.DAEMON_ENABLED, "DAEMON_ENABLED", false);
  const chronikUrls = parseList(env.CHRONIK_URLS, "CHRONIK_URLS");
  if ((indexApiToken !== undefined || daemonEnabled) && chronikUrls.length === 0) {
    throw new ConfigError("CHRONIK_URLS is required when administrative indexing or the daemon is enabled.");
  }

  return {
    host,
    port,
    dbPath,
    chronikUrls,
    corsOrigins: parseList(env.CORS_ORIGINS, "CORS_ORIGINS"),
    trustProxy: parseBoolean(env.TRUST_PROXY, "TRUST_PROXY", false),
    daemonEnabled,
    queueLimit: parseInteger(env.INDEX_QUEUE_LIMIT, "INDEX_QUEUE_LIMIT", 1000, 1),
    backfillIntervalMs: parseInteger(env.BACKFILL_INTERVAL_MS, "BACKFILL_INTERVAL_MS", 60_000, 1000),
    backfillPageSize: parseInteger(env.BACKFILL_PAGE_SIZE, "BACKFILL_PAGE_SIZE", 100, 1, 199),
    backfillMaxPagesPerRun: parseInteger(env.BACKFILL_MAX_PAGES_PER_RUN, "BACKFILL_MAX_PAGES_PER_RUN", 100, 1),
    backfillOverlapPages: parseInteger(env.BACKFILL_OVERLAP_PAGES, "BACKFILL_OVERLAP_PAGES", 2, 0),
    readinessMaxLagBlocks: parseInteger(env.READINESS_MAX_LAG_BLOCKS, "READINESS_MAX_LAG_BLOCKS", 6, 0),
    publicIndexRateLimitMax: parseInteger(env.PUBLIC_INDEX_RATE_LIMIT_MAX, "PUBLIC_INDEX_RATE_LIMIT_MAX", 30, 1),
    publicIndexRateLimitWindowMs: parseInteger(
      env.PUBLIC_INDEX_RATE_LIMIT_WINDOW_MS,
      "PUBLIC_INDEX_RATE_LIMIT_WINDOW_MS",
      60_000,
      1000
    ),
    ...(indexApiToken === undefined ? {} : { indexApiToken })
  };
}

function parseInteger(
  value: string | undefined,
  name: string,
  defaultValue: number,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER
): number {
  const raw = nonEmpty(value);
  if (raw === undefined) {
    return defaultValue;
  }
  if (!/^[0-9]+$/u.test(raw)) {
    throw new ConfigError(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new ConfigError(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

function parseBoolean(value: string | undefined, name: string, defaultValue: boolean): boolean {
  const raw = nonEmpty(value);
  if (raw === undefined) {
    return defaultValue;
  }
  if (raw === "true") {
    return true;
  }
  if (raw === "false") {
    return false;
  }
  throw new ConfigError(`${name} must be true or false.`);
}

function parsePort(value: string | undefined): number {
  const raw = nonEmpty(value) ?? "3000";
  if (!/^[0-9]+$/u.test(raw)) {
    throw new ConfigError("PORT must be an integer between 1 and 65535.");
  }
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ConfigError("PORT must be an integer between 1 and 65535.");
  }
  return port;
}

function parseList(value: string | undefined, name: string): readonly string[] {
  const raw = nonEmpty(value);
  if (raw === undefined) {
    return [];
  }
  const parts = raw.split(",").map((part) => part.trim()).filter((part) => part.length > 0);
  if (parts.length === 0) {
    throw new ConfigError(`${name} must contain at least one non-empty value when set.`);
  }
  return parts;
}

function nonEmpty(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}
