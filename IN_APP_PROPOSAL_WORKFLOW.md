# In-App Proposal Workflow

This replaces the n8n proposal orchestration. The app owns the job state, media generation, lead publishing, and queue updates. n8n can stay as an external experiment later, but the core proposal path should not depend on it.

## Why This Shape

n8n failed because the workflow crossed too many loose payload boundaries: prospect data, roof images, AI media output, and final lead publishing all had to agree on field names and timing. The app already has typed access to Supabase, Google Maps/Solar, and the admin queue, so the stable path should live here.

The key decision now: stop using Veo/Gemini for the customer-facing roof visual. Google Maps is only a coordinate tracker in the admin UI. Google Solar API RGB imagery is the roof image source. Google Solar panel coordinates control panel placement. The app draws matte black panels deterministically and publishes a still-image proposal.

## Current Entry Points

- Admin prospect table: `promoteProspectToLeadAction()` queues a proposal job for a verified prospect.
- Manual create endpoint: `POST /api/create-proposal` queues a proposal job from explicit address and coordinates.
- Both entry points create a `proposal_jobs` row, write an initial event, then schedule `runInAppProposalWorkflow(jobId)` with Next's `after()`.

## Job State Model

Primary table: `proposal_jobs`

Event table: `proposal_job_events`

The queue UI reads:

- `status`: `queued`, `running`, `completed`, `failed`
- `current_step`: human-readable step
- `progress_percent`: 0-100
- `proposal_url`: final microsite URL
- `lead_id`: published lead
- `receipt`: structured workflow metadata

Important receipt fields:

- `engine: "app"`
- `build_status`
- `build_status_label`
- `prospect_id`
- `visual_target`
- `reference_set`
- `solar_model`
- `render_source`
- `solar_data_layers`
- `solar_layout_debug`

## Workflow Steps

1. Queue job
   - Validate target coordinates.
   - Store prospect ID and visual target in `receipt`.
   - Mark job as `running`, step `App workflow starting`.

2. Fetch roof and solar data
   - Call Google Solar building insights.
   - Build the solar model.
   - Fetch Google Solar data layers.
   - Use the Solar RGB GeoTIFF preview as the roof image source.
   - Store Solar RGB imagery, roof mask, DSM height model, and annual sunlight flux previews.
   - Read Solar RGB GeoTIFF bounds so panel coordinates map to the Solar image instead of a Maps screenshot.

3. Collect visual references
   - Google Maps remains a coordinate tracker only.
   - Optional aerial/street context can be collected for internal review, but it is not the proposal render source.
   - Apply prospect-level exclusions.
   - Store the reference set in the job receipt.

4. Generate proposal image
   - Create a 16:9 proposal image from the Solar RGB roof image.
   - Fit the Solar RGB image on a muted/blurred background so it is readable and not a raw map screenshot.
   - Draw matte black panels from Google Solar `solarPanels[]` coordinates.
   - Upload `render_preview.webp`.

5. Publish still proposal lead
   - Insert or update the matching `leads` row by slug.
   - Publish with `status = "published"`.
   - Set `roof_image_url` to the Solar RGB image.
   - Set `render_preview_url` to the deterministic black-panel proposal image.
   - Keep `video_url = null`.

6. Complete job
   - Write `proposal_url`.
   - Link `lead_id`.
   - Mark `build_status = "proposal_published"`.
   - Mark `video_required = false`.
   - Move the prospect to `microsite_live`.

## Intentional Non-Goals For This Pass

- No n8n webhook is required for proposal creation.
- No blocking admin request while the full workflow runs.
- No new queue table yet. `proposal_jobs` remains the queue.
- No n8n polling or n8n finalization.
- No Veo/Gemini image generation for the primary proposal visual.

## Later Improvements

- Add a dedicated worker route or cron processor for stalled jobs.
- Add a retry button per failed job.
- Add max-duration controls before deploying this as a production background worker.
- Split media generation into smaller resumable steps if jobs start timing out on Vercel.
- Add post-processing controls for panel count, roof plane selection, and crop/rotation.
