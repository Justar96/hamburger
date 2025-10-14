Here’s a **linear, day-by-day roadmap** to take Beef from zero → MVP → submission. It’s prescriptive, dependency-driven, and aligned with Devvit Web’s review realities. If you start today (Tue Oct 14), this fits a 14-day sprint. Adjust dates if you’re sliding.

# Ground rules (apply to all days)

* **Branching:** `main` protected; feature branches → PRs → CI green → squash merge.
* **Definition of Done (DoD):** code + tests + docs updated + lints/format + e2e smoke passes.
* **Non-negotiables:** no secrets in client; `/api/*` for client endpoints, `/internal/*` for cron/triggers; HTTP allowlist exact hostnames; images uploaded via Media API.
* **Daily artifact:** a short “done/blocked/next” note + link to PRs.

---

# Phase 0 — Decisions & scaffolding (Half-day warm-start)

**Exit criteria:** Repo created, local run works, CI green.

* Create repo `choice-chorus`.
* Tooling: Node LTS, pnpm or npm; Prettier + ESLint; Vitest/Jest; Playwright; TypeScript strict.
* CI: GitHub Actions with jobs for unit, integration (Redis service), e2e smoke, build.
* Secrets: set GitHub env secrets for Vertex/GCP if needed; local `.env` for dev only.
* Create **SUBMISSION.md** skeleton and **README** with run commands.

---

# Day 1 — Devvit Web skeleton + server runtime

**Goal:** Valid Devvit config, server boot, health echo.

**Tasks**

* Add **`devvit.json`** (the schema-accurate one from the finalized spec).
* `src/client/index.html`, minimal app shell; `public/` wired as `post.entrypoints.default.entry`.
* `src/server/index.ts`: express-style router or native handler with:

  * `GET /api/health -> { ok: true, ts }`
  * `POST /internal/install -> 200`
* Build pipeline: compile server to `dist/server/index.js`.

**Acceptance**

* `devvit validate` (or equivalent) passes.
* Local dev runs; `/api/health` returns JSON in <100ms.

---

# Day 2 — Data layer + postData + user identity

**Goal:** Redis data service + postData writer + identity wrapper.

**Tasks**

* `DataService`: `get/setSeed`, `setUserChoices`, `incrementTallies`, `getTopWords`.
* `postData` writer util (2KB max) with teaser content.
* Identity helper to get hashed user id (`SHA256(userId + PEPPER)`).
* Add `TelemetryService` skeleton (counters + p95 samples list).

**Acceptance**

* Unit tests: Redis pipeline works; postData size ≤ 2000 bytes; hashing stable.
* `/api/health` increments telemetry counters (basic middleware hook).

---

# Day 3 — Deterministic seeding engine

**Goal:** Per-user word draw, deterministic and auditable.

**Tasks**

* `SeedingService`: HMAC daily/user seeds; PRNG (SplitMix64/Xoroshiro).
* Import `pools.v1.json` and `lexicon.map.json` (stub with 50+ safe words).
* Draw algorithm: slot coverage + 1-per-cluster + wildcards.
* Unit tests for determinism, uniqueness, slot coverage.

**Acceptance**

* Same user/date → same set; different user/date → different set.
* 1000 draws finish <150ms total (perf guard).

---

# Day 4 — Client-facing API

**Goal:** `/api/init`, `/api/pick`, `/api/progress` wired and validated.

**Tasks**

* `/api/init?date=`: returns seed preview, myWords, progress, timeLeftSec.
* `/api/pick`: body validation, per-user max K, idempotent writes (`HSET` choice + `ZINCRBY` tallies).
* `/api/progress`: returns top N and countdown.
* Rate-limit `/api/pick` (1 req / 3s / user); structured error responses.
* Integration tests with in-memory or Docker Redis.

**Acceptance**

* Integration tests pass; invalid words rejected with `INVALID_WORDS`.

---

# Day 5 — Client app (splash → main)

**Goal:** Fast first paint; select chips; live chart scaffolding.

**Tasks**

* Use **postData** for splash (theme, teaser top words).
* Minimal JS app: render chips, enable multi-select up to K, submit to `/api/pick`.
* Basic bar chart (textual summary for a11y).
* Mobile-first CSS (single column); “tall” height entrypoint.

**Acceptance**

