# Measurements — before / after

Evidence captured against a seeded DB (**1200 requests, 4800 notes**), API on `:3001`, Postgres
on `:5433`. Query counts are DB ground truth: `log_statement='all'` on Postgres, counting
`execute`/`statement` log lines for a single request (the app's own `logging` stays `false`).

Method:
- **Query count** — one isolated `GET`, diff the Postgres statement-log lines around it.
- **Latency** — `curl -o /dev/null -w '%{time_total}'`, 10 runs, report min/median/max.

## Task 1 — `GET /requests` N+1

| | Queries / request | Latency median | Notes |
|---|---|---|---|
| **Before** | **1201** | **303 ms** | 1 requests query + 1 notes query *per row* (1200). Scales O(rows). Returned all 1200 rows. Cold 484 ms. |
| **After** | **1** | **3.6 ms** | Single aggregate query (grouped `COUNT` + `LIMIT 1` correlated subquery). Constant in row count. Default 25-row page. |

**~84× faster, query count 1201→1.** Baseline: 1201 statements; latency
`min=0.280 median=0.303 max=0.375`. After: 1 statement (also 1 with `?limit=3`); latency
`min=0.0033 median=0.0036 max=0.0040`.

**Correctness cross-check (DB ground truth):** sample request → API `noteCount=5`,
`latestNotePreview="Reproduced locally. [1200.5]"`; direct SQL `count=5`, latest body identical. ✓

**Pagination:** default 25, `?limit=3`→3, `?limit=200`→clamped to 100 (`MAX_LIMIT`), `?offset=5`
returns a distinct page. Response stays an array — client `slice(0,25)` unaffected (safe contract change).

## Task 1 — regression guard (query count is constant in row count)

Encoded as a permanent test (`apps/api/test/requests.integration.test.ts`): seed few vs many
requests, count queries for `list()` each time, assert equal and ≤ 2.

- **Fixed code:** 3 requests → **1** query; 30 requests → **1** query. Constant. ✓
- **Guard is non-vacuous** — reintroduced a per-row query and the guard failed as designed:
  3 requests → **4** queries, 30 requests → **34** queries (`expected 34 to be 4`). So it catches an
  N+1 regression, it doesn't just always pass. Reverted after proving.

## Other verified changes

- **`getById` over-fetch (extra):** `PATCH /:id/status` trace after the fix is
  `SELECT customer_requests` → `UPDATE` → `COMMIT` — **0 `request_notes` queries** (before, `getById`
  LEFT-joined every note just to change a scalar).
- **Atomic classify (self-review):** the request write-back + history insert run in one transaction.
  An integration test forces the history INSERT to fail (an over-long `provider`) and asserts the
  request update rolls back with it — `category` null, status still `open`, 0 classifications.
  `forbidNonWhitelisted` additionally rejects unknown request fields with a **400**.
- **CORS (extra):** with `origin` pinned, a request from `http://evil.example` no longer gets its
  own origin echoed — `Access-Control-Allow-Origin` is fixed to the web origin, so other origins are
  browser-blocked. (Before: `origin: true` reflected any origin.)
- **Contract fixes (task 4):** empty/oversized/malformed input on classify/create/updateStatus now
  returns **400** (was `{error}` at HTTP 201); unknown request → **404**. Verified by curl battery.
- **Task 5:** migration applies (table + FK `ON DELETE SET NULL` + `(category, created_at)` index);
  classify persists a row (`provider=keyword`); `/history?category=` filters server-side;
  `?category=bogus` / `?limit=abc` → 400.
- **Whole stack:** `npm test` **10/10** green (2 unit + 8 integration); `npm run build` (api + web) green.
