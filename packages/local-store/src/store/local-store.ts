import type { AgentEvent } from "@agentsflow/agent-contracts";
import { SchemaMigrator } from "../migrate/schema-migrator.js";
import type { SqlExecutor, MigrationStep, MigrationResult } from "../migrate/schema-migrator.js";

/**
 * LocalStore — SQLite-backed persistence for flow runs, events, and artifacts.
 *
 * Design constraints:
 *   - No Electron dependency (pure Node.js + SQLite)
 *   - Schema migrations are versioned and transactional
 *   - All queries are synchronous (matches better-sqlite3 API)
 *   - Event storage is append-only for audit integrity
 */

/** Query options for event retrieval */
export interface EventQueryOptions {
  readonly runId?: string;
  readonly nodeId?: string;
  readonly agentId?: string;
  readonly eventType?: string;
  readonly since?: number; // timestamp
  readonly limit?: number;
  readonly offset?: number;
}

/** Run metadata stored in the runs table */
export interface RunRecord {
  readonly runId: string;
  readonly flowName: string;
  readonly flowVersion: string;
  readonly status: string;
  readonly startedAt: number;
  readonly completedAt: number | undefined;
  readonly inputJson: string | undefined;
  readonly outputJson: string | undefined;
}

/** Artifact record */
export interface ArtifactRecord {
  readonly artifactId: string;
  readonly runId: string;
  readonly nodeId: string;
  readonly artifactType: string;
  readonly contentJson: string;
  readonly createdAt: number;
}

// ── Schema Migrations ────────────────────────────────────────────────

const MIGRATIONS: MigrationStep[] = [
  {
    version: 1,
    description: "Initial schema — runs, events, artifacts",
    up: `
      CREATE TABLE IF NOT EXISTS runs (
        run_id        TEXT PRIMARY KEY,
        flow_name     TEXT NOT NULL,
        flow_version  TEXT NOT NULL DEFAULT '1.0',
        status        TEXT NOT NULL DEFAULT 'running',
        started_at    INTEGER NOT NULL,
        completed_at  INTEGER,
        input_json    TEXT,
        output_json   TEXT
      );

      CREATE TABLE IF NOT EXISTS events (
        event_id      TEXT PRIMARY KEY,
        run_id        TEXT NOT NULL,
        node_id       TEXT,
        agent_id      TEXT,
        invocation_id TEXT,
        event_type    TEXT NOT NULL,
        schema_version TEXT NOT NULL DEFAULT '1.0',
        timestamp     INTEGER NOT NULL,
        payload_json  TEXT NOT NULL DEFAULT '{}',
        metadata_json TEXT NOT NULL DEFAULT '{}'
      );

      CREATE INDEX IF NOT EXISTS idx_events_run_id ON events(run_id);
      CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
      CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);

      CREATE TABLE IF NOT EXISTS artifacts (
        artifact_id   TEXT PRIMARY KEY,
        run_id        TEXT NOT NULL,
        node_id       TEXT NOT NULL,
        artifact_type TEXT NOT NULL,
        content_json  TEXT NOT NULL DEFAULT '{}',
        created_at    INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_artifacts_run_id ON artifacts(run_id);
    `,
  },
  {
    version: 2,
    description: "Add memory_snapshots table",
    up: `
      CREATE TABLE IF NOT EXISTS memory_snapshots (
        snapshot_id   TEXT PRIMARY KEY,
        run_id        TEXT NOT NULL,
        scope         TEXT NOT NULL,
        version       INTEGER NOT NULL DEFAULT 1,
        items_json    TEXT NOT NULL DEFAULT '[]',
        created_at    INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_memory_snapshots_run ON memory_snapshots(run_id);
      CREATE INDEX IF NOT EXISTS idx_memory_snapshots_scope ON memory_snapshots(scope);
    `,
  },
];

export class LocalStore {
  private db: SqlExecutor;
  private migrator: SchemaMigrator;

  constructor(db: SqlExecutor) {
    this.db = db;
    this.migrator = new SchemaMigrator(MIGRATIONS);
  }

  /**
   * Initialize the store — run migrations.
   */
  initialize(): MigrationResult {
    return this.migrator.migrate(this.db);
  }

  // ── Runs ──────────────────────────────────────────────────────────

