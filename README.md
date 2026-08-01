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

## Status (cycle C-390)

ADR-001 is Proposed, blocked on three items — resolved this cycle:

1. [`docs/task-1-epicon-attestation-interface.md`](docs/task-1-epicon-attestation-interface.md) — kaizencycle/epicon attestation interface
2. [`docs/task-2-epicon-status-vocabulary.md`](docs/task-2-epicon-status-vocabulary.md) — EPICON status vocabulary mapping
3. [`docs/task-3-hosting-decision.md`](docs/task-3-hosting-decision.md) — hosting target

See [`docs/lifecycle.md`](docs/lifecycle.md) for the candidate state machine
end to end, from `NEW` through `ATTESTED`.

Items that couldn't be fully closed this cycle are tracked in
[`docs/open-questions.md`](docs/open-questions.md).

## Layout

```
sources/          rss/, github/, sec/, nasa/, arxiv/ — poll adapters
normalizers/       raw source output → frozen Signal schema
classifiers/       embedding-based pattern-similarity scoring (separate ML component)
queue/             lifecycle state machine
review/            human/ATLAS/ZEUS review surface
db/                Postgres schema + migrations
api/                promotion endpoint → kaizencycle/epicon
workers/           poll/cron jobs (Render Background Workers)
docs/              design notes
schemas/           JSON Schemas (frozen per ADR-001)
```

This cycle is scaffold-only: directory structure and design notes, no
functional implementation. See each directory's README for status.
