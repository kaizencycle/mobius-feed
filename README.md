# mobius-feed

Feed observes. EPICON witnesses. Roadmaps explain. Nothing skips a layer,
and nothing in this repo decides what's true — it decides what's worth
someone else looking at.

mobius-feed is a sibling to `mobius-civic-ai-terminal`, not a mirror of it.
Terminal answers "how is Mobius doing?" for the operator. Feed answers
"what is happening in the world?" for the researcher/editor. Both are
renderers over the same canonical EPICON object — neither owns it.

```
Reality → mobius-feed (observe) → Candidate → kaizencycle/epicon (Guard/attest)
        → Attested EPICON → Civic Protocol Core (canon)
              ↓
     Terminal · Notion · Browser (renderers)
```

## Repo boundaries

```
DOES:                          DOES NOT:
✓ Poll sources                 ✗ Write Roadmaps
✓ Normalize                    ✗ Create Lessons
✓ Deduplicate                  ✗ Seal EPICON
✓ Persist candidates           ✗ Publish content
✓ Suggest patterns             ✗ Decide truth
✓ Queue reviews
✓ Promote to EPICON (via kaizencycle/epicon, not its own ledger)
```

If a PR against this repo does any item in the right-hand column, it's out
of scope for this repo.

## Source of truth

Architecture decision record maintained in Notion. Operational source of
truth for this repository. Canonical EPICON records remain governed by the
EPICON attestation pipeline (`kaizencycle/epicon` → Civic Protocol Core),
not by Notion.

[ADR-001 — mobius-feed Architecture](https://app.notion.com/p/3ae93f6e20a1813692a6c731e003468b)
(Notion, under Mobius Command Center) is where this repo's architecture
decisions are recorded. [`docs/ADR-001-reference.md`](docs/ADR-001-reference.md)
mirrors it for offline reading.

## Status

**PR-001** (C-390) resolved the three items blocking ADR-001 from Proposed →
Accepted, and scaffolded the repo:

1. [`docs/task-1-epicon-attestation-interface.md`](docs/task-1-epicon-attestation-interface.md) — kaizencycle/epicon attestation interface
2. [`docs/task-2-epicon-status-vocabulary.md`](docs/task-2-epicon-status-vocabulary.md) — EPICON status vocabulary mapping
3. [`docs/task-3-hosting-decision.md`](docs/task-3-hosting-decision.md) — hosting target

**PR-002** implements the canonical Signal and Candidate objects every
source adapter normalizes into, plus the Postgres schema behind them — see
[`docs/signal-lifecycle.md`](docs/signal-lifecycle.md) for the full chain,
and [`docs/lifecycle.md`](docs/lifecycle.md) for the state-machine diagram.

Items that couldn't be fully closed across either PR are tracked in
[`docs/open-questions.md`](docs/open-questions.md).

## Roadmap

```
PR-001  ADR + Scaffold                     ✅
PR-002  Canonical Signal + Candidate schema ✅
PR-003  RSS Source Adapters
PR-004  Normalization Pipeline            ✅
PR-005  Duplicate Detection
PR-006  Pattern Suggestion Engine
PR-007  Review Workflow
PR-008  EPICON Promotion API
PR-009  Feed Dashboard
```

No PR skips a layer.

## Layout

```
sources/          rss/, github/, sec/, nasa/, arxiv/ — poll adapters
normalizers/       raw source output → canonical Signal schema
classifiers/       embedding-based pattern-similarity scoring (separate ML component)
queue/             lifecycle state machine
review/            human/ATLAS/ZEUS review surface
db/                Postgres schema + migrations (implemented, PR-002)
api/                promotion endpoint → kaizencycle/epicon
workers/           poll/cron jobs (Render Background Workers)
docs/              design notes
schemas/           JSON Schemas — signal.schema.json, candidate.schema.json
```

`db/` and `schemas/` have real implementations as of PR-002. Everything
else is still scaffold — directory structure and a README, no functional
code. See each directory's README for status.