  /**
   * Insert a new run record.
   */
  insertRun(record: RunRecord): void {
    this.db.run(
      `INSERT INTO runs (run_id, flow_name, flow_version, status, started_at, completed_at, input_json, output_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.runId,
        record.flowName,
        record.flowVersion,
        record.status,
        record.startedAt,
        record.completedAt ?? null,
        record.inputJson ?? null,
        record.outputJson ?? null,
      ],
    );
  }

  /**
   * Update run status.
   */
  updateRunStatus(runId: string, status: string, completedAt?: number): void {
    this.db.run(
      `UPDATE runs SET status = ?, completed_at = COALESCE(?, completed_at) WHERE run_id = ?`,
      [status, completedAt ?? null, runId],
    );
  }

  /**
   * Get a run by ID.
   */
  getRun(runId: string): RunRecord | undefined {
    const row = this.db.get<{
      run_id: string;
      flow_name: string;
      flow_version: string;
      status: string;
      started_at: number;
      completed_at: number | null;
      input_json: string | null;
      output_json: string | null;
    }>(`SELECT * FROM runs WHERE run_id = ?`, [runId]);

    if (!row) return undefined;

    return {
      runId: row.run_id,
      flowName: row.flow_name,
      flowVersion: row.flow_version,
      status: row.status,
      startedAt: row.started_at,
      completedAt: row.completed_at ?? undefined,
      inputJson: row.input_json ?? undefined,
      outputJson: row.output_json ?? undefined,
    };
  }

  /**
   * List runs, most recent first.
   */
  listRuns(limit = 50, offset = 0): RunRecord[] {
    const rows = this.db.all<{
      run_id: string;
      flow_name: string;
      flow_version: string;
      status: string;
      started_at: number;
      completed_at: number | null;
      input_json: string | null;
      output_json: string | null;
    }>(`SELECT * FROM runs ORDER BY started_at DESC LIMIT ? OFFSET ?`, [limit, offset]);

    return rows.map((row) => ({
      runId: row.run_id,
      flowName: row.flow_name,
      flowVersion: row.flow_version,
      status: row.status,
      startedAt: row.started_at,
      completedAt: row.completed_at ?? undefined,
      inputJson: row.input_json ?? undefined,
      outputJson: row.output_json ?? undefined,
    }));
  }

  // ── Events ────────────────────────────────────────────────────────

  /**
   * Append an event (append-only, no updates or deletes).
   */
  appendEvent(event: AgentEvent): void {
    this.db.run(
      `INSERT INTO events (event_id, run_id, node_id, agent_id, invocation_id, event_type, schema_version, timestamp, payload_json, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        event.eventId,
        event.runId,
        event.nodeId ?? null,
        event.agentId ?? null,
        event.invocationId ?? null,
        event.eventType,
        event.schemaVersion,
        event.timestamp,
        JSON.stringify(event.payload),
        JSON.stringify(event.metadata ?? {}),
      ],
    );
  }

  /**
   * Query events with filters.
   */
  queryEvents(options: EventQueryOptions = {}): AgentEvent[] {
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (options.runId) {
      clauses.push("run_id = ?");
      params.push(options.runId);
    }
    if (options.nodeId) {
      clauses.push("node_id = ?");
      params.push(options.nodeId);
    }
    if (options.agentId) {
      clauses.push("agent_id = ?");
      params.push(options.agentId);
    }
    if (options.eventType) {
      clauses.push("event_type = ?");
      params.push(options.eventType);
    }
    if (options.since) {
      clauses.push("timestamp >= ?");
      params.push(options.since);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const limit = options.limit ?? 100;
    const offset = options.offset ?? 0;

    const rows = this.db.all<{
      event_id: string;
      run_id: string;
      node_id: string | null;
      agent_id: string | null;
      invocation_id: string | null;
      event_type: string;
      schema_version: string;
      timestamp: number;
      payload_json: string;
      metadata_json: string;
    }>(`SELECT * FROM events ${where} ORDER BY timestamp ASC LIMIT ? OFFSET ?`, [
      ...params,
      limit,
      offset,
    ]);

    return rows.map((row) => ({
      eventId: row.event_id,
      runId: row.run_id,
      ...(row.node_id !== null ? { nodeId: row.node_id } : {}),
      ...(row.agent_id !== null ? { agentId: row.agent_id } : {}),
      ...(row.invocation_id !== null ? { invocationId: row.invocation_id } : {}),
      eventType: row.event_type as AgentEvent["eventType"],
      schemaVersion: row.schema_version as AgentEvent["schemaVersion"],
      timestamp: row.timestamp,
      payload: JSON.parse(row.payload_json),
      metadata: JSON.parse(row.metadata_json),
    }));
  }

  // ── Artifacts ─────────────────────────────────────────────────────

  /**
   * Store an artifact.
   */
  insertArtifact(record: ArtifactRecord): void {
    this.db.run(
      `INSERT INTO artifacts (artifact_id, run_id, node_id, artifact_type, content_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        record.artifactId,
        record.runId,
        record.nodeId,
        record.artifactType,
        record.contentJson,
        record.createdAt,
      ],
    );
  }

  /**
   * Get artifacts for a run.
   */
  getArtifacts(runId: string): ArtifactRecord[] {
    const rows = this.db.all<{
      artifact_id: string;
      run_id: string;
      node_id: string;
      artifact_type: string;
      content_json: string;
      created_at: number;
    }>(`SELECT * FROM artifacts WHERE run_id = ? ORDER BY created_at ASC`, [runId]);

    return rows.map((row) => ({
      artifactId: row.artifact_id,
      runId: row.run_id,
      nodeId: row.node_id,
      artifactType: row.artifact_type,
      contentJson: row.content_json,
      createdAt: row.created_at,
    }));
  }
}
