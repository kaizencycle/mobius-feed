-- Candidate object (PR-002): the reviewable unit created 1:1 when a Signal
-- reaches status = 'NORMALIZED'. Carries pattern suggestions and the
-- review/promotion lifecycle Signal itself does not.
--
-- review_state starts at 'NORMALIZED' — deliberately the same word as the
-- Signal status it's created from. This is not duplicated tracking: Signal
-- stops changing once NORMALIZED (its job is done), Candidate picks up the
-- word as its own starting point and evolves independently from there. See
-- ../../docs/signal-lifecycle.md.

-- Always a scored list, never a bare `pattern` field (ADR-001 Decision 4):
-- validates the full shape (array of exactly {name: string, confidence:
-- 0..1}, no other keys), not just top-level array-ness — a bare string, an
-- empty object, an out-of-range confidence, or an extra key is rejected
-- here, matching schemas/candidate.schema.json's `additionalProperties:
-- false` exactly, not just its required-fields shape.
CREATE OR REPLACE FUNCTION candidate_patterns_valid(patterns jsonb) RETURNS boolean AS $$
DECLARE
    elem jsonb;
    k    text;
BEGIN
    IF jsonb_typeof(patterns) IS DISTINCT FROM 'array' THEN
        RETURN false;
    END IF;
    FOR elem IN SELECT value FROM jsonb_array_elements(patterns) LOOP
        IF jsonb_typeof(elem) IS DISTINCT FROM 'object' THEN
            RETURN false;
        END IF;
        IF NOT (elem ? 'name') OR jsonb_typeof(elem->'name') IS DISTINCT FROM 'string' THEN
            RETURN false;
        END IF;
        IF NOT (elem ? 'confidence') OR jsonb_typeof(elem->'confidence') IS DISTINCT FROM 'number' THEN
            RETURN false;
        END IF;
        IF (elem->>'confidence')::numeric < 0 OR (elem->>'confidence')::numeric > 1 THEN
            RETURN false;
        END IF;
        FOR k IN SELECT jsonb_object_keys(elem) LOOP
            IF k NOT IN ('name', 'confidence') THEN
                RETURN false;
            END IF;
        END LOOP;
    END LOOP;
    RETURN true;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE TABLE candidates (
    candidate_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    signal_id           uuid NOT NULL REFERENCES signals (signal_id),
    review_state        text NOT NULL DEFAULT 'NORMALIZED'
                            CHECK (review_state IN (
                                'NORMALIZED', 'REVIEWED', 'PROMOTED',
                                'DISMISSED', 'ARCHIVED'
                            )),
    candidate_patterns  jsonb NOT NULL DEFAULT '[]'::jsonb
                            CONSTRAINT candidate_patterns_is_valid
                            CHECK (candidate_patterns_valid(candidate_patterns)),
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

-- No separate index on signal_id: candidates_signal_id_unique above
-- already creates one as a side effect of the UNIQUE constraint.
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

-- The FK above only guarantees signal_id references *some* row in signals —
-- it doesn't enforce the documented 1:1 handoff ("created when a Signal
-- reaches NORMALIZED"). A cross-table rule can't be expressed as a CHECK
-- constraint in Postgres, so enforce it the same way as the other
-- structural rules in this PR: a trigger that looks up the parent and
-- rejects the write if it isn't NORMALIZED yet.
CREATE OR REPLACE FUNCTION enforce_candidate_requires_normalized_signal() RETURNS trigger AS $$
DECLARE
    parent_status text;
BEGIN
    SELECT status INTO parent_status FROM signals WHERE signal_id = NEW.signal_id;
    IF parent_status IS DISTINCT FROM 'NORMALIZED' THEN
        RAISE EXCEPTION 'candidates.signal_id must reference a signal with status = NORMALIZED (found %)', parent_status;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER candidates_require_normalized_signal
    BEFORE INSERT OR UPDATE OF signal_id ON candidates
    FOR EACH ROW
    EXECUTE FUNCTION enforce_candidate_requires_normalized_signal();
