import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  countCandidates,
  countSignalsByStatus,
  getCandidateForSignal,
  getSignal,
  insertNewSignal,
  setupTestDatabase,
  teardownTestDatabase,
} from "./helpers.js";
import { MAX_SUMMARY_LENGTH } from "../sources/rss/constants.js";
import {
  normalizeSignalText,
  parseBatchSize,
  processNormalizationBatch,
  runNormalizationPipeline,
  stripHtmlTags,
  truncateToMaxLength,
} from "../normalizers/index.js";
import type pg from "pg";

describe("normalizeSignalText", () => {
  it("strips HTML, collapses whitespace, and caps summary length", () => {
    const longBody = "x".repeat(MAX_SUMMARY_LENGTH + 100);
    const result = normalizeSignalText(
      "  <b>Title</b>  ",
      `<p>Hello   world</p>${longBody}`,
    );

    expect(result.headline).toBe("Title");
    expect(result.summary).toHaveLength(MAX_SUMMARY_LENGTH);
    expect(result.summary?.startsWith("Hello world")).toBe(true);
  });

  it("preserves word boundaries across block and line-break markup", () => {
    expect(stripHtmlTags("Hello<br>world")).toBe("Hello world");
    expect(
      normalizeSignalText("Headline", "<p>Alpha</p><p>Beta</p>").summary,
    ).toBe("Alpha Beta");
    expect(stripHtmlTags("a < b > c")).toBe("a < b > c");
  });

  it("truncates on code-point boundaries without splitting surrogate pairs", () => {
    const prefix = "x".repeat(MAX_SUMMARY_LENGTH - 1);
    const input = `${prefix}😀extra`;
    const result = normalizeSignalText("Headline", input);

    expect(result.summary).toBe(`${prefix}😀`);
    expect(result.summary).not.toContain("\uFFFD");
  });

  it("returns null summary when cleaned summary is empty", () => {
    const result = normalizeSignalText("Headline", "   <br/>  ");
    expect(result.summary).toBeNull();
  });
});

describe("truncateToMaxLength", () => {
  it("does not split emoji at the boundary", () => {
    expect(truncateToMaxLength("ab😀cd", 3)).toBe("ab😀");
  });
});

describe("parseBatchSize", () => {
  it("defaults to 50 when unset", () => {
    expect(parseBatchSize(undefined)).toBe(50);
  });

  it("rejects empty, zero, and non-integer values", () => {
    expect(() => parseBatchSize("")).toThrow(/positive integer/);
    expect(() => parseBatchSize("   ")).toThrow(/positive integer/);
    expect(() => parseBatchSize("0")).toThrow(/positive integer/);
    expect(() => parseBatchSize("1.5")).toThrow(/positive integer/);
  });
});

describe("normalization pipeline", () => {
  let pool: pg.Pool;

  beforeAll(async () => {
    pool = await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  it("transitions NEW signals to NORMALIZED and creates exactly one candidate", async () => {
    const signalId = await insertNewSignal(pool, {
      headline: "<em>Launch</em> detected",
      summary: "<p>Details   here</p>",
    });

    const result = await processNormalizationBatch(pool, 10);

    expect(result.processed).toBe(1);
    expect(result.signal_ids).toEqual([signalId]);

    const signal = await getSignal(pool, signalId);
    expect(signal?.status).toBe("NORMALIZED");
    expect(signal?.headline).toBe("Launch detected");
    expect(signal?.summary).toBe("Details here");

    const candidate = await getCandidateForSignal(pool, signalId);
    expect(candidate?.review_state).toBe("NORMALIZED");
    expect(candidate?.candidate_patterns).toEqual([]);
  });

  it("is idempotent when re-run — NORMALIZED signals are not reprocessed", async () => {
    await insertNewSignal(pool, { headline: "First" });
    await insertNewSignal(pool, { headline: "Second" });

    const firstRun = await runNormalizationPipeline(pool);
    expect(firstRun.processed).toBe(2);

    const secondRun = await runNormalizationPipeline(pool);
    expect(secondRun.processed).toBe(0);

    expect(await countSignalsByStatus(pool, "NEW")).toBe(0);
    expect(await countSignalsByStatus(pool, "NORMALIZED")).toBeGreaterThanOrEqual(
      2,
    );
    expect(await countCandidates(pool)).toBeGreaterThanOrEqual(2);
  });

  it("does not filter junk signals — every NEW signal becomes a candidate", async () => {
    const emptySummaryId = await insertNewSignal(pool, {
      headline: "   ",
      summary: "",
    });

    await runNormalizationPipeline(pool, { maxBatches: 1, batchSize: 10 });

    const signal = await getSignal(pool, emptySummaryId);
    expect(signal?.status).toBe("NORMALIZED");

    const candidate = await getCandidateForSignal(pool, emptySummaryId);
    expect(candidate).not.toBeNull();
    expect(candidate?.review_state).toBe("NORMALIZED");
  });

  it("forbids candidate deletion to preserve the 1:1 invariant", async () => {
    const signalId = await insertNewSignal(pool, { headline: "No delete" });
    await runNormalizationPipeline(pool, { maxBatches: 1, batchSize: 1 });

    const { rows } = await pool.query<{ candidate_id: string }>(
      "SELECT candidate_id FROM candidates WHERE signal_id = $1",
      [signalId],
    );
    const candidateId = rows[0]?.candidate_id;
    expect(candidateId).toBeDefined();

    await expect(
      pool.query("DELETE FROM candidates WHERE candidate_id = $1", [candidateId]),
    ).rejects.toThrow(/cannot be deleted/);
  });

  it("handles concurrent workers without duplicate candidates", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 20; i += 1) {
      ids.push(
        await insertNewSignal(pool, {
          headline: `Concurrent item ${i}`,
          url: `https://example.com/concurrent-${i}`,
        }),
      );
    }

    const beforeNew = await countSignalsByStatus(pool, "NEW");
    expect(beforeNew).toBeGreaterThanOrEqual(20);

    const results = await Promise.all([
      runNormalizationPipeline(pool, { batchSize: 5 }),
      runNormalizationPipeline(pool, { batchSize: 5 }),
      runNormalizationPipeline(pool, { batchSize: 5 }),
      runNormalizationPipeline(pool, { batchSize: 5 }),
    ]);

    const totalProcessed = results.reduce((sum, r) => sum + r.processed, 0);
    expect(totalProcessed).toBeGreaterThanOrEqual(20);
    expect(await countSignalsByStatus(pool, "NEW")).toBe(0);

    for (const signalId of ids) {
      const signal = await getSignal(pool, signalId);
      expect(signal?.status).toBe("NORMALIZED");

      const { rows } = await pool.query(
        "SELECT count(*)::int AS count FROM candidates WHERE signal_id = $1",
        [signalId],
      );
      expect(rows[0]?.count).toBe(1);
    }
  });

  it("rejects non-positive batch sizes at the pipeline layer", async () => {
    await expect(processNormalizationBatch(pool, 0)).rejects.toThrow(
      /positive integer/,
    );
  });
});
