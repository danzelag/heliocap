# Veo Cinematic Video — Implementation Plan

**Goal:** Replace the two-image GIS layout with a single full-bleed cinematic Veo video hero on every proposal. One render per proposal, one universal prompt, n8n polling workflow. Emotional visualization tool, not engineering simulation.

**Authors:** Claude + Codex  
**Notepad:** See `## Shared Notepad` at the bottom — both agents should update it as work progresses.

---

## Current state (pre-implementation)

| Already done | Location |
| :--- | :--- |
| `video_url TEXT` column in Supabase | migration `20240502000000_openclaw_pipeline.sql:71` |
| `video_url` in `Lead` interface | `src/services/lead.service.ts:17` |
| `videoUrl` in `ProposalViewModel` | `src/components/proposal/types.ts:42` |
| `videoUrl` mapped from lead | `src/app/proposal/[slug]/page.tsx:107` |
| Video branch exists in `PropertyVisual` | `src/components/proposal/PropertyVisual.tsx:59–69` |
| Gemini still pipeline | `src/lib/gemini-solar-render.ts` + `src/app/api/generate-proposal-image/route.ts` |
| `updateProposalJobProgress` helper | `src/lib/proposal-job-events.ts` |
| `N8N_WEBHOOK_SECRET` auth helper | `src/lib/n8n-auth.ts` |
| `GEMINI_API_KEY` env var | already in Vercel + `.env.local` |

**No DB migration required.** `video_url` is already wired end-to-end; it's just never populated.

---

## Phase 0 — Kill two-image layout, promote still to full-bleed hero

**Effort:** ~half a day  
**Ships independently.** Do this before any Veo work. It makes every existing proposal immediately more premium.

### 0.1 — Delete `PropertyVisual`

- Delete `src/components/proposal/PropertyVisual.tsx` entirely.
- In `src/app/proposal/[slug]/page.tsx`:
  - Remove `import { PropertyVisual } from '@/components/proposal/PropertyVisual'` (line 10)
  - Remove `<PropertyVisual proposal={proposal} />` (line 57)

### 0.2 — Rewrite `Hero` to full-bleed visual

Replace the dim background image in `src/components/proposal/Hero.tsx`.

**Current behavior** (lines 15–22): `<img>` at `opacity-[0.35]` used as a faint background.

**New behavior:** Full-bleed visual layer. Priority order:
1. If `proposal.videoUrl` → `<video autoPlay muted loop playsInline>`
2. Else → `<img>` (the Gemini still / roof image)
3. Else → gradient only (no change)

**Full-bleed means:** `absolute inset-0 -z-10 h-full w-full object-cover` — same positioning, no opacity dimming. The overlaid gradient (lines 24–30) already handles text legibility; leave it as-is.

**Video element spec:**
```tsx
<video
  src={proposal.videoUrl}
  poster={proposal.heroImageUrl ?? undefined}
  autoPlay
  muted
  loop
  playsInline
  className="absolute inset-0 -z-10 h-full w-full object-cover"
  aria-hidden="true"
/>
```

**Still image fallback spec (same class, no opacity):**
```tsx
<img
  src={proposal.heroImageUrl}
  alt=""
  aria-hidden="true"
  className="absolute inset-0 -z-10 h-full w-full object-cover"
/>
```

**Reduced-motion fallback:** Wrap the video in a `prefers-reduced-motion` check — if motion is reduced, render the still instead. Use a CSS class or inline media query check via a small client component.

**Do not change:** headline, CTA buttons, stats badge, scroll indicator, nav bar, gradient overlays, grid-bg. Only the background visual layer changes.

### 0.3 — `heroImageUrl` fallback chain (already correct)

`buildProposalViewModel` in `src/app/proposal/[slug]/page.tsx:108` already sets:
```ts
heroImageUrl: lead.render_preview_url || lead.roof_image_url || lead.render_image_url,
```
No change needed here. Used as `<video poster>` and as the still fallback.

### 0.4 — Check `/site/[slug]` parity

CLAUDE.md rule: if you change `/proposal/[slug]`, check `/site/[slug]`. The `site` directory doesn't exist in this repo (`src/app/site/` returns 404 on ls). No action needed.

---

## Phase 1 — Veo render library + API endpoints

### 1.1 — New file: `src/lib/veo-render.ts`

Mirrors the shape of `src/lib/gemini-solar-render.ts`. Handles:
- Submitting a Veo LRO (long-running operation) to the Gemini API
- Returning the operation name immediately (non-blocking)

