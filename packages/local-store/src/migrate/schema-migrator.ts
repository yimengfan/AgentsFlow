/**
 * SchemaMigrator — manages SQLite schema versioning and migrations.
 *
 * Follows the "migrations table" pattern:
 *   1. On first run, create the `schema_version` tracking table
 *   2. Apply migrations sequentially from current version to latest
 *   3. Each migration runs in a transaction
 */

/** A single migration step */
export interface MigrationStep {
  readonly version: number;
  readonly description: string;
  readonly up: string; // SQL to apply
}

/** Result of a migration run */
export interface MigrationResult {
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly appliedSteps: number;
}

/**
 * Abstract interface for executing SQL.
 * Decoupled from any specific SQLite driver so the store
 * can work with better-sqlite3, sql.js, etc.
 */
export interface SqlExecutor {
  exec(sql: string): void;
  get<T = Record<string, unknown>>(sql: string, params?: unknown[]): T | undefined;
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[];
  run(sql: string, params?: unknown[]): { changes: number };
}

export class SchemaMigrator {
  private static readonly SCHEMA_VERSION_TABLE = `
    CREATE TABLE IF NOT EXISTS __schema_version (
      key   TEXT PRIMARY KEY DEFAULT 'current',
      version INTEGER NOT NULL DEFAULT 0
    );
  `;

  private static readonly GET_VERSION = `
    SELECT version FROM __schema_version WHERE key = 'current';
  `;

  private static readonly SET_VERSION = `
    INSERT INTO __schema_version (key, version)
    VALUES ('current', ?)
    ON CONFLICT(key) DO UPDATE SET version = excluded.version;
  `;

  private readonly migrations: MigrationStep[];

  constructor(migrations: MigrationStep[]) {
    // Sort by version ascending
    this.migrations = [...migrations].sort((a, b) => a.version - b.version);
  }

  /**
   * Get the latest schema version.
   */
  get latestVersion(): number {
    return this.migrations.length > 0
      ? this.migrations[this.migrations.length - 1]!.version
      : 0;
  }

  /**
   * Run all pending migrations.
   */
  migrate(db: SqlExecutor): MigrationResult {
    // Ensure the version tracking table exists
    db.exec(SchemaMigrator.SCHEMA_VERSION_TABLE);

    // Read current version
    const row = db.get<{ version: number }>(SchemaMigrator.GET_VERSION);
    const currentVersion = row?.version ?? 0;

    // Find pending migrations
    const pending = this.migrations.filter((m) => m.version > currentVersion);

    if (pending.length === 0) {
      return { fromVersion: currentVersion, toVersion: currentVersion, appliedSteps: 0 };
    }

    // Apply each migration
    for (const step of pending) {
      db.exec("BEGIN TRANSACTION;");
      try {
        db.exec(step.up);
        db.run(SchemaMigrator.SET_VERSION, [step.version]);
        db.exec("COMMIT;");
      } catch (err) {
        db.exec("ROLLBACK;");
        throw new Error(
          `Migration v${step.version} ("${step.description}") failed: ${String(err)}`,
        );
      }
    }

    return {
      fromVersion: currentVersion,
      toVersion: this.latestVersion,
      appliedSteps: pending.length,
    };
  }
}
