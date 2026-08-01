# Candidate lifecycle

```
NEW → NORMALIZED → REVIEWED ─┬─→ PROMOTED → ATTESTED → ARCHIVED
                              ├─→ DISMISSED
                              └─→ ARCHIVED
```

This is the same fork as `queue/README.md` — kept identical on purpose so
the two docs can't drift again. `REVIEWED` is a single state reached either
way (approved or rejected); it forks from there:

- **Approved** → `PROMOTED` → `ATTESTED` → `ARCHIVED` — the happy path.
  `NEW → NORMALIZED → REVIEWED → PROMOTED` are mobius-feed's own queue
  states (`queue/`), backed by Postgres — matching the enum in
  `schemas/signal.schema.json` exactly. `ATTESTED` happens outside this
  repo, via `kaizencycle/epicon`'s Guard (see
  [`task-1-epicon-attestation-interface.md`](./task-1-epicon-attestation-interface.md))
  — mobius-feed submits, it does not attest. The `REVIEWED → PROMOTED`
  transition itself *is* the Guard call: an approved `REVIEWED` candidate is
  submitted for attestation, and only a Guard `PASS`/`PASS_WITH_BACKFILL`
  moves it to `PROMOTED` (see [`../api/README.md`](../api/README.md)).
- **Rejected** → `DISMISSED`, staying entirely in mobius-feed's own store —
  never reaches Notion, never calls Guard.
- **Reviewed but never promoted** → `ARCHIVED` directly from `REVIEWED`
  (e.g. approved but stale, or simply not acted on) — separate from the
  `ARCHIVED` that follows a completed `PROMOTED`/`ATTESTED` run. Both are
  the same terminal state; only the path there differs.

See [`../queue/README.md`](../queue/README.md) for the queue-level detail
behind each state.