* Lighthouse perf on client bundle: initial payload ≤ 50KB gz.
* First paint with postData < 400ms (local); visual + textual chart present.

---

# Day 6 — Realtime & countdown

**Goal:** Live top-10 updates, countdown synced to cutoff.

**Tasks**

* Server: `RealtimeService.realtime.send("run:{date}", { type:"tally", top })`.
* Client: `connectRealtime` subscribe; update chart; debounce redraw.
* Countdown: compute time to 23:00 **BKK** on client; server exposes canonical seconds left via `/api/progress`.

**Acceptance**

* Local multi-tab test: picking in one tab updates others within 1–3s.
* Realtime disconnect/reconnect doesn’t break (retry with backoff).

---

# Day 7 — Aggregation → slots → prompt

**Goal:** End-of-day assembly that never outputs word-soup.

**Tasks**

* `AggregationService`: weights, slot candidates, deterministic tie-break.
* Templates T1–T4; negative list; 1–2 runner-up soft modifiers.
* Prompt length < 350 chars; fallback slots when sparse input.
* Unit tests: tie-break determinism, prompt budget, fallbacks.

**Acceptance**

* Given fixed tallies, `assembleFinal()` is bit-for-bit deterministic across runs.

---

# Day 8 — Vertex image gen + Media upload

**Goal:** Generate image server-side and attach to finale.

**Tasks**

* `VertexService.generateImage()` (Imagen 3 / Gemini 2.5 Flash-Image).
* Upload bytes to Reddit via `media.upload` → get CDN URL.
* Store `img:{date}` with prompt and slots.
* Compliance: ensure `permissions.http.domains` includes exact hostnames; add ToS/Privacy URLs in app details.

**Acceptance**

* Golden prompt returns an image; stored URL renders in a test post.
* Error paths: simulate Vertex timeout → `img:{date}.status="error"` with message.

---

# Day 9 — Finale UX + posting

**Goal:** After cutoff, show image + explain winners.

**Tasks**

* Client “finale” screen: image, prompt, slot winners; expand/collapse.
* Server: `reddit` user-action to comment the finale caption (if permitted) or post to a configured subreddit.
* A11y: alt text contains date + theme; chart summary string.

**Acceptance**

* Manual flow: cutoff → `/internal/finale-image` → realtime “final” broadcast → client switches to finale.

---

# Day 10 — Scheduler (cron) + rollover

**Goal:** Autonomous daily cycle.

**Tasks**

* `/internal/finale-image` (idempotent): assemble → generate → upload → broadcast.
* `/internal/rollover`: new theme + seed, write postData, prune old keys.
* Cron in **UTC**: 23:00 BKK = **16:00 UTC**. In `devvit.json`, set:

  * finale image: `0 16 * * *`
  * rollover: `5 16 * * *`
* Add `/internal/cleanup` for telemetry compaction.

**Acceptance**

* Trigger endpoints by hand; re-running doesn’t duplicate; telemetry counters increment.

---

# Day 11 — Hardening: validation, errors, perf

**Goal:** Make it hard to break.

**Tasks**

* Input clamps everywhere; JSON schema for `/api/pick`.
* Bulk Redis ops pipelined; cache pools/lexicon in memory.
* Realtime coalescing every 1–3s; dedupe by `tallyVersion`.
* Timeouts: all server calls under 30s; retries with jitter for Vertex.
* Integration perf test: 50 parallel users → P95 <150ms for `/api/*`.

**Acceptance**

* Perf CI job passes; chaos test drops realtime for 10s → app recovers.

---

# Day 12 — Tests, docs, and polish

**Goal:** Confidence high enough for submission.

**Tasks**

* Unit coverage for seeding/aggregation ≥ 90%.
* E2E Playwright flow: splash → draw → pick → live update → finale.
* Cross-browser smoke: Chrome/Firefox/Safari; mobile Safari.
* Docs: **README** (run, build, deploy), **SUBMISSION.md** (template filled), **ARCHITECTURE.md** (data model, flows).
* Add analytics counters (basic): requests, p95, errors, active users.

**Acceptance**

* CI 🔵 across unit/integration/e2e/perf; docs PR approved.

---

# Day 13 — Compliance & review prep

**Goal:** Pass App Review in one go.

**Tasks**

