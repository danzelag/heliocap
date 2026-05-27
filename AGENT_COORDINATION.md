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

## Agent: Codex (Hero Media Wiring & Veo Key Diagnosis)
* **Timestamp**: 2026-05-24 11:31 PM EDT
* **Files touched**:
  - `src/app/page.tsx`
  - `src/app/globals.css`
  - `public/hero/house-solar-hero-poster.webp`
  - `AGENT_COORDINATION.md`
* **What changed**:
  - Replaced the landing page hero placeholder treatment with the actual residential house image as the live poster/fallback asset.
  - Wired the hero to support a real background video at `/hero/house-solar-hero.mp4`, fading it in automatically once the file exists and can play, while keeping the poster visible if the video is absent or fails.
  - Tested Gemini/Veo image-to-video generation against the current local Gemini key and a second pasted key to diagnose the rendering blocker before touching more UI.
* **Intentionally avoided**:
  - Any admin, proposal, API route, Supabase, or Vercel deployment changes.
  - Adding a fake or unrelated hero video just to fill the slot.
  - Overwriting the existing `.env.local` or committing temporary pulled env files.
* **Risks**:
  - No hero video was generated in this pass because the available keys are blocked in two different ways:
    - current local `GEMINI_API_KEY`: `429 RESOURCE_EXHAUSTED` / depleted prepay credits for Veo generation
    - pasted alternate key: `403 API_KEY_SERVICE_BLOCKED` for `generativelanguage.googleapis.com` long-running prediction
  - The hero video slot is ready, but the final MP4 still needs a working Gemini/Veo-enabled key before `/hero/house-solar-hero.mp4` can be produced and dropped in.
* **Preview instructions**:
  - Run `npm run dev`.
  - Open `http://localhost:3000`.
  - The hero now shows the real house poster immediately; if `public/hero/house-solar-hero.mp4` is later added, it will autoplay and replace the still automatically.
* **Lint/Build**:
  - `npm run build` passed.
  - `npm run lint` passed with one warning in `src/app/page.tsx` for using a raw `<img>` in the hero poster layer.

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

## Agent: Codex (Landing Intake Autocomplete & Vertex Hero Video Path)
* **Timestamp**: 2026-05-24 11:41 PM EDT
* **Files touched**:
  - `package.json`
  - `src/app/page.tsx`
  - `src/app/globals.css`
  - `src/lib/google-cloud-auth.ts`
  - `src/lib/vertex-veo.ts`
  - `scripts/generate-hero-video.mjs`
  - `public/hero/house-solar-hero-poster.webp`
  - `AGENT_COORDINATION.md`
* **What changed**:
  - Added Google Places autocomplete to the landing-page contact form's property address field, using `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.
  - The address picker is restricted to Canadian addresses and updates the contact-form province select from the selected place's province component when available.
  - Kept the address input usable as a normal text field if Places is unavailable or the browser key is missing.
  - Replaced the raw hero poster image with `next/image` and kept the `/hero/house-solar-hero.mp4` background video slot ready.
  - Restored a minimal Vertex Veo helper path and added `npm run generate:hero-video` to generate the 16:9 hero MP4 from the local house reference image once real `GOOGLE_CLOUD_*` service-account env values are available locally.
* **Intentionally avoided**:
  - Vercel deployment and GitHub push.
  - Hardcoding Google API keys or service-account secrets into source.
  - Reintroducing the deleted admin/proposal generator app surface.
  - Touching the untracked `solar-imagery-research.md` file.
* **Risks**:
  - `npx vercel env ls` shows the expected Vertex env names exist on the Vercel project, but `vercel env pull` returned blank values for all five `GOOGLE_CLOUD_*` variables. The generator cannot submit to Vertex until those values are populated locally.
  - `npm run generate:hero-video` currently stops at `GOOGLE_CLOUD_PROJECT_ID is not configured`, which confirms the missing local Vertex env values are the remaining blocker.
  - The contact form is still preview-only; autocomplete improves intake quality, but submissions are not yet wired to Supabase/email/CRM.
* **Preview instructions**:
  - Dev server is running at `http://localhost:3000`.
  - Open the contact section and type a Canadian address into "Property address" to test Places autocomplete.
  - After real Vertex env values are added locally, run `npm run generate:hero-video`; the output will be saved to `public/hero/house-solar-hero.mp4` and the hero will autoplay it automatically.
* **Lint/Build**:
  - `npm run build` passed.
  - `npm run lint` passed.

## Agent: Codex (Deployed Hero Video Bridge)
* **Timestamp**: 2026-05-25 12:01 AM EDT
* **Files touched**:
  - `package.json`
  - `src/app/api/hero-video/route.ts`
  - `scripts/generate-hero-video-via-vercel.mjs`
  - `AGENT_COORDINATION.md`
