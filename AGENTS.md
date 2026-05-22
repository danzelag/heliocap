<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->


<claude-mem-context>
# Memory Context

# [solar-lead-gen] recent context, 2026-05-22 4:57pm EDT

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (17,983t read) | 671,630t work | 97% savings

### Apr 29, 2026
S83 User asked what the /design-handoff skill does — skill capability explanation provided (Apr 29 at 3:48 PM)
S66 Add Google Places Autocomplete to lead creator/editor with automatic satellite roof image generation on address selection (Apr 29 at 3:48 PM)
### Apr 30, 2026
S84 User asked about "Claude Design" tool — available design skills and options explained (Apr 30 at 7:55 PM)
S82 User asked what the /design-handoff skill does — skill capability explanation provided (Apr 30 at 7:55 PM)
S85 Fix heliocap Vercel build failure caused by TypeScript errors in Next.js 16.2.4 project (Apr 30 at 7:56 PM)
### May 1, 2026
S86 Fix proposal page image rendering (cropped/stretched SVG) + deploy to Vercel via git push or CLI (May 1 at 12:14 PM)
### May 3, 2026
S87 Fix proposal page image rendering (aspect-ratio/object-fit bug) and deploy to Vercel via git push or Vercel CLI (May 3 at 2:03 AM)
S95 Migrate /api/generate-proposal-image to use Gemini AI image generation with a single GOOGLE_MAPS_API_KEY (May 3 at 2:06 AM)
### May 4, 2026
277 2:08p 🔵 ProposalJobsQueue JSX Redesign Patch Failed — Only Data Layer Changes Applied
278 " 🟣 ProposalJobsQueue JSX Layout Redesign Successfully Applied
279 " 🟣 Live Queue UI Fully Shipped — JSX Confirmed and Server-Side Limits Updated
280 2:09p 🔵 Lint Run Shows 5609 Problems — All Errors in .next Build Artifacts, Not Source Files
281 " 🟣 Production Build Passes Clean — All Changes Compile Successfully
282 " ✅ Session Changeset Summary — 5 Files Modified, Dev Server Running
283 2:12p 🔵 No AI Image Generation in Source — Video/Veo3 Pipeline Is Documentation-Only
284 " ✅ Veo 3 Video Prompt Updated in OPENCLAW_REROOF_GUIDE.md
285 2:15p 🔵 Google Maps API Key Covers 6 APIs Including Solar
286 2:27p ⚖️ Google API Key Consolidation — Single GOOGLE_MAPS_API_KEY for All Google Services
287 " 🟣 Gemini Image Generation Added to /api/generate-proposal-image
288 " 🟣 generate-proposal-image Route: Gemini AI Render with SVG Fallback
289 " 🔵 API Key Consolidation Incomplete — Multiple Google Key Env Vars Still in Code
290 2:28p 🔄 generate-proposal-image Simplified: SVG Fallback Removed, True roof_image_url Fallback Added
291 " 🔄 Google API Key Consolidation Completed and Dead SVG Code Purged
292 " 🔄 GenerateProposalImageBody Type Cleaned Up — render_image_url and solar_model Removed
293 " 🔵 generate-proposal-image Refactor Verified Clean — Build Passes with No Errors
294 " 🔵 git diff Reveals Original Route Required render_image_url and Used Parallel Fetch
S101 HELIOCAP solar-lead-gen 10-point UX/API overhaul — build, commit, and push to GitHub (May 4 at 2:30 PM)
295 2:30p 🔵 Broader Session Changeset — 7 Files Modified Across Admin UI and API Routes
296 " 🟣 Gemini Proposal Render Pipeline Committed and Pushed to main
### May 5, 2026
303 12:17a 🔵 HELIOCAP Solar Lead Gen — Project Structure Mapped
304 12:18a 🔵 ProposalRoofRender Has Wrong Image Priority Order
305 " 🔵 Proposal Page Has Redundant Solar Layout Preview Card
306 " 🔵 ProposalJobsQueue Has Two Side-by-Side Panels and Exposes Progress Percent
307 " 🔵 Progress Stuck at 2%/8% — Root Cause Found in actions.ts
308 " 🔵 ProspectPipelineTable Has No Delete Action
309 " 🔵 generate-proposal-image API Accepts Minimal Payload — Mismatched with n8n Requirements
310 " 🔵 Lead Service Fetches Published Proposals Only — Admin Fallback Available
311 12:19a 🔴 ProposalRoofRender Image Priority Fixed — AI Render Now Shown First
312 " 🔴 Removed Duplicate Solar Layout Preview Card from Proposal Hero
313 " 🔵 n8n Job Update API at /api/proposal-jobs/update — Flexible Payload Schema
314 " 🟣 ProposalJobsQueue Unified into Single Live Job Stream Panel
315 12:20a 🟣 Prospect Delete Implemented — Server Action + Optimistic UI
316 " 🟣 Delete Button Wired into ProspectPipelineTable Action Column
317 " 🔴 generate-proposal-image API Payload Type Expanded to Match n8n Workflow Fields
318 " 🟣 generate-proposal-image Now Handles n8n Filtered Items and Missing Roof Images Gracefully
319 12:21a ✅ Event Step Labels Standardized Across Proposal Pipeline for Live Stream Readability
S102 HELIOCAP UX/API overhaul: commit bulk delete, then add queue-clearing and collapsible queue UI (May 5 at 12:28 AM)
320 6:26p 🔴 Gemini Image Generation Model Updated in /api/generate-proposal-image
321 " 🔵 generate-proposal-image Route Structure Confirmed Before Fix
322 " 🔴 Gemini Model Constant Updated: gemini-2.0-flash → gemini-2.5-flash-image
323 " ✅ solar-lead-gen Production Build Passes After Gemini Model Fix
324 " 🔴 Gemini Model Fix Committed to main Branch
325 6:27p 🔴 Gemini Model Fix Pushed to GitHub — heliocap main Branch
326 6:41p ✅ Planned: Gemini image model fix, proposal image quality overhaul, and dashboard navigation performance
327 " 🔵 Solar lead-gen project structure mapped: two app directories, key files identified
328 6:42p 🔵 ProposalJobsQueue uses both Supabase Realtime + 4-second polling; static map currently generates square 1280×1280 images
329 " 🔵 Server actions use revalidatePath for cache busting; n8n webhook integration confirmed in pipeline actions
330 6:43p 🔵 next.config.ts is effectively empty — no custom image domains, rewrites, or experimental flags configured
331 " 🔵 generate-proposal-image already uses gemini-2.5-flash-image; image quality fix must target generate-roof-image static map dimensions
332 6:49p 🟣 Live Production Queue UI with Real-Time n8n Step Tracking

Access 672k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>