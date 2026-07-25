export interface IndexerCliConfig {
  readonly host: string;
  readonly port: number;
  readonly dbPath: string;
  readonly chronikUrls: readonly string[];
  readonly corsOrigins: readonly string[];
  readonly indexApiToken?: string;
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
  const chronikUrls = parseList(env.CHRONIK_URLS, "CHRONIK_URLS");
  if (indexApiToken !== undefined && chronikUrls.length === 0) {
    throw new ConfigError("CHRONIK_URLS is required when INDEX_API_TOKEN enables administrative indexing.");
  }

  return {
    host,
    port,
    dbPath,
    chronikUrls,
    corsOrigins: parseList(env.CORS_ORIGINS, "CORS_ORIGINS"),
    ...(indexApiToken === undefined ? {} : { indexApiToken })
  };
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
