import BetterSqlite3 from "better-sqlite3";
import { CURRENT_SCHEMA_VERSION, MIGRATIONS, UnsupportedSchemaVersionError } from "./migrations.js";
import type { IndexerDatabase, OpenIndexerDatabaseOptions } from "./types.js";

interface UserVersionRow {
  readonly user_version: number;
}

export function openIndexerDatabase(options: OpenIndexerDatabaseOptions): IndexerDatabase {
  if (options.filename.length === 0) {
    throw new Error("Indexer database filename must be explicit.");
  }

  const connection = new BetterSqlite3(options.filename);
  connection.pragma("foreign_keys = ON");
  connection.pragma("busy_timeout = 5000");

  if (options.filename !== ":memory:") {
    connection.pragma("journal_mode = WAL");
    connection.pragma("synchronous = NORMAL");
  }

  try {
    runMigrations(connection);
  } catch (error) {
    connection.close();
    throw error;
  }

  return {
    connection,
    close() {
      connection.close();
    }
  };
}

function runMigrations(connection: BetterSqlite3.Database): void {
  const currentVersion = readUserVersion(connection);
  if (currentVersion > CURRENT_SCHEMA_VERSION) {
    throw new UnsupportedSchemaVersionError(currentVersion, CURRENT_SCHEMA_VERSION);
  }

  for (const migration of MIGRATIONS) {
    if (migration.version <= currentVersion) {
      continue;
    }

    connection.transaction(() => {
      connection.exec(migration.sql);
      connection.pragma(`user_version = ${migration.version}`);
    })();
  }
}

function readUserVersion(connection: BetterSqlite3.Database): number {
  const row = connection.prepare("PRAGMA user_version").get() as UserVersionRow;
  return row.user_version;
}
