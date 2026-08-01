# sources/

Poll adapters — one directory per source family. Each adapter's job is to
fetch raw content from its origin and hand it to `normalizers/` as a Signal
candidate (see `schemas/signal.schema.json`). Adapters do not classify,
score, or deduplicate; that happens downstream in `normalizers/` and
`classifiers/`.

Scaffold only this cycle — no adapter implementations yet. Hosting shape
(Render Background Worker per source, or multiplexed) is documented in
[`../docs/task-3-hosting-decision.md`](../docs/task-3-hosting-decision.md).

- `rss/` — generic RSS/Atom feeds
- `github/` — GitHub activity (releases, issues, discussions) relevant to tracked repos
- `sec/` — SEC filings
- `nasa/` — NASA announcements/feeds
- `arxiv/` — arXiv paper listings
