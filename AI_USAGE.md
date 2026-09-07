# AI Usage

## Tools used
AI as the main driver for the in-repo work, with a few subagents running in parallel for
mechanical prep that didn't need to touch the exercise repo directly: toolchain/environment
bring-up, a framework-idiom rubric (NestJS/TypeORM/Next conventions to check fixes against), and
calibrating expectations against the exercise's own scoring rubric. One subagent also built the
web history page and its category filter concurrently with the API-side work.

## How I used AI
- **Recon before touching anything.** Read the whole repo first and built a verified findings
  register — every planted issue confirmed against the actual source, not assumed from the task
  list, plus a handful of additional legitimate issues and a short list of things that look wrong
  but aren't (deliberate non-fixes, documented rather than "fixed").
- **Measurement-gated, not green-gated.** For the perf fix in particular, I had AI draft the
  aggregate query, but didn't accept it on "tests pass" — I measured query count and latency
  before and after, and cross-checked the returned `noteCount`/`latestNotePreview` against a
  direct SQL query on a sampled row. Same standard elsewhere: a behavior change needs a test, a
  perf claim needs a number.
- **Parallelism to compress wall-clock**, not to skip review — prep subagents ran while I worked
  the in-repo fixes; each one's output still got read before I relied on it.

## What I changed or rejected
- The CI failure could plausibly have been three things: a lint step, a possibly-stale lockfile,
  or the migrate step. I verified instead of assumed: `lint --if-present` is a silent no-op
  because there's no ESLint config in the repo at all, and a lockfile-sync check showed it
  genuinely in sync. Neither was the break. The actual cause was a step-level `DATABASE_URL`
  override pointing at a database (`cami_app`) the CI Postgres service never creates — the
  job-level env already had the right value, so I removed the redundant override instead of
  patching the name, since that's the smaller, more obviously-correct diff.
- I pushed back on "cleanup" suggestions for the classifier's confidence-scoring thresholds —
  convoluted-looking, but load-bearing business policy, not a bug. I relocated that logic (out of
  the controller, into a service) without changing its behavior, which is a different thing from
  tuning it.
- Caught a test-setup bug in AI-drafted code before trusting it. The integration test uses a
  dedicated Postgres schema for isolation, but it mixed ORM writes (TypeORM qualifies those with
  the schema) and raw `dataSource.query` (which don't — they follow the connection's `search_path`).
  The raw `TRUNCATE`/`INSERT` silently hit `public`, which both failed the tests (cross-schema FK)
  and wiped my local seed data. Fixed by schema-qualifying the raw SQL and re-seeding — and I
  verified the N+1 regression guard actually fails when the N+1 is reintroduced, so it isn't a
  test that always passes.

## Trade-offs
- Letting a subagent build the web history UI concurrently with the API work saved wall-clock, but
  meant reviewing that page's contract (query params sent, empty/error states) after the fact
  rather than co-designing it live — a reasonable trade for a self-contained page, not one I'd make
  for something touching shared state.
- For the aggregate list query I hand-verified the SQL shape myself rather than trusting that the
  ORM output looked plausible, because a wrong `noteCount` is a silent correctness bug, not a
  crash — nothing in the existing test suite would have caught a subtly wrong count without the
  direct DB cross-check.

## Team workflow (optional stretch)
- AI is good for boilerplate, idiom lookups, and a first draft to react to; humans own diagnosis,
  the data model, and anything security-adjacent.
- Every line in a PR needs to be defensible by its author, out loud — not "AI wrote it and tests
  passed."
- Proof over assertion: a perf change ships with a before/after measurement, a behavior change
  ships with a test. Green CI is necessary, not sufficient.
- A review rubric that separates blockers from nits matters more once AI raises the volume of code
  moving through review — otherwise real blockers get lost in style nitpicking.
