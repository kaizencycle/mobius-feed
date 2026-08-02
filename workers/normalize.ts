import { getPool, closePool } from "../db/pool.js";
import { runNormalizationPipeline } from "../normalizers/pipeline.js";

async function main(): Promise<void> {
  const pool = getPool();
  const batchSize = Number(process.env.NORMALIZE_BATCH_SIZE ?? "50");

  try {
    const result = await runNormalizationPipeline(pool, { batchSize });
    console.log(
      JSON.stringify({
        ok: true,
        processed: result.processed,
        signal_ids: result.signal_ids,
      }),
    );
  } finally {
    await closePool();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
