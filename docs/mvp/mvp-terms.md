
# Beef — MVP spec for Devvit Web (Hackathon Oct 13–29, 2025)

**Why this version?**

* Updates **`devvit.json`** to the **current Devvit Web schema** (`post`, `server`, `permissions`, `scheduler.tasks`, `/internal/*` triggers) and removes legacy fields.
* Clarifies **endpoint namespaces**: **client‑called** routes must start with **`/api/`**; **internal** routes for scheduler/triggers/settings must start with **`/internal/`**.
* Locks in platform **limits** (30s, 4MB request, 10MB response, no websockets) and **postData 2KB**.
* Corrects **imports** to `@devvit/web/client` and `@devvit/web/server`, and aligns **Realtime** and **Media** usage.
* Adds **HTTP Fetch** allowlist rules and ToS/Privacy requirements (App Review will actually check these).

---

## Hackathon overview (Oct 13–29, 2025)

* Build a new game/social experiment using **Devvit Web** interactive posts. See the **Devvit Web Overview** for architecture and limits.

---

## Devvit Web — essentials for Beef

* **What it is:** standard web client in a post + Node server. You define **server endpoints** and fetch them from the client; no postMessage. **All client‑facing endpoints start with `/api/`**.
* **Limits that matter:** Node is **serverless/ephemeral**, **no websockets** (long‑poll under 30s is fine), **no native packages or `fs`**, **30s max**, **4MB request / 10MB response**.
* **File layout:**

  ```
  - src/
    - client/  // webview code (HTML/CSS/JS)
    - server/  // your router & handlers
  - devvit.json
  ```

  (This is the canonical template layout.)

**Realtime:** subscribe on client, send from server (`connectRealtime` / `realtime.send`).

**Media:** you **must** upload runtime images to Reddit via the Media API (PNG/JPEG/GIF, ≤20MB). External images must be uploaded—no hotlinking.

**HTTP Fetch:** server can call allow‑listed domains; client **cannot** call external domains (client may only hit your own webview’s `/api/*`). Domain entries must be exact hostnames; timeouts are 30s; if you enable fetch you **must provide ToS + Privacy Policy**.

---

## 0) Product snapshot (MVP)

* **Name:** Beef
* **Loop:** Daily (Asia/Bangkok cutoff in product logic), per‑user keywords → pick few → crowd tallies → assemble prompt → generate image → post finale.
* **Categories:** Community Play (+ Kiro DevEx optional)
* **Non‑goals (MVP):** no accounts, no long video in‑post, no NSFW.

---

## 1) Data model (Redis + postData)

**Redis keys**

* `seed:{date}` → `{ seedHex, theme, poolsVersion }`
* `choices:{date}` (HASH) → `{ userIdHash: '["wordA","wordB"]' }`
* `tallies:{date}` (ZSET) → `{ word -> count }`
* `slots:{date}` → assembled slot choices for transparency (JSON)
* `prompt:{date}` → **final text prompt** (string)
* `img:{date}` → `{ status: "pending|done|error", cdnUrl, provider, model, params }`
* `video:{date}` (optional) → same shape as `img:{date}`
* `telemetry:{date}` (HASH) → perf counters

**postData (≤2KB, public):**

```json
{
  "date": "2025-10-14",
  "theme": "Nocturnal Cities",
  "seedPreview": "8d23…",
  "teaserTop": ["neon", "rain", "alley"],
  "timeLeftSec": 43122
}
```

(**Post Data** is sent to the client and capped at **2KB**—no secrets.)

---

## 2) Deterministic keyword seeding

* **Daily seed:** `HMAC_SHA256(SECRET, dateISO)`
* **User seed:** `HMAC_SHA256(seedDay, userId)`
* **PRNG:** SplitMix64/Xoroshiro128**, implement `nextUint`, `nextFloat`, `shuffle`, `choice`.

Pools & taxonomy, 1‑per‑cluster, slot coverage, a couple of wildcards. (Your pseudocode is fine.)

