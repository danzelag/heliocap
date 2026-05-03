<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->


<claude-mem-context>
# Memory Context

# [solar-lead-gen] recent context, 2026-05-03 9:45am EDT

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (18,189t read) | 1,036,254t work | 98% savings

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
177 2:07p 🟣 generate-roof-image Route Upgraded to Full Solar API Pipeline; LeadGeneratorForm Wired to Solar Model
178 " 🟣 LeadGeneratorForm Solar Intelligence HUD Added; Render Input No Longer Required
179 2:08p 🔴 Solar API Failure Made Non-Fatal; Fallback Panel Count Hardened
180 " 🟣 Solar API Pipeline Build Passed; Files Ready to Commit
181 " 🔵 git index.lock Permission Error Requires Escalated Sandbox Permissions Again
182 2:09p 🟣 OpenClaw Google Solar Intelligence Committed as 23fc378
183 " 🟣 OpenClaw Solar Intelligence Pushed to GitHub; Vercel Deploy Triggered
184 2:14p ⚖️ Lead Generator Form Redesigned for Bot-First Automation Workflow
### May 2, 2026
185 2:16p 🔵 OpenClaw Reroof — Full Implementation Plan Reviewed
186 " 🔵 OpenClaw Reroof — Project File Structure and Dependencies Confirmed
187 " 🔵 Core API Routes and Service Layer — Implementation Details
188 2:17p 🔵 Supabase Schema and Lead Generator Form — Complete Implementation Details
189 " ⚖️ V1 Build Priority — Pipeline First
190 " 🔵 Production Build Passes Clean — Current Route Map Confirmed
191 " 🟣 Pipeline Phase 0 — Four New Files Written for Prospects Pipeline Foundation
192 " ⚖️ Architecture Decisions — n8n Calls App + Shared Secret Auth
193 " ⚖️ Pipeline-First MVP Plan Submitted to Codex — Auth Renamed to N8N_WEBHOOK_SECRET
194 2:23p 🔵 Previously Written Pipeline Files Not Present on Disk — Git Status Confirms
195 " 🟣 Prospects Migration and N8N Auth Helper Written to Disk
196 2:24p 🟣 N8N Auth Wired Into API Routes — generate-roof-image and leads Hardened
197 " 🟣 ProspectService and Prospect TypeScript Interface Created
198 " ⚖️ Project Consolidation: Use heliocap repo only, not solar-lead-gen
199 2:41p 🔵 Vercel CLI deploy blocked: no saved credentials, requires VERCEL_TOKEN
200 2:46p ⚖️ Pipeline First MVP: Outstanding manual steps before go-live
201 2:50p ⚖️ n8n setup: self-host or cloud, no "API key" signup needed
202 2:53p 🔵 User created n8n Cloud account; using ChatGPT for n8n workflow setup instructions
### May 3, 2026
203 12:47a ⚖️ Regrid API eliminated from pipeline: $375/mo cost is prohibitive
204 12:48a ⚖️ Regrid eliminated as parcel source; Google Places Nearby Search adopted as free replacement
S87 Fix proposal page image rendering (aspect-ratio/object-fit bug) and deploy to Vercel via git push or Vercel CLI (May 3 at 2:06 AM)
205 2:10a 🔵 Proposal Image Still Broken + "Roof Render Pending" on Manual Proposals
206 " ⚖️ Address-to-Image Auto-Fetch Architecture Decision Pending
207 9:22a 🔵 LeadGeneratorForm Already Has Auto-Image Fetch on Address Entry
208 " ✅ ProposalRoofRender Commit + Vercel Deploy Confirmed (Replay)
209 9:23a 🔵 Full Image Pipeline Architecture Mapped
210 " 🔄 ProposalRoofRender Simplified — Overlay Logic Removed
211 " 🟣 LeadGeneratorForm: Geocode Fallback Fetches Images at Submit Time
212 9:24a 🟣 POST /api/leads Now Auto-Generates Images When n8n Sends lat/lng Without Image URLs
213 " 🔴 TypeScript Build Error: lat/lng Typed as number|null Passed to generateRoofIntelligence Expecting number
214 " 🔴 Fixed TypeScript null Type Error — Use geocoded.lat/lng Directly Instead of Reassigned Variables
215 " ✅ Build Passes Clean After TypeScript Fix — All 10 Routes Compiled
216 " ✅ Commit 5a9acef: "Fix proposal image generation flow" — 3 Files, 133 Insertions
217 9:27a ✅ Commit 5a9acef Pushed to GitHub Main — Image Flow Fix Live on danzelag/heliocap
218 9:33a 🟣 Pipeline/Deal Tracker Feature Requested for Admin Dashboard
219 " 🔵 Existing Status System Only Supports draft/published/archived — Missing CRM Statuses
220 " 🔵 LeadTable and Actions Full Architecture Mapped — Ready for Pipeline Status Expansion
221 " 🔵 Ontario Utility Rate Constants Updated in solar-utils.ts and openclaw-google.ts
222 9:34a 🔵 LeadService.getLeadBySlug Has Public+Admin Dual-Path — New CRM Statuses Won't Break Public Proposals
223 " 🟣 Migration 20240503000000_lead_lifecycle_statuses.sql Created
224 " 🟣 LeadStatus Type Exported + updateLeadsStatusAction Widened to 6-State Pipeline
225 9:35a 🟣 LeadTable Upgraded to Full 6-Status Pipeline UI
226 " 🔴 LeadTable.tsx Has Duplicate/Orphaned JSX After Patch — Old Dropdown Code Still Appended at End of File

Access 1036k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>