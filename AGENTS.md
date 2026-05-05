<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->


<claude-mem-context>
# Memory Context

# [solar-lead-gen] recent context, 2026-05-04 2:30pm EDT

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (17,556t read) | 492,921t work | 96% savings

### Apr 29, 2026
S83 User asked what the /design-handoff skill does — skill capability explanation provided (Apr 29 at 3:48 PM)
S66 Add Google Places Autocomplete to lead creator/editor with automatic satellite roof image generation on address selection (Apr 29 at 3:48 PM)
S67 Add Google Places Autocomplete + auto-satellite roof image generation to lead creator/editor, then deploy to Vercel (Apr 29 at 3:48 PM)
### Apr 30, 2026
S84 User asked about "Claude Design" tool — available design skills and options explained (Apr 30 at 7:55 PM)
S82 User asked what the /design-handoff skill does — skill capability explanation provided (Apr 30 at 7:55 PM)
S85 Fix heliocap Vercel build failure caused by TypeScript errors in Next.js 16.2.4 project (Apr 30 at 7:56 PM)
### May 1, 2026
S86 Fix proposal page image rendering (cropped/stretched SVG) + deploy to Vercel via git push or CLI (May 1 at 12:14 PM)
### May 3, 2026
S87 Fix proposal page image rendering (aspect-ratio/object-fit bug) and deploy to Vercel via git push or Vercel CLI (May 3 at 2:06 AM)
233 9:46a 🔴 ProposalRoofRender overlay fix committed and pushed to production
245 10:34a ⚖️ Rasterize SVG render to WebP/JPG preview to fix slow proposal page performance
246 10:35a 🔵 No image processing library available — sharp/canvas/resvg not in package.json
247 " 🔵 SVG render embeds satellite image as base64 data URI — already self-contained, not a separate overlay
248 " 🔵 ProposalRoofRender reverted to single-image logic — overlay patch from earlier session not present
249 " 🔵 Proposal page passes render_image_url directly to ProposalRoofRender — no render_preview_url field exists yet
250 " 🔵 sharp already installed — `npm install sharp` was a no-op
251 " 🔵 src/app/admin/leads/[id]/actions.ts cannot be read via unquoted glob in zsh
252 10:36a 🔵 sharp ^0.34.5 already in package.json — rasterization can proceed immediately
253 " 🟣 Added `buildRasterRenderPreview` to openclaw-google.ts — SVG-to-WebP rasterization helper
254 " 🟣 /api/generate-roof-image now rasterizes SVG and returns render_preview_url
255 10:37a 🟣 /api/leads accepts and stores render_preview_url; auto-generates WebP preview when building from lat/lng
256 " 🟣 Lead interface gains render_preview_url field in lead.service.ts
257 " 🟣 ProposalRoofRender prioritizes render_preview_url over SVG render for hero display
258 " 🟣 Proposal page passes render_preview_url to ProposalRoofRender and uses it for OpenGraph
259 " 🟣 Migration 20240503010000 adds render_preview_url TEXT column to leads table
### May 4, 2026
261 12:15p 🟣 Proposal Job Events Table with Realtime Progress Tracking
262 " 🔵 generate-roof-image API Route Architecture
263 12:16p 🔵 generate-proposal-image API Route Architecture
264 " 🔵 ProposalJobsQueue Already Has Realtime + Polling Wiring
265 " 🟣 updateProposalJobProgress Helper Added to proposal-job-events.ts
266 " 🔴 generate-roof-image Route Now Emits Step Progress Events
267 12:17p 🔴 Full Pipeline Progress Instrumentation Across All n8n API Routes
268 " ✅ ProposalJobsQueue Events Table Layout Improved for Wide Screens
269 " 🔴 Build Passes Clean After Progress Instrumentation; proposalUrl Removed from 85% Event
270 12:18p 🟣 Proposal Queue Progress Sync Shipped to Production
271 12:24p 🔵 Redundant Job Tracking Tables Identified in Proposal System
272 2:06p 🟣 Live Production Queue with Real-Time n8n Step Visibility
273 " 🔵 Live Production Queue Architecture — Full Stack Inventory
274 " 🔵 Complete Proposal Job Pipeline — Full n8n → Supabase → UI Data Flow Mapped
275 2:07p 🔴 n8n Webhook Update Endpoint Made Flexible for Multiple Field Name Conventions
276 " 🟣 ProposalJobsQueue Redesigned — Per-Job Step Timeline Replaces Progress Bar
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
### May 5, 2026
295 12:58a 🔴 Fixed Gemini model name (gemini-2.0-flash) and API key retrieval in /api/generate-proposal-image
296 " 🟣 Added source logging (ai_generated vs fallback_roof_image) to /api/generate-proposal-image
297 " 🔵 Production Build Failing with TurbopackInternalError (os error 1) in globals.css

Access 493k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>