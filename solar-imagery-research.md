# Solar Proposal Imagery: Killing the "Solar Panel Acne" Look

**Goal:** Replace the low-res satellite + composited panel overlay (the "acne") with imagery that feels like an architect or engineer visited the site. Keep Google Solar API for the *data* (irradiance, panel layout math, savings). Decouple the *visual*.

---

## How Aurora Solar Actually Does It

Aurora is the gold standard you screenshotted. Here's their stack:

1. **High-res aerial imagery, not satellite.** Aurora doesn't rely on Google Maps satellite. They pull from:
   - **EagleView** — a fleet of ~130 aircraft flying low-altitude orthogonal *and* oblique shots, stitched into navigable 3D building models. 70x more detailed than satellite.
   - **Google HD imagery** (25cm–10cm/pixel) where EagleView isn't current.
   - **Drone uploads** for the contractor's own captures.

2. **LIDAR-derived geometry.** They use LIDAR point clouds (laser pulse timing → distance) to extract building heights, roof slope, ridge lines, and tree shading. This is what gives them the *clean wireframe roof model* with crisp facet edges instead of pixelated rooftops.

3. **Photogrammetry DSM (Digital Surface Model).** Multi-angle aerial photos are correlated to produce a per-pixel elevation grid. Combined with LIDAR, this is how they get the 3D mesh.

4. **AI roof segmentation.** Computer vision (trained on 500k+ site models) auto-detects roof faces, obstructions (vents, chimneys, HVAC), and edges in ~15 seconds. Then panels are placed on the *clean rendered model*, not painted onto a satellite tile.

The critical insight: **Aurora's "tablet screenshot" image you sent isn't a satellite photo with panels glued on. It's a 3D rendered scene of the building, with the panels as actual 3D objects on that mesh, with the satellite/aerial used as a textured map on the ground plane only.**

---

## Why Yours Looks Like "Acne"

Google Solar API gives you:
- A flat raster satellite tile (often 25–50cm/px, sometimes blurred/old)
- A `panelConfig` array of lat/lng/orientation rectangles
- You're rendering those rectangles as a 2D overlay on top of the tile

So you're literally pasting blue rectangles onto a low-res photo. No 3D, no perspective, no lighting match → the brain reads it as a defect on the roof rather than a designed installation.

The fix is one of three categories: **(A) Use better source imagery**, **(B) Render in 3D**, or **(C) Sidestep the realism problem entirely with curated/AI imagery**. Most polished products combine A+B.

---

## Option 1: Photorealistic 3D + Real Panel Mesh (Closest to Aurora)

Render the actual address in 3D and place panel meshes on the roof.

### Stack
- **Google Photorealistic 3D Tiles API** — drape full 3D mesh of any address with photo textures (covers 2,500+ cities, 49 countries). Loads via `3d-tiles` renderer.
- **NASA-AMMOS `3d-tiles-renderer`** — official React Three Fiber bindings. `<TilesRenderer>`, `<GlobeControls>`, attribution overlays — drops into your existing R3F scene.
- **React Three Fiber + drei** — already React/Next-friendly, you can wire panels as `<mesh>` instances onto the tile surface using the Solar API's lat/lng/azimuth/tilt data.
- **Camera framing** — orbit slowly, then settle into a 30°-down isometric — that's the Aurora "tablet look."

### Cost
- **Google Photorealistic 3D Tiles — PAID — $6.00 per 1,000 root tile sessions (one session = up to 3 hours of viewing per user)**. First 1,000 sessions/month free. So if you have 10,000 proposal views/month: ~$54/mo. Cheap.
- React Three Fiber, drei, 3d-tiles-renderer — free, MIT.

### Realism
8/10. Photoreal textures, real building shapes, panels look placed. Won't match Aurora's super-clean LIDAR wireframe, and texture quality varies wildly by city (suburban single-family homes outside major metros may look mediocre).

---

## Option 2: Premium Aerial Imagery API (Aurora's Actual Source)

Skip Google entirely and pull from the same providers Aurora uses.

