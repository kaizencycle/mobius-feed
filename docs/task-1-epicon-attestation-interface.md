# Task 1 — kaizencycle/epicon attestation interface (design note)

Status: **Proposed**. This is a design note, not an implementation — no code
in `kaizencycle/epicon` is changed by this cycle. It exists to unblock
ADR-001 Decision 1.

## What exists today (read directly from `kaizencycle/epicon`, not assumed)

Two separate surfaces currently validate EPICON intent, and neither is a
general-purpose attestation API:

1. **GitHub Action** (`action.yml` → `src/validate.mjs`). A composite action
   that runs in CI on `pull_request` events. It reads the PR body, extracts a
   ` ```intent ` fenced block, and validates it. Not callable — it only runs
   inside a GitHub Actions workflow, against a real PR.
2. **GitHub App webhook** (`packages/github-app/src/server.mjs`, deployed as
   `epicon-api` on Render per `render.yaml`). Hosts
   `POST /api/github/webhook`, verifies `X-Hub-Signature-256`, and — when
   `APP_ID`/`PRIVATE_KEY` are configured — runs Probot-based I2 (immutability)
   enforcement via Check Runs. Still GitHub-event-shaped: it exists to react
   to `pull_request` webhook deliveries from an *installed* GitHub App, not
   to accept an arbitrary POSTed candidate from another service.

Both surfaces are thin wrappers around the same shared, **pure** validation
engine: `packages/guard-core/src/index.mjs`, specifically
`validatePullRequest({ prBody, changedFiles, policy, now })`. This function
does not know about GitHub, HTTP, or PRs internally — it takes a markdown
string (searched for an intent fenced block) and an optional file list, and
returns a structured verdict:

```js
{
  status,        // PASS | PASS_WITH_BACKFILL | QUARANTINE | FAIL_CLOSED
  prTier,         // EP-1 | EP-2 | EP-3
  epicon_id, ledger_id, scope, issued_at, expires_at,
  justification_hash,
  divergent,      // I4: changed files outside declared scope envelope
  errors, warnings, notices,
}
```

This is the reuse seam. **The proposal below is an HTTP entry point on top
of this existing function — not a new validator.**

## Do the six invariants (I1–I6) already tolerate a non-PR candidate?

Checked against `packages/guard-core/src/index.mjs` and
`immutability.mjs` line by line, since this determines whether Task 1 is a
transport-only change or actually needs an ATLAS-level EPICON on
`kaizencycle/epicon` itself (invariant change = new EPICON, per the handoff).

| Invariant | Applies to a Feed candidate as-is? | Notes |
|---|---|---|
| I1 — Intent must precede authority | Yes | Just requires a `` ```intent `` block to exist. A candidate submission can carry one. |
| I2 — Immutability (no silent mutation) | Yes, with a caveat | Today implemented as *prior check-run state vs. new push* on a PR. A non-PR caller has no check-run history to diff against — needs its own state store (candidate row's prior `justification_hash`, kept in mobius-feed's own Postgres `candidates` table, not epicon's). The comparison logic (`compareIntentMutation`) is reusable as-is; only the "where does the prior state live" wiring differs. |
| I3 — Scoped, time-bound authority | Yes | `scope`, `issued_at` are ordinary intent fields. |
| I4 — Divergence (changed files vs. declared scope) | N/A, and the code already handles that gracefully | `validatePullRequest` only runs the divergence check `if (changedFiles && changedFiles.length > 0)`. A candidate has no file diff, so pass `changedFiles: null` — tier defaults to `EP-3` (deny-by-default naming) but **this does not force a failing status**; `status` is computed solely from `errors.length`, independent of tier. A structurally valid candidate with `changedFiles: null` returns `PASS` at tier `EP-3`. Confirmed by reading `validatePullRequest`'s status computation (lines ~275–289 as of this clone) — not inferred. |
| I5 — Mandatory expiration | Yes | Same `expires_at` field semantics. |
| I6 — Structured justification | Yes | Same `VALUES INVOKED / REASONING / ANCHORS / BOUNDARIES / COUNTERFACTUAL` shape. |

**Finding: no invariant (I1–I6) changes are required.** The gap is entry
surface (HTTP transport + auth + state storage for I2), not semantics. This
does **not** need its own EPICON on the epicon repo. Flagging this
conclusion explicitly so it isn't silently assumed — if a future reviewer on
`kaizencycle/epicon` disagrees with the I2/I4 handling above, that
disagreement is the trigger for escalating to ATLAS, not this note's
existence.

Two adjacent, smaller decisions are *not* invariant changes but do need a
policy owner's sign-off before this ships (called out in
[open-questions.md](./open-questions.md)):

