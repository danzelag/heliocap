# App Overview

This app is a Next.js energy-proposal system for two sales motions:

- **Residential inbound**: homeowners submit a public lead form, then the team works that lead in the Residential CRM and can publish a homeowner proposal microsite.
- **Commercial outbound**: the team creates or imports business/property prospects, runs solar analysis, adds EV charger data when relevant, and publishes a commercial proposal microsite.

The product is intentionally split into a public lead-capture surface, an internal CRM/admin workspace, and private proposal pages.

## Main User Flows

### 1. Residential Lead Capture

The public homepage at `/` is a one-screen residential landing page. It captures:

- name
- address and city
- monthly energy bill
- email and phone
- interest flags for solar, heat pump, and EV charger
- the home-insurance consent checkbox

Submitting the form posts to `POST /api/leads`. The API creates a residential prospect in Supabase with `stage = "sourced"`.

Important current behavior: the live Supabase table may still be on the older schema. When the newer residential columns are missing, `/api/leads` falls back to a legacy insert format and tags the row as residential using `owner_title = "Residential lead"` and `industry` metadata. This keeps the landing page functional before the full restructure migration is applied.

### 2. CRM Review

Internal users manage prospects at `/admin/prospects`.

The roster has two lanes:

- **Commercial CRM**
- **Residential CRM**

The Residential tab can be opened directly with:

```txt
/admin/prospects?type=residential
```

The detail page at `/admin/prospects/[id]` is where the team edits proposal data, media, scope flags, and solar values before publishing a proposal.

### 3. Proposal Publishing

Prospects become proposal pages when `microsite_url` is set and `stage` reaches `microsite_live`.

The main proposal route is:

```txt
/proposal/[slug]
```

There is also a legacy redirect route:

```txt
/[slug]
```

The proposal route decides which microsite to render by calling `prospectJourney(prospect)`:

- residential prospects render `ResidentialMicrosite`
- commercial prospects render `CommercialMicrosite`

`prospectJourney` also supports legacy residential rows by detecting residential markers in existing fields.

## Microsite Behavior

### Residential Microsite

The residential proposal is homeowner-focused and modeled after the Claude design export in:

```txt
~/Downloads/solar-dashboard/project/microsites/Residential Microsite.html
```

It includes:

- cinematic sticky hero with solar video/poster/satellite fallback
- homeowner name and address
- solar savings section
- heat-pump savings section when included
- EV charger add-on when included
- interactive package selector
- live combined annual and lifetime savings summary
- CTA/contact form
- exact insurance consent checkbox text:

```txt
I consent to being contacted about a home insurance quote.
```

Heat pump and EV sections do not use videos. Solar is the only residential product video.

### Commercial Microsite

The commercial proposal is ROI-focused and modeled after:

```txt
~/Downloads/solar-dashboard 2/project/microsites/Commercial Microsite.html
```

It supports four configurations:

- solar only
- EV only
- solar + EV
- unknown / assessment in progress

It includes:

- sticky hero with product-specific video/poster/satellite fallback
- solar data band when solar is included
- EV charger media/value section when EV is included
- ROI summary
- professional discovery-call CTA
- a build-note section showing the four supported configurations

Commercial pages do not include home-insurance consent, homeowner comfort framing, or heat-pump content.

## Data Model

The main table is `prospects` in Supabase. The TypeScript shape lives in:

```txt
lib/types.ts
```

Important groups of fields:

- **Identity**: `proposal_type`, `company_name`, `contact_name`, `owner_name`, `owner_title`
- **Location**: `address`, `city`, `lat`, `lng`
- **Commercial property**: `sqft`, `year_built`, `roof_age`, `industry`
- **Scope flags**: `include_solar`, `include_heat_pump`, `include_ev`
- **Residential inputs**: `monthly_energy_bill`, `interested_solar`, `interested_heat_pump`, `interested_ev`, `insurance_quote_consent`
- **Solar economics**: `panel_count`, `system_kw`, `yearly_kwh`, `yearly_savings`, `savings_25yr`, `system_cost`, `incentive_amount`
- **EV economics**: `ev_charger_count`, `ev_charger_annual_value`, `ev_charger_notes`
- **Media**: `satellite_image_url`, `panel_svg_url`, `video_url`, `video_thumbnail_url`, `ev_video_url`, `ev_video_thumbnail_url`
- **Publishing/outreach**: `microsite_url`, `email_sent_at`, `sms_sent_at`, `reply_classification`, `stage`

The restructure migration is:

```txt
supabase/20260613_residential_commercial_restructure.sql
```

Apply that migration to get the clean residential/commercial schema. Until then, the app contains compatibility fallbacks for residential lead creation and Residential CRM filtering.

## Pipeline

The commercial solar pipeline is orchestrated in:

