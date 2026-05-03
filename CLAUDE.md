@AGENTS.md

# Helio Cap — solar-lead-gen

## What this is
Commercial solar lead generation platform targeting **commercial rooftops in the Greater Toronto Area (GTA), Ontario**. The pitch angle is high energy costs in Ontario, not aging roofs. Generates personalized satellite + solar panel overlay proposals and ships multi-channel outreach. Full pipeline spec in `OPENCLAW_REROOF_GUIDE.md`. Build plan in `OPENCLAW_IMPL_PLAN.md`.

## Target market
- **Geography:** GTA — Toronto, Mississauga, Brampton, Vaughan, Markham, Oakville, Burlington
- **ICP:** Commercial buildings with large flat roofs (warehouses, distribution centres, light industrial, big-box retail)
- **Hook:** Ontario commercial electricity rates are among the highest in North America (~$0.18–0.22/kWh all-in with Global Adjustment). ROI math is strong.
- **Not:** Aging roof angle. Not US Sun Belt. Not residential.
- **Parcel sourcing:** Google Places API (not Regrid — too expensive at $375/mo for v1). Solar API qualifies roof size.

## Stack
- Next.js 16.2.4 (App Router, Turbopack) — **Read `node_modules/next/dist/docs/` before writing any Next.js code. APIs differ from training data.**
- Supabase (Postgres + Storage + Auth + RLS)
- Tailwind CSS v4
- Vercel deployment (repo: `danzelag/heliocap`, branch: `main`)
- n8n for workflow orchestration (not yet wired)

## What's already built
- Admin dashboard at `/admin` with full lead CRUD + bulk delete/status
- Proposal microsites at `/proposal/[slug]` and `/site/[slug]`
- Google Solar API + satellite imagery + SVG panel overlay → `src/lib/openclaw-google.ts`
- Financial model: 70% panel array, $1.8/W install, 30% ITC → `buildSolarModel()`
- Web Mercator lat/lng → pixel projection → `buildSolarOverlaySvg()`
- `POST /api/leads` — webhook for n8n to create leads (secured with `N8N_WEBHOOK_SECRET`)
- `POST /api/generate-roof-image` — full Solar API pipeline, uploads to Supabase Storage
- Address autocomplete (Google Places) → `src/components/AddressAutocomplete.tsx`
- `prospects` table migration written (may or may not be applied — verify in Supabase before adding)

## What's NOT built yet
- n8n workflows (parcel sourcing, enrichment, outreach)
- Regrid API parcel ingestion
- LLC piercing (OpenCorporates + Apollo enrichment waterfall)
- Email outreach (Instantly)
- Reply handling + inbox classifier
- Video generation — **deliberately deferred to v2**

## Key files
| File | Purpose |
| :--- | :--- |
| `src/lib/openclaw-google.ts` | Google Solar API + satellite + SVG overlay |
| `src/lib/solar-utils.ts` | Financial calculations, slug generation, rate defaults by building type |
| `src/lib/supabase-server.ts` | `createClient()` (anon) + `createAdminClient()` (service role) |
| `src/services/lead.service.ts` | Lead CRUD + `Lead` interface |
| `src/app/api/leads/route.ts` | n8n → create lead webhook |
| `src/app/api/generate-roof-image/route.ts` | Solar API pipeline API route |
| `src/app/admin/actions.ts` | `deleteLeadsAction`, `updateLeadsStatusAction` |
| `OPENCLAW_IMPL_PLAN.md` | Full phased build plan with AI assignments |
| `OPENCLAW_REROOF_GUIDE.md` | Product spec and full pipeline architecture |

## Database tables
- `leads` — deployed microsites (public proposals)
- `cta_submissions` — contact form responses from proposal pages
- `page_views` — analytics
- `prospects` — raw pipeline (parcel data → enriched → emailed) — **check if migration has been applied**

## Environment variables (Vercel + .env.local)
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY        ← must be single JWT, not doubled
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
GOOGLE_SOLAR_API_KEY
N8N_WEBHOOK_SECRET               ← shared secret for n8n → app calls
```

## Hard rules
- `SUPABASE_SERVICE_ROLE_KEY` must be a single JWT. If you see a "Headers.set invalid value" error, the key is doubled in Vercel env vars — fix it in the Vercel dashboard.
- Do not use `createAdminClient()` for public reads. Use `createClient()` with RLS.
- Video generation (Veo 3 / Fal.ai) is v2. Do not add it until non-video pipeline has proven reply rates.
- AI in production: use Gemini Flash for reply classification and email copy (high volume). Never use Opus/Sonnet for per-prospect automation.
- The `/proposal/[slug]` and `/site/[slug]` pages are near-identical. If you change one, check if the other needs the same change.

## AI model guidance (for this project)
| Task | Model |
| :--- | :--- |
| n8n workflow JSON, boilerplate config | Codex |
| Enrichment orchestration, cross-API logic | Gemini Pro |
| Simple JSX/UI additions | Haiku |
| Multi-file features, complex routes | Sonnet (default) |
| Email copy in production (per prospect) | Gemini Flash |
| Reply classification in production | Gemini Flash |
| Hard architecture decisions only | Opus |
