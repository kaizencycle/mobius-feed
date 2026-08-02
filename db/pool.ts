import pg from "pg";

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(connectionString?: string): pg.Pool {
  const url = connectionString ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required");
  }

  if (!pool) {
    pool = new Pool({ connectionString: url });
  }

  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export async function withTransaction<T>(
  client: pg.PoolClient,
  fn: (tx: pg.PoolClient) => Promise<T>,
): Promise<T> {
  await client.query("BEGIN");
  try {
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
