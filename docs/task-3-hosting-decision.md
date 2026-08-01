# Task 3 — hosting target for mobius-feed (design note)

Status: **Confirmed** (for this cycle's scope — infrastructure is not
provisioned yet, this is the documented decision so it isn't silently
re-decided later, per the acceptance criteria).

## Decision

**Render Postgres + Render Background Worker(s).** No KV. No Vercel cron.

## Why Postgres, and why Render specifically

ADR-001 Decision 3 already settles the storage engine: a Postgres candidate
queue (`signals → candidates → reviews → promotions`), explicitly not KV,
not Notion, not Civic Protocol Core. What ADR-001 left open was *where*
that Postgres instance and its workers run. Render is the correct default
because it's already the platform of record for two adjacent, structurally
similar services in this same system, not because it's merely convenient:

1. **`mobius-mic-wallet-service`** already runs Postgres on Render — ADR-001
   cites this directly as precedent for consistency.
2. **`kaizencycle/epicon`** itself — confirmed by reading its `render.yaml`
   in this cycle — already runs its GitHub App webhook service
   (`epicon-github-webhook`, aka `epicon-api`) on Render as a `type: web`
   service with `healthCheckPath: /health`, zero extra runtime dependencies,
   binding `0.0.0.0:$PORT`. mobius-feed's promotion path
   ([Task 1](./task-1-epicon-attestation-interface.md)) calls directly into
   this service, so co-locating on the same platform means one fewer
   network hop between hosting providers, one fewer TLS/DNS surface to
   reason about, and shared operational tooling (Render dashboards, health
   checks, deploy hooks) across the two services that talk to each other
   most.

Introducing a third hosting provider for mobius-feed's own store would add
an operational surface with no matching benefit — nothing about mobius-feed's
workload (a candidate queue + scheduled polling) needs a capability Render
doesn't already provide for its siblings.

## Why not Vercel's cron model

Flagged explicitly in the handoff: Vercel's cron model is what caused the
C-354 Upstash bandwidth incident — frequent serverless cron invocations
each cold-starting and re-establishing connections drove unexpectedly high
bandwidth against Upstash. mobius-feed's `workers/` are exactly the same
shape of risk (`rss/, github/, sec/, nasa/, arxiv/` pollers, each running on
some interval) — the same failure mode would reproduce if these ran as
Vercel scheduled functions hitting a KV/Redis-fronted store on every
invocation.

Render avoids this because a **Background Worker** is a persistent process,
not a per-invocation cold start: a poller can hold a long-lived DB
connection (or a small connection pool) and sleep between polls internally,
rather than opening a fresh connection on every cron tick. This removes the
specific mechanism that caused C-354, not just the specific vendor.

## Proposed shape

- **Render Postgres** — a dedicated instance for mobius-feed, not a shared
  schema on the wallet-service's database. Isolation matters here: this
  store holds unreviewed, unattested candidate data (Tier 0/1) that must
  never be mistaken for anything in the wallet service's ledger-adjacent
  data, and the two services should be able to scale, back up, and be
  rotated independently.
- **Render Background Worker**, one per source family (or one worker
  process multiplexing `sources/{rss,github,sec,nasa,arxiv}/` internally,
  to be decided at implementation time — not a hosting-target question) —
  running its own internal scheduling (e.g. `node-cron` inside a long-lived
  process) rather than relying on Render's separate Cron Job product for
  every poll tick. Render Cron Jobs remain an acceptable fallback for any
  source with a genuinely coarse interval (e.g. daily), since a Cron Job on
  Render still runs a normal container process per invocation rather than
  a serverless function — same underlying mitigation, different scheduling
  primitive.
- **`api/` (promotion endpoint → kaizencycle/epicon)** — can run as part of
  the same Render web service that serves `review/`'s human review surface,
  or as its own small Render web service. Not decided in this cycle; low
  stakes either way since both options stay on Render.

## What this does not decide

This note fixes the *hosting provider and service shape*. It does not fix:
schema/column design for `signals/candidates/reviews/promotions` (Decision 3
names the tables, not the columns), exact poll intervals per source, or
whether workers are one-process-per-source or multiplexed. Those are
implementation details for whenever Task 4 scaffolding above the directory
level is actually built out.
