import type { Pool, PoolClient } from "pg";
import { normalizeSignalText } from "./text.js";

export interface NewSignalRow {
  signal_id: string;
  headline: string;
  summary: string | null;
}

export interface NormalizeBatchResult {
  processed: number;
  signal_ids: string[];
}

const CLAIM_NEW_SIGNALS_SQL = `
  SELECT signal_id, headline, summary
  FROM signals
  WHERE status = 'NEW'
  ORDER BY created_at
  LIMIT $1
  FOR UPDATE SKIP LOCKED
`;

const UPDATE_SIGNAL_NORMALIZED_SQL = `
  UPDATE signals
  SET headline = $2,
      summary = $3,
      status = 'NORMALIZED'
  WHERE signal_id = $1
    AND status = 'NEW'
`;

const INSERT_CANDIDATE_SQL = `
  INSERT INTO candidates (signal_id, review_state, candidate_patterns)
  VALUES ($1, 'NORMALIZED', '[]'::jsonb)
`;

/**
 * Claim up to `batchSize` NEW signals with row-level locks.
 * SKIP LOCKED lets concurrent workers claim disjoint batches safely.
 * Locks are held until the surrounding transaction commits or rolls back.
 */
export async function claimNewSignals(
  client: PoolClient,
  batchSize: number,
): Promise<NewSignalRow[]> {
  const { rows } = await client.query<NewSignalRow>(CLAIM_NEW_SIGNALS_SQL, [
    batchSize,
  ]);
  return rows;
}

/**
 * Normalize one claimed signal and create its Candidate.
 * Caller must hold the row lock from claimNewSignals in the same transaction.
 */
export async function normalizeClaimedSignal(
  client: PoolClient,
  signal: NewSignalRow,
): Promise<void> {
  const { headline, summary } = normalizeSignalText(
    signal.headline,
    signal.summary,
  );

  const updated = await client.query(UPDATE_SIGNAL_NORMALIZED_SQL, [
    signal.signal_id,
    headline,
    summary,
  ]);

  if (updated.rowCount !== 1) {
    throw new Error(
      `Expected to normalize signal ${signal.signal_id}, updated ${updated.rowCount ?? 0} rows`,
    );
  }

  await client.query(INSERT_CANDIDATE_SQL, [signal.signal_id]);
}

/**
 * Claim and normalize up to `batchSize` NEW signals in one transaction.
 * Status transition and Candidate insert for each signal are atomic with the batch commit.
 */
export async function processNormalizationBatch(
  pool: Pool,
  batchSize: number,
): Promise<NormalizeBatchResult> {
  const client = await pool.connect();
  const signalIds: string[] = [];

  try {
    await client.query("BEGIN");
    const claimed = await claimNewSignals(client, batchSize);

    for (const signal of claimed) {
      await normalizeClaimedSignal(client, signal);
      signalIds.push(signal.signal_id);
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return { processed: signalIds.length, signal_ids: signalIds };
}

/**
 * Run the normalization pipeline until no NEW signals remain or `maxBatches` is hit.
 */
export async function runNormalizationPipeline(
  pool: Pool,
  options: { batchSize?: number; maxBatches?: number } = {},
): Promise<NormalizeBatchResult> {
  const batchSize = options.batchSize ?? 50;
  const maxBatches = options.maxBatches ?? Number.POSITIVE_INFINITY;

  const allIds: string[] = [];
  let batches = 0;

  while (batches < maxBatches) {
    const result = await processNormalizationBatch(pool, batchSize);
    allIds.push(...result.signal_ids);
    batches += 1;

    if (result.processed === 0) {
      break;
    }
  }

  return { processed: allIds.length, signal_ids: allIds };
}
