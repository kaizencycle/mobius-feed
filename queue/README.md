# queue/

Candidate lifecycle state machine, backed by Render Postgres (see
`../docs/task-3-hosting-decision.md`):

```
NEW → NORMALIZED → REVIEWED ─┬─→ PROMOTED → ATTESTED* → ARCHIVED
                              ├─→ DISMISSED
                              └─→ ARCHIVED
```
*`ATTESTED` is not a queue state stored here — see below.

- `NEW` — signal ingested, not yet normalized.
- `NORMALIZED` — Signal shape assigned, candidate patterns scored.
- `REVIEWED` — human/ATLAS/ZEUS review surface (see `review/`) has reached
  a decision on the candidate: approve for a promotion attempt, or reject.
  Both outcomes pass through `REVIEWED` before branching — it records that
  review happened, not that it approved.
- `PROMOTED` — the outcome of `api/` submitting an *approved* `REVIEWED`
  candidate to `kaizencycle/epicon` for attestation (see
  `../docs/task-1-epicon-attestation-interface.md`) and Guard returning
  `PASS`/`PASS_WITH_BACKFILL`. Review approval (`REVIEWED`) plus Guard
  `PASS` together are what eventually becomes a Notion `Attested` row (see
  `../docs/task-2-epicon-status-vocabulary.md`) — a candidate is never
  `PROMOTED` before that Guard call has already returned.
- `DISMISSED` — review rejected the candidate at `REVIEWED`. Stays in
  mobius-feed's own store; never reaches Notion.
- `ARCHIVED` — retained for history, no further action expected. Reachable
  directly from `REVIEWED` (a reviewed candidate nobody promoted) as well
  as from further along the chain once `PROMOTED`/attested activity has
  concluded — see `../docs/lifecycle.md`, which shows both paths.

Scaffold only this cycle — no implementation yet.
