# api/

The promotion endpoint: mobius-feed's side of the call into
`kaizencycle/epicon`'s attestation interface described in
[`../docs/task-1-epicon-attestation-interface.md`](../docs/task-1-epicon-attestation-interface.md)
(`POST /api/candidates/attest` on the `epicon-api` Render service).

This directory calls out to `kaizencycle/epicon` — it does not implement
Guard logic itself, and it does not seal or publish anything. It only
constructs the intent envelope for a `PROMOTED` candidate and records the
returned verdict.

Scaffold only this cycle — no implementation yet.
