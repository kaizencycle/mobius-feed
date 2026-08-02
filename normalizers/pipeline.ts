import type { Pool, PoolClient } from "pg";
import { normalizeClaimedSignal } from "./normalize-signal.js";
import type { NewSignalRow } from "./types.js";

export type { NewSignalRow } from "./types.js";

export interface NormalizeBatchResult {
  processed: number;
  signal_ids: string[];
  /** Signals that failed normalization in this batch and were skipped. */
  failed_signal_ids: string[];
}

/**
 * Claim up to `batchSize` NEW signals with row-level locks.
 * SKIP LOCKED lets concurrent workers claim disjoint batches safely.
 * Locks are held until the surrounding transaction commits or rolls back.
 */
export async function claimNewSignals(
  client: PoolClient,
  batchSize: number,
  excludeSignalIds: readonly string[] = [],
): Promise<NewSignalRow[]> {
  if (batchSize < 1) {
    return [];
  }

  if (excludeSignalIds.length === 0) {
    const { rows } = await client.query<NewSignalRow>(
      `SELECT signal_id, headline, summary
       FROM signals
       WHERE status = 'NEW'
       ORDER BY created_at
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [batchSize],
    );
    return rows;
  }

  const { rows } = await client.query<NewSignalRow>(
    `SELECT signal_id, headline, summary
     FROM signals
     WHERE status = 'NEW'
       AND NOT (signal_id = ANY($2::uuid[]))
     ORDER BY created_at
     LIMIT $1
     FOR UPDATE SKIP LOCKED`,
    [batchSize, excludeSignalIds],
  );
  return rows;
}

export { normalizeClaimedSignal } from "./normalize-signal.js";

/**
 * Normalize up to `batchSize` NEW signals, one transaction per signal.
 * A poison row (persistent per-row failure) is skipped for the rest of this
 * batch so later signals are not blocked by an all-or-nothing rollback.
 */
export async function processNormalizationBatch(
  pool: Pool,
  batchSize: number,
): Promise<NormalizeBatchResult> {
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error(`batchSize must be a positive integer, got ${batchSize}`);
  }

  const signalIds: string[] = [];
  const failedSignalIds: string[] = [];
  const skipped = new Set<string>();

  while (signalIds.length + failedSignalIds.length < batchSize) {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      const claimed = await claimNewSignals(client, 1, [...skipped]);

      if (claimed.length === 0) {
        await client.query("ROLLBACK");
        break;
      }

      const signal = claimed[0]!;

      try {
        await normalizeClaimedSignal(client, signal);
        await client.query("COMMIT");
        signalIds.push(signal.signal_id);
      } catch {
        await client.query("ROLLBACK");
        skipped.add(signal.signal_id);
        failedSignalIds.push(signal.signal_id);
      }
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  return {
    processed: signalIds.length,
    signal_ids: signalIds,
    failed_signal_ids: failedSignalIds,
  };
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
  const allFailedIds: string[] = [];
  let batches = 0;

  while (batches < maxBatches) {
    const result = await processNormalizationBatch(pool, batchSize);
    allIds.push(...result.signal_ids);
    allFailedIds.push(...result.failed_signal_ids);
    batches += 1;

    if (result.processed === 0) {
      break;
    }
  }

  return {
    processed: allIds.length,
    signal_ids: allIds,
    failed_signal_ids: allFailedIds,
  };
}
