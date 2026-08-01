# api/

The promotion endpoint: mobius-feed's side of the call into
`kaizencycle/epicon`'s attestation interface described in
[`../docs/task-1-epicon-attestation-interface.md`](../docs/task-1-epicon-attestation-interface.md)
(`POST /api/candidates/attest` on the `epicon-api` Render service).

This directory calls out to `kaizencycle/epicon` — it does not implement
Guard logic itself, and it does not seal or publish anything. It constructs
the intent envelope for a `REVIEWED` candidate attempting promotion, calls
Guard, and records the returned verdict. The Guard call *is* the
`REVIEWED → PROMOTED` transition: only a `PASS`/`PASS_WITH_BACKFILL`
verdict moves the candidate to `PROMOTED` (see
[`../docs/lifecycle.md`](../docs/lifecycle.md)) — a candidate is never
`PROMOTED` before Guard has already returned that verdict.

Scaffold only this cycle — no implementation yet.
