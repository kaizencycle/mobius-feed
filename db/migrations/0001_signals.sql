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
    hash                text NOT NULL,
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
