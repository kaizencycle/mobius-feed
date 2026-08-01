-- Append-only review event log (PR-002). One row per reviewer decision on
-- a candidate (ATLAS, ZEUS, and/or Human may each leave their own row).
-- candidates.review_owner/review_notes are a denormalized "latest" snapshot;
-- this table is the authoritative history and is never updated in place —
-- enforced structurally below, not left to caller discipline (see the
-- handoff's C-376/C-377 concurrent-writer note: same risk, avoided here by
-- construction rather than convention).

CREATE TABLE reviews (
    review_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id  uuid NOT NULL REFERENCES candidates (candidate_id),
    -- Free text, not a CHECK-constrained enum: the reviewer roster (ATLAS,
    -- ZEUS, Human, ...) is a governance question, not a schema-only
    -- decision for this PR. Document expected values in
    -- docs/signal-lifecycle.md rather than hard-coding them here.
    reviewer_type text NOT NULL,
    reviewer_id   text NOT NULL,
    decision      text NOT NULL CHECK (decision IN ('APPROVE', 'REJECT')),
    notes         text,
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX reviews_candidate_id_idx ON reviews (candidate_id);

-- Structural append-only enforcement: reject UPDATE/DELETE outright rather
-- than relying on every future caller to remember not to mutate history.
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION '% is append-only: % is not permitted', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER reviews_forbid_update
    BEFORE UPDATE ON reviews
    FOR EACH ROW
    EXECUTE FUNCTION forbid_mutation();

CREATE TRIGGER reviews_forbid_delete
    BEFORE DELETE ON reviews
    FOR EACH ROW
    EXECUTE FUNCTION forbid_mutation();
