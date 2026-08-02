# ADR-001 — mobius-feed Architecture (reference mirror)

**Source of truth:** [ADR-001 — mobius-feed Architecture](https://app.notion.com/p/3ae93f6e20a1813692a6c731e003468b) (Notion, under [Mobius Command Center](https://app.notion.com/p/73d10503ebe642f3ae80dcdce18b936a))

This file is a point-in-time mirror for engineers working in this repo without
Notion open. If it and the Notion page ever disagree, **Notion wins** — update
this file, don't argue with it.

Mirrored as of 2026-08-01, ADR-001 status **Proposed**.

## Context

mobius-feed is a sibling to Terminal, not a mirror of it. Terminal's user is
the operator ("how is Mobius doing?"); Feed's user is the researcher/editor
("what is happening in the world?"). Both depend on the same canonical EPICON
object rather than either owning it — one source of truth, many renderers.

## Decision 1 — Reuse the existing EPICON implementation

Do not create a second EPICON ledger inside Civic Protocol Core.
`kaizencycle/epicon` (Guard + six invariants, I1–I6) already embodies the
EPICON model and is the ingestion/attestation service. Civic Protocol Core
remains the constitutional layer that consumes attested records, not a
parallel implementation.

```
Reality → mobius-feed → Candidate → kaizencycle/epicon (Guard) → Attested EPICON → Civic Protocol Core (canon)
```

Resolved this cycle by [Task 1](./task-1-epicon-attestation-interface.md).

## Decision 2 — Feed trust tiers

```
Tier 0 — Raw Signal
Tier 1 — Feed Candidate
Tier 2 — Reviewed EPICON (ATLAS + ZEUS + Human)
Tier 3 — Constitutionally Sealed (full 5-sentinel quorum: ATLAS, ZEUS, EVE, JADE, AUREA)
```

Roadmaps may be generated from Tier 2. Constitutional consequences require
Tier 3. Reconciled against the Notion `Draft/Attested/Disputed/Sealed` enum
this cycle by [Task 2](./task-2-epicon-status-vocabulary.md).

## Decision 3 — Candidate queue storage

Not KV, not Notion, not Civic Protocol Core. A lightweight Postgres store in
mobius-feed, matching the pattern used for `mobius-mic-wallet-service`
(Render):

```
signals → candidates → reviews → promotions
```

Hosting target confirmed this cycle by [Task 3](./task-3-hosting-decision.md).

## Decision 4 — Pattern classification is a separate concern

```
Signal → Normalization → Embedding → Pattern Suggestions → Review → EPICON
```

The classifier suggests; it does not assign. Schema carries
`candidate_patterns: [{name, confidence}]`, never a bare `pattern` field —
this preserves editorial judgment at the human/ATLAS review step. Producing
confidence-scored candidate patterns means Feed's normalize step runs actual
embedding-based similarity matching against the 15 Pattern definitions in the
Patterns database — a small ML component, budgeted separately from
`normalizers/` (see `classifiers/`).

## Repo boundaries

```
mobius-feed DOES:
✓ Poll sources  ✓ Normalize  ✓ Deduplicate
✓ Persist candidates  ✓ Suggest patterns
✓ Queue reviews  ✓ Promote to EPICON (via kaizencycle/epicon)

mobius-feed DOES NOT:
✗ Write Roadmaps  ✗ Create Lessons  ✗ Seal EPICON
✗ Publish content  ✗ Decide truth
```

## Signal schema (frozen, with provenance)

```json
{
  "signal_id": "...",
  "source": "NASA",
  "retrieved_at": "...",
  "published_at": "...",
  "normalizer_version": "1.0.0",
  "candidate_patterns": [
    {"name": "Technological Acceleration", "confidence": 0.41}
  ],
  "review_state": "NEW"
}
```

`normalizer_version` lets the classifier be re-run against historical signals
without losing original ingestion history. See `schemas/signal.schema.json`
for the versioned JSON Schema.

> **PR-002 addendum (not a change to the ADR text above, which mirrors
> Notion verbatim):** the sketch above predates the two-object split PR-002
> formalizes. `candidate_patterns` and `review_state` no longer live on the
> Signal object — they moved to a separate Candidate object. See
> [`signal-lifecycle.md`](./signal-lifecycle.md) for the current canonical
> shapes and why the split happened.

## Consequence

Once sealed, this ADR governs: mobius-feed does not implement its own EPICON
logic, does not touch KV, does not assign patterns unilaterally, and does not
write anywhere in the Roadmap → OAA → Pattern → School chain. It observes,
normalizes, and proposes — nothing more.

## Status

Proposed. Blocking items resolved this cycle (C-390):

1. `kaizencycle/epicon` attestation-API scope — [Task 1](./task-1-epicon-attestation-interface.md)
2. EPICON status vocabulary reconciliation — [Task 2](./task-2-epicon-status-vocabulary.md)
3. Hosting target for mobius-feed's Postgres + workers — [Task 3](./task-3-hosting-decision.md)

Items that could not be fully closed this cycle are carried forward in
[docs/open-questions.md](./open-questions.md), not silently dropped.
