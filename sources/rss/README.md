# sources/rss/

RSS feed poll adapter. Inserts Signals at `status = 'NEW'` for the
normalization pipeline (`normalizers/`) to pick up.

`constants.ts` defines `MAX_SUMMARY_LENGTH` (5000) — adapters must cap
summaries to this value; `normalizers/text.ts` applies the same cap when
cleaning text during `NEW → NORMALIZED`.

Scaffold only — polling implementation is PR-003.
