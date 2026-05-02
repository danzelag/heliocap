# OpenClaw Reroof — Implementation Plan

**Legend:**  
✅ Already built | 🔨 Build next | 👤 Manual step required | 🤖 AI used in production | 🛠️ AI used to write the code

---

## What's Already Done

| Feature | Status |
| :--- | :--- |
| Next.js app + Vercel deployment | ✅ |
| Supabase schema (`leads`, `cta_submissions`, `page_views`) | ✅ |
| Admin dashboard + CRUD | ✅ |
| Google Maps Static API (satellite image) | ✅ |
| Google Solar API + SVG panel overlay | ✅ `src/lib/openclaw-google.ts` |
| Web Mercator lat/lng → pixel projection | ✅ inside `buildSolarOverlaySvg` |
| Financial model (70% array, $1.8/W, 30% ITC) | ✅ `buildSolarModel` |
| Proposal microsite at `/proposal/[slug]` | ✅ |
| CTA form + submissions table | ✅ |
| `POST /api/leads` webhook for external intake | ✅ secured with `N8N_WEBHOOK_SECRET` |
| Address autocomplete (Google Places) | ✅ |
| Prospects table migration + pipeline dashboard | ✅ pipeline-first MVP foundation |

**Not built:** parcel sourcing, LLC piercing, enrichment, video, outreach, reply handling.
**Hard truth:** video is v2. Build the boring pipeline first; that is the money machine.

---

## Phase 0 — Foundation Setup (Do This First)
*No code yet — infrastructure you need before any phase can run.*

### 0a. New Supabase table: `prospects`
The `leads` table is for **deployed microsites**. You need a separate `prospects` table for the raw pipeline (buildings not yet contacted).

👤 **You do this:** Open Supabase → SQL Editor, run:

```sql
CREATE TABLE prospects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Parcel data
  address TEXT NOT NULL,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  parcel_id TEXT,
  owner_llc TEXT,
  sqft NUMERIC,
  year_built INTEGER,
  use_code TEXT,
  county TEXT,
  metro TEXT,
  -- Solar data (populated after Phase 1b)
  panel_count INTEGER,
  system_kw NUMERIC,
  yearly_kwh NUMERIC,
  annual_savings NUMERIC,
  system_cost NUMERIC,
  federal_itc NUMERIC,
  payback_years NUMERIC,
  satellite_url TEXT,
  render_url TEXT,
  solar_quality TEXT, -- 'google_solar' | 'fallback'
  -- Owner enrichment (Phase 2)
  owner_name TEXT,
  owner_title TEXT,
  owner_email TEXT,
  owner_phone TEXT,
  owner_linkedin TEXT,
  email_confidence NUMERIC,
  enrichment_source TEXT,
  -- Outreach state
  pipeline_stage TEXT DEFAULT 'sourced',
    -- sourced → solar_fetched → enriched → microsite_live → emailed → replied → booked
  lead_id UUID REFERENCES leads(id),
  video_url TEXT,
  microsite_slug TEXT,
  -- Outreach log
  email_sent_at TIMESTAMPTZ,
  email_day3_sent_at TIMESTAMPTZ,
  sms_sent_at TIMESTAMPTZ,
  reply_received_at TIMESTAMPTZ,
  reply_classification TEXT,
  booked_at TIMESTAMPTZ,
  -- Meta
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: only authenticated admins
ALTER TABLE prospects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access" ON prospects
  FOR ALL TO authenticated USING (true);

-- Index for pipeline stage queries
CREATE INDEX idx_prospects_stage ON prospects(pipeline_stage);
CREATE INDEX idx_prospects_metro ON prospects(metro);
```

### 0b. Supabase Storage bucket
👤 **You do this:** Supabase → Storage → New Bucket → name: `prospects`, Public: yes.  
(The existing `leads` bucket is for deployed microsites. Keep them separate.)