```txt
lib/pipeline/index.ts
```

The main stages are:

1. **Geocode** the address with Google Maps.
2. **Qualify** the prospect based on available property data.
3. **Fetch satellite imagery**.
4. **Fetch Google Solar API insights**.
5. **Calculate solar economics**.
6. **Generate and upload panel overlay SVG**.
7. **Optionally generate proposal video** if a video provider is configured.
8. **Set the microsite URL** and mark the record `microsite_live`.

Video generation is non-fatal. If no video provider is configured, users can manually add video URLs through the admin editor.

## Key Routes

### Public

```txt
/                       Residential lead landing page
/proposal/[slug]         Private proposal microsite
/[slug]                  Legacy redirect to /proposal/[slug]
```

### Admin

```txt
/admin                   Proposal console
/admin/prospects         Residential/commercial CRM roster
/admin/prospects/new     Create a new prospect
/admin/prospects/[id]    Edit proposal data, media, and analysis
```

### API

```txt
POST   /api/leads                         Create a residential inbound lead
GET    /api/prospects                     List prospects
POST   /api/prospects                     Create residential or commercial prospect
DELETE /api/prospects                     Delete prospects
GET    /api/prospects/[id]                Fetch prospect
PATCH  /api/prospects/[id]                Update prospect
DELETE /api/prospects/[id]                Delete prospect
POST   /api/proposals                     Publish selected prospects as proposals
POST   /api/pipeline/run                  Run full pipeline
POST   /api/pipeline/solar                Run/update solar analysis
POST   /api/pipeline/video                Generate proposal video
POST   /api/uploads/video                 Upload/attach manual video
POST   /api/places/autocomplete           Google Places autocomplete
POST   /api/places/details                Google Places detail lookup
GET    /api/maps/static                   Google static map proxy
GET    /api/maps/browser-config           Exposes map browser config
GET    /api/solar/preview                 Solar preview data
GET    /api/solar/layer-image             Solar layer image proxy
GET    /api/solar/analysis-image          Generated solar analysis image
POST   /api/webhooks/reply                Outreach reply webhook
```

## Important Files

```txt
app/page.tsx                                      Public residential landing page
app/proposal/[slug]/page.tsx                      Proposal router
app/proposal/[slug]/ResidentialMicrosite.tsx      Residential proposal experience
app/proposal/[slug]/CommercialMicrosite.tsx       Commercial proposal experience
app/admin/prospects/ProspectRoster.tsx            CRM roster tabs/table
app/admin/prospects/[id]/ProposalDataEditor.tsx   Main proposal data editor
app/admin/prospects/[id]/ProposalVideoPanel.tsx   Solar/EV video controls
app/api/leads/route.ts                            Residential lead API
app/api/prospects/route.ts                        Prospect create/list/delete API
lib/supabase.ts                                   Supabase clients and list helpers
lib/prospectJourney.ts                            Residential/commercial classifier
lib/proposals.ts                                  Proposal URL helpers
lib/pipeline/*                                    Geocode, solar, satellite, video, outreach
lib/types.ts                                      Shared Prospect types
supabase/schema.sql                               Current schema snapshot
supabase/20260613_residential_commercial_restructure.sql
```

## Environment Variables

Core required variables:

```txt
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

Useful app/config variables:

```txt
NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_CAL_URL
NEXT_PUBLIC_CONTACT_EMAIL
```

Pipeline and enrichment variables:

```txt
GOOGLE_MAPS_API_KEY
GOOGLE_SOLAR_API_KEY
ANTHROPIC_API_KEY
HIGGSFIELD_API_KEY
BUNNY_API_KEY
BUNNY_STORAGE_ZONE
BUNNY_CDN_URL
```

`GOOGLE_SOLAR_API_KEY` is optional if `GOOGLE_MAPS_API_KEY` is also enabled for Solar API access.

## Local Development

Install dependencies:

```bash
npm install
```

Run the app:

```bash
npm run dev
```

Build:

```bash
npm run build
```

Lint:

```bash
npm run lint
```

At the time this document was written, lint passed with one existing warning in the older solar workspace component about a missing React hook dependency.

## Deployment

The app is deployed on Vercel.

Preview deploy:

```bash
npx vercel deploy --yes
```

Production deploy:

```bash
npx vercel deploy --prod
```

Vercel preview deployments may be protected by Vercel Authentication. Use `vercel curl` for authenticated smoke tests against protected preview URLs.

## Operational Notes

- Apply the Supabase restructure migration for the clean data model.
- Until the migration is applied, residential leads still work through legacy fallback inserts.
- Proposal pages are private by convention and marked noindex in metadata.
- All savings and ROI numbers shown on proposal pages should be treated as modeled estimates.
- The residential landing page is intentionally single-screen and optimized to avoid page overflow on desktop and mobile.
