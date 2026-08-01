# Task 2 — EPICON status vocabulary mapping (design note)

Status: **Proposed**. Reconciles the Notion EPICON database's `Status`
select field (`Draft / Attested / Disputed / Sealed`, confirmed by fetching
the live database schema this cycle) against ADR-001 Decision 2's four-tier
model.

## The two vocabularies

**Notion `EPICON` database** — `Status` select, four options:
`Draft` (gray) → `Attested` (blue) → `Disputed` (red) → `Sealed` (green).

**ADR-001 Decision 2** — four tiers:

```
Tier 0 — Raw Signal
Tier 1 — Feed Candidate
Tier 2 — Reviewed EPICON (ATLAS + ZEUS + Human)
Tier 3 — Constitutionally Sealed (ATLAS, ZEUS, EVE, JADE, AUREA quorum)
```

## Why they don't map 1:1

The Notion enum predates the tier model (built in the Canonical Objects v2
PR) and describes a *lifecycle within Notion*, not a *trust tier*. The tier
model additionally describes two states — Tier 0 and Tier 1 — that live
entirely in mobius-feed's own Postgres store and **never produce a Notion
row at all**. So the Notion enum only ever needs to describe what happens to
an EPICON *after* it clears Tier 1 — which is a smaller mapping problem than
"four states to four tiers," and closer to "two tiers, plus two lifecycle
states neither of which mobius-feed causes to exist."

## Proposed mapping

| Notion `Status` | Tier | mobius-feed involvement |
|---|---|---|
| — (no row exists) | Tier 0 — Raw Signal | Lives in `signals` table only. |
| — (no row exists) | Tier 1 — Feed Candidate | Lives in `candidates` table only, through mobius-feed's own `NEW → NORMALIZED → REVIEWED` states. Never written to Notion. |
| `Attested` | Tier 2 — Reviewed EPICON | Written when mobius-feed's `queue` reaches `PROMOTED` **and** the [Task 1](./task-1-epicon-attestation-interface.md) Guard verdict is `PASS`/`PASS_WITH_BACKFILL` **and** the human/ATLAS/ZEUS review step has separately signed off. All three, not just Guard's structural check — see "What Guard's PASS does and doesn't mean" below. |
| `Sealed` | Tier 3 — Constitutionally Sealed | Full 5-sentinel quorum (ATLAS, ZEUS, EVE, JADE, AUREA). mobius-feed never causes this transition — it is out of repo boundary (`✗ Seal EPICON`) and happens entirely within Civic Protocol Core / the sentinel quorum process. |
| `Draft` | *Not a Feed-originated state* | See below — proposed to mean an EPICON entered directly in Notion (hand-authored, not via mobius-feed) awaiting Tier 2 review. |
| `Disputed` | *Post-Attestation contest, not a rejection* | See below — this is the one the handoff flagged as needing an explicit, not assumed, definition. |

## What Guard's PASS does and doesn't mean

This is the load-bearing distinction for the mapping above. The
[Task 1](./task-1-epicon-attestation-interface.md) attestation endpoint
returns a structural verdict (invariants I1–I6 satisfied) — it says the
candidate's intent envelope is *well-formed*, not that ATLAS/ZEUS/a human
have *agreed with its claim*. ADR-001 Decision 2 defines Tier 2 as requiring
all three (ATLAS + ZEUS + Human). So:

- A candidate can pass Guard structurally and still sit in mobius-feed's
  `review/` surface pending ATLAS/ZEUS/Human sign-off — that candidate is
  Tier 1, not yet Tier 2, and does not exist in Notion yet.
- Only once *both* Guard PASS and the review consensus are satisfied does
  mobius-feed call `PROMOTED`, and only `PROMOTED` candidates get written
  through to a Notion `Attested` row (via `kaizencycle/epicon` → Civic
  Protocol Core → whatever syncs canon into Notion — mobius-feed does not
  write Notion directly, consistent with the repo boundary against
  publishing content).

## `Draft` — proposed definition

**Proposed: `Draft` is not a state mobius-feed ever produces.** Since
Tier 0/1 never reach Notion, and mobius-feed's own promotion path only
fires after Tier 2 criteria are already satisfied, any Notion row
mobius-feed is responsible for starts its life as `Attested`, never
`Draft`. `Draft` is left to describe EPICONs authored directly in Notion by
a human or ATLAS outside the Feed pipeline entirely (e.g., a claim written
straight into the database before going through any review) — a path this
ADR doesn't otherwise touch. **This needs confirmation from whoever owns
the Notion EPICON database**, since mobius-feed can describe what it does
and doesn't produce, but can't unilaterally define a status it never
writes.

## `Disputed` — proposed definition (explicit, not assumed)

The handoff's tentative guess was "a Tier 2 candidate a human rejected."
Reading the tier model closely, that guess conflates two different things:

- A Tier 1 candidate a human/ATLAS/ZEUS **rejects during review** never
  reaches Notion at all — it's mobius-feed's own `DISMISSED` queue state,
  fully contained in mobius-feed's Postgres store. There is no reason for
  this to need a Notion status, since no Notion row exists yet to hold one.
- **Proposed instead:** `Disputed` describes an EPICON that already reached
  `Attested` (Tier 2) — or in principle even `Sealed` (Tier 3) — and is
  *subsequently* formally contested: new counter-evidence surfaces, a
  reviewer challenges the claim's standing after the fact, etc. It's a
  post-hoc challenge to something that already had standing, not a
  same-cycle rejection of something that never did.

This distinction matters because it changes what "moving to Disputed" 
implies operationally: rejecting a Tier 1 candidate is routine, silent
housekeeping inside mobius-feed; disputing an Attested or Sealed EPICON is
a visible, consequential event that presumably needs its own review trail
(who disputed it, on what grounds) — closer in weight to sealing than to
ordinary review rejection. **This is a proposal, not a ruling** — flagged
explicitly for confirmation rather than silently assumed, per the handoff's
instruction, and carried forward in
[open-questions.md](./open-questions.md).

## Summary table (mapping only)

| | Tier 0 | Tier 1 | Tier 2 | Tier 3 |
|---|---|---|---|---|
| Notion Status | *(none)* | *(none)* | `Attested` | `Sealed` |
| Also maps to | | | `Draft` (non-Feed origin, proposed) | |
| Cross-cutting | | | `Disputed` = post-hoc contest of an already-Attested or -Sealed row (proposed) | |