---

## 3) The “word race” → slots → prompt

Normalize counts to weights; map to canonical slots via lexicon; pick winners with deterministic tie‑break (`HMAC_SHA256(seedDay, canonical)`).

**Prompt assembly (final string)**: single paragraph, compact; include a short negative list (`avoid text, artifacts, extra limbs, watermarks`). Keep under ~350 chars for Imagen/Gemini prompt budgets.

---

## 4) Video (optional “finale+”)

8–12s beat‑sheet template; async job pattern; store `video:{date}`. Use **Veo on Vertex AI**.

---

## 5) API (server)

**Namespaces**

* **Client‑facing:** `/api/*` (fetch from webview) — **required**.
* **Internal:** `/internal/*` for scheduler/triggers/settings validation.

**Client‑facing endpoints**

```http
GET  /api/init?date=YYYY-MM-DD
  -> { seedPreview, myWords:[string], progress:{top:[{word,count}]}, timeLeftSec }

POST /api/pick
  body: { words:[string], date }
  -> { ok:true, accepted:[...], top:[{word,count}] }

GET  /api/progress?date=YYYY-MM-DD
  -> { top:[{word,count}], my:[...], timeLeftSec }
```

**Internal (cron/ops)**

```http
POST /internal/finale-image
POST /internal/finale-video
POST /internal/rollover
```

⚠️ **Note:** Internal routes **must** be `/internal/*`. Don’t mount these under `/api/`.

**Auth:** handled by Devvit middleware; you don’t hand‑roll tokens.

---

## 6) `devvit.json` (final, schema‑accurate)

```json
{
  "$schema": "https://developers.reddit.com/schema/config-file.v1.json",
  "name": "choice-chorus",

  "post": {
    "dir": "public",
    "entrypoints": {
      "default": { "entry": "index.html", "height": "tall" }
    }
  },

  "server": {
    "entry": "dist/server/index.js"
  },

  "permissions": {
    "redis": true,
    "realtime": true,
    "media": true,
    "http": {
      "enable": true,
      "domains": [
        "us-central1-aiplatform.googleapis.com",
        "vertex-ai.googleapis.com",
        "storage.googleapis.com"
      ]
    },
    "reddit": {
      "enable": true,
      "asUser": ["SUBMIT_POST", "SUBMIT_COMMENT"]
    }
  },

  "scheduler": {
    "tasks": {
      "daily-finale-image": {
        "endpoint": "/internal/finale-image",
        "cron": "0 16 * * *"
      },
      "daily-rollover": {
        "endpoint": "/internal/rollover",
        "cron": "5 16 * * *"
      },
      "cleanup-old-data": {
        "endpoint": "/internal/cleanup",
        "cron": "0 18 * * *"
      }
    }
  },

  "triggers": {
    "onAppInstall": "/internal/install",
    "onAppUpgrade": "/internal/upgrade"
  },

  "marketingAssets": {
    "icon": "assets/icon.png"
  },

  "dev": {
    "subreddit": "your-test-subreddit"
  }
}
```

**Why this shape?**

* **`post.entrypoints.default.entry`** is your HTML or an API endpoint; `"height"` is `"regular"` or `"tall"`.
* **`server.entry`** points to your **compiled** server bundle.
* **`permissions.http.domains`** must be exact hostnames (no protocol, no wildcards).
* **`scheduler.tasks.*.endpoint`** **must** be `/internal/*`; no timezone key exists—cron strings only.
* **`reddit.asUser`** unlocks “run as user” actions after approval.
  References: config, scheduler, HTTP fetch, user actions.

> **Cron timing:** Devvit doesn’t expose a timezone setting in `devvit.json`. If you want “23:00 Asia/Bangkok”, compute the **UTC** cron equivalent in your CI or use a small helper to choose the correct UTC minute/hour at deploy time. (Don’t invent a `timezone` field—validation will fail.)

---

## 7) Vertex calls (server‑side)

