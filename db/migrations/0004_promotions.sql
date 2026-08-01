-- Append-only promotion-attempt log (PR-002). One row per call to
-- kaizencycle/epicon's Guard (docs/task-1-epicon-attestation-interface.md).
-- A candidate can have multiple rows here (e.g. an early QUARANTINE
-- attempt followed by a later PASS after rework) — candidates.review_state
-- = 'PROMOTED' is the denormalized "did it ever succeed" marker; this
-- table is the full attempt history and audit trail. Never updated in
-- place, enforced the same way as reviews.

CREATE TABLE promotions (
    promotion_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id        uuid NOT NULL REFERENCES candidates (candidate_id),
    attempted_at         timestamptz NOT NULL DEFAULT now(),
    -- Matches kaizencycle/epicon Guard's actual status vocabulary exactly
    -- (packages/guard-core/src/index.mjs), confirmed against source in PR-001.
    guard_status         text NOT NULL
                            CHECK (guard_status IN (
                                'PASS', 'PASS_WITH_BACKFILL', 'QUARANTINE', 'FAIL_CLOSED'
                            )),
    -- Guard's prTier (EP-1 | EP-2 | EP-3). Nullable: an attempt can fail
    -- before a tier is even assigned.
    guard_tier           text
                            CHECK (guard_tier IS NULL OR guard_tier IN ('EP-1', 'EP-2', 'EP-3')),
    epicon_id            text,
    justification_hash   text,
    -- Full raw verdict payload from the Guard call, for audit/replay —
    -- provenance, same spirit as normalizer_version/schema_version on signals.
    response_raw         jsonb NOT NULL,
    created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX promotions_candidate_id_idx ON promotions (candidate_id);

CREATE TRIGGER promotions_forbid_update
    BEFORE UPDATE ON promotions
    FOR EACH ROW
    EXECUTE FUNCTION forbid_mutation();

CREATE TRIGGER promotions_forbid_delete
    BEFORE DELETE ON promotions
    FOR EACH ROW
    EXECUTE FUNCTION forbid_mutation();