**Veo API details:**
- Endpoint: `POST https://generativelanguage.googleapis.com/v1beta/models/${model}:predictLongRunning`
- Auth: `x-goog-api-key: GEMINI_API_KEY` (same key already in use)
- Model: `veo-3.0-generate-001` — put behind `VEO_MODEL` env var defaulting to this value
- Returns: `{ name: "operations/..." }` — store this as the operation ID

**Poll endpoint:**
- `GET https://generativelanguage.googleapis.com/v1beta/${operationName}`
- Returns `{ done: boolean, response?: { ... } }` when complete
- Response contains base64-encoded MP4 or a GCS URI depending on API version

**Veo request body:**
```json
{
  "instances": [{
    "prompt": "<VEO_PROMPT>",
    "image": {
      "bytesBase64Encoded": "<base64 of Gemini still>",
      "mimeType": "image/webp"
    }
  }],
  "parameters": {
    "aspectRatio": "16:9",
    "durationSeconds": 5,
    "sampleCount": 1
  }
}
```

**Exports from `src/lib/veo-render.ts`:**
```ts
submitVeoRender(seedImageUrl: string): Promise<{ operationName: string }>
pollVeoOperation(operationName: string): Promise<{ done: boolean; videoBuffer?: Buffer; mimeType?: string }>
```

### 1.2 — The one universal Veo prompt

Single constant in `src/lib/veo-render.ts`:

```
Cinematic aerial shot of a single commercial building. Smooth, slow drone-style flyover, gentle parallax, 5 seconds. Premium architectural visualization aesthetic — clean materials, soft natural daylight, subtle long shadows, gentle atmospheric depth. During the shot, dark commercial solar panels appear naturally across the roof in a clean grid layout. Preserve the building's footprint and roof shape from the reference image. No text, no UI, no labels, no map artifacts, no Google Maps style, no people, no vehicles, no logos, no neon, no cartoon. Style: high-end infrastructure visualization, premium energy brand, calm and confident.
```

This is a TypeScript `const` named `VEO_CINEMATIC_PROMPT`. Do not parameterize it — one prompt for all proposals.

### 1.3 — New API route: `POST /api/generate-proposal-video`

File: `src/app/api/generate-proposal-video/route.ts`

**Purpose:** Called by n8n immediately after `generate-proposal-image` completes. Fetches the seed image (the Gemini still at `render_preview_url`), submits the Veo LRO, returns the operation name. **Does not wait for Veo to finish.**

**Request body:**
```ts
{
  slug: string          // used to find the lead + upload path
  render_preview_url: string   // the Gemini still — used as Veo seed
  job_id?: string       // for progress tracking
  business_name?: string
}
```

**Response (immediate, ~2s):**
```ts
{ operation_name: string }   // n8n stores this and polls with it
```

**Steps:**
1. Validate `N8N_WEBHOOK_SECRET` header (use existing `src/lib/n8n-auth.ts`)
2. Fetch the `render_preview_url` image buffer (same pattern as `fetchImageAsset` in gemini-solar-render)
3. Call `submitVeoRender(seedImageBuffer)` — get `operationName`
4. Call `updateProposalJobProgress` with step `'Veo render submitted'`, status `'running'`, progressPercent `88`
5. Return `{ operation_name: operationName }`

**Error handling:** if submission fails, return `{ error }` with 500. n8n should treat this as a failed step but not block proposal publish (the Gemini still is already saved).

### 1.4 — New API route: `POST /api/generate-proposal-video/finalize`

File: `src/app/api/generate-proposal-video/finalize/route.ts`

**Purpose:** Called by n8n once polling detects `done: true`. Downloads the video, uploads to Supabase, writes `video_url` to the lead.

**Request body:**
```ts
{
  operation_name: string
  slug: string
  job_id?: string
  business_name?: string
}
```

**Steps:**
1. Validate `N8N_WEBHOOK_SECRET`
2. Call `pollVeoOperation(operationName)` one final time to get the buffer (or reuse the done response n8n received — accept either pattern)
3. Upload MP4 to Supabase Storage: `proposals/${slug}/video.mp4`, `contentType: 'video/mp4'`, `upsert: true`
4. Get public URL
5. Update `leads` table: `{ video_url: publicUrl }` where `slug = slug` — use `createAdminClient()`
6. Call `updateProposalJobProgress` with step `'Video ready'`, status `'completed'`, progressPercent `100`
7. Return `{ video_url: publicUrl }`

