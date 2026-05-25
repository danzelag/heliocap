## Agent: Codex (Command Centre & Proposal Workflow)
* **Timestamp**: 2026-05-22 7:01 PM EDT
* **Files touched**:
  - `next.config.ts`
  - `src/app/admin/page.tsx`
  - `src/app/api/generate-roof-image/route.ts`
  - `src/app/globals.css`
  - `src/app/proposal/[slug]/page.tsx`
  - `src/components/proposal/Hero.tsx`
  - `src/lib/openclaw-google.ts`
  - `src/lib/proposal-image-compose.ts`
  - `src/lib/proposal-workflow-publish.ts`
  - `src/lib/proposal-workflow-render.ts`
  - `src/lib/proposal-workflow-shared.ts`
  - `AGENT_COORDINATION.md`
* **What changed**:
  - Stabilized the Command Centre `/admin` layout with explicit `cc-*` shell classes so it no longer collapses into raw-looking text when utility layout styling fails or stale CSS is served.
  - Added a Turbopack root override so local dev resolves CSS from this project instead of the parent Antigravity workspace.
  - Reworked the deterministic Solar API render pipeline to use the original Solar RGB source when available, crop around the real panel cluster, project panel coordinates relative to that crop, and render a matte presentation plate instead of the blurred stretched satellite background.
  - Added mask-aware black panel clipping, variable render aspect selection, rotation limits, render quality flags, and richer receipt/debug data.
  - Updated proposal hero media handling to prefer the generated render only, use `object-contain`, avoid raw map fallback imagery, and remove video/cinematic wording when no video exists.
* **Intentionally avoided**:
  - Public landing page and premium marketing files owned by Antigravity, including `src/app/page.tsx` and `src/components/site/PixelCard.tsx`.
  - Database schema changes.
  - Environment variable renames.
  - Vercel deployment, deployment settings, commits, or pushes.
  - Hard publish approval gating until an operator approval UI exists, to avoid blocking the current local workflow without a release path.
* **Risks**:
  - Solar masks may be unavailable for some addresses; the workflow records mask fallback quality so those renders can be reviewed.
  - Lint still fails on pre-existing/out-of-scope issues, including `AddressAutocomplete.tsx`, `CtaForm.tsx`, `PixelCard.tsx`, and `textarea.tsx`.
  - Browser automation plugin CLI was unavailable locally, so visual verification was limited to build/typecheck/dev-server checks.
* **Preview instructions**:
  - Run `npm run dev`.
  - Visit `http://localhost:3000/admin` for the Command Centre and `http://localhost:3000/admin/pipeline` for the pipeline workspace.
  - Hard refresh the browser with `Cmd+Shift+R` if the old collapsed CSS view is still cached.
* **Lint/Build**:
  - `npm run build` passed.
  - `npm run lint` failed on existing/out-of-scope lint errors listed above.

## Agent: Codex (Command Centre Hotfix)
* **Timestamp**: 2026-05-22 10:46 PM EDT
* **Files touched**:
  - `src/app/admin/page.tsx`
  - `AGENT_COORDINATION.md`
* **What changed**:
  - Added page-local critical CSS directly inside `/admin` so the Command Centre keeps its grid, status strip, cards, queue, and table shell even if the global Tailwind/dev CSS layer is stale or slow to refresh.
  - Restarted the local Next dev server after the patch.
* **Intentionally avoided**:
  - Public landing page and Antigravity-owned marketing files.
  - Proposal workflow logic, database schema, environment variables, deployment settings, commits, and Vercel deployment.
* **Risks**:
  - This is intentionally a containment hotfix. A later cleanup can move the critical CSS back into a smaller dedicated module once the admin layout is stable.
  - Auth prevents unauthenticated `curl` from rendering `/admin`, so final visual confirmation still needs the logged-in browser session.
* **Preview instructions**:
  - Dev server is running at `http://localhost:3000`.
  - Visit `http://localhost:3000/admin`.
  - If Chrome still shows the old raw layout, open DevTools and disable cache or hard refresh with `Cmd+Shift+R`.
* **Lint/Build**:
  - `npm run build` passed after this hotfix.
  - `npm run lint` was not rerun after this CSS-only hotfix; the previous run failed on existing/out-of-scope lint errors.

## Agent: Codex (Proposal Page Rebuild)
* **Timestamp**: 2026-05-22 11:02 PM EDT
* **Files touched**:
  - `src/app/proposal/[slug]/page.tsx`
  - `AGENT_COORDINATION.md`
