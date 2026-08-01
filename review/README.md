# review/

Human/ATLAS/ZEUS review surface. This is where a `NORMALIZED` candidate
gets the review-consensus half of Tier 2 (ADR-001 Decision 2) — the half
that `kaizencycle/epicon`'s Guard attestation ([Task 1](../docs/task-1-epicon-attestation-interface.md))
does not and cannot provide, since Guard only checks structural validity of
the intent envelope, not agreement with the underlying claim.

mobius-feed does not decide truth here — this surface queues candidates for
someone (or something) with actual review authority to act on. Its output
is a `REVIEWED` queue transition, not a publication.

Scaffold only this cycle — no implementation yet.
