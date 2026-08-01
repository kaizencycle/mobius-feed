# Candidate lifecycle

```
NEW
  ↓
NORMALIZED
  ↓
REVIEWED
  ↓
PROMOTED
  ↓
ATTESTED
  ↓
ARCHIVED
```

`NEW → NORMALIZED → REVIEWED → PROMOTED` are mobius-feed's own queue states
(`queue/`), backed by Postgres — `REVIEWED` matches the enum in
`schemas/signal.schema.json` and `queue/README.md` exactly. `ATTESTED`
happens outside this repo, via `kaizencycle/epicon`'s Guard (see
[`task-1-epicon-attestation-interface.md`](./task-1-epicon-attestation-interface.md))
— mobius-feed submits, it does not attest. The `REVIEWED → PROMOTED`
transition itself *is* the Guard call: a `REVIEWED` candidate is submitted
for attestation, and only a Guard `PASS` moves it to `PROMOTED` (see
[`../api/README.md`](../api/README.md)). A candidate can also exit the
lifecycle early as `DISMISSED` (rejected at `REVIEWED`) instead of
continuing to `PROMOTED`; see [`../queue/README.md`](../queue/README.md)
for the full state machine including those branches.
