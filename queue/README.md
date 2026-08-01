# queue/

Candidate lifecycle state machine, backed by Render Postgres (see
`../docs/task-3-hosting-decision.md`):

```
NEW → NORMALIZED → REVIEWED → PROMOTED / DISMISSED / ARCHIVED
```

- `NEW` — signal ingested, not yet normalized.
- `NORMALIZED` — Signal shape assigned, candidate patterns scored.
- `REVIEWED` — human/ATLAS/ZEUS review surface (see `review/`) has acted
  and approved the candidate for a promotion attempt.
- `PROMOTED` — the outcome of `api/` submitting a `REVIEWED` candidate to
  `kaizencycle/epicon` for attestation (see
  `../docs/task-1-epicon-attestation-interface.md`) and Guard returning
  `PASS`/`PASS_WITH_BACKFILL`. Review consensus (`REVIEWED`) plus Guard
  `PASS` together are what eventually becomes a Notion `Attested` row (see
  `../docs/task-2-epicon-status-vocabulary.md`) — a candidate is never
  `PROMOTED` before that Guard call has already returned.
- `DISMISSED` — rejected during review. Stays in mobius-feed's own store;
  never reaches Notion.
- `ARCHIVED` — retained for history, no further action expected.

Scaffold only this cycle — no implementation yet.