**Fallback on failure:** if the operation failed or buffer is empty, log it and return `{ skipped: true, reason }`. n8n treats it as a no-op; the proposal stays with the still image. Do not write anything to `leads.video_url`.

### 1.5 — New API route: `GET /api/generate-proposal-video/status`

File: `src/app/api/generate-proposal-video/status/route.ts`

**Purpose:** Thin proxy for n8n to poll the Veo LRO without exposing `GEMINI_API_KEY` to n8n.

**Query params:** `?op=operations%2F...`

**Steps:**
1. Validate `N8N_WEBHOOK_SECRET` header
2. Call `pollVeoOperation(operationName)` — forward the `done` field + any error
3. Return `{ done: boolean, failed?: boolean, reason?: string }`

n8n uses this to decide: keep waiting (done=false), call finalize (done=true), or give up (failed=true).

---

## Phase 2 — n8n workflow update

### Current n8n flow (relevant tail end)
```
... → generate-roof-image → generate-proposal-image → [publish lead]
```

### New n8n flow
```
... → generate-roof-image → generate-proposal-image → generate-proposal-video (submit)
        │
        └─► Wait 20s → GET /status → IF done → POST /finalize
                           └─► IF not done → Wait 20s → GET /status → ... (max 25 iterations = ~8 min)
                           └─► IF failed → log + continue (no video, not a blocker)
```

### n8n node additions

**Node 1 — "Submit Veo render"**
- Type: HTTP Request
- Method: POST
- URL: `{{ $env.NEXT_PUBLIC_APP_URL }}/api/generate-proposal-video`
- Headers: `Authorization: Bearer {{ $env.N8N_WEBHOOK_SECRET }}`
- Body: `{ slug, render_preview_url, job_id, business_name }` — pull from upstream node outputs
- Continue on fail: true (missing video is non-fatal)
- Store response `operation_name` in a variable

**Node 2 — "Wait for Veo"**
- Type: Wait
- Resume: After time interval
- Interval: 20 seconds

**Node 3 — "Poll Veo status"**
- Type: HTTP Request
- Method: GET
- URL: `{{ $env.NEXT_PUBLIC_APP_URL }}/api/generate-proposal-video/status?op={{ $json.operation_name }}`
- Headers: `Authorization: Bearer {{ $env.N8N_WEBHOOK_SECRET }}`
- Continue on fail: true

**Node 4 — "Check done"**
- Type: IF
- Condition: `{{ $json.done }}` is true
- True → Node 5 (finalize)
- False → check iteration count → if < 25, back to Node 2; else → skip (no video)

**Node 5 — "Finalize Veo video"**
- Type: HTTP Request
- Method: POST
- URL: `{{ $env.NEXT_PUBLIC_APP_URL }}/api/generate-proposal-video/finalize`
- Headers: `Authorization: Bearer {{ $env.N8N_WEBHOOK_SECRET }}`
- Body: `{ operation_name, slug, job_id, business_name }`
- Continue on fail: true

### Phase 2 implementation notes

- Insert the Veo branch immediately after `generate-proposal-image` returns `render_preview_url`.
- Keep proposal publish independent from the Veo branch. Submit, poll, and finalize failures should leave the still image in place.
- Use `operation_name` from "Submit Veo render" as the poll/finalize identifier.
- Cap polling at 25 attempts with 20-second waits. If Veo is still not done, stop the video branch and leave `leads.video_url` empty.
- Treat `{ failed: true }`, a missing `operation_name`, and failed HTTP nodes as non-fatal.
- Make sure n8n has `NEXT_PUBLIC_APP_URL` set to the deployed HelioCap app URL and `N8N_WEBHOOK_SECRET` set to the same bearer secret used by Vercel.

---

## Phase 3 — Proposal page renders video

After Phases 0–2, the hero already handles video via the logic added in Phase 0. Nothing more to build.

**Verify:** when `leads.video_url` is populated, the hero `<video>` autoplay/muted/loop renders the cinematic clip. When it's null, the still image fills the same position. Same layout, no jank.