* App detail page: icon, description, **ToS & Privacy links** (HTTP fetch enabled).
* Verify `permissions` minimal; `reddit.asUser` only if truly needed.
* Verify **Media** limits (≤20MB); prompt safety defaults; blocklist sanity.
* Run **Submission checklist** (below) and record evidence (screens + logs).

**Acceptance**

* Dry-run “review checklist” doc: every item linked to code or screenshot.

---

# Day 14 — Submission & contingency

**Goal:** Submit early; keep fallback ready.

**Tasks**

* `devvit upload --env production` to target subreddit.
* Create demo Interactive Post; record a 2–3 min video showing full loop.
* Finalize **SUBMISSION.md**; zip `submission/` package.
* Contingency: tag previous good build; have local demo (no external calls) to show flow if Vertex hiccups.

**Acceptance**

* Submission portal accepted; demo post live; video link public.

---

### How to execute

Go **linear**, but batch the first chunk. Think of **Days 1–4** as the **Core Spine**: config → data layer → seeding → APIs. Ship that as one tight milestone, then go day-by-day.

**Milestone 1 — Core Spine (2 days total)**

1. **Config + Boot (Day 1)**

   * Valid `devvit.json` (post/server/permissions/scheduler).
   * `public/index.html` wired; `dist/server/index.js` builds.
   * `/api/health` and `/internal/install` live.

2. **Data Layer + Identity + postData (Day 1.5)**

   * Redis service (seed/choices/tallies/top).
   * userId hashing (`SHA256(userId + PEPPER)`).
   * postData writer (≤2KB).

3. **Deterministic Seeding (Day 2 morning)**

   * HMAC seeds + PRNG + pools/lexicon; slot coverage; 1-per-cluster.
   * Unit tests for determinism.

4. **Core APIs (Day 2 afternoon)**

   * `/api/init`, `/api/pick`, `/api/progress` with validation, rate limit, and errors.
   * Integration tests with Redis.

After that, follow the roadmap **day-by-day**:

* **Day 5–6:** client UI + realtime + countdown
* **Day 7:** aggregation → slots → prompt
* **Day 8–9:** Vertex image + Media upload + finale UX
* **Day 10:** cron + rollover
* **Day 11–14:** hardening, tests, docs, compliance, submission

### Why this split

* You remove the biggest uncertainty early (platform config + server runtime).
* Seeding and APIs need each other; building them together avoids double work on mocks.
* Once the spine is done, every remaining day is additive UI/ops polish.

---

## Submission checklist (copy/paste for PR template)

* [ ] `devvit.json` validated; `/api/*` & `/internal/*` correct; cron set to **UTC**.
* [ ] HTTP domains allowlisted exactly; ToS & Privacy URLs present.
* [ ] Media upload paths used; no client secrets; client can’t hit external hosts.
* [ ] First paint <400ms with postData; initial bundle ≤ 50KB gz.
* [ ] A11y basics: keyboard, ARIA on chips, chart text summary.
* [ ] Unit/integration/e2e/perf tests green in CI; coverage ≥ 90% core.
* [ ] Telemetry counters visible (requests, p95, errors).
* [ ] README, ARCHITECTURE.md, SUBMISSION.md complete.
* [ ] Demo Interactive Post live; finale auto-comment works or is documented as optional.

---

## Roles & ownership (single-dev version)

You’re solo? Keep it lean:

* **Backend** (you): Days 1–4, 7–8, 10–11 → highest complexity.
* **Frontend** (you): Days 5–6, 9, 12 → keep UI minimal but polished.
* **Ops/Submission** (you): Days 13–14 → paperwork and polish.

---

## Risk ledger (and what to do)

* **Vertex flakiness:** cache the last good image; show “rendering delayed” state; retry with backoff.
* **Realtime outages:** long-poll `/api/progress` every 5s as fallback.
* **App Review nitpicks:** ensure ToS/Privacy; no external client fetch; minimal permissions.
* **Cron timezone mistakes:** we fixed to **UTC** (16:00 UTC = 23:00 BKK). Don’t invent a timezone field.

---

## What you’ll have at the end

* A **deterministic, auditable** daily crowd → prompt → image loop.
* A minimal, **fast** client that feels native to Reddit posts.
* A submission package tuned for both **Community Play** and **Kiro DevEx** judging.
