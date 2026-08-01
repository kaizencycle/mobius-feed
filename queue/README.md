# queue/

Candidate lifecycle state machine, backed by Render Postgres (see
`../docs/task-3-hosting-decision.md`):

```
NEW → NORMALIZED → REVIEWED → PROMOTED / DISMISSED / ARCHIVED
```

- `NEW` — signal ingested, not yet normalized.
- `NORMALIZED` — Signal shape assigned, candidate patterns scored.
- `REVIEWED` — human/ATLAS/ZEUS review surface (see `review/`) has acted.
- `PROMOTED` — sent to `kaizencycle/epicon` for attestation (see `api/` and
  `../docs/task-1-epicon-attestation-interface.md`); on Guard PASS +
  review consensus this is what eventually becomes a Notion `Attested` row
  (see `../docs/task-2-epicon-status-vocabulary.md`).
- `DISMISSED` — rejected during review. Stays in mobius-feed's own store;
  never reaches Notion.
- `ARCHIVED` — retained for history, no further action expected.

Scaffold only this cycle — no implementation yet.