### EagleView (Aurora's primary partner)
- True ortho aerial + obliques, AI roof reports with measurements/pitch/area
- **PAID — ~$15–$38 per property report** retail; volume/subscription deals available via sales (Silver/Gold/Platinum tiers, must call).
- Developer portal: `developer.eagleview.com`. REST API.
- Best for: getting both the *imagery* and a structured roof geometry JSON in one call. Then render panels onto their ortho image.

### Nearmap
- HyperCamera3 system — 4.4–7.5cm/pixel aerial, refreshed up to 3x/year
- APIs: WMS 2.0, Tile API, Coverage API, **DSM + True Ortho API** (← this is the one), AI Feature API
- **PAID — pricing is sales-gated, typically $500–$5,000/mo subscription bands** based on geography + API mix. Estimate ~$1–$3 per address pull at low volume.
- Best for: gorgeous straight-down ortho imagery you can drop the panel overlay on; the DSM API gives you elevation data so you can also do basic 3D.

### Recommendation
EagleView if you want roof geometry + imagery bundled. Nearmap if you mostly want imagery quality and have your own panel layout logic.

---

## Option 3: AI Render of Their Actual House (Street View → ControlNet → Photoreal)

Since the lead gives you their address, you have Street View on tap. The pipeline:

1. Pull Google Street View Static API image at their address (free at low volume, then ~$7/1000 imgs).
2. Run it through a depth/canny ControlNet preprocessor to extract structure.
3. Feed to SDXL/Flux with prompt like *"architectural photograph, twin-pitch suburban home with solar panels installed cleanly on south-facing roof, golden hour, professional real estate photography, sharp focus, no people."*
4. Optional: use IP-Adapter on a reference image (your second attached photo) to lock the style.

### Cost
- **Google Street View Static API — PAID — $7 per 1,000 images** after free tier (28,500/mo free with $200 Maps credit).
- **Flux 1.1 Pro via Replicate / fal.ai — PAID — ~$0.04 per image** generated. Higher quality than SDXL.
- **SDXL + ControlNet self-hosted or via Replicate — PAID — ~$0.003 per image**. Cheaper, less photoreal.

So ~$0.05 per lead all-in for one generated hero image. Cache it forever once generated.

### Realism
7/10. The vibe is right — looks like their house, looks like a pro photo. **Caveat:** the AI will hallucinate details (wrong number of windows, fake architectural elements). Quality is unpredictable per address. You need a human-in-the-loop review step before showing to the lead, or a "regenerate" button.

### Why this matters for HelioCap
This is the *lead-facing emotional hook* — "here's what your home will look like." It's not technically accurate, and it shouldn't be the technical design section. Pair it with Option 1 or 4 below for the "this is your actual roof + panel layout" section.

---

## Option 4: Stylized 3D — Skip Realism, Lean Into "Architect's Drawing"

Instead of fighting for photorealism, render the roof as a **clean axonometric/isometric illustration** — flat-shaded facets, soft shadows, panels as crisp dark rectangles. Think Linear / Stripe marketing aesthetic applied to a roof.

### Stack
- Pull roof polygon + height data from Google Solar API (`buildingInsights.solarPotential.roofSegmentStats`)
- Extrude in Three.js (R3F) — each segment becomes a quad with the right azimuth/pitch
- Place panel rects as flat meshes on each segment
- Use a stylized shader (toon, low-saturation palette, subtle ambient occlusion)
- Render to canvas, freeze as a static image for the proposal

### Cost
- Free. No new APIs. You already have the data.

### Realism
4/10 photorealism, but 9/10 *design polish*. This is actually a strong fit for HelioCap's dark luxury glassmorphism aesthetic — a photoreal satellite would clash with the rest of the page; a stylized render would harmonize.

---

## Public Claude Artifacts

I checked claude.site / claude.ai/share for prior solar visualization artifacts. Nothing notable came up — there's a small community ecosystem at `madewithclaude.com` and the official catalog at `claude.ai/catalog/artifacts`, but no solar-specific reference pieces worth copying. Your strongest reference is still Aurora's marketing site + the HelioScope and OpenSolar demos.

---

## My Recommendation for HelioCap (Per-Lead Workflow)

You're not picking generic imagery — every proposal is for a *specific address the lead just submitted*. So the imagery pipeline runs once per lead, ideally during the n8n flow that generates the proposal.

### The two-image strategy

