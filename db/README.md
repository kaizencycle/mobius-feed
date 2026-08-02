# db/

Postgres schema + migrations for the candidate queue (ADR-001 Decision 3):

```
signals → candidates → reviews → promotions
```

Hosting target: Render Postgres, dedicated instance — see
[`../docs/task-3-hosting-decision.md`](../docs/task-3-hosting-decision.md).

## Migrations

Plain SQL in `migrations/`, applied in numeric order:

- `0001_signals.sql` — canonical Signal object.
- `0002_candidates.sql` — Candidate object, `updated_at` trigger.
- `0003_reviews.sql` — append-only review event log, enforced via
  `BEFORE UPDATE/DELETE` triggers, not caller discipline.
- `0004_promotions.sql` — append-only Guard-attestation attempt log, same
  enforcement.
- `0005_forbid_candidate_delete.sql` — `BEFORE DELETE` trigger on
  `candidates` so a `NORMALIZED` signal cannot be orphaned by row deletion.

Each has been applied against a real Postgres 16 instance and exercised
(constraint violations, append-only triggers, `updated_at` bump) as part of
PR-002 — not just written and assumed correct.

See [`../docs/signal-lifecycle.md`](../docs/signal-lifecycle.md) for the
full column-level rationale, the `hash` dedup spec, and how
`signals.status` and `candidates.review_state` relate.

Schema only this cycle — no ingestion, no workers, no business logic.
