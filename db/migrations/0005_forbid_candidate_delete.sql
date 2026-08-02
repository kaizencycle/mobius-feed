-- Preserve the bidirectional 1:1 signal/candidate invariant on deletion.
-- INSERT-side enforcement exists in 0002_candidates.sql; without this,
-- deleting a candidate would leave its parent signal NORMALIZED with no
-- reviewable unit. Lifecycle changes use review_state, not row deletion.

CREATE OR REPLACE FUNCTION forbid_candidate_delete() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'candidates cannot be deleted; use review_state transitions instead';
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER candidates_forbid_delete
    BEFORE DELETE ON candidates
    FOR EACH ROW
    EXECUTE FUNCTION forbid_candidate_delete();