**Image (Imagen 3 or Gemini 2.5 Flash‑Image)**

```ts
const req = {
  model: "imagen-3.0-capability-001" /* or "gemini-2.5-flash-image" */,
  prompt: finalPrompt,                 // 1–3 sentences
  negativePrompt: "text, artifacts, watermark, deformed",
  aspectRatio: "16:9",
  guidanceScale: 6.5,
  seed: seedInt(seedDay)
};
```

Docs: Imagen 3 capability & Gemini 2.5 Flash Image.

**Video (Veo)**

```ts
const job = await veo.create({
  prompt: beatSheet,
  duration: 10,
  aspectRatio: "16:9"
}); // poll status, store GCS URI or bytes
```

Docs: Veo video generation API overview and model reference.

> **HTTP allowlist:** add **`vertex-ai.googleapis.com`**, **`us-central1-aiplatform.googleapis.com`**, and **`storage.googleapis.com`** to `permissions.http.domains`. Exact hostnames only; no protocols or wildcards.

---

## 8) Client UX (feed‑native, minimal taps)

* **Splash (<400ms):** theme + teaser from `postData`; CTA **“Draw my words”**.
* **Main:** personal chips (select up to K), live top‑10 bar via Realtime, countdown, submit state.
* **Finale day:** render generated image (and video if present), show **final prompt** and per‑slot winners.
* **A11y:** focus order, ARIA on chips, textual summary of chart.

---

## 9) Realtime channels

* Channel `run:{date}` payloads:

  * `{ type:"tally", top:[{word,count}] }`
  * `{ type:"lockdown" }` at cutoff
  * `{ type:"final", imageUrl, prompt }`
* Client: `connectRealtime({ channel, onMessage })`
* Server: `realtime.send(channel, msg)`
  Docs & imports: `@devvit/web/client` and `@devvit/web/server`. Batch updates 1–3s.

---

## 10) Safety, moderation, fairness

* **Input filtering:** only curated pools; no free text.
* **Blocklist:** remove words that yield unsafe outputs.
* **Determinism:** HMAC tie‑breaks; auditability.
* **Privacy:** `userIdHash = SHA256(userId + PEPPER)`; never log raw ids.
* **Compliance:** If you enable HTTP Fetch or collect user data, you **must** provide ToS and Privacy Policy links; App Review will check. Also comply with **Devvit Rules**.

---

## 11) Testing & Kiro integration (DevEx category)

* **Unit:** PRNG determinism, tie‑breaks, prompt length.
* **Integration:** Redis + API endpoints.
* **E2E:** full flow, live chart, cutoff.
* **Perf:** target P95 <150ms on user endpoints; throttle realtime.
* **Kiro helpers:** prompt auditor, load simulator, telemetry dashboard.

---

## 12) Delivery plan (14 days)

* **Days 1–2:** scaffold repo, Redis + postData + realtime; pools v1 + seeding.
* **Days 3–4:** `/api/init`, `/api/pick`, `/api/progress`; live chart + chips + countdown.
* **Days 5–6:** slot assembly + prompt render; Imagen/Gemini image; media upload + finale post.
* **Day 7:** scheduler wiring (cron in UTC), telemetry, retries.
* **Stretch:** Veo video, gallery, variants.

---

## 13) Copy blocks (ship‑ready)

* **Splash:** “today’s chorus is forming. draw your words. add your voice.”
* **Finale auto‑comment:** “{N} redditors composed today’s image. top words: {w1}, {w2}, {w3}. full prompt below. reset at 23:00 BKK.”

---

## 14) Handoff checklist

* [ ] `data/pools.v1.json` + `data/lexicon.map.json`
* [ ] `src/server/services/seed.ts` (HMAC, PRNG, shuffle)
* [ ] `src/server/services/assemble.ts` (slots + prompt)
* [ ] `src/server/services/vertex.ts` (image/video adapters)
* [ ] Routes: `/api/init`, `/api/pick`, `/api/progress`, `/internal/finale-image`, `/internal/finale-video`
* [ ] `devvit.json` per above (cron in **UTC**)
* [ ] Client: chips, chart, countdown, finale view
* [ ] Telemetry, logs, alert on job failure

