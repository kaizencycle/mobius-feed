import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PoolClient } from "pg";

const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "migrations",
);

export async function applyMigrations(client: PoolClient): Promise<void> {
  const files = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), "utf-8");
    await client.query(sql);
  }
}
