# AI Usage

## Tools
**Claude Code** (Anthropic's agentic CLI) — the main driver for the in-repo work, with a few of its
subagents running in parallel for mechanical work that didn't need to touch the exercise repo
directly: toolchain/environment bring-up, a framework-idiom rubric (NestJS/TypeORM/Next conventions
to check fixes against), and the self-contained web history page (built concurrently with the
API-side work). No Cursor/Copilot/ChatGPT in the loop.

## The method
I ran this as a human-in-the-loop workflow, not "ask the model, paste the answer." Every task went
through the same shape:

1. **Recon first, findings register second.** Read the whole repo before changing a line and wrote
   down every issue with the evidence that proves it — each planted bug confirmed against the actual
   source, plus the additional legitimate issues and a short list of things that *look* wrong but
   aren't (deliberate non-fixes, documented rather than "fixed"). I worked from that register, not
   from the task list.
2. **Plan in ROI order.** Sequenced the fixes by return on time — cheapest-but-blocking first,
   biggest-and-dependent last — with a documented cut-line, so any partial progress is always the
   highest-value slice rather than a random half.
3. **One concern per commit.** Each fix is its own commit with its own before/after, so the diff is
   reviewable task-by-task instead of as one wall of changes.
4. **Accept on evidence, not on green.** A perf claim ships with a measured number; a behaviour
   change ships with a test. For the N+1 fix I had AI draft the aggregate query but didn't accept it
   on "tests pass" — I measured query count and latency before and after, and cross-checked the
   returned `noteCount`/`latestNotePreview` against a direct SQL query on a sampled row. Green CI is
   necessary, not sufficient.
5. **Review against a written bar.** Before finalising I re-read the diff against a framework-idiom
   checklist and a senior-review bar that separates blockers from nits. That pass is what caught the
   `ValidationPipe` missing `forbidNonWhitelisted` (unknown fields were being silently dropped
   instead of rejected) and pinned the exact transaction shape (transactional `manager`, provider
   call outside it).
6. **Parallelise the mechanical, but read the output.** Environment bring-up, the rubric, and the
   web history page ran as parallel subagents to compress wall-clock — each one's output still got
   read and verified before I relied on it.

The throughline: every line has to be defensible out loud — what it does, why it's shaped that way,
and how I know it works. That's the bar I'd hold any AI-assisted PR to, mine included.

## Judgment calls: what I changed or rejected
- The CI failure could plausibly have been three things: a lint step, a stale lockfile, or the
  migrate step. I verified instead of assumed: `lint --if-present` is a silent no-op because there's
  no ESLint config in the repo at all, and a lockfile-sync check showed it genuinely in sync. Neither
  was the break. The actual cause was a step-level `DATABASE_URL` override pointing at a database
  (`cami_app`) the CI Postgres service never creates — the job-level env already had the right value,
  so I removed the redundant override instead of patching the name, since that's the smaller, more
  obviously-correct diff.
- I pushed back on "cleanup" suggestions for the classifier's confidence-scoring thresholds —
  convoluted-looking, but load-bearing business policy, not a bug. I relocated that logic (out of the
  controller, into a service) without changing its behaviour, which is a different thing from tuning
  it.
- I caught a test-setup bug in AI-drafted code before trusting it. The integration test uses a
  dedicated Postgres schema for isolation, but it mixed ORM writes (TypeORM qualifies those with the
  schema) and raw `dataSource.query` (which don't — they follow the connection's `search_path`). The
  raw `TRUNCATE`/`INSERT` silently hit `public`, which both failed the tests (cross-schema FK) and
  wiped my local seed data. Fixed by schema-qualifying the raw SQL and re-seeding — and I verified the
  N+1 regression guard actually fails when the N+1 is reintroduced, so it isn't a test that always
  passes.

## Trade-offs I made knowingly
- Letting a subagent build the web history UI concurrently with the API work saved wall-clock, but
  meant reviewing that page's contract (query params sent, empty/error states) after the fact rather
  than co-designing it live — a reasonable trade for a self-contained page, not one I'd make for
  something touching shared state.
- For the aggregate list query I hand-verified the SQL shape myself rather than trusting that the ORM
  output looked plausible, because a wrong `noteCount` is a silent correctness bug, not a crash —
  nothing in the existing test suite would have caught a subtly wrong count without the direct DB
  cross-check.

## How I'd run this on a team
This was a solo exercise; the workflow above is the single-player version of how I'd run AI-assisted
delivery with a team — the same practice, plus coordination:

- **Shared standards and shared tooling.** One agreed set of conventions and a shared review rubric
  that separates blockers from nits, plus common skills and workflows, so every engineer's agent
  produces code that reads like one author wrote it — not N house styles.
- **Context and plan before code.** Share the full context up front (ticket, constraints, data model)
  and agree a plan, iterate it until it's right, *then* decompose into small, independently-shippable
  slices. Planning is the cheapest place to kill a wrong approach.
- **Iteratively ship, each slice proven.** Small PRs, one concern each; every behaviour change carries
  a test, every perf change a measured number. An agentic review pass catches the mechanical issues,
  then a human review owns the judgment — diagnosis, the data model, anything security-adjacent. Green
  CI is necessary, not sufficient.
- **Integration/e2e and staged rollout at the seams.** Unit tests don't cover where slices meet —
  integration/e2e exercise the request/response path and cross-module contracts, and anything
  user-facing ships behind a staged rollout (flag or canary) so a regression shows on a slice of
  traffic, not all of it.
