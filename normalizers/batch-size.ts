const DEFAULT_BATCH_SIZE = 50;

/**
 * Parse NORMALIZE_BATCH_SIZE. Rejects empty, non-numeric, fractional, and
 * non-positive values so a misconfigured worker cannot silently no-op.
 */
export function parseBatchSize(raw: string | undefined): number {
  const trimmed = raw?.trim();
  const value = Number(trimmed ?? DEFAULT_BATCH_SIZE);

  if (!Number.isInteger(value) || value < 1) {
    throw new Error(
      `NORMALIZE_BATCH_SIZE must be a positive integer, got ${JSON.stringify(raw)}`,
    );
  }

  return value;
}