Every proposal page should have **two distinct visuals**, doing different jobs:

**1. Emotional hero ("Look at your future home")**
- Above the fold. Lifestyle vibe. Doesn't need to be technically correct.
- **Best option: Option 3 — AI render of their actual house.** Street View → ControlNet → Flux. ~$0.05 per lead. Cache the result. Add a "this is an artistic preview" disclaimer in small text.
- Fallback when Street View is bad/missing: Option 1 — Google Photorealistic 3D Tiles, rendered to a hero camera angle and screenshotted.

**2. Technical roof + panel layout ("Here's your actual system")**
- Mid-page. Must be accurate. This is where the customer-trust math happens.
- **Best option: Option 4 — stylized 3D from Solar API data.** Free, matches your dark luxury glassmorphism aesthetic, no acne, no hallucinations. Aurora-adjacent feel without Aurora-level cost.
- Premium upgrade later: Option 1 (interactive Photorealistic 3D Tiles viewer) or Option 2 (Nearmap/EagleView ortho with overlay).

### Recommended build order

**Phase 1 — kill the acne now (this week):**
- Replace the current Solar API satellite + rectangle overlay with Option 4 (stylized 3D render of the roof from Solar API roof segment data, panels as flat dark meshes). Free, fast, ships clean.

**Phase 2 — add the emotional hero (next sprint):**
- Add Option 3 pipeline to your n8n flow: on new lead, pull Street View → run through Flux + ControlNet → store result in Supabase → display on proposal page. ~$0.05 per lead.
- Build a manual override / regenerate button in the prospects admin dashboard for cases where the AI hallucinates badly.

**Phase 3 — premium interactivity (once you have volume):**
- Add Option 1 (Google Photorealistic 3D Tiles) as an interactive "explore your home" section. ~$54/mo at 10k proposal views.

**Phase 4 — match Aurora on accuracy (when sales motion warrants it):**
- Add Option 2 (EagleView or Nearmap) for high-ticket commercial leads where the per-property cost ($15–$38) is justified.

---

## Sources

- [3 Ways to model a roof — Aurora Solar Help Center](https://help.aurorasolar.com/hc/en-us/articles/21016351139859-3-Ways-to-model-a-roof)
- [Aurora AI in Design Mode](https://help.aurorasolar.com/hc/en-us/articles/8172307851411-Aurora-AI-in-Design-Mode)
- [Using Computer Vision for Remote Solar Site Measurements — Aurora](https://aurorasolar.com/blog/using-computer-vision-for-remote-solar-site-measurements/)
- [EagleView Powered 3D roof models in Aurora — Solar Builder](https://solarbuildermag.com/products/eagleview-powered-3d-roof-models-now-available-in-aurora-solar/)
- [LIDAR: What it is, how it works — Aurora](https://aurorasolar.com/blog/lidar-what-it-is-how-it-works-and-a-huge-update/)
- [Advanced Solar Modeling — Aurora](https://www.aurorasolar.com/features/modeling)
- [EagleView Developer Portal](https://developer.eagleview.com/documentation/property-data/v2/overview)
- [EagleView Pricing](https://www.eagleview.com/pricing/)
- [Nearmap Integrations & APIs](https://www.nearmap.com/products/integrations-apis)
- [Nearmap for Solar Lead Generation](https://www.nearmap.com/us/en/industries/solar-lead-generation)
- [Google Photorealistic 3D Tiles](https://developers.google.com/maps/documentation/tile/3d-tiles)
- [Google Maps Tile API — Usage and Billing](https://developers.google.com/maps/documentation/tile/usage-and-billing)
- [NASA-AMMOS 3DTilesRendererJS — R3F bindings](https://github.com/NASA-AMMOS/3DTilesRendererJS/blob/master/src/r3f/README.md)
- [Google Solar API Methodology](https://developers.google.com/maps/documentation/solar/methodology)
- [SurgePV — Rooftop Solar Assessment & Roof Modeling 2026](https://www.surgepv.com/hub/solar-designing/roof-modeling)
- [ControlNet + Stable Diffusion for architectural visualization](https://parametric-architecture.com/stable-diffusion-controlnet-and-its-integration-with-blender-for-architectural-visualization/)