- `VALID_SCOPES` (`packages/guard-core/src/intent.mjs`) currently has no
  `feed` entry (`docs | ci | core | infra | sentinels | labs | specs`).
  Candidates need a scope value. Proposal: add `feed` to `VALID_SCOPES` /
  `SCOPE_ENVELOPES` as an additive policy config change.
- `ledger_id` today is a human/bot GitHub actor. A service caller needs an
  identity convention, e.g. `svc:mobius-feed`. This is a ledger-identity
  policy question, not a code change to Guard.

## Proposed minimal surface

Extend the existing `epicon-api` Render service (`packages/github-app`) —
**do not stand up a second service**, per `docs/services/epicon-api.md`'s
own "do not create a separate `epicon-guard-app` Render service" rule, which
applies equally to a new mobius-feed-facing route.

```
POST /api/candidates/attest
Authorization: Bearer <EPICON_API_TOKEN>       # new secret, distinct from
                                                 # GITHUB_WEBHOOK_SECRET —
                                                 # this caller isn't a GitHub
                                                 # App installation.
Content-Type: application/json

{
  "epicon_id":       "EPICON_C-390_FEED_nasa-signal-142_v1",
  "ledger_id":       "svc:mobius-feed",
  "scope":           "feed",
  "issued_at":       "2026-08-01T00:00:00Z",
  "expires_at":      "2026-11-01T00:00:00Z",
  "justification": {
    "VALUES INVOKED": "...",
    "REASONING":       "...",
    "ANCHORS_LIST":   ["...", "..."],
    "BOUNDARIES":      "...",
    "COUNTERFACTUAL":  "..."
  },
  "counterfactuals": ["..."],
  "prior_justification_hash": "<sha256 or null>"   // for I2, see below
}
```

Response — same verdict shape `validatePullRequest` already returns, so
mobius-feed and any GitHub PR consumer read an identical contract:

```json
{
  "status": "PASS",
  "epicon_id": "EPICON_C-390_FEED_nasa-signal-142_v1",
  "prTier": "EP-3",
  "justification_hash": "…",
  "errors": [],
  "warnings": [],
  "notices": []
}
```

(`prTier`, not `tier` — matching `validatePullRequest`'s actual field name
exactly, since the whole point of this example is that the shape is
identical for both callers.)

Implementation sketch (for whoever picks this up on `kaizencycle/epicon`,
not built in this cycle):

1. A tiny serializer that renders the JSON body back into the same
   ` ```intent ` fenced-block text `extractIntentBlocks`/`parseIntent`
   already expect — the cheapest way to reuse `validatePullRequest`
   unmodified. (A cleaner long-term refactor would factor a
   `validateIntentEnvelope({ fields, justification, counterfactuals, ... })`
   out of `validatePullRequest` so JSON callers skip the markdown
   round-trip — worth doing, not required for v1.)
2. Route handler in `packages/github-app` (sibling to `handler.mjs`) that:
   authenticates via `EPICON_API_TOKEN` bearer, does **not** touch
   `verifySignature`/`X-Hub-Signature-256` (that's the GitHub webhook path
   only), calls the serializer + `validatePullRequest`, returns the verdict.
3. I2 state: mobius-feed's own `candidates` table (Decision 3) stores the
   last-known `justification_hash` per `epicon_id` prefix and sends it as
   `prior_justification_hash`; the route calls `compareIntentMutation`
   (already exported from `guard-core`) instead of diffing GitHub check-run
   summaries.

## What this endpoint does *not* do

Consistent with mobius-feed's repo boundaries: a `PASS` verdict here means
"this candidate's intent envelope is structurally sound" — it is **not**
the same thing as reaching Tier 2 (`Attested`), which per ADR-001 Decision 2
additionally requires ATLAS + ZEUS + Human review. That review happens in
mobius-feed's own `review/` surface *before* a candidate is submitted here
for promotion, or the Guard verdict is one input to that review — see
[Task 2](./task-2-epicon-status-vocabulary.md) for exactly where the line
falls. This endpoint attests structure; it does not decide truth and does
not write to Notion.

## Carried forward

See [docs/open-questions.md](./open-questions.md) for the `feed` scope
addition, the `ledger_id` service-identity convention, and the I2
state-storage wiring — none of these are invariant changes, but none are
unilaterally decidable by mobius-feed either.