---

# Code & config deltas you **must** keep

1. **Imports & SDK names**
   Use these:

```ts
// client
import { context, connectRealtime } from '@devvit/web/client';

// server
import { reddit, realtime, scheduler, settings } from '@devvit/web/server';
import { media } from '@devvit/media';
```

Realtime API and usage: **here**.

2. **Endpoints**

* Client calls → `/api/*` only.
* Scheduler/Triggers/Settings validation → `/internal/*`.
  Docs: overview, config, scheduler.

3. **HTTP fetch**

* Put **exact hostnames** in `permissions.http.domains`. No wildcards, no scheme, no paths. 30s timeout. **ToS & Privacy** required if you fetch.

4. **Media**

* Upload runtime images to Reddit via `media.upload` (PNG/JPEG/GIF ≤20MB).

5. **postData**

* Max **2KB**; sent to client; safe for teaser/splash only.

---

## Source‑of‑truth docs (linked)

* **Devvit Web Overview** — architecture, limits, `/api/*`.
  [https://developers.reddit.com/docs/capabilities/devvit-web/devvit_web_overview](https://developers.reddit.com/docs/capabilities/devvit-web/devvit_web_overview)
* **Devvit Web Configuration** — `devvit.json` schema, `post`, `server`, `permissions`, `/internal/*` for triggers/forms/scheduler.
  [https://developers.reddit.com/docs/capabilities/devvit-web/devvit_web_configuration](https://developers.reddit.com/docs/capabilities/devvit-web/devvit_web_configuration)
* **Server: Scheduler** — `scheduler.tasks` and `/internal/*` endpoints.
  [https://developers.reddit.com/docs/capabilities/server/scheduler](https://developers.reddit.com/docs/capabilities/server/scheduler)
* **Server: HTTP Fetch** — allowlist, domain rules, 30s timeout, ToS/Privacy requirement.
  [https://developers.reddit.com/docs/capabilities/server/http-fetch](https://developers.reddit.com/docs/capabilities/server/http-fetch)
* **Server: Post Data** — 2KB limit, usage.
  [https://developers.reddit.com/docs/capabilities/server/post-data](https://developers.reddit.com/docs/capabilities/server/post-data)
* **Realtime (Web)** — `connectRealtime` / `realtime.send`.
  [https://developers.reddit.com/docs/capabilities/realtime/overview](https://developers.reddit.com/docs/capabilities/realtime/overview)
* **Media Uploads** — supported types, 20MB limit.
  [https://developers.reddit.com/docs/capabilities/server/media-uploads](https://developers.reddit.com/docs/capabilities/server/media-uploads)
* **User Actions / Reddit API** — `asUser`, `runAs: 'USER'`.
  [https://developers.reddit.com/docs/capabilities/server/userActions](https://developers.reddit.com/docs/capabilities/server/userActions)
* **Devvit Rules** — compliance, ToS/Privacy expectations.
  [https://developers.reddit.com/docs/devvit_rules](https://developers.reddit.com/docs/devvit_rules)
* **Imagen 3** — model capability doc.
  [https://cloud.google.com/vertex-ai/generative-ai/docs/models/imagen/3-0-capability-001](https://cloud.google.com/vertex-ai/generative-ai/docs/models/imagen/3-0-capability-001)
* **Gemini 2.5 Flash Image** — model doc (note: deprecation notice for previews).
  [https://cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/2-5-flash](https://cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/2-5-flash)
* **Veo (Video)** — overview + API reference.
  [https://cloud.google.com/vertex-ai/generative-ai/docs/video/overview](https://cloud.google.com/vertex-ai/generative-ai/docs/video/overview)
  [https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/veo-video-generation](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/veo-video-generation)

---