* **What changed**:
  - Replaced the old proposal microsite composition with a single, data-honest proposal page rendered directly from the lead record.
  - Removed the old landing-page style sections from the live proposal route and replaced them with a compact proposal document: header strip, media panel, savings snapshot, modeled scope, next-step CTA, and footer.
  - Stopped inventing fallback economics on the live proposal page. Missing values now show as pending instead of fabricated defaults.
  - Switched proposal copy and metadata to CAD-oriented, direct language and kept the media area honest about whether it is video, rendered imagery, raw satellite, or still pending.
* **Intentionally avoided**:
  - Landing page files owned by Antigravity.
  - Database schema changes.
  - Route renames.
  - Deployment commands or Vercel changes.
* **Risks**:
  - Old proposal section components still exist in the repo as unused code and can be cleaned up in a later pass.
  - The admin pipeline page itself still needs a follow-up redesign pass if the user wants the generator workspace to change more substantially.
* **Preview instructions**:
  - Dev server is running at `http://localhost:3000`.
  - Open any live proposal at `/proposal/[slug]` to see the rebuilt page.
* **Lint/Build**:
  - `npm run build` passed after the proposal page rebuild.

## Agent: Codex (Proposal Render Image Hotfix)
* **Timestamp**: 2026-05-24 1:12 PM EDT
* **Files touched**:
  - `src/lib/google-solar-data.ts`
  - `src/lib/openclaw-google.ts`
  - `src/lib/proposal-image-compose.ts`
  - `AGENT_COORDINATION.md`
* **What changed**:
  - Diagnosed the latest published proposal `danzel-gaminde-mphgwcah`: the proposal page had an image URL, but the saved generated render was effectively blank.
  - Fixed Solar GeoTIFF coordinate handling by preserving the projected EPSG code from Google Solar data layers and projecting panel lat/lng into UTM raster coordinates before drawing.
  - Fixed mask clipping for Google Solar binary masks that store roof pixels as `0/1`, so the compositor no longer erases the entire black panel layer.
  - Regenerated and uploaded the latest lead's `render_preview.webp`, then updated the lead to point at the repaired render URL.
* **Intentionally avoided**:
  - Public landing page and marketing files.
  - Database schema changes.
  - Environment variable renames.
  - API contract changes.
  - Vercel deployment, commits, or pushes.
* **Risks**:
  - Local regeneration could not use `/api/generate-roof-image` end to end because local env is missing `GOOGLE_CLOUD_CLIENT_EMAIL`; the repaired image was rebuilt from the already-stored Solar RGB/mask layers plus fresh Solar building insights.
  - This fixes blank/off-canvas renders caused by projected GeoTIFF bounds, but visual quality still depends on Google Solar's available imagery and selected panel layout.
* **Preview instructions**:
  - Run `npm run dev`.
  - Open `http://localhost:3000/proposal/danzel-gaminde-mphgwcah`.
  - Hard refresh if the browser cached the old `deterministic_solar_reference.webp`; the lead now points at `render_preview.webp`.
* **Lint/Build**:
  - `npm run build` passed.

## Agent: Codex (Command Centre Design Implementation)
* **Timestamp**: 2026-05-24 1:42 PM EDT
* **Files touched**:
  - `src/app/admin/pipeline/page.tsx`
  - `src/components/admin/ProposalJobsQueue.tsx`
  - `src/components/admin/ProspectPipelineTable.tsx`
  - `AGENT_COORDINATION.md`
* **What changed**:
  - Fetched and read the Claude Command Centre design package and implemented the relevant `command-centre/index.html` direction on `/admin/pipeline`.
  - Reworked the Command Centre shell into a compact mission-control layout with a warm grey palette, service health chip, navigation, command-search affordance, and a six-stage workflow stripe.
  - Redesigned the live proposal queue into a focused active-job monitor plus right-side queue rail, including generated render preview, workflow step ladder, collapsed diagnostics, event stream, status badges, and no raw Google map fallback image as the hero.
  - Polished the prospect workbench with denser CRM-style rows, readiness dots for visual/coordinate/solar/published state, warmer status accents, tighter controls, and reduced visual noise while preserving all existing actions.
* **Intentionally avoided**:
  - Public landing page and marketing files.
  - Proposal generation backend logic, database schema, API contracts, environment variables, Supabase/Vercel integration behavior, and deployment commands.
  - The existing visual verification modal logic beyond styling-adjacent containment, so its coordinate/Solar API actions remain unchanged.
* **Risks**:
  - Browser-level visual verification still needs a logged-in admin session; unauthenticated requests redirect to `/admin/login`.
  - The design implementation is intentionally scoped to the Command Centre. Other dirty files in the worktree are pre-existing and were not reverted.
  - `npm run lint` still fails on pre-existing/out-of-scope errors in `AddressAutocomplete.tsx`, `CtaForm.tsx`, `PixelCard.tsx`, and `textarea.tsx`.
