# Solar Lead Gen: Residential + Commercial Restructure Plan

## Executive Summary

This document outlines the restructure to turn a single commercial-only solar proposal generator into a two-journey product supporting both **residential** (inbound/ad-driven) and **commercial** (outbound) pathways. The restructure uses a single `prospects` table with a `proposal_type` discriminator and builds two separate microsite templates.

**Key principle:** one pipeline, one table, two journeys.

---

# PART 1 — PRODUCT PLAN

## Core Architecture

**One pipeline, one table, two journeys — branched by a single `proposal_type` discriminator.** Do not split into two tables for V1. Reuse shared infrastructure (slug, microsite_url, stage, video, RLS, Storage bucket, Google Places, Solar API).

### The Two Journeys

|  | **Residential** | **Commercial** |
|---|---|---|
| Acquisition | Inbound — paid ads → public landing page | Outbound — admin creates prospect manually |
| Entry point | Public landing form (homeowner) | `/admin/prospects/new` (internal) |
| Public landing page? | **Yes** (only public marketing page) | **No** |
| Products | Solar (hero video) + Heat pump (savings only) + EV charger (optional add-on, no video) | Solar and/or EV chargers (both can have video) |
| Tone | Emotional, premium, homeowner, savings/comfort | ROI, property, business, outbound-sales |
| Special | Home-insurance consent checkbox | Must survive "unknown/not-yet-qualified" gracefully |

## Data Model Changes

### Schema Migration (Additive, Non-Breaking)

Add to the existing `prospects` table. **Backfill all existing rows to `'commercial'`.**

**Core Discriminator**
- `proposal_type` — `'residential' | 'commercial'`, NOT NULL, default `'commercial'`
- `include_solar`, `include_ev`, `include_heat_pump` — boolean (drive which microsite sections render)

