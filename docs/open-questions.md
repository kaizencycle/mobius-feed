# Open questions carried forward from C-390

Per the C-390 acceptance criteria: items Tasks 1–3 couldn't fully close this
cycle, tracked explicitly rather than dropped. Each links back to the design
note that raised it.

## From Task 1 — attestation interface

1. **`feed` scope addition.** `packages/guard-core/src/intent.mjs`'s
   `VALID_SCOPES` has no entry for Feed candidates today
   (`docs | ci | core | infra | sentinels | labs | specs`). Proposal: add
   `feed` as an additive policy config change (not an invariant change).
   Needs sign-off from whoever owns Guard's policy config on
   `kaizencycle/epicon`.
   → [task-1-epicon-attestation-interface.md](./task-1-epicon-attestation-interface.md)
2. **`ledger_id` service-identity convention.** Today `ledger_id` names a
   GitHub actor (human or bot). A service caller (mobius-feed) needs its own
   identity convention, proposed as `svc:mobius-feed`. This is a
   ledger-identity/governance decision, not something mobius-feed can set
   unilaterally.
   → [task-1-epicon-attestation-interface.md](./task-1-epicon-attestation-interface.md)
3. **I2 state storage wiring.** The PR flow diffs against GitHub check-run
   history; a non-PR caller has no check-run history. Proposed: mobius-feed
   stores the last-known `justification_hash` per `epicon_id` prefix in its
   own `candidates` table and passes it as `prior_justification_hash` on
   each attestation call, reusing `compareIntentMutation` from
   `guard-core` as-is. Needs review by whoever implements the endpoint on
   `kaizencycle/epicon`.
   → [task-1-epicon-attestation-interface.md](./task-1-epicon-attestation-interface.md)
4. **Auth mechanism finalization.** Proposed a new `EPICON_API_TOKEN`
   bearer secret, distinct from `GITHUB_WEBHOOK_SECRET`. Not yet
   provisioned; needs a decision owner on the `kaizencycle/epicon` side
   before implementation.
   → [task-1-epicon-attestation-interface.md](./task-1-epicon-attestation-interface.md)

## From Task 2 — status vocabulary

5. **`Draft` definition confirmation.** Proposed that `Draft` describes
   EPICONs authored directly in Notion outside the Feed pipeline (since
   mobius-feed's own promotions only ever land as `Attested`). This is a
   proposal about a status mobius-feed doesn't write — needs confirmation
   from whoever owns the Notion EPICON database.
   → [task-2-epicon-status-vocabulary.md](./task-2-epicon-status-vocabulary.md)
6. **`Disputed` definition confirmation.** Proposed as a post-hoc contest of
   an already-`Attested`/`Sealed` row, not a same-cycle rejection of a
   Tier 1 candidate (which stays mobius-feed-internal as `DISMISSED` and
   never reaches Notion). This reframes the handoff's own tentative guess
   and needs explicit confirmation, not silent adoption, from ATLAS or
   whoever governs EPICON status transitions.
   → [task-2-epicon-status-vocabulary.md](./task-2-epicon-status-vocabulary.md)
7. **Who/what writes the Notion row.** mobius-feed does not write Notion
   directly (repo boundary: `✗ Publish content`). This mapping assumes some
   existing canon→Notion sync process performs the actual write once
   `kaizencycle/epicon` attests and Civic Protocol Core admits the record.
   That sync process wasn't verified in this cycle (out of scope repos) —
   worth confirming it exists and handles the tier transitions above
   correctly.
   → [task-2-epicon-status-vocabulary.md](./task-2-epicon-status-vocabulary.md)

## From Task 3 — hosting

8. ~~**Column-level schema for `signals/candidates/reviews/promotions`.**~~
   **Resolved in PR-002** — see
   [signal-lifecycle.md](./signal-lifecycle.md) and `db/migrations/`.
9. **One worker process per source vs. multiplexed.** Hosting shape
   (Render Background Worker) is confirmed; whether that's one worker per
   `sources/*` adapter or a single process handling all of them is an
   implementation detail, not a hosting decision, and wasn't resolved here.
   → [task-3-hosting-decision.md](./task-3-hosting-decision.md)

## From PR-002 — canonical Signal + Candidate schema

10. **Hash collision policy for updated content at a stable URL.** The
    `hash` dedup key (`source_type|source|url`) treats new activity at an
    already-seen URL (e.g. a GitHub PR gaining commits after its first
    signal) as a duplicate. Whether that's correct is source-specific;
    belongs to PR-003 (source adapters) and PR-005 (Duplicate Detection),
    not decided here.
    → [signal-lifecycle.md](./signal-lifecycle.md)
11. **Review consensus rule.** `reviews` is an append-only log of individual
    ATLAS/ZEUS/Human decisions; nothing in PR-002 computes a consensus rule
    across them (e.g. does promotion require all three to `APPROVE`, or a
    subset). Belongs to PR-007 Review Workflow.
    → [signal-lifecycle.md](./signal-lifecycle.md)

## Not yet started

- `api/`, `workers/`, `normalizers/`, `classifiers/`, `review/` are
  directory scaffolds with README placeholders only — no functional code
  yet. `db/` now has real migrations (PR-002); ingestion, normalization,
  classification, review UI, and the promotion API itself remain future
  PRs per the roadmap in `README.md`.
