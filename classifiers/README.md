# classifiers/

Embedding-based pattern-similarity scoring (ADR-001 Decision 4). Produces
the scored `candidate_patterns: [{name, confidence}]` list against the 15
Pattern definitions in the Patterns database.

This is a small ML component, not RSS parsing — budgeted and scoped as its
own piece of work, separate from `normalizers/`. The classifier **suggests**
pattern matches; it never assigns a single pattern outright. That judgment
is preserved for the human/ATLAS review step in `review/`.

Scaffold only this cycle — no implementation yet.
