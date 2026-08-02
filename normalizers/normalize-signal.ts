import type { PoolClient } from "pg";
import { normalizeSignalText } from "./text.js";
import type { NewSignalRow } from "./types.js";

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
