# Signal lifecycle (PR-002)

Status: **Implemented** (schema only — no ingestion, no workers, no business
logic; see "Out of scope" below). This is PR-002 in the roadmap: it defines
the canonical Signal and Candidate objects every future source adapter
normalizes into. Architecture is frozen per PR-001/ADR-001 — this PR
implements it, it does not redesign it.

```
Reality → Signal → Candidate → Review → Promotion → EPICON
```

- **Signal** — a raw observation. What was seen, where, when. No
  interpretation.
- **Candidate** — the reviewable unit. Created 1:1 from a Signal once
  normalized. Carries pattern *suggestions*, never assignments.
- **Review** — ATLAS/ZEUS/Human decide whether a candidate is worth
  promoting. Append-only event log.
- **Promotion** — mobius-feed submits an approved candidate to
  `kaizencycle/epicon`'s Guard
  ([task-1-epicon-attestation-interface.md](./task-1-epicon-attestation-interface.md)).
  Append-only log of every attempt and its verdict.
- **EPICON** — the attested record, outside this repo. mobius-feed submits;
  it does not attest, seal, or publish (repo boundaries, unchanged from
  PR-001).

## 1. Canonical Signal object

`schemas/signal.schema.json` / `db/migrations/0001_signals.sql`.

| Field | Notes |
|---|---|
| `signal_id` | uuid PK. |
| `source` | Specific origin within `source_type` — a named feed, a tracked repo, a CIK/ticker. |
| `source_type` | Adapter family: `rss \| github \| sec \| nasa \| arxiv`, matching `sources/*`. Not DB-constrained to this list (new adapters shouldn't need a migration to add a value); documented here as the current set. |
| `headline` | Required. |
| `summary` | Optional. |
| `url` | Required — canonical link, and part of the dedup hash (§2). |
| `published_at` | Source's own timestamp. |
| `retrieved_at` | When mobius-feed polled it. |
| `hash` | Dedup key — see §2 for the exact spec. A generated column (`GENERATED ALWAYS AS ... STORED`), computed by Postgres from `source_type`/`source`/`url` at write time — not accepted as caller-supplied text, so it can never drift from the inputs it claims to represent. |
| `normalizer_version` | Version of the *specific adapter* that produced this row. |
| `schema_version` | Version of *this canonical schema*, distinct from `normalizer_version` — bumped when the Signal table shape itself changes, not when a source's parsing logic changes. Lets historical rows self-declare which schema revision wrote them. |
| `status` | `NEW \| NORMALIZED` only — see §3. One-way in practice: a `BEFORE UPDATE` trigger (`enforce_signal_status_forward()`) rejects any attempt to move a row back from `NORMALIZED` to `NEW`. The same trigger also freezes `source_type`/`source`/`url` once `NORMALIZED` — those three fields back the generated `hash` above, so allowing them to keep changing after normalization would silently change a signal's dedup identity out from under it. |
| `created_at` | Row creation time. |

Deliberately small. No `candidate_patterns`, no `review_state` on this
object — those live on Candidate (§ below). This is a change from the
Signal shape PR-001 mirrored from ADR-001's original single-object sketch,
which combined observation and review data on one object because ADR-001
predates the two-table split this PR formalizes. `schemas/signal.schema.json`
has been updated accordingly (now `version: 2.0.0`); nothing in
`docs/ADR-001-reference.md` was edited, since that file mirrors Notion
verbatim — it now carries a short addendum pointing here instead.

## 2. Hash — the dedup key, defined exactly

**`hash = SHA-256(SHA-256(source_type) || SHA-256(source) || SHA-256(url))`**,
where `||` is raw byte concatenation of the three inner 32-byte digests
(not their hex strings), and the outer `SHA-256` result is hex-encoded into
the `hash` column. No normalization (no case-folding, no trimming) beyond
what the normalizer already applies when populating `source_type`,
`source`, and `url`.

An earlier version of this spec joined the three fields with a literal
`"|"` delimiter before hashing them — flagged during review as ambiguous:
since `url` values can themselves contain a `|`, `source="a", url="b|c"`
and `source="a|b", url="c"` would hash identically, silently colliding two
distinct signals. Hashing each field independently first, then
concatenating only the fixed-length 32-byte digests, removes the ambiguity
entirely: no split of the three inputs can produce the same triple of
inner digests unless the field values were actually identical, since each
inner digest's length no longer depends on its input's content.

Deliberately **excludes** `headline` and `published_at`:

- A source correcting a typo in its headline, or re-emitting the same item
  with a slightly different timestamp, should not mint a new Signal for the
  same underlying observation. Including either field in the hash would
  make dedup miss real duplicates on exactly the inputs most likely to
  wobble between polls.
- `url` is the closest thing to a stable natural key available across all
  five source families in `sources/`: RSS entries, GitHub events, SEC
  filings, NASA releases, and arXiv listings all normalize to a canonical
  link.

**Known open edge case, carried forward rather than silently decided:**
some sources can legitimately produce *new* content at an *existing* URL
(e.g. a GitHub PR gaining new commits/comments after its first signal was
recorded). Under this hash spec, that re-poll would hash identically to
the first observation and register as a duplicate. Whether that's correct
(the PR is "one signal" regardless of activity) or wrong (new activity is
a new signal) is source-specific and belongs to PR-003 (RSS/source
adapters) and PR-005 (Duplicate Detection) to resolve per adapter — not
decided here, since resolving it requires adapter-level knowledge this
schema-only PR doesn't have. This schema only fixes what the hash *is*;
what happens on a collision (reject, merge, flag) is explicitly PR-005's
job, which is why `signals.hash` is indexed but not `UNIQUE` (see
`0001_signals.sql`).

## 3. `Signal.status` vs `Candidate.review_state` — resolved, not assumed

These are **two different state machines**, split at one intentional
handoff point, not the same field duplicated across two tables:

- **`Signal.status`** covers only `NEW → NORMALIZED`. Once a signal reaches
  `NORMALIZED`, its status is frozen forever — the Signal's job (observe,
  normalize) is done. It never becomes `REVIEWED`, `PROMOTED`, etc. itself.