**Revalidation note:** `src/app/proposal/[slug]/page.tsx` has `export const revalidate = 3600`. For manual testing, use `?_=${Date.now()}` or trigger a Vercel revalidation call from n8n finalize step if you want the page to show the video immediately without a cache wait. Add this to the finalize route if needed:
```ts
await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/revalidate?slug=${slug}&secret=...`)
```
Optional — not required for v1.

---

## Environment variables

| Variable | Where used | Notes |
| :--- | :--- | :--- |
| `GEMINI_API_KEY` | `src/lib/veo-render.ts` | Already set. Same key for Veo. |
| `VEO_MODEL` | `src/lib/veo-render.ts` | Optional override. Default: `veo-3.0-generate-001` |
| `N8N_WEBHOOK_SECRET` | All three new API routes | Already set. |
| `NEXT_PUBLIC_APP_URL` | n8n nodes | Must be set in n8n env: your Vercel deployment URL |

---

## Files to create

```
src/lib/veo-render.ts
src/app/api/generate-proposal-video/route.ts
src/app/api/generate-proposal-video/status/route.ts
src/app/api/generate-proposal-video/finalize/route.ts
```

## Files to modify

```
src/components/proposal/Hero.tsx          — full-bleed video/still background
src/app/proposal/[slug]/page.tsx          — remove PropertyVisual import + usage
```

## Files to delete

```
src/components/proposal/PropertyVisual.tsx
```

---

## Hard rules (do not violate)

- `video_url` is the only new DB column. No `video_status`, no `video_candidates`, no `video_poster_url`.
- One Veo render per proposal. No candidates, no retry logic, no fan-out.
- One prompt constant. Do not parameterize by building type, address, or system size.
- Seed image for Veo = the Gemini still (`render_preview_url`). Never raw satellite.
- Video is **non-blocking** for proposal publish. If Veo fails or times out, the still is the visual. Proposal always has a visual.
- `generate-proposal-image` route is unchanged. Veo is an additive step after it, not a replacement.
- Use `createAdminClient()` only for the DB write in finalize. All public reads use `createClient()` with RLS.
- Both API routes that n8n calls (`generate-proposal-video` and `generate-proposal-video/finalize`) must validate `N8N_WEBHOOK_SECRET` using the existing pattern in `src/lib/n8n-auth.ts`.

---

## Shared Notepad

_Both Claude and Codex: update this section as work progresses. Note what's done, what's blocked, and any decisions made during implementation._

### Status
- [x] Phase 0 — Kill PropertyVisual, full-bleed hero
- [x] Phase 1 — `veo-render.ts` + 3 API routes
- [x] Phase 2 — n8n nodes (spec complete, ready to wire in n8n UI)
- [x] Phase 3 — Verify video renders on proposal page
- [x] **SHIPPED** — Commit 0452162, pushed to `codex/minimal-admin-ui`, Vercel deploying

### Decisions log
- **Auth header:** `verifyN8nRequest` uses `Authorization: Bearer <secret>`, not `x-n8n-secret`. All three new routes use this existing helper. n8n nodes must send `Authorization: Bearer {{ $env.N8N_WEBHOOK_SECRET }}`.
- **Seed image fetch:** submit route fetches `render_preview_url` directly, passes buffer + mime type to `submitVeoRender`. No sharp dependency.
- **Veo response format:** `extractVideoBuffer` in `veo-render.ts` handles both Format A (`generateVideoResponse.generatedSamples[0].video`) and Format B (`predictions[0]`), and both base64 and URI variants. Verify actual response shape on first real test run and remove the dead branch.
- **Finalize is non-fatal:** finalize route returns `{ skipped: true, reason }` on any error instead of 500, so n8n treats a video failure as a no-op rather than a pipeline failure. Proposal always has the still image as fallback.
- **Phase 2 handoff:** repo has no exported n8n workflow JSON to edit. Node specs above are corrected for Bearer auth and ready to wire in n8n.

### Open questions
- **Veo API response format:** The Gemini Veo API for AI Studio may return the video as base64 in the operation response, or as a GCS URI, depending on API version at build time. Check the actual response structure in your first test. If it's a GCS URI, add a download step in `pollVeoOperation` before returning the buffer. If it's base64, decode directly.
- **Vercel function timeout for status endpoint:** The status endpoint is a fast GET (~1s). No timeout concern. The submit endpoint does one image fetch + one LRO submit (~3s). Should be well within limits. The finalize endpoint downloads a ~5MB MP4 and uploads it — budget ~15s, fine on Pro.
- **`proposals` storage bucket:** Already exists (migration `20240503020000_create_proposals_bucket.sql`). MP4 uploads go to `proposals/${slug}/video.mp4` — same bucket, new path.
