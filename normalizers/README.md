# normalizers/

Converts raw source-adapter output into the frozen Signal shape
(`schemas/signal.schema.json`). Versioned: each normalizer records a
`normalizer_version` on every Signal it produces, so the classifier can be
re-run against historical signals without losing original ingestion
history (ADR-001 Decision 4).

Normalizers do **not** run pattern classification — that's a separate,
budgeted concern in `classifiers/`. Keeping normalize/classify separate is
deliberate: folding embedding-based similarity scoring into "normalize" as
an afterthought was explicitly flagged against in the ADR-001 handoff.

## PR-004 — normalization pipeline

`pipeline.ts` claims `status = 'NEW'` signals (`FOR UPDATE SKIP LOCKED`),
cleans `headline`/`summary` text (`text.ts`), transitions each signal to
`NORMALIZED`, and inserts the matching `candidates` row in one transaction.
See `docs/signal-lifecycle.md` §8.

Run via `pnpm normalize` (or `workers/normalize.ts`).
