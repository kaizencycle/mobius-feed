# workers/

Poll/cron jobs that drive `sources/` adapters, running as Render Background
Workers (not Vercel cron — see
[`../docs/task-3-hosting-decision.md`](../docs/task-3-hosting-decision.md)
for why: Vercel's serverless cron model is what caused the C-354 Upstash
bandwidth incident).

Scaffold only this cycle — no implementation yet.
