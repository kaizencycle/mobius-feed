# db/

Postgres schema + migrations for the candidate queue (ADR-001 Decision 3):

```
signals → candidates → reviews → promotions
```

Hosting target: Render Postgres, dedicated instance — see
[`../docs/task-3-hosting-decision.md`](../docs/task-3-hosting-decision.md).

Column-level schema design is not part of this cycle's scope — Decision 3
names the four tables, not their columns. Scaffold only; no migrations yet.