### 0c. Accounts + API keys to set up now
👤 **You get these, then add to Vercel env vars:**
- Regrid API → [app.regrid.com](https://app.regrid.com) → API key
- OpenCorporates → [opencorporates.com](https://opencorporates.com) → API key (~$50/mo)
- Apollo.io → [apollo.io](https://apollo.io) → API key (~$49/mo starter)
- MillionVerifier → [millionverifier.com](https://millionverifier.com) → API key
- Instantly → [instantly.ai](https://instantly.ai) → API key (~$97/mo)
- n8n Cloud → [n8n.io](https://n8n.io) → ($20/mo) OR self-host free

🔒 **Vercel env var required for app webhooks:**
- `N8N_WEBHOOK_SECRET` → shared bearer token for n8n → Next.js calls

🧊 **V2 only:** Fal.ai / Veo video. Do not buy or wire this until the non-video pipeline proves reply rates.

### 0d. n8n setup
If self-hosting: 👤 **You run in terminal:**
```bash
npx n8n
# or with Docker:
docker run -it --rm --name n8n -p 5678:5678 -v n8n_data:/home/node/.n8n n8nio/n8n
```
n8n will be at `http://localhost:5678`. For production, deploy to Railway or Render (free tier).

---

## Phase 1 — Parcel Sourcing Pipeline
*Goal: fill the `prospects` table with real buildings.*

### 1a. n8n workflow: Regrid → Supabase
🔨 **Build:** Create an n8n workflow with these nodes:

1. **Trigger:** Manual / Cron (weekly, Sunday 2am)
2. **HTTP Request** → Regrid API, filter by metro + use_code + sqft + year_built
3. **Code Node** → normalize parcel fields, generate a UUID
4. **Supabase Node** → upsert into `prospects` (on conflict: parcel_id do nothing)

🛠️ **Use Gemini Flash** to write this n8n workflow JSON. Paste the Regrid API docs + the `prospects` schema and ask:
> "Write an n8n workflow JSON that queries Regrid for commercial parcels in Maricopa County with use_code in [industrial, warehouse, manufacturing], min_sqft 50000, year_built 1995–2005. Normalize the response and upsert into Supabase table `prospects`. Handle pagination."

**Cost:** ~$0.01/parcel from Regrid. Start with 500 prospects for v1.

👤 **You do:** In n8n, create a new workflow → import the generated JSON → add your Regrid API key credential → test with limit=10 → run it.

### 1b. Solar geometry sub-workflow (wire into existing API)
The `/api/generate-roof-image` route already does everything for Step 3 in the guide. You just need n8n to call it for each new prospect.

🔨 **Build:** After the Supabase upsert node, add:
- **HTTP Request** → `POST https://your-vercel-app.vercel.app/api/generate-roof-image`
  - Header: `Authorization: Bearer {{ $env.N8N_WEBHOOK_SECRET }}`
  - Body: `{ lat, lng, slug: prospect.id, formattedAddress, bucket: "prospects" }`
- **Supabase Node** → update prospect with `satellite_url`, `render_url`, `panel_count`, `system_kw`, `annual_savings`, `federal_itc`, set `pipeline_stage = 'solar_fetched'`

This calls your existing code — no new dev work needed here. The route already calls Google Solar API, builds the SVG overlay, uploads to Storage, and returns URLs.

🛠️ **Use Codex** to write the n8n HTTP + Supabase update nodes (just JSON configuration, not logic).

---

## Phase 2 — LLC Piercing + Owner Enrichment
*Goal: find the real human with authority to sign a $500k solar deal.*

### 2a. n8n sub-workflow: `prospects` where stage = 'solar_fetched'
🔨 **Build nodes:**

1. **Supabase Node** → SELECT from `prospects` WHERE `pipeline_stage = 'solar_fetched'` LIMIT 20
2. **Loop Over Items**
3. **HTTP Request** → OpenCorporates search by `owner_llc + jurisdiction`
4. **Code Node** → extract officers list (registered agent, president, CEO)
5. **HTTP Request** → Apollo company search → get LinkedIn profiles
6. **Code Node** → rank officers: Owner > President > CEO > CFO > Facilities Director
7. **HTTP Request** → Apollo people enrichment → email + phone for top-ranked officer
8. **HTTP Request** → MillionVerifier → verify email deliverability
9. **Filter Node** → confidence > 0.95, else try next-ranked officer
10. **Supabase Node** → update prospect: `owner_name`, `owner_email`, `owner_phone`, `owner_linkedin`, `email_confidence`, `enrichment_source`, set `pipeline_stage = 'enriched'`

🛠️ **Use Gemini Pro** to write the OpenCorporates + Apollo orchestration logic (it involves cross-referencing multiple API responses — needs reasoning, but not Claude-level cost).

🤖 **No AI in production here** — this is pure API calls + business logic.

👤 **You do:** Add OpenCorporates, Apollo, MillionVerifier credentials to n8n. Run on 10 prospects first to validate email quality before scaling.

### 2b. Fallback: manual enrichment in admin dashboard
For v1, add a "Prospects" tab to `/admin` that shows `pipeline_stage = 'solar_fetched'` rows with a manual "Enrich" button that fires the n8n webhook for that one prospect.

🛠️ **Use Sonnet** to add this tab (it touches multiple files: new admin page, new API route to trigger n8n).

---

## Phase 3 — Video Generation (Deferred to V2)
*Goal later: 15-second drone flyover per prospect. Do not build for v1.*

Video is the dominant cost. At 500 prospects, it is roughly $1,000/month before you know whether the outbound motion works. Skip it for v1 and validate reply rates with the solar render, financial math, and personalized microsite.

### 3a. New API route: `POST /api/generate-video`
🧊 **V2 only:** Build `src/app/api/generate-video/route.ts` after reply-rate validation:

```typescript
// Input: { prospectId, satelliteImageUrl, businessName, city, industry }
// Steps:
// 1. Call Fal.ai Veo 3 with the satellite image + cinematic prompt
// 2. Poll for completion (Fal.ai is async, ~90 seconds)
// 3. Download mp4 from Fal.ai temp URL
// 4. Upload to Supabase Storage: prospects/{prospectId}/flyover.mp4
// 5. Return { video_url }
```

🛠️ **Use Sonnet** to write this later. Fal.ai has a JS SDK (`@fal-ai/client`). The tricky part is async polling.

### 3b. FFmpeg compositing (panel overlay + text burn-in)
The guide describes burning in owner name, federal credit, and countdown timer.

**Simplest path for v1:** Skip FFmpeg entirely. Instead:
- Use the satellite PNG + SVG overlay already generated (it's already in Supabase Storage)
- Add the text as HTML overlays on the proposal microsite
- Use the Veo 3 video as the hero background without compositing

FFmpeg compositing is a significant engineering lift (binary installation, streaming, encoding). **Defer it to v2** unless you have a specific reason the text must be burned into the video file.

👤 **You do:** If you want FFmpeg in v1: add a `flyover-compositor` service on Railway (Node.js + ffmpeg binary). Otherwise skip.

### 3c. Wire into n8n
🧊 **V2 only:** After enrichment is done, add to n8n workflow:
- **HTTP Request** → `POST /api/generate-video` with prospect data
- **Supabase Node** → update `video_url`; add a dedicated video stage in the v2 migration if needed

---

## Phase 4 — Microsite Deployment
*Goal: each prospect gets `/proposal/[slug]` live.*

### 4a. The `/api/leads` route already works
Your existing `POST /api/leads` creates a lead, generates a slug, and publishes it immediately. This is the deploy step.

🔨 **Build:** Add to n8n workflow (after `enriched`; skip video in v1):
- **HTTP Request** → `POST https://your-app.vercel.app/api/leads`
  - Header: `Authorization: Bearer {{ $env.N8N_WEBHOOK_SECRET }}`
  - Body: business_name, contact_name=owner_name, address, roof_sqft, utility_rate, estimated_savings, estimated_payback, roof_image_url, render_image_url
- **Supabase Node** → update prospect: `lead_id`, `microsite_slug`, set `pipeline_stage = 'microsite_live'`

### 4b. Wire video URL into proposal page
✅ **Built for future compatibility:** The `leads` table has a `video_url` column and the proposal page hero autoplays it if present.

👤 **You do:** Supabase SQL Editor:
```sql
ALTER TABLE leads ADD COLUMN video_url TEXT;
```

🧊 **V2 only:** Generate/populate `video_url` after reply-rate validation.

### 4c. Subdomains (optional, v2)
The guide describes `[slug].openclawsolar.com` subdomains. For v1, `/proposal/[slug]` URLs are fine and easier.  
**Defer subdomains until you have proof of concept.**

---

## Phase 5 — Email Outreach
*Goal: automated Day 0 + Day 3 emails via Instantly.*

### 5a. Email copy generation
🤖 **Use Gemini Flash in production** (high volume, cheap, good enough for templated outreach copy).

Add an n8n **HTTP Request** node that calls Gemini Flash API:
- Input: `{ owner_name, business_name, address, annual_savings, federal_itc, microsite_url, days_until_deadline }`
- Prompt: generate subject line + 3-sentence email body. Short, direct, no marketing speak.
- Output: `{ subject, body_text }`

🛠️ **Use Gemini Flash** to write this prompt template and the n8n node config.

### 5b. Send via Instantly
🔨 **Build** n8n nodes:
1. **HTTP Request** → Instantly API: create campaign (one-time setup)
2. **HTTP Request** → Instantly API: add lead to campaign with custom variables (owner_name, microsite_url, etc.)
3. **Supabase Node** → set `email_sent_at = NOW()`, `pipeline_stage = 'emailed'`

### 5c. Day 3 follow-up
🔨 **Build:** Separate n8n workflow, triggered by Cron:
- SELECT prospects WHERE `pipeline_stage = 'emailed'` AND `email_sent_at < NOW() - INTERVAL '3 days'` AND `reply_received_at IS NULL`
- Generate Day 3 email via Gemini Flash
- Send via Instantly API
- Update `email_day3_sent_at`

👤 **You do:** In Instantly, warm 5 inboxes for 30 days before sending. Set up 1 sending domain (not your primary). This CANNOT be skipped — cold inboxes get flagged immediately.

---

## Phase 6 — Reply Handling + Booking
*Goal: auto-classify replies and fire calendar links.*

### 6a. Instantly webhook → n8n
When a reply arrives, Instantly fires a webhook. 

🔨 **Build** n8n workflow:
1. **Webhook Trigger** ← Instantly reply event
2. **HTTP Request** → Gemini Flash API: classify the reply
3. **Switch Node** → route by classification
4. **Interested branch:** HTTP Request → Instantly send calendar link reply
5. **Not_Now branch:** update `pipeline_stage = 'snoozed'`, set `email_sent_at = NOW() + INTERVAL '30 days'`
6. **Wrong_Person branch:** clear owner fields, reset to `pipeline_stage = 'solar_fetched'` to re-enrich
7. **Unsubscribe branch:** set `pipeline_stage = 'dead'`
8. **Question branch:** Supabase update `reply_classification = 'question'` → notify you via Slack/email
9. **Supabase Node** → update `reply_received_at`, `reply_classification`

🤖 **Use Gemini Flash in production** for reply classification. This is a 4-class text classification — doesn't need Claude. Prompt:

```
Classify this email reply as exactly one of: Interested, Not_Now, Wrong_Person, Unsubscribe, Question.
Reply: {reply_text}
Output: JSON { "classification": "...", "confidence": 0.0-1.0 }
```

### 6b. Cal.com integration
🔨 **Build:** For Interested replies, the Instantly reply should include a Cal.com booking link. No code needed — just configure a Cal.com event type and hardcode the URL in the Instantly reply template.

👤 **You do:** Create a Cal.com account, set up a "30-min Solar Assessment" event type. Get the booking URL. Paste it into the Instantly reply template.

---

## Phase 7 — Dashboard: Prospects Pipeline View
*Goal: see the full pipeline, not just deployed microsites.*

### 7a. Add `/admin/pipeline` page
🔨 **Build:** New Next.js page that shows `prospects` table grouped by `pipeline_stage`:
- Sourced → Solar Fetched → Enriched → Video Ready → Live → Emailed → Replied → Booked

Display counts per stage, table of records in each stage, stage transition buttons (manual override).

🛠️ **Use Sonnet** — touches multiple files, needs Supabase queries + UI components.

### 7b. Supabase Realtime feed on admin home
🔨 **Build:** The admin home (`/admin`) already has a "Signal Chain" widget. Wire it to real `prospects` counts via Supabase Realtime.

🛠️ **Use Haiku** — it's a simple Supabase Realtime subscription wired to existing UI elements.

---

## Build Order (V1 MVP — "50 Emails in 9 Days")

| Day | Task | AI for Code | You Do |
| :--- | :--- | :--- | :--- |
| 1 | Phase 0: create `prospects` table + buckets | — | Run SQL migration |
| 1 | Phase 0: get API keys | — | Sign up for Regrid, Apollo, MillionVerifier |
| 1 | Phase 0: spin up n8n | — | `npx n8n` or Railway deploy |
| 2 | Phase 1a: Regrid → Supabase n8n workflow | Gemini Flash | Import JSON to n8n, test with 10 records |
| 2 | Phase 1b: wire `/api/generate-roof-image` into n8n | Codex | Add HTTP + Supabase nodes |
| 3 | Phase 2a: OpenCorporates + Apollo enrichment workflow | Gemini Pro | Add credentials to n8n, test on 5 prospects |
| 4 | Phase 4a: wire `/api/leads` into n8n (microsite deploy) | — | Run end-to-end test with 1 prospect |
| 4 | Phase 4b: add future-compatible `video_url` to `leads` table + proposal hero | Haiku | Run SQL migration |
| 5 | Phase 5a: Gemini Flash email copy generation | Gemini Flash | — |
| 5 | Phase 5b: Instantly campaign + n8n send node | Codex | Set up Instantly campaign, verify sending domain |
| 5 | Phase 5c: Day 3 follow-up cron workflow | Codex | Schedule in n8n |
| 6 | Phase 6a: reply classification workflow | Gemini Flash | Configure Instantly webhook URL |
| 6 | Phase 6b: Cal.com booking link | — | Create Cal.com event, paste URL into Instantly template |
| 7 | Phase 7a: `/admin/pipeline` page | Sonnet | — |
| 9 | End-to-end test: 5 prospects, all stages | — | Verify, tune |
| 9 | Send first 50 real emails | — | Pull trigger in Instantly |

**Skip for v1:** Veo/Fal video, FFmpeg compositing (Phase 3b), subdomains (Phase 4c), SMS/direct mail.

---

## AI Assignment Summary

| Task | Model | Why |
| :--- | :--- | :--- |
| n8n workflow JSON (Regrid, API wiring) | **Codex** | Boilerplate JSON config, no reasoning needed |
| Enrichment orchestration logic | **Gemini Pro** | Cross-referencing API responses, ranking logic |
| Simple UI additions (future video tag, Realtime) | **Haiku** | Mechanical JSX changes |
| Multi-file features (pipeline page) | **Sonnet** | Touches routes, services, actions, and UI |
| Email copy prompt template | **Gemini Flash** | High volume, cheap, good enough |
| Reply classification in production | **Gemini Flash** | 4-class text classification, runs on every reply |
| Inbox classifier prompt design | **Sonnet** | One-time prompt engineering, get it right |
| Architecture / edge case questions | **Opus** | Reserve for hard decisions only |

**Never use Opus or Sonnet for:** reply classification at scale, email copy generation at scale, parcel data parsing, or any task running on every prospect automatically.

---

## Costs at 500 Prospects/Month

| Item | Cost |
| :--- | :--- |
| Regrid (500 parcels) | $5 |
| Google Solar API (500 calls) | $50 |
| Google Maps Static (500 images) | $1 |
| OpenCorporates | $50/mo flat |
| Apollo (500 enrichments) | included in $49/mo |
| MillionVerifier (500 checks) | $2.50 |
| Gemini Flash (email copy + classification) | ~$0.50 |
| Instantly | $97/mo flat |
| n8n Cloud | $20/mo |
| **V1 Total without video** | **~$275/mo** |

Video is the dominant cost. **For v1, skip video.** Run the pipeline without it ($275/mo) and add video only after you validate reply rates.