**Make Compatible**
- `company_name` — change from NOT NULL to **nullable** (residential uses a person's name, or keep it as generic display name; decide with Codex)
- Alternatively, add `contact_name` text nullable if you want to keep `company_name` for commercial and disambiguate

**Residential-Specific (all nullable)**
- `monthly_energy_bill` — int (captured from landing form)
- `interested_solar`, `interested_heat_pump`, `interested_ev` — bool (checkboxes on landing)
- `heat_pump_annual_savings` — int (operator inputs on editor)
- `insurance_quote_consent` — bool (checkbox on form)
- `insurance_consent_at` — timestamptz (when consent captured)

**Commercial / Shared EV (all nullable)**
- `ev_charger_count` — int
- `ev_charger_annual_value` — int (annual savings/value to business)
- `ev_charger_notes` — text (internal notes)

**Video Fields (extend, do not change existing)**
- Keep `video_url` / `video_thumbnail_url` as the **solar video** (both upload and URL resolve here)
- Add `ev_video_url` / `ev_video_thumbnail_url` (commercial only, same upload-or-URL model)

> Exact column names to be finalized by Codex during Phase 0.

## Admin-Side Flows

### Creation: `/admin/prospects/new`
Step 1 is a **Residential / Commercial choice**. The choice controls:
- Which form fields render (Google Places + building for commercial; homeowner name + address for residential)
- Validation rules
- `proposal_type` saved to the database

Both types POST to the same `/api/prospects` route with `proposal_type` included.

### Two Separate Lists

Filter the prospect roster by `proposal_type`:
- **Residential Proposals** tab/route
- **Commercial Proposals** tab/route

Implement via tabs on `/admin/prospects` or separate routes (`/admin/prospects/residential`, `/admin/prospects/commercial`). Update query helpers in `lib/supabase.ts` to support filtering. Update `AdminConsole.tsx` to show both funnels separately—never a single undifferentiated list.

### Proposal Data Editor: `/admin/prospects/[id]`

Refocus from "solar engineering workspace" into a clean **Proposal Data Editor**:
- Structured form layout for reading/writing the data fields
- Conditional sections by `proposal_type`
- **Preserve:** demote the 1414-line `ProspectSolarWorkspace` to an optional "Solar layout (advanced)" accordion
- **Video block:** extend to support file upload (to `openclaw` bucket) + URL paste, with per-product fields
  - Solar video: always present
  - EV video: commercial only
  - Heat pump video: never (no video for heat pump)
- **Generate Microsite button:** validates required data and that every **included** product with a video slot has a video, then stamps `microsite_url` + advances stage

Uses the existing PATCH `/api/prospects/[id]` route; no new write infrastructure needed.

## Video Handling (V1, Manual Only)

**Rule:** no video-generation API in V1. All videos are created manually in Google Omni and then uploaded or pasted.

- **Residential:** solar video only (upload or URL)
- **Commercial:** solar video and/or EV video (upload or URL), depending on `include_solar`/`include_ev`
- **No heat pump video, no residential EV video, ever**

"Generate Microsite" is gated: every **included** product that has a video slot must have a video.

### Upload Flow
- New server route: `/api/uploads/video` (POST, service role)
- Accepts multipart form-data with file (mp4/webm, size limits TBD)
- Uploads to Supabase Storage `openclaw` bucket
- Returns public URL
- URL is saved to `video_url`, `ev_video_url`, etc. via the editor's PATCH

## Microsite Generation & Routing

- **Route:** `/proposal/[slug]`
- **Logic:** in `page.tsx`, branch on `proposal_type`
  - `'residential'` → render `<ResidentialMicrosite />`
  - `'commercial'` → render `<CommercialMicrosite />`
- **Existing component:** rename/adapt `ProposalExperience.tsx` into the commercial template
- **New component:** build residential template (see design prompt in Part 3)
- **Generate action:** reuse `/api/proposals` to stamp `microsite_url` + advance stage

### Conditional Section Logic

| Section | Residential | Commercial |
|---|---|---|
| Cinematic solar video | if `include_solar` + solar video | if `include_solar` + solar video |
| EV charger video | — | if `include_ev` + ev video |
| Solar savings | if `include_solar` | if `include_solar` |
| Heat pump savings | if `include_heat_pump` | — |
| EV charger | optional **add-on selector** (interactive) | qualified line item |
| Package selector + combined savings | yes | optional |
| Insurance consent checkbox | **yes** (exact text required) | **never** |
| "Under assessment" empty state | n/a | when nothing qualified yet |

**Commercial "unknown" handling:** if a section's include flag is false, it does not render. If *nothing* is qualified, show a tasteful "assessment in progress" state—never broken scaffolding.

## Public Residential Landing Page

- **Route:** make `/` the public landing page (admin stays at `/admin`)
- **Purpose:** ad-driven lead capture for homeowners
- **Capture fields:** name, **address**, **monthly energy bill**, **interest in solar / heat pump / EV** (checkboxes), **insurance consent checkbox** (exact text required)
- **Form submission:** POST to new `/api/leads` route (service role, same RLS as `/api/prospects`)
  - Creates a `proposal_type='residential'`, `stage='sourced'` prospect
  - Appears in the Residential list
  - Operator can then edit the lead into a full proposal

## Existing-App Compatibility

**What to preserve:**
- Single `prospects` table (additive migration only)
- Google Places intake for commercial creation
- Google Solar API + satellite + 3D tiles
- Solar canvas tool (demoted, not deleted)
- `/api/proposals` + `/api/pipeline/microsite` generate path
- `/[slug]` legacy redirect (still needed for existing URLs)
- RLS (writes stay server-side; anon can only read live rows)
- Existing commercial microsite (becomes the commercial template)

**Zero breaking changes to existing commercial flow.**

## Implementation Phases

### Phase 0 — Schema & Types
- Add migration (discriminator + new nullable columns)
- Update `Prospect` type in `lib/types.ts`
- Make `company_name` nullable (or add `contact_name`)
- Backfill existing rows to `'commercial'`
- Update RLS if needed (should not need changes—writes stay server-side)
- **Output:** updated schema, no UI yet, no breaking changes to existing app

### Phase 1 — Typed Creation
- Add Residential/Commercial choice to `/admin/prospects/new`
- Render conditional fields per type
- Save `proposal_type` via `/api/prospects`
- Commercial keeps today's Google Places flow

### Phase 2 — Two Separate Lists
- Type-filtered roster queries in `lib/supabase.ts`
- "Residential Proposals" and "Commercial Proposals" tabs or routes on `/admin/prospects`
- Update `AdminConsole.tsx` to show both funnels separately

### Phase 3 — Proposal Data Editor
- Refocus `/admin/prospects/[id]` as data-entry form with conditional sections
- Demote `ProspectSolarWorkspace` to optional "Solar layout (advanced)" accordion
- Extend video block: file upload + URL paste, per-product fields
- Add "Generate Microsite" button with validation
- Uses existing PATCH `/api/prospects/[id]` route

### Phase 4 — Conditional Microsites
- Branch routing in `/proposal/[slug]/page.tsx`
- Adapt existing `ProposalExperience` into commercial template
- Build new residential template
- Conditional sections + graceful empty states
- Exact insurance consent checkbox text: "I consent to being contacted about a home insurance quote."

### Phase 5 — Public Residential Landing Page
- Make `/` the residential landing
- New form capturing name, address, monthly bill, interests, consent
- POST to new `/api/leads` route (service role)
- Creates `proposal_type='residential'`, `stage='sourced'` prospect

---

# PART 2 — CODEX IMPLEMENTATION PROMPT

Copy/paste the block below to send to Codex:

```
You are working in an existing Next.js 16.2.7 App Router project (root-level `app/` directory, NOT `src/`), React 19, Supabase (single `prospects` table), Tailwind v4, deployed on Vercel. A Supabase Storage bucket named `openclaw` already exists.

IMPORTANT: This repo pins a specific Next.js version with breaking changes vs. older Next.js. Before writing routing, server-action, or data-fetching code, read the relevant guide in `node_modules/next/dist/docs/`. Do not rely on training-data assumptions about Next.js APIs.

DO NOT START CODING YET. Phase 0 is review and planning only.

## What we are building

We are turning a single-template commercial solar proposal generator into a two-journey product:
1. **RESIDENTIAL** — inbound/ad-driven. Has a public landing page. Offer = Solar (cinematic video) + Heat pump (savings numbers, no video) + optional EV charger add-on (no video). Includes a home-insurance consent checkbox.
2. **COMMERCIAL** — outbound only. NO public landing page. Offer = Solar and/or EV chargers (each can have an uploaded video). Must render cleanly even when qualification is unknown/partial.

## V1 VIDEO RULE (critical)

All videos are created manually by the operator in Google Omni. DO NOT build, scaffold, or plan any video-generation API. DO NOT add V2 video-gen work. For V1, the app only needs to: (a) upload a finished video file (to the existing `openclaw` Supabase Storage bucket) OR paste a hosted video URL, (b) save it to the proposal, (c) generate the microsite. There is already a manual video-URL paste UI in `app/admin/prospects/[id]/ProposalVideoPanel.tsx` and an "Auto-render" button that calls a video pipeline — REMOVE or hide the Auto-render affordance for V1; keep manual upload + URL only.

## STEP 1 — Review the current app first (do not code blindly)

Read and report back on:
- Routes & pages: `app/page.tsx`, `app/[slug]/page.tsx`, `app/admin/**`, `app/proposal/[slug]/**`, `app/api/**`
- Data model: `lib/types.ts` (the `Prospect` interface), `supabase/schema.sql`, `lib/supabase.ts`
- Creation: `app/admin/prospects/new/page.tsx`, `app/api/prospects/route.ts`
- Editor: `app/admin/prospects/[id]/page.tsx`, `ProspectSolarWorkspace.tsx`, `ProposalVideoPanel.tsx`
- List & dashboard: `app/admin/prospects/ProspectRoster.tsx`, `app/admin/AdminConsole.tsx`
- Microsite: `app/proposal/[slug]/page.tsx`, `ProposalExperience.tsx`
- Generate path: `app/api/proposals/route.ts`, `app/api/pipeline/microsite/route.ts`
- Note: writes currently go through the service role server-side; RLS lets anon READ live rows only. Financial math appears duplicated across the admin detail page, the microsite, and the solar preview — confirm and call this out.

Produce a short written inventory: every route/component/schema field this change will touch, and what currently depends on each.

## STEP 2 — Produce a phased implementation plan and STOP for approval

Output a phased plan (below) and a list of any MAJOR architectural decisions. If anything requires a bigger structural change than described here (e.g. you believe two tables beat one, or the landing route should differ), STOP and ask for approval before implementing. Do not begin Phase 0 code until I approve the plan.

Target phases:
- **Phase 0** — Schema & types: additive migration to `prospects`. Add `proposal_type` ('residential'|'commercial', NOT NULL, default 'commercial'); section flags `include_solar`/`include_ev`/`include_heat_pump`; residential fields `monthly_energy_bill`, `interested_solar`/`interested_heat_pump`/`interested_ev`, `heat_pump_annual_savings`, `insurance_quote_consent`, `insurance_consent_at`; EV fields `ev_charger_count`, `ev_charger_annual_value`, `ev_charger_notes`; video fields `ev_video_url`/`ev_video_thumbnail_url` (keep existing `video_url`/`video_thumbnail_url` as the SOLAR video). Make `company_name` nullable. Backfill existing rows to 'commercial'. Update the `Prospect` type in `lib/types.ts` to match. Keep RLS as-is (writes stay server-side). Finalize exact column names and report them.
- **Phase 1** — Typed creation: add a Residential/Commercial choice as the first step in `app/admin/prospects/new/page.tsx`; render conditional fields per type; save `proposal_type` via `app/api/prospects/route.ts`. Commercial keeps today's Google Places flow.
- **Phase 2** — Two separate lists: filter the roster by `proposal_type` into "Residential Proposals" and "Commercial Proposals" (tabs or two routes). Add type-filtered query helpers in `lib/supabase.ts`. Split the AdminConsole funnels by type. Never one undifferentiated list.
- **Phase 3** — Proposal Data Editor: refocus `app/admin/prospects/[id]/page.tsx` from an engineering workspace into a clean data form that reads/writes the fields above with conditional sections by type. DEMOTE `ProspectSolarWorkspace` into an optional "Solar layout (advanced)" accordion — preserve it, do not delete it. Extend the video block to support file upload (to the `openclaw` bucket via a new server route, e.g. `/api/uploads/video`) AND URL paste, with per-product fields (solar always; EV only for commercial). Add a "Generate Microsite" button that validates required data + that every INCLUDED product with a video slot has a video, then stamps `microsite_url`/stage via the existing generate path.
- **Phase 4** — Conditional microsites: in `app/proposal/[slug]/page.tsx`, branch on `proposal_type` to render a residential vs commercial template. Adapt the existing `ProposalExperience` into the COMMERCIAL template. Build a NEW residential template. Sections must be conditional on the include_* flags; commercial must degrade gracefully when qualification is unknown (show an "assessment in progress" state, never broken scaffolding). Residential includes a contact form with this EXACT checkbox text and nothing rephrased: "I consent to being contacted about a home insurance quote." Commercial NEVER shows it.
- **Phase 5** — Public residential landing page: make `app/page.tsx` the public residential landing page (admin stays at `/admin`). Capture name, address, monthly energy bill, interest in solar/heat pump/EV, and the insurance consent checkbox (exact text above). POST to a NEW server route `/api/leads` that uses the service role to create a `proposal_type='residential'`, `stage='sourced'` prospect (do not loosen RLS for anon writes). New leads must appear in the Residential list.

## Constraints

- Preserve all existing working features: Google Places intake, Google Solar API + satellite + 3D tiles, the solar canvas tool, the existing generate path, the `/[slug]` legacy redirect, RLS.
- Additive schema only — do not drop existing columns.
- No video-generation API. No V2 features. Keep V1 focused.
- Each phase must build clean (`npm run build`) and lint clean before moving on.
- Match the existing code style, file conventions, and Tailwind patterns already in the repo.

Begin with STEP 1 (review) and STEP 2 (phased plan + approval request). Do not write implementation code until I approve.
```

---

# PART 3 — CLAUDE DESIGN PROMPTS

## 3.1 — Residential Microsite Design Prompt

```
Design a RESIDENTIAL energy proposal microsite — a private, cinematic, scroll-based page generated for one homeowner after they submit an inbound lead.

AUDIENCE: A homeowner (not a business). They came from a paid ad or inbound inquiry. They care about money saved, home comfort, home value, and doing the right thing — not engineering specs.

PURPOSE: Make a premium, emotional, trustworthy case that this home should go solar, with heat-pump savings and an optional EV charger as upside. Drive them to book/contact.

TONE & VISUAL DIRECTION: Homeowner-focused, emotional, clean, premium, savings-driven. Think a high-end energy brand meeting a warm, human home story. Cinematic hero, generous whitespace, confident typography, smooth scroll reveals. Not corporate, not spreadsheet-y.

REQUIRED SECTIONS (in order):
1. Cinematic hero with the uploaded SOLAR video (autoplay/muted/loop; poster fallback to a satellite still). Homeowner name + address as a personal touch.
2. Solar savings — headline annual savings + system size, panel count, annual kWh, payback. Big, scannable numbers.
3. Heat pump savings — realistic dollar savings (NO video; data + a comfort/efficiency narrative).
4. Optional EV charger add-on — an interactive selector the homeowner can toggle on/off (NO video).
5. Package selector — let them choose Solar / Solar + Heat pump / + EV; the combined savings summary updates with their selection.
6. Combined savings summary — total annual + lifetime savings for the chosen package.
7. CTA / contact form — book a call or submit contact info. The form MUST include a checkbox with this EXACT text, unaltered: "I consent to being contacted about a home insurance quote."

DATA FIELDS AVAILABLE (bind to these; show graceful fallbacks when null):
homeowner/contact name, address, city, monthly_energy_bill, solar video URL + thumbnail, panel_count, system_kw, yearly_kwh, yearly_savings (solar), savings_25yr, system_cost, incentive_amount, heat_pump_annual_savings, ev_charger_annual_value, include_solar / include_heat_pump / include_ev flags, satellite_image_url, booking URL, contact email.

CONDITIONAL LOGIC:
- Render solar / heat pump / EV sections only when their include_* flag is true.
- The EV add-on and package selector are interactive (client-side) and update the combined savings live.
- If a number is missing, degrade gracefully — never show broken placeholders or "$NaN".
- All modeled numbers should carry a subtle "estimate" treatment (the app already uses estimate marks/disclaimers — match that).

CTA: Primary = book a call (booking URL) or submit the contact form. Make the insurance consent checkbox present but secondary (not pre-checked).

WHAT NOT TO INCLUDE:
- No heat pump video, no EV charger video (solar is the ONLY video).
- No commercial/ROI/property-investment framing.
- No engineering-heavy roof-plane/azimuth/pitch detail.
- Do not invent fields not listed above.

Deliver a responsive (mobile-first) design. Assume Next.js + Tailwind v4. Show the full scroll experience including mobile.
```

## 3.2 — Commercial Microsite Design Prompt

```
Design a COMMERCIAL energy proposal microsite — a private page generated for an outbound business prospect (property owner / facilities decision-maker).

AUDIENCE: A business owner or facilities/property decision-maker receiving an outbound proposal. They care about ROI, payback, property value, and risk — not emotion.

PURPOSE: Make a credible, ROI-driven case for solar and/or EV chargers on their property, suitable to send cold or semi-warm in an outbound sales motion.

TONE & VISUAL DIRECTION: Business-focused, ROI-driven, property-focused, confident and premium but restrained. Data-forward, trustworthy, "this is a serious investment proposal." Cinematic but professional.

REQUIRED SECTIONS (conditional — see logic):
1. Hero with the uploaded SOLAR video when solar is included (poster fallback to satellite still). Company name + property address.
2. Solar section — system size, panel count, annual kWh, year-1 savings, 25-year net, incentive, payback, CO2 offset.
3. EV charger section — when included: uploaded EV charger video, charger count, annual value, notes.
4. ROI / financial summary — payback period, lifetime value, incentive treatment.
5. CTA — book a call / contact.

OFFER CONFIGURATIONS THE PAGE MUST HANDLE CLEANLY:
- Solar only
- EV chargers only
- Solar + EV chargers
- Unknown / not-yet-qualified — when nothing is confirmed, show a tasteful "assessment in progress" state. The page must NEVER look broken, empty, or half-built.

DATA FIELDS AVAILABLE (bind to these; graceful fallbacks when null):
company_name, owner_name, owner_title, address, city, industry, sqft, year_built, roof_age, panel_count, system_kw, yearly_kwh, yearly_savings, savings_25yr, system_cost, incentive_amount, solar video URL + thumbnail, ev_video_url + thumbnail, ev_charger_count, ev_charger_annual_value, ev_charger_notes, include_solar / include_ev flags, satellite_image_url, booking URL, contact email.

CONDITIONAL LOGIC:
- Render the solar section only if include_solar; the EV section only if include_ev.
- Each included product shows its own uploaded video; a product without a video falls back to the satellite still or a clean static state.
- If neither product is qualified, render the "assessment in progress" state instead of empty sections.
- Modeled numbers carry a subtle "estimate" treatment matching the app's existing estimate marks/disclaimers.

CTA: Primary = book a discovery call (booking URL) or contact. Professional, low-pressure.

WHAT NOT TO INCLUDE:
- NO home-insurance consent checkbox (residential only).
- No homeowner/emotional/comfort framing.
- No heat pump content (commercial offer is solar + EV only).
- Do not invent fields not listed above.

Deliver a responsive (mobile-first) design. Assume Next.js + Tailwind v4. Explicitly show the four offer configurations (solar-only, EV-only, both, unknown).
```

## 3.3 — Residential Landing Page Design Prompt

```
Design a PUBLIC residential landing page — the inbound, ad-driven entry point for homeowners. This is the ONLY public marketing page in the product (commercial is outbound and has no landing page). It will receive paid-ad traffic and must convert visitors into leads.

BEFORE YOU FINALIZE ANY DESIGN, ASK ME THESE QUESTIONS AND WAIT FOR MY ANSWERS:
1. Dark/cinematic or bright/clean?
2. Luxury-home, Apple-style minimal, or warm homeowner-friendly?
3. Should it emphasize savings, comfort, home value, or future-proofing? (rank them)
4. How aggressive should this ad landing page feel? (soft brand → hard direct-response)
5. Should it feel more like a premium energy brand or a direct-response lead-capture page?

Present 2–3 quick visual directions based on my answers before building the full design.

AUDIENCE: Homeowners arriving from paid ads / inbound. Mixed intent — some ready, some curious.

PURPOSE: Explain the homeowner offer and capture a lead (which becomes a residential proposal in our system).

REQUIRED SECTIONS:
1. Hero — clear value proposition for the homeowner energy offer (solar + heat pump + EV), strong headline, primary CTA.
2. Offer explanation — solar as the centerpiece, heat-pump savings, optional EV charger, framed for homeowners.
3. Trust / credibility — light social proof, estimate-based savings framing, reassurance.
4. Lead capture form (the conversion goal) capturing:
   - Name
   - Address
   - Monthly energy bill
   - Interest checkboxes: solar, heat pump, EV charger
   - A checkbox with this EXACT text, unaltered: "I consent to being contacted about a home insurance quote."
   - Submit CTA
5. Reinforcing CTA near the bottom.

FORM BEHAVIOR: On submit, the lead is created as a residential proposal in our pipeline. Design success and error/validation states. The insurance consent checkbox is present but NOT pre-checked.

CONDITIONAL LOGIC: Minimal — this is a marketing page, not a configurator. The interest checkboxes are captured but do not branch the page.

CTA: Single dominant goal — submit the lead form. Keep one primary action; avoid competing CTAs.

WHAT NOT TO INCLUDE:
- No commercial/business content (this is homeowner-only).
- No pricing engine, configurator, or instant-quote calculator (V1 captures the lead; humans follow up).
- No login/account flows.
- Do not invent fields beyond those listed.

Deliver a responsive (mobile-first, ad-traffic-optimized) design. Assume Next.js + Tailwind v4. Remember: ask me the five theme/style questions and show direction options BEFORE finalizing.
```

---

# PART 4 — QUESTIONS / RISKS / FIRST MILESTONE

## Top 5 Product Questions

1. **Residential identity field:** Reuse `company_name` as a generic display name, or add a dedicated `contact_name`? (Affects schema and every place that reads `company_name`.)

2. **Landing page URL:** Put the residential landing at `/` (recommended; admin stays at `/admin`), or a marketing path like `/solar`? (Affects ad URLs and the existing root redirect.)

3. **EV add-on numbers on residential:** Do you have real heat-pump and EV-charger savings figures/formulas, or should the editor just take manual dollar amounts you type in per proposal? (Determines whether we need a calc or just input fields.)

4. **Commercial "qualified" model:** Is "what's included" purely the `include_solar`/`include_ev` toggles you set, or do you also want an explicit qualification status (qualified / not qualified / unknown) shown internally? (V1 leans toward just the toggles.)

5. **Lead notifications:** When a residential lead comes in, do you need an email/Slack notification in V1, or is it enough that it appears in the Residential list? (Affects whether `/api/leads` needs a notify step.)

## Top 5 Technical Risks

1. **Duplicated financial math:** Savings/system formulas live in at least 3 places (admin detail page `getProspectModel`, `ProposalExperience.tsx`, solar preview) with *different* constants. Branching into two microsites will multiply the drift. Consolidate into one `lib/economics` helper used everywhere — but keep it light, not a rewrite.

2. **`company_name NOT NULL`:** Residential breaks the current NOT NULL constraint and the validation in `/api/prospects/route.ts`. Must be relaxed carefully without breaking commercial creation.

3. **Public write path / abuse:** The landing form is the first anonymous write. Keep it server-side (service role via `/api/leads`) and add basic spam protection (honeypot/rate limit). Do NOT loosen RLS to let anon insert directly.

4. **File upload plumbing:** Upload-to-`openclaw`-bucket is new (only URL paste exists today). Needs a server upload route, size/type limits, and public-URL wiring — more involved than the existing paste field.

5. **Next.js version drift:** This repo pins Next 16.2.7 with breaking changes; route handlers, server actions, and params are already async (`params: Promise<...>`). New routes (`/api/leads`, upload route, landing page) must follow the in-repo conventions and `node_modules/next/dist/docs/`, not generic Next.js habits.

## Cleanest First Milestone

**Phase 0 + Phase 1: the schema migration plus the typed creation flow.**

Ship the additive `proposal_type` migration (backfill existing rows to `'commercial'`, make `company_name` nullable, update the `Prospect` type), then add the Residential/Commercial choice and conditional fields to `/admin/prospects/new`.

Why this first:
- It's low-risk and additive
- Touches no public surface
- Keeps the current commercial app fully working
- Unlocks everything downstream (lists, editor, microsites, landing all key off `proposal_type`)
- After this milestone you can create both prospect types end-to-end internally before any public or design work lands

Verify the existing commercial flow still builds, lints, and generates a microsite unchanged before moving to Phase 2.

---

**Next step:** Send the Codex prompt from Part 2 and await Phase 0 review + approval before any implementation begins.