- **`Candidate.review_state`** covers `NORMALIZED → REVIEWED → PROMOTED /
  DISMISSED / ARCHIVED`. A Candidate is created the moment its parent
  Signal reaches `NORMALIZED`, and its `review_state` **starts** at
  `NORMALIZED` — the same word, deliberately — because at the instant of
  creation nothing has happened to the candidate yet beyond what already
  happened to the signal. From that shared starting point, `review_state`
  evolves independently; `Signal.status` never changes again.

Why reuse the word `NORMALIZED` instead of inventing a new "awaiting
review" state name: ADR-001's original lifecycle text is a single chain,
`NEW → NORMALIZED → REVIEWED → PROMOTED/DISMISSED/ARCHIVED`, with no named
state between `NORMALIZED` and `REVIEWED`. Splitting that chain across two
tables without inventing a new word means the join point has to carry the
same name on both sides. The alternative (a new state like `PENDING`) would
be introducing a state ADR-001 never named, which is exactly the kind of
inline architecture decision this PR is supposed to avoid making.

Concretely: `signals.status` and `candidates.review_state` are never read
as if they were the same column. Anything that needs "where is this
observation in its lifecycle" for a candidate reads
`candidates.review_state`; `signals.status` only answers "has this
produced a candidate yet."

**Enforcing the handoff without a deadlock.** The 1:1 handoff is a
bidirectional invariant — a candidate must not exist for a non-`NORMALIZED`
signal, *and* a signal must not be `NORMALIZED` without a candidate — but
enforcing both halves as ordinary (immediate) triggers is impossible: the
candidate-side check requires the signal to already be `NORMALIZED` before
the candidate can be inserted, while the signal-side check would require
the candidate to already exist before the signal can become `NORMALIZED`.
Neither side can legally go first. Both checks are therefore
`DEFERRABLE INITIALLY DEFERRED` constraint triggers
(`enforce_candidate_signal_normalized()` on `candidates`,
`enforce_signal_normalized_requires_candidate()` on `signals`), which
Postgres only evaluates at transaction commit — a single transaction can
write the signal and its candidate in either order, and only the final,
post-commit state has to satisfy both invariants together. Verified
against Postgres 16: both orderings (normalize-then-create-candidate,
create-candidate-then-normalize) commit successfully within one
transaction; normalizing without ever creating a candidate, or creating a
candidate for a signal that never gets normalized in the same transaction,
both fail at commit.

## 4. Candidate object

`schemas/candidate.schema.json` / `db/migrations/0002_candidates.sql`.