* **What changed**:
  - Added a protected server route at `/api/hero-video` so the deployed Vercel app can use its runtime `GOOGLE_CLOUD_*` env values to submit, poll, and download a Veo hero render.
  - Protected the route with a request token derived from the configured `GOOGLE_CLOUD_PRIVATE_KEY`, so the endpoint is not publicly callable without the matching service-account material.
  - Added `npm run generate:hero-video:vercel`, a local orchestration script that calls the deployed route, waits for completion, and saves the finished MP4 into `public/hero/house-solar-hero.mp4`.
* **Intentionally avoided**:
  - Exposing raw env values or adding an unauthenticated expensive generation endpoint.
  - Editing the public page design beyond what was needed for the existing hero media slot.
* **Risks**:
  - This bridge assumes the deployed Vercel project really has working `GOOGLE_CLOUD_*` values, even though `vercel env pull` returned blanks locally.
  - The route can submit real paid Veo jobs, so the private-key-derived token must stay secret.
* **Preview instructions**:
  - After deployment, run `npm run generate:hero-video:vercel`.
  - The script will call the production `/api/hero-video` route and save the downloaded MP4 into `public/hero/house-solar-hero.mp4`.
* **Lint/Build**:
  - `npm run build` passed.
  - `npm run lint` passed.

## Agent: Codex (Hero Video Generated)
* **Timestamp**: 2026-05-25 08:41 AM EDT
* **Files touched**:
  - `src/app/api/hero-video/route.ts`
  - `scripts/generate-hero-video-via-vercel.mjs`
  - `public/hero/house-solar-hero.mp4`
  - `AGENT_COORDINATION.md`
* **What changed**:
  - Swapped the deployed hero-video route from private-key-derived auth to a dedicated shared secret so the protected Vercel bridge could be called reliably from this machine.
  - Updated the Vercel production env to use the provided service-account identity values and a matching shared secret, then redeployed production.
  - Successfully submitted a Vertex Veo job through the deployed route, polled it to completion, downloaded the finished asset, and saved the final hero video locally to `public/hero/house-solar-hero.mp4`.
* **Intentionally avoided**:
  - Printing or committing any secret values.
  - Touching unrelated local research files or the automatic `AGENTS.md` timestamp change.
* **Risks**:
  - The deployed bridge now depends on `HERO_VIDEO_SHARED_SECRET` in Vercel production; if that env is removed or changed, the local generator script must use the matching value.
  - The Vercel production env still contains an unknown `GOOGLE_CLOUD_STORAGE_URI` value that was not surfaced locally; the successful render strongly suggests it is valid in production, but local Vertex generation still cannot use it without setting it locally.
* **Preview instructions**:
  - Open `http://localhost:3000` to verify the hero plays the generated MP4 locally.
  - After pushing the generated asset, production will serve the same hero video from `public/hero/house-solar-hero.mp4`.
* **Lint/Build**:
  - Existing build and lint checks for this landing page state were already passing before the final asset save.

## Agent: Codex (Batch Veo Loop Pipeline)
* **Timestamp**: 2026-05-26 10:58 AM EDT
* **Files touched**:
  - `package.json`
  - `src/app/api/hero-video/route.ts`
  - `scripts/generate-veo-loop-via-vercel.mjs` (NEW)
  - `scripts/hero-video-loop.config.example.json` (NEW)
  - `AGENT_COORDINATION.md`
* **What changed**:
  - Generalized the deployed `/api/hero-video` route so it can accept a custom prompt, custom reference image bytes, and custom duration instead of only using the single built-in poster image.
  - Added a new batch generator script that can submit multiple house-reference images to the deployed Veo route, save each finished clip locally, and stitch them into one seamless looping MP4 with crossfades.
  - Added an example JSON config showing how to pass three house-image paths plus optional per-image crop percentages for trimming visible MLS/watermark bands before generation.
  - Installed `ffmpeg-static` so stitching the generated clips into a loop is self-contained on this machine and no longer depends on a separate system ffmpeg install.
* **Intentionally avoided**:
  - Touching the landing page layout or changing the live hero behavior yet.
  - Committing any API keys, shared secrets, or service-account credentials.
  - Guessing at final source-image file paths for the two chat-only house references that are not yet present on disk.
* **Risks**:
  - The current Vertex Veo path is still limited by the model to 1080p output; “highest available” on this path is 1080p, not 4K.
  - If the final source photos themselves contain visible watermarks, Veo may preserve or reinterpret them; the new crop config helps, but truly clean output is best with unwatermarked source files.
  - The batch pipeline is ready, but it still needs the actual local file paths for the remaining house references before the full three-clip job can run.
* **Preview instructions**:
  - Use `npm run generate:hero-loop:vercel -- scripts/hero-video-loop.config.example.json` after replacing the example image paths with real local files and exporting `HERO_VIDEO_SHARED_SECRET`.
  - The script will save individual clips in `public/hero/generated-clips/` and the stitched loop to `public/hero/house-solar-hero.mp4` by default.
* **Lint/Build**:
  - `npm run build` passed.
  - `node --check scripts/generate-veo-loop-via-vercel.mjs` passed.
