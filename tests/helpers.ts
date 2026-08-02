import pg from "pg";
import { randomUUID } from "node:crypto";
import { applyMigrations } from "../db/apply-migrations.js";
import { closePool } from "../db/pool.js";

const { Pool } = pg;

export interface TestSignalInput {
  headline: string;
  summary?: string | null;
  url?: string;
}

let testPool: pg.Pool | null = null;
let testDbName: string | null = null;

export async function setupTestDatabase(): Promise<pg.Pool> {
  const adminUrl =
    process.env.PG_ADMIN_URL ??
    "postgresql://postgres:postgres@localhost:5432/postgres";

  const admin = new Pool({ connectionString: adminUrl });
  testDbName = `mobius_feed_test_${randomUUID().replace(/-/g, "")}`;

  await admin.query(`CREATE DATABASE ${testDbName}`);
  await admin.end();

  const connectionString = `postgresql://postgres:postgres@localhost:5432/${testDbName}`;
  testPool = new Pool({ connectionString });

  const client = await testPool.connect();
  try {
    await applyMigrations(client);
  } finally {
    client.release();
  }

  return testPool;
}

export async function teardownTestDatabase(): Promise<void> {
  if (testPool) {
    await testPool.end();
    testPool = null;
  }

  if (testDbName) {
    const admin = new Pool({
      connectionString:
        process.env.PG_ADMIN_URL ??
        "postgresql://postgres:postgres@localhost:5432/postgres",
    });
    await admin.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1`,
      [testDbName],
    );
    await admin.query(`DROP DATABASE IF EXISTS ${testDbName}`);
    await admin.end();
    testDbName = null;
  }

  await closePool();
}

export async function insertNewSignal(
  pool: pg.Pool,
  input: TestSignalInput,
): Promise<string> {
  const signalId = randomUUID();
  const url = input.url ?? `https://example.com/${signalId}`;

  await pool.query(
    `INSERT INTO signals (
      signal_id, source, source_type, headline, summary, url,
      published_at, retrieved_at, normalizer_version, schema_version, status
    ) VALUES (
      $1, 'test-feed', 'rss', $2, $3, $4,
      now(), now(), 'rss-adapter-test', '2.0.0', 'NEW'
    )`,
    [signalId, input.headline, input.summary ?? null, url],
  );

  return signalId;
}

export async function countSignalsByStatus(
  pool: pg.Pool,
  status: string,
): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM signals WHERE status = $1",
    [status],
  );
  return Number(rows[0]?.count ?? 0);
}

export async function countCandidates(pool: pg.Pool): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM candidates",
  );
  return Number(rows[0]?.count ?? 0);
}

export async function getSignal(
  pool: pg.Pool,
  signalId: string,
): Promise<{
  headline: string;
  summary: string | null;
  status: string;
} | null> {
  const { rows } = await pool.query<{
    headline: string;
    summary: string | null;
    status: string;
  }>("SELECT headline, summary, status FROM signals WHERE signal_id = $1", [
    signalId,
  ]);
  return rows[0] ?? null;
}

export async function getCandidateForSignal(
  pool: pg.Pool,
  signalId: string,
): Promise<{ review_state: string; candidate_patterns: unknown } | null> {
  const { rows } = await pool.query<{
    review_state: string;
    candidate_patterns: unknown;
  }>(
    "SELECT review_state, candidate_patterns FROM candidates WHERE signal_id = $1",
    [signalId],
  );
  return rows[0] ?? null;
}