| Field | Notes |
|---|---|
| `candidate_id` | uuid PK. |
| `signal_id` | FK to `signals`, `UNIQUE` — one candidate per signal, and immutable once set (`enforce_candidate_signal_id_immutable()`, an ordinary `BEFORE UPDATE` trigger — repointing to a different signal isn't a documented operation and would silently orphan the original). The FK alone only guarantees the parent row exists, not that it's `NORMALIZED`; that's checked by `enforce_candidate_signal_normalized()`, a *deferred* constraint trigger — see §3's "Enforcing the handoff without a deadlock" for why it can't be an ordinary immediate trigger. |
| `review_state` | See §3. |
| `candidate_patterns` | Scored list, `[{"name", "confidence"}]` — **never** a bare `pattern` field. Enforced at the DB level by `candidate_patterns_valid()`, which checks the *full* shape (array of objects, each with exactly a string `name` and a `confidence` in `[0,1]`, no other keys) — not just top-level array-ness, so a bare string, an empty object, an out-of-range score, or an extra key is rejected too, matching `schemas/candidate.schema.json`'s `additionalProperties: false` exactly, not just its required fields. |
| `confidence` | Denormalized top-line score (e.g. the best `candidate_patterns` entry), kept only for review-surface sorting/filtering. `candidate_patterns` stays authoritative — this is a projection of it, not an independent judgment. |
| `review_owner`, `review_notes` | Current-state snapshot, denormalized for fast reads without joining `reviews`. `reviews` (§5) is the authoritative history. |
| `created_at`, `updated_at` | `updated_at` is trigger-maintained (`set_updated_at()`), bumped on every mutation. |

## 5. Postgres schema — `signals → candidates → reviews → promotions`

Migrations: `db/migrations/0001_signals.sql` through `0004_promotions.sql`,
plain SQL, framework-agnostic (no migration tool chosen yet — deliberately,
so this doesn't lock a future PR into a specific tool before one's needed).
Apply in numeric order; each has been run against a real Postgres 16
instance as part of this PR (not just written and assumed correct).

`reviews` and `promotions` are **append-only**, enforced structurally, not
by convention: both tables have `BEFORE UPDATE` and `BEFORE DELETE`
triggers (`forbid_mutation()`) that raise an exception on any attempt to
mutate a row. This is the direct fix for the failure mode the handoff
flagged from C-376/C-377 — concurrent writers overwriting shared "current
state" — applied here before it can recur, not left to reviewer discipline
to catch in every future PR that touches these tables.

- **`reviews`** — one row per reviewer decision (`APPROVE`/`REJECT`) on a
  candidate. ATLAS, ZEUS, and Human can each leave their own row; nothing
  in this PR computes a consensus rule across them (business logic, out of
  scope — see PR-007 Review Workflow).
- **`promotions`** — one row per call to `kaizencycle/epicon`'s Guard,
  recording `guard_status` (`PASS \| PASS_WITH_BACKFILL \| QUARANTINE \|
  FAIL_CLOSED`, matching Guard's actual vocabulary exactly — confirmed
  against `packages/guard-core/src/index.mjs` in PR-001, not guessed),
  `guard_tier`, `epicon_id`, `justification_hash`, and the full raw verdict
  payload for audit. A candidate can have multiple rows here (e.g. an
  early `QUARANTINE` followed by a later `PASS`); `candidates.review_state
  = 'PROMOTED'` is the denormalized "did it ever succeed" marker, this
  table is the full attempt history.

`candidates` is the one table with a mutable "current state" column
(`review_state`), matching the handoff's instruction that only
`reviews`/`promotions` need to be append-only — `signals` and `candidates`
are ordinary entity tables with a status column that updates in place.

## 6. Lifecycle enum — three terminal branches, not collapsed

Per the handoff: `REVIEWED → PROMOTED / DISMISSED / ARCHIVED` is
implemented as a genuine three-way fork (see `0002_candidates.sql`'s CHECK
constraint), matching PR-001's `queue/README.md` and `docs/lifecycle.md`
exactly. `DISMISSED` (a human/ATLAS/ZEUS rejection) and `ARCHIVED` (retained
history, no pending action) are kept distinct — no written justification
for collapsing them was found or needed, so they aren't collapsed.

## 7. Provenance

Every Signal carries `hash`, `retrieved_at`, `published_at`,
`normalizer_version`, and `schema_version` unconditionally (all `NOT NULL`
in `0001_signals.sql`). Every Promotion carries the full raw Guard verdict
(`response_raw jsonb`). Together these mean a future classifier or a future
Guard-integration change can be replayed against historical rows without
losing the original ingestion or attestation record.

## 8. Normalization pipeline (PR-004)

PR-004 bridges source adapters (PR-003) and review (PR-007): it performs
the `NEW → NORMALIZED` transition on `signals.status` and creates the
1:1 `candidates` row that transition requires. Implementation lives in
`normalizers/` (`pipeline.ts`, `text.ts`) and is invoked by
`workers/normalize.ts`.

### No content-based filtering

`Signal.status` has only two values (`NEW`, `NORMALIZED`). There is no
`REJECTED` or `INVALID` terminal state for signals that were inspected and
discarded. If this pipeline filtered out "junk" (empty headline, broken
URL, obvious spam), those rows would sit at `NEW` forever with no formal
record of why.

**Decision (PR-004):** every Signal at `status = 'NEW'` is normalized and
gets exactly one Candidate row. No content judgment happens here. Whether
a candidate is worth anything belongs to review (PR-007) or duplicate
detection (PR-005), where `DISMISSED` is already a terminal state with a
reason attached. Adding signal-level rejection would require a new ADR
addendum (probably a new `Signal.status` value), not a quiet mid-PR
exception.

### Selection and concurrency

Workers claim work with:

```sql
SELECT signal_id, headline, summary
FROM signals
WHERE status = 'NEW'
ORDER BY created_at
LIMIT $batch_size
FOR UPDATE SKIP LOCKED
```

`FOR UPDATE SKIP LOCKED` lets multiple workers (or retries after partial
failure) run safely: each row is locked to one transaction at a time, and
contending workers skip rows already claimed rather than blocking. This
prevents two processes from racing on the `candidates.signal_id` unique
constraint from PR-002.

### Text normalization (mechanical only)

For each claimed row, before the state transition:

- Strip HTML tags from `headline` and `summary` (RSS feeds regularly leak
  markup).
- Collapse whitespace and ensure valid UTF-8.
- Cap `summary` length at `MAX_SUMMARY_LENGTH` (5000 characters, defined in
  `sources/rss/constants.ts` — the same constant PR-003 RSS adapters use
  when inserting signals).

No language detection, scoring, or classification.

### Transaction boundary

Within the same database transaction as the `SELECT ... FOR UPDATE SKIP
LOCKED` claim, for each claimed Signal:

1. `UPDATE signals SET headline = ..., summary = ..., status = 'NORMALIZED'
   WHERE signal_id = ... AND status = 'NEW'`
2. `INSERT INTO candidates (signal_id, review_state, candidate_patterns)
   VALUES (..., 'NORMALIZED', '[]')`

Both steps commit together. A crash between them must not leave a
`NORMALIZED` Signal without a Candidate — PR-002's deferred
`enforce_signal_normalized_requires_candidate()` trigger exists to prevent
that orphan state at commit time, and this pipeline relies on atomic
transactions rather than reintroducing it. Candidate deletion is also
forbidden (`0005_forbid_candidate_delete.sql`) so the invariant cannot be
broken from the delete side either; lifecycle changes use
`review_state` instead.

### Idempotency

Re-running the pipeline is safe: `WHERE status = 'NEW'` never re-selects
rows already `NORMALIZED`. `Signal.status` is one-way (enforced by
`enforce_signal_status_forward()`), so idempotency is structural, not
best-effort.

## Out of scope (unchanged from the handoff — flagging, not doing)

RSS/GitHub/NASA/SEC/arXiv polling (PR-003), AI embeddings and the pattern
classifier (PR-006), review UI (PR-007), frontend, the actual EPICON
promotion API implementation (PR-008, only designed in PR-001's Task 1),
Notion integration. Nothing in this PR ingests, classifies, reviews, or
promotes anything — it only defines the shapes those future PRs will read
and write.

## Carried forward

- Hash collision policy for legitimately-updated content at a stable URL
  (§2) — belongs to PR-003/PR-005, not decided here.
- Review consensus rule across multiple `reviews` rows (does ATLAS + ZEUS +
  Human all have to `APPROVE`, and in what order?) — belongs to PR-007
  Review Workflow. This PR only provides the append-only log to record
  each decision into.
- Everything already carried forward in
  [open-questions.md](./open-questions.md) from PR-001 remains open except
  item 8 (column-level schema), which this PR resolves.
