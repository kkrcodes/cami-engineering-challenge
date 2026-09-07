# Decisions

## Prioritisation

Order (highest ROI first, one commit per task): CI green -> UI freshness -> list perf (N+1) ->
controller structure -> classification history. Reasoning per step:

- **CI first** — cheapest fix (a stray step-level env override), and it gives every later commit a
  baseline that's actually green rather than "probably fine."
- **Freshness next** — a ~2-line invalidation fix for a feature that visibly doesn't work (the
  table doesn't update after a status change or a classify).
- **List perf third** — the headline bug, but it takes longer to measure and fix properly, so it
  shouldn't block the two cheap wins ahead of it.
- **Controller fourth** — unlocks the layering history needs (a service history can also call),
  and fixes a correctness bug arguably worse than the N+1 (below).
- **History last** — the biggest slice, and it depends on the controller's layering.

**Cut-line at ~2h instead of ~4h:** ship CI + freshness + list perf, plus a minimal controller fix
(DTOs/ValidationPipe only, skip extracting the service). Defer history entirely beyond a stubbed
provider interface, and skip the extras (CORS, log gating, ESLint). The first three are the
correctness/perf spine; everything after is additive surface.

**One deliberate break from strict ROI order:** `create`/`updateStatus`/`classify` all returned
`{ error }` at HTTP 200 instead of throwing, and the web client only checks `res.ok` — so a
validation failure reads as success on the client. That's higher severity than the N+1 (silent
data corruption vs. a slow read), so the *minimal* version of that fix (real exceptions) is worth
pulling forward even though the full controller refactor stayed in its ROI slot.

## Assumptions
- The seeded volume (1,200 requests / ~4,800 notes) is the perf target the list has to scale against.
- The web UI only ever renders a 25-row page (`slice(0,25)`), so server-side pagination is a safe,
  non-breaking contract change.
- No auth/tenant model is in scope — the missing authorization is called out as a gap, not bolted
  on as a side quest.
- The classifier stays a deterministic keyword matcher. The provider interface exists so an LLM
  implementation is a drop-in later, not something to build now.

## Trade-offs
- **List perf** — one aggregate query (grouped `COUNT` for `noteCount` + a `LIMIT 1` correlated
  subquery for `latestNotePreview`) instead of a join-and-dedupe. Same response shape. Measured
  1201 -> 1 queries, ~303ms -> ~4ms median on the seeded DB (isolated `GET`, Postgres statement
  log as ground truth). Cross-checked `noteCount`/`latestNotePreview` against direct SQL on a
  sampled row.
- **Freshness** — invalidation over optimistic updates. Simpler and guaranteed-correct under the
  timebox; optimistic update needs rollback handling on failure, which isn't free.
- **Controller** — `class-validator` DTOs + a global `ValidationPipe` over hand-rolled `if` checks.
  This is also what actually kills the 200-on-error bug — a thrown `BadRequestException` beats a
  returned object the client happens to check `.error` on.
- **Classification persistence + provider seam** — classify logic lives in a `ClassificationService`
  so both the classify endpoint and history read from the same place. `ClassifierProvider.classify()`
  is async even though the keyword implementation is synchronous, because the whole point of the
  interface is that an LLM-backed provider is a drop-in later — a sync signature would mean
  widening it (and every call site) when that day comes.
- **Migration** — hand-written raw SQL matching how `InitialSchema` is already written in this
  repo, rather than switching styles for one table. Additive/expand only: new table, nullable FK,
  nothing on existing tables changes.
- **Index** — `(category, created_at DESC)` on `classifications`, matching the one query shape the
  history endpoint actually needs. Not indexing anything speculative.

## Classification history scope
- **Implemented:** `Classification` entity + expand migration; `ClassifierProvider` interface + DI
  token with a `KeywordClassifierProvider` adapter; every classify call persists a row; `GET
  /requests/history` filters server-side by category (validated) with pagination; a real history
  table + category filter on the web side.
- **Left out (deliberately):** an actual LLM provider (the interface is ready; wiring a real
  model/API key is out of scope here), richer sort/filter options on history, per-user
  auth/ownership on history rows. These are additive surface on top of the thin slice — better
  documented than half-built.

## Security notes

Fixed (cheap enough to close in-scope):
- **CORS** was `origin: true` (reflected any requesting origin back as allowed). Pinned to
  `WEB_ORIGIN` (default the web app's origin); verified a non-web origin is no longer echoed.
- **Query logging** was unconditionally on (`logging: ['query']`), leaking every SQL statement into
  logs in all environments. Gated behind `DB_LOGGING`; errors still logged.

Flagged (real, but out of scope to build here — the ask is to name them):
- **No authorization/ownership on mutations** — any client can `PATCH /:id/status` or classify any
  request by id. In a multi-tenant deployment this is a data-integrity/leak risk; the fix is
  server-side scoping tied to an authenticated principal, never a client-supplied id.
- **No rate limit on `/classify`** — today it's a free local classifier, but the provider interface
  is built so a paid LLM can sit behind that same endpoint with zero call-site changes. Whoever
  wires that in needs a rate limit and a request-size bound at the same time, or it's an open
  cost/abuse vector from day one.
- **Tenant/owner scoping — considered, not applicable.** `customer_requests` has no per-customer/
  owner column, so there's no existing cross-tenant leak surface to close here. Noted so it reads
  as considered, not missed.

## Stretch notes

**LLM provider failure modes** — what the seam has to handle once `KeywordClassifierProvider`
becomes an LLM one (the async interface already makes room for all of this without call-site changes):
- *Timeout / latency* — an LLM call is slow and can hang. Wrap it in a timeout and fall back to the
  keyword provider (still in the tree) so `/classify` degrades to a worse-but-instant answer rather
  than 500s.
- *Rate limits & cost* — a paid API needs a per-caller rate limit and a request-size bound in front
  of `/classify` (see Security), plus a cost cap / circuit breaker that trips to the keyword
  fallback when the error rate or budget is exceeded.
- *Transient errors* — bounded retries with backoff on 429/5xx; never retry a 4xx.
- *Bad output* — validate the model's category against the known enum; anything off-enum or
  low-confidence rides the same `< 0.55 → unknown` policy that already lives in
  `ClassificationService` (deliberately provider-independent).
- *PII / data egress* — messages are customer text; sending them to a third party is a
  data-processing decision (redaction / region / consent). The provider boundary is the right place
  to enforce redaction before egress. Each row already records `provider`, so a mixed history stays
  auditable.

**Migration vs deploy ordering** — the `classifications` migration is expand-only (new table,
nullable FK, new index; nothing on existing tables), so it's backward-compatible: safe to run ahead
of the rollout, and a rollback to the previous code doesn't hit a missing column. It ships in the
same release as the code that reads/writes it. A contract change (drop/rename) would invert the
order — ship the code that stops using the old shape first, drop it a release later — but none is
needed here.

Not done: a repository/port seam for classification storage (task 6 stretch) — the service still
talks to the TypeORM repository directly. It'd pay rent mainly in testability; left as additive.

## What I would do with more time
- Optimistic UI updates with rollback on mutation failure.
- Keyset pagination instead of offset — offset is fine at 1,200 rows, not at real scale.
- Real auth + tenant scoping, and rate limiting in front of `/classify`.
- Richer history filters (date range, confidence threshold) and sortable columns.
- ESLint as a real, enforced CI gate — right now `lint --if-present` is a silent no-op because
  there's no ESLint config to run.
- HTTP-level e2e (supertest through the Nest app) for the `ValidationPipe` 400s and exception
  mapping — the added tests cover the service layer plus the N+1 regression guard, but not the full
  request/response path.
