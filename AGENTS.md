<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->


<claude-mem-context>
# Memory Context

# [solar-lead-gen] recent context, 2026-05-02 2:37pm EDT

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (20,634t read) | 732,849t work | 97% savings

### Apr 29, 2026
S83 User asked what the /design-handoff skill does — skill capability explanation provided (Apr 29 at 3:48 PM)
S66 Add Google Places Autocomplete to lead creator/editor with automatic satellite roof image generation on address selection (Apr 29 at 3:48 PM)
S67 Add Google Places Autocomplete + auto-satellite roof image generation to lead creator/editor, then deploy to Vercel (Apr 29 at 3:48 PM)
### Apr 30, 2026
S84 User asked about "Claude Design" tool — available design skills and options explained (Apr 30 at 7:55 PM)
S82 User asked what the /design-handoff skill does — skill capability explanation provided (Apr 30 at 7:55 PM)
### May 1, 2026
S85 Fix heliocap Vercel build failure caused by TypeScript errors in Next.js 16.2.4 project (May 1 at 12:14 PM)
148 12:54p 🔵 Proposal Page 404 Bug Reported
149 " 🔵 Solar Lead Gen Project Structure Mapped
150 12:55p 🔵 Proposal 404 Root Cause Investigation: Slug Lookup Chain Traced
151 " 🔵 Supabase RLS + Env Var Analysis: Root Cause Narrowed for Proposal 404
152 12:56p 🔵 Root Cause Confirmed: All Proposal Slugs Exist in DB; `createAdminClient` Was Broken
153 " 🔴 Fixed: `createAdminClient` Switched from SSR Adapter to Direct Supabase Client
154 " 🔴 Production Build Passes After Fix; Proposal Route Confirmed Dynamic
155 12:57p 🔴 Proposal Page 404 Fix Verified: `/proposal/testing-3` Returns HTTP 200
156 12:58p 🟣 New Task Request: Delete Proposals + Palantir Gotham Command Center Redesign
157 1:09p 🔵 OPENCLAW_REROOF_GUIDE.md: Full Automated Solar Lead Pipeline Architecture
158 " 🔴 deleteLeadsAction Hardened with Input Validation and Slug Revalidation
159 " 🟣 Palantir Gotham Command Center Redesign Shipped
160 1:12p 🔴 Supabase Delete Smoke Test Confirms Deletion Works End-to-End
161 " 🔵 ESLint Reports 5604 Problems — Almost All from .next Build Artifacts, Not Source
162 " 🔴 Unused archivedCount Variable Removed, Build Passes Clean
163 1:13p ✅ Gotham Redesign + Delete Fix Committed and Pushed to GitHub
164 1:14p ✅ Duplicate Commit 808d99e Created and Attempting Push — Diverged from d7b39d9
165 " 🔵 Push Output Shows 4f9aaf0..808d99e — d7b39d9 Was Never Actually Pushed
166 1:28p ⚖️ Command Center UI Refinement + New Lead Generator Page Redesign Requested
167 " 🔵 Current State of Files Before UI Refinement Pass
168 " 🟣 Admin Dashboard Redesigned: Hero Text Removed, Activity Board Added
169 1:29p 🟣 New Lead Page Wrapper Redesigned to Gotham Dark Theme
170 " ⚖️ User Asks If OPENCLAW_REROOF_GUIDE.md Workflow Can Be Built Out
171 1:38p 🟣 Gotham UI Refinements Committed and Pushed to Production
172 2:05p ⚖️ OPENCLAW_REROOF_GUIDE Workflow Build Authorized with Google API Keys
173 " 🔵 OPENCLAW_REROOF_GUIDE Full Pipeline Scope Confirmed
174 2:06p 🔵 Existing API and Service Layer Mapped Before Solar API Implementation
175 " 🔵 Admin Command Center Signal Chain Shows Google Solar as Active Before Integration
176 " 🟣 New `openclaw-google.ts` Library Implements Google Solar API Integration
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

Access 733k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>