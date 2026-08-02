-- Canonical Signal object (PR-002). An observation, not an interpretation.
-- No pattern data, no review lifecycle here — see 0002_candidates.sql.
-- See ../../docs/signal-lifecycle.md for the hash spec and the
-- status-vs-review_state split rationale.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE signals (
    signal_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source              text NOT NULL,
    source_type         text NOT NULL,
    headline            text NOT NULL,
    summary             text,
    url                 text NOT NULL,
    published_at        timestamptz NOT NULL,
    retrieved_at        timestamptz NOT NULL,
    -- Computed by Postgres itself from source_type/source/url, not accepted
    -- as caller-supplied text — a caller cannot submit a hash that doesn't
    -- match its own inputs, so the dedup key can never drift from what it
    -- claims to represent. See ../../docs/signal-lifecycle.md §2 for the
    -- exact SHA-256(SHA-256(a)||SHA-256(b)||SHA-256(c)) spec this implements.
    hash                text GENERATED ALWAYS AS (
                            encode(
                                digest(
                                    digest(source_type, 'sha256') ||
                                    digest(source, 'sha256') ||
                                    digest(url, 'sha256'),
                                    'sha256'
                                ),
                                'hex'
                            )
                        ) STORED,
    normalizer_version  text NOT NULL,
    schema_version      text NOT NULL,
    status              text NOT NULL DEFAULT 'NEW'
                            CHECK (status IN ('NEW', 'NORMALIZED')),
    created_at          timestamptz NOT NULL DEFAULT now()
);

-- Dedup lookup key. Not a UNIQUE constraint: duplicate-detection *logic*
-- (reject vs. merge vs. flag-for-review) is PR-005's job, not this
-- schema-only PR's. An index is enough to make that lookup cheap without
-- deciding the policy here.
CREATE INDEX signals_hash_idx ON signals (hash);

CREATE INDEX signals_source_idx ON signals (source_type, source);
CREATE INDEX signals_status_idx ON signals (status);

-- signals.status is documented as one-way (frozen once NORMALIZED) in
-- docs/signal-lifecycle.md §3 — enforce that structurally rather than
-- trusting every future caller to respect it. Also freezes
-- source_type/source/url once NORMALIZED: those three fields back the
-- generated `hash` column above, so letting them change post-normalization
-- would silently change a signal's dedup identity out from under it.
CREATE OR REPLACE FUNCTION enforce_signal_status_forward() RETURNS trigger AS $$
BEGIN
    IF OLD.status = 'NORMALIZED' AND NEW.status IS DISTINCT FROM 'NORMALIZED' THEN
        RAISE EXCEPTION 'signals.status is one-way: cannot move from NORMALIZED back to %', NEW.status;
    END IF;
    IF OLD.status = 'NORMALIZED' AND (
        NEW.source_type IS DISTINCT FROM OLD.source_type OR
        NEW.source      IS DISTINCT FROM OLD.source OR
        NEW.url         IS DISTINCT FROM OLD.url
    ) THEN
        RAISE EXCEPTION 'signals.source_type/source/url are frozen once NORMALIZED (they back the dedup hash)';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER signals_forbid_status_regress
    BEFORE UPDATE ON signals
    FOR EACH ROW
    EXECUTE FUNCTION enforce_signal_status_forward();
