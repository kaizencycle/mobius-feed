# Candidate lifecycle

```
NEW
  ↓
NORMALIZED
  ↓
REVIEW
  ↓
PROMOTED
  ↓
ATTESTED
  ↓
ARCHIVED
```

`NEW → NORMALIZED → REVIEW → PROMOTED` are mobius-feed's own queue states
(`queue/`), backed by Postgres. `ATTESTED` happens outside this repo, via
`kaizencycle/epicon`'s Guard (see
[`task-1-epicon-attestation-interface.md`](./task-1-epicon-attestation-interface.md))
— mobius-feed submits, it does not attest. A candidate can also exit the
lifecycle early as `DISMISSED` (rejected at `REVIEW`) instead of continuing
to `PROMOTED`; see [`../queue/README.md`](../queue/README.md) for the full
state machine including those branches.
