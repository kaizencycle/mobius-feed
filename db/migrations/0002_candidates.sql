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

-- signal_id is outright immutable once set: nothing in the documented
-- design ever repoints a candidate to a different signal, and allowing it
-- — even to another NORMALIZED signal — would silently orphan the
-- original signal (left NORMALIZED with no candidate, contradicting the
-- 1:1 handoff from the other direction). This check is synchronous
-- (ordinary BEFORE trigger): it depends only on this row's own history,
-- not on anything else changing later in the transaction.
CREATE OR REPLACE FUNCTION enforce_candidate_signal_id_immutable() RETURNS trigger AS $$
BEGIN
    IF NEW.signal_id IS DISTINCT FROM OLD.signal_id THEN
        RAISE EXCEPTION 'candidates.signal_id is immutable once set';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER candidates_signal_id_immutable
    BEFORE UPDATE ON candidates
    FOR EACH ROW
    EXECUTE FUNCTION enforce_candidate_signal_id_immutable();

-- The FK above only guarantees signal_id references *some* row in signals —
-- it doesn't enforce the documented 1:1 handoff ("a candidate exists iff
-- its signal is NORMALIZED"). A cross-table rule can't be expressed as a
-- CHECK constraint in Postgres, so it needs a trigger — but a same-instant
-- BEFORE trigger creates an impossible ordering: this check requires the
-- signal to already be NORMALIZED before the candidate can be inserted,
-- while the mirror-image check on signals (below) requires a candidate to
-- already exist before the signal can become NORMALIZED. Enforced
-- immediately, those two rules can never both be satisfied — there is no
-- legal first move. Both checks are therefore DEFERRABLE INITIALLY
-- DEFERRED constraint triggers, which Postgres only evaluates at
-- transaction commit: a single transaction can write the signal and its
-- candidate in either order, and only the final, post-commit state needs
-- to satisfy both invariants together.
CREATE OR REPLACE FUNCTION enforce_candidate_signal_normalized() RETURNS trigger AS $$
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

CREATE CONSTRAINT TRIGGER candidates_require_normalized_signal
    AFTER INSERT ON candidates
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION enforce_candidate_signal_normalized();

-- Mirror image of the check above, attached to `signals` (candidates must
-- already exist as a table by this point in the migration order, which is
-- why this trigger is defined here in 0002 rather than in 0001_signals.sql
-- even though it fires on the signals table): a signal cannot commit as
-- NORMALIZED unless a matching candidates row exists by commit time.
CREATE OR REPLACE FUNCTION enforce_signal_normalized_requires_candidate() RETURNS trigger AS $$
BEGIN
    IF NEW.status = 'NORMALIZED' AND NOT EXISTS (
        SELECT 1 FROM candidates WHERE signal_id = NEW.signal_id
    ) THEN
        RAISE EXCEPTION 'signals.status = NORMALIZED requires a matching candidates row for signal_id %', NEW.signal_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER signals_normalized_requires_candidate
    AFTER INSERT OR UPDATE ON signals
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION enforce_signal_normalized_requires_candidate();
