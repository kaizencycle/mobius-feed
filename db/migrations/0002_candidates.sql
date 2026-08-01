-- Candidate object (PR-002): the reviewable unit created 1:1 when a Signal
-- reaches status = 'NORMALIZED'. Carries pattern suggestions and the
-- review/promotion lifecycle Signal itself does not.
--
-- review_state starts at 'NORMALIZED' — deliberately the same word as the
-- Signal status it's created from. This is not duplicated tracking: Signal
-- stops changing once NORMALIZED (its job is done), Candidate picks up the
-- word as its own starting point and evolves independently from there. See
-- ../../docs/signal-lifecycle.md.

CREATE TABLE candidates (
    candidate_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    signal_id           uuid NOT NULL REFERENCES signals (signal_id),
    review_state        text NOT NULL DEFAULT 'NORMALIZED'
                            CHECK (review_state IN (
                                'NORMALIZED', 'REVIEWED', 'PROMOTED',
                                'DISMISSED', 'ARCHIVED'
                            )),
    -- Always a scored list, never a bare `pattern` field (ADR-001 Decision 4).
    -- The jsonb_typeof check enforces "always an array" at the schema level.
    candidate_patterns  jsonb NOT NULL DEFAULT '[]'::jsonb
                            CONSTRAINT candidate_patterns_is_array
                            CHECK (jsonb_typeof(candidate_patterns) = 'array'),
    -- Denormalized top-line score (e.g. the best candidate_patterns entry),
    -- kept for review-surface sorting. candidate_patterns stays authoritative.
    confidence          numeric(4, 3)
                            CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
    -- Current-state snapshot fields. The append-only `reviews` table
    -- (0003_reviews.sql) is the authoritative history; these are a fast,
    -- denormalized "latest" view, not a second source of truth.
    review_owner        text,
    review_notes        text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    -- One candidate per signal.
    CONSTRAINT candidates_signal_id_unique UNIQUE (signal_id)
);

CREATE INDEX candidates_signal_id_idx ON candidates (signal_id);
CREATE INDEX candidates_review_state_idx ON candidates (review_state);

-- candidates is the one mutable "current state" table in this schema
-- (signals.status also mutates NEW -> NORMALIZED, but has no updated_at
-- column per the canonical Signal schema). Keep updated_at honest.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER candidates_set_updated_at
    BEFORE UPDATE ON candidates
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