* **Preview instructions**:
  - Dev server is already listening on `http://localhost:3000`.
  - Visit `http://localhost:3000/admin/pipeline` while logged in.
  - Hard refresh with `Cmd+Shift+R` if the browser is holding stale admin CSS.
* **Lint/Build**:
  - `npm run build` passed.
  - `npm run lint` failed only on existing/out-of-scope lint errors listed above.

## Agent: Codex (Reset to Premium Energy Landing Page)
* **Timestamp**: 2026-05-24 10:05 PM EDT
* **Files touched**:
  - `src/app/page.tsx`
  - `src/app/layout.tsx`
  - `src/app/globals.css`
  - Deleted `src/app/admin/**`
  - Deleted `src/app/api/**`
  - Deleted `src/app/proposal/**`
  - Deleted `src/components/**`
  - Deleted `src/lib/**`
  - Deleted `src/services/**`
  - Deleted `src/middleware.ts`
  - `AGENT_COORDINATION.md`
* **What changed**:
  - Fetched and read the Claude Design handoff for `Energy Landing Page.html`, including its README, chat transcript, HTML, CSS, and calculator logic.
  - Replaced the old HelioCap app surface with a single premium Canadian energy landing page at `/`.
  - Implemented the Rolex/Porsche/AP-inspired white/warm-cream editorial design direction with serif display type, restrained teal accent, full-screen dark hero, partner strip, metrics, calculator, product sections, rebates table, contact form, and footer.
  - Ported the Canadian savings calculator into React state with province rates, heating type, residential/commercial mode, EV/parking inputs, CAD formatting, rebates, payback, and CO2 estimates.
  - Removed the exposed admin, proposal, generator, VEO/Gemini/Solar API, middleware, component, service, and workflow code paths from `src`.
* **Intentionally avoided**:
  - `.env*` files and Vercel project/configuration.
  - `package.json`, dependency pruning, and lockfile churn.
  - Git push/deployment commands.
  - The untracked `/Users/danzelgaminde/solar-imagery-research.md` file.
* **Risks**:
  - The contact form is currently preview-only and shows a local success state; it is not wired to Supabase, email, or a CRM because the old backend/API surface was intentionally removed.
  - Product/hero imagery uses premium placeholders from the design direction; real product photography still needs to be supplied.
  - Dependencies are still the old project dependency set and can be pruned in a follow-up cleanup.
* **Preview instructions**:
  - Run `npm run dev`.
  - Open `http://localhost:3000`.
  - Use the calculator and contact form directly on the page.
* **Lint/Build**:
  - `npm run build` passed.
  - `npm run lint` passed.

## Agent: Codex (Stylized Solar Design Plate)
* **Timestamp**: 2026-05-24 2:50 PM EDT
* **Files touched**:
  - `src/app/api/generate-roof-image/route.ts`
  - `src/lib/openclaw-google.ts`
  - `src/lib/proposal-image-compose.ts`
  - `src/lib/proposal-workflow-publish.ts`
  - `src/lib/proposal-workflow-render.ts`
  - `AGENT_COORDINATION.md`
* **What changed**:
  - Added a deterministic stylized Solar API design plate generator as the practical Option 4 path.
  - The new render uses Google Solar panel centers and roof segment data to draw an axonometric technical plate with matte dark roof planes and black graphite panels only.
  - Wired the in-app proposal workflow so new proposals use the stylized design plate as `render_preview_url`, while the old Solar RGB + panel composite is still uploaded and kept in receipts for diagnostics.
  - Mirrored the same behavior in `/api/generate-roof-image`, returning the design plate as the public preview and exposing the technical SVG/composite URLs separately.
* **Intentionally avoided**:
  - Public landing page and marketing files.
  - Database schema changes.
  - Environment variable changes.
  - Veo, Gemini, Aurora, EagleView, or new third-party API integration.
  - Full Three.js/browser rendering in the backend workflow; this pass uses server-side SVG/WebP for reliability.
* **Risks**:
  - The design plate is an illustrative technical visual, not a permit-grade Aurora-style model.
  - The output depends on Google Solar panel and roof segment quality. Bad Solar API targeting still needs operator review.
  - `AGENTS.md` had an automatic memory timestamp change in the worktree before this note; it was not part of the feature work.
  - `npm run lint` still fails on pre-existing/out-of-scope lint errors in `AddressAutocomplete.tsx`, `CtaForm.tsx`, `PixelCard.tsx`, and `textarea.tsx`.
* **Preview instructions**:
  - Run `npm run dev`.
  - Generate a new roof/proposal via the existing admin workflow or `/api/generate-roof-image`.
  - Open the resulting `render_preview_url` or proposal page to inspect the stylized design plate.
* **Lint/Build**:
  - `npm run build` passed.
  - `npm run lint` failed only on existing/out-of-scope lint errors listed above.
