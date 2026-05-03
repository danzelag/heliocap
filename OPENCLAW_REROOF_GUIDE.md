# OpenClaw Reroof — Build Guide

A step-by-step guide to building the system that finds commercial buildings with aging roofs, renders solar panels on their actual building, and ships the owner a personalized video proposal with the 30% federal tax credit baked in.

This is the full tech stack. If you follow it top to bottom you'll have a working pipeline.

---

## What you're building
A workflow that:
1. Pulls commercial buildings from countywdym parcel records
2. Filters by year built (aging roof window)
3. Fetches real roof geometry + panel placements from Google Solar API
4. Pierces the LLC on the deed to find the real human owner
5. Generates a cinematic drone flyover of their actual building with panels rendered on the roof
6. Deploys a personalized microsite per prospect
7. Books calls when they reply

---

## The Stack at a Glance

| Layer | Tool | Purpose | Cost |
| :--- | :--- | :--- | :--- |
| **Orchestration** | n8n | Workflow engine | Self-host free, Cloud $20/mo |
| **Database** | Supabase | Prospects, state, realtime dashboard | Free tier |
| **Hosting** | Vercel | Microsites + dashboard | Free tier |
| **Parcel Data** | Regrid API | Commercial buildings + year built | $0.01/parcel |
| **Satellite** | Google Maps Static API | Building imagery | $2/1000 calls |
| **Geocoding** | Google Geocoding API | Address → Lat/Lng | $5/1000 calls |
| **Solar Geometry** | Google Solar API | Real panel layouts + energy output | $2/1000 calls |
| **LLC Piercing** | OpenCorporates API | Corp filings → Real human | $50/mo |
| **Enrichment** | Apollo.io | Owner contact waterfall | $49/mo starter |
| **Email Verification** | MillionVerifier | Deliverability check | $0.005/check |
| **AI Text** | Claude API | Email copy, inbox classifier | ~$0.02/prospect |
| **AI Video** | Veo 3 (via Fal.ai) | Satellite still → Drone flyover | ~$2/video |
| **Compositing** | FFmpeg + Skia | Overlay panels, countdowns, text | Free |
| **Email Sending** | Instantly | Warmed sending + inbox rotation | $97/mo |
| **SMS** | Twilio | Mobile follow-up | $0.01/sms |
| **Direct Mail** | Lob | Handwritten letter fallback | $1.50/letter |
| **Calendar** | Cal.com | Booking | Free |

**Total Tooling Cost to Start:** ~$300/mo + usage.  
**Cost per fully processed prospect (end to end):** ~$3-5.

---

## Step 1 — Source the Buildings
**Goal:** Get a list of commercial buildings in your target market with the right age profile.

### 1a. Pick your market
Start with one metro. Solar-strong is ideal: Phoenix, Dallas, Houston, Vegas, Miami, Orlando. High sun hours + low cloud cover = bigger savings numbers = louder email.

### 1b. Pull parcel data
Use the Regrid API (or Apify's parcel scrapers if you want to go cheaper).  
**Query:** Commercial parcels, 50,000+ sqft, built between 1995 and 2005.

```javascript
// n8n HTTP Node
GET https://app.regrid.com/api/v1/search.json
  ?query=county:maricopa
  &use_code=industrial,warehouse,manufacturing
  &min_sqft=50000
  &year_built_min=1995
  &year_built_max=2005
```

You'll get back parcel records with: address, lat/lng, parcel id, owner (LLC on the deed), square footage, year built. Save each one as a row in your Supabase `prospects` table.

### 1c. Enrich with County Assessor data
Regrid doesn't always have the deepest assessor data. For the missing fields, scrape the county assessor site directly with Puppeteer or Apify. Maricopa County, Dallas County, Clark County all have free online assessor portals.

---

## Step 2 — Fetch Satellite Imagery
**Goal:** Get a clean top-down satellite image of each building.

### 2a. Google Maps Static API
One call per prospect:
```http
GET https://maps.googleapis.com/maps/api/staticmap
  ?center={lat},{lng}
  &zoom=18
  &size=1280x720
  &maptype=satellite
  &key=YOUR_KEY
```
Save the PNG to Supabase Storage. Keep the URL on the prospect row.

### 2b. Tips
* Zoom 18 gets you the whole building without too much surrounding noise.
* For really big warehouses (500k+ sqft) drop to Zoom 17.
* Always grab a square aspect ratio for the microsite, a 16:9 for the video.

---

## Step 3 — Fetch Real Solar Panel Layouts
This is the core of the whole system. It's what makes the proposal feel like an engineering report instead of a sales pitch.

### 3a. Call Google Solar API
For each prospect:
```http
POST https://solar.googleapis.com/v1/buildingInsights:findClosest
  ?location.latitude={lat}
  &location.longitude={lng}
  &requiredQuality=HIGH
  &key=YOUR_KEY
```

**Response includes:**
* `solarPotential.maxArrayPanelsCount` — Theoretical max panels
* `solarPotential.solarPanels[]` — Array with each panel's lat/lng, orientation, roof segment ID
* `solarPotential.roofSegmentStats[]` — Per-segment azimuth, pitch, usable area
* `solarPotential.financialAnalyses[]` — Yearly energy output per panel, sorted by best output first

### 3b. Slice to realistic coverage
Take the top 70% of panels by output. This matches what a real installer would deploy after code setbacks, walkways, and obstructions. Don't use 100% — it looks fake and installers will tell you why.

```javascript
const allPanels = response.solarPotential.solarPanels;
const sortedByOutput = allPanels.sort((a, b) => b.yearlyEnergyDcKwh - a.yearlyEnergyDcKwh);
const deployablePanels = sortedByOutput.slice(0, Math.floor(allPanels.length * 0.7));
```

### 3c. Calculate project economics
Each panel is 1.045m × 1.879m. Panel wattage assume 400W.

```javascript
const systemKW = deployablePanels.length * 0.4; // 400W per panel
const yearlyKWh = deployablePanels.reduce((sum, p) => sum + p.yearlyEnergyDcKwh, 0);
const kwhRate = 0.14; // Phoenix commercial avg, adjust by market
const yearlySavings = yearlyKWh * kwhRate;
const savings25yr = yearlySavings * 25 * 1.03; // 3% annual rate escalation
const systemCost = systemKW * 1800; // ~$1.80/watt installed commercial
const federalITC = systemCost * 0.30;
```
Store everything on the prospect row.

### 3d. Project Panel Lat/Lng to Pixel Coordinates
To draw the panels on the satellite image, convert each panel's lat/lng to pixel position using Web Mercator math:

```javascript
function latLngToPixel(lat, lng, centerLat, centerLng, zoom, width, height) {
  const scale = 256 * Math.pow(2, zoom);
  const worldX = (lng + 180) / 360 * scale;
  const worldY = (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * scale;
  const centerWorldX = (centerLng + 180) / 360 * scale;
  const centerWorldY = (1 - Math.log(Math.tan(centerLat * Math.PI / 180) + 1 / Math.cos(centerLat * Math.PI / 180)) / Math.PI) / 2 * scale;
  return {
    x: width / 2 + (worldX - centerWorldX),
    y: height / 2 + (worldY - centerWorldY)
  };
}
```

For each panel, project its center lat/lng to pixel coordinates, then draw an SVG `<rect>` rotated to match its roof segment azimuth. Sizes: 1.045m wide × 1.879m tall converted to pixels at the current zoom level.

### 3e. Render the Overlay
Build an SVG that goes on top of the satellite PNG. Save both as a combined PNG + the raw SVG (you'll need the SVG layer separately for the video compositing step).

---

## Step 4 — Pierce the LLC to the Real Owner
The owner on the parcel is usually an LLC like "1725 Country Club Dr Holdings LLC". That's not the decision maker.

### 4a. OpenCorporates Lookup
First, get the LLC's filing data:
```http
GET https://api.opencorporates.com/v0.4/companies/search
  ?q={llc_name}
  &jurisdiction_code=us_az
```
You'll get registered agent, officers, and filing history.

### 4b. State Secretary of State Scrape
OpenCorporates is often stale. Go direct to the state SOS portal (Arizona Corporation Commission, Delaware SOS, etc) and pull the latest annual report. That's where the real officer names live.

### 4c. Cross-reference with LinkedIn
Use Apollo's "Company Search" to find the real company behind the LLC (usually the tenant or a parent). Then pull LinkedIn profiles for: Owner, President, CEO, Facilities Director, Director of Operations, CFO.  
**Rank them:** Owner > President > CEO > CFO > Facilities Director.

### 4d. Waterfall Enrich Email + Phone
Pipe the top-ranked human through:
1. Apollo → Verified Email + Mobile
2. DropContact → Fallback
3. Hunter → Fallback
4. Catch-all pattern guess (firstname@domain.com) → Verify with MillionVerifier

Keep the first one with >95% deliverability.

### 4e. Save Everything
Store owner name, title, email, phone, confidence score on the prospect row.

---

## Step 5 — Generate the Video
**Goal:** Turn the satellite still + panel overlay into a 15-second cinematic drone flyover.

### 5a. Call Veo 3 via Fal.ai
Veo 3 takes an image prompt + motion prompt and outputs video. Fal.ai wraps it with a simple API.

```javascript
const result = await fal.subscribe("fal-ai/veo-3", {
  input: {
    image_url: satelliteImageUrl,
    prompt: `aerial drone footage pulling up and over a large commercial ${industry} building in ${city}, slow cinematic reveal from low oblique angle to top-down view, photorealistic, 4K, golden hour lighting, subtle atmospheric haze, smooth camera motion`,
    duration: 12,
    aspect_ratio: "16:9"
  }
});
const videoUrl = result.data.video.url;
```
**Cost:** ~$2 per video. Takes 60-90 seconds to render.

### 5b. Composite the Overlay with FFmpeg
The Veo output is just the drone shot. You need to overlay the panel grid, the owner name, the countdown, and the federal credit number.

**Pipeline:**
```bash
# 1. Extract the final frame from the video
ffmpeg -sseof -0.1 -i flyover.mp4 -vframes 1 final-frame.png

# 2. Composite the SVG panel overlay on the final frame
# (Use Sharp or Skia Canvas to rasterize the SVG first, then overlay)

# 3. Create a "panels materializing" sequence by generating 15 frames 
# with progressive panel opacity (0% → 100%)

# 4. Append the sequence to the end of the flyover
ffmpeg -i flyover.mp4 -i panels-materializing.mp4 \
  -filter_complex "[0:v][1:v]concat=n=2:v=1[out]" -map "[out]" final-pre.mp4

# 5. Burn in the text overlays
ffmpeg -i final-pre.mp4 \
  -vf "drawtext=text='$OWNER_NAME':x=40:y=h-120:fontsize=32:fontcolor=white:box=1:boxcolor=black@0.5,
       drawtext=text='$FEDERAL_CREDIT federal credit':x=40:y=h-80:fontsize=28:fontcolor=#16a34a,
       drawtext=text='%{eif\:max(0\,85-t/86400)\:d} days to july 4':x=w-300:y=40:fontsize=24:fontcolor=#f97316" \
  -c:a copy final.mp4
```

### 5c. Upload to Bunny.net or Mux
CDN for fast streaming. Get a public URL back.

### 5d. Generate a Thumbnail
Grab the first frame as a PNG for the email preview.
```bash
ffmpeg -i final.mp4 -ss 0 -vframes 1 thumbnail.png
```

---

## Step 6 — Deploy the Microsite
Each prospect gets their own subdomain: `[companyslug].openclawsolar.com`.

### 6a. Template the Next.js App
Build a single Next.js template with:
* **Hero:** Video autoplays at top
* **Building Specs:** Sqft, Year Built, Roof Age, Owner Name
* **Solar System:** Panel count, kW, Yearly kWh, 25-year savings
* **Federal Credit Block:** ITC amount, countdown to July 4, safe harbor explanation
* **CTA:** Book a Call button → Cal.com link

### 6b. Deploy via Vercel API
On each new prospect, the bot:
```javascript
await fetch('https://api.vercel.com/v13/deployments', {
  method: 'POST',
  headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
  body: JSON.stringify({
    name: `${prospect.slug}-openclawsolar`,
    gitSource: { type: 'github', repo: 'openclaw-microsite-template', ref: 'main' },
    env: {
      PROSPECT_SLUG: prospect.slug,
      OWNER_NAME: prospect.owner,
      VIDEO_URL: prospect.videoUrl,
      // ... everything else
    }
  })
});
```
Then point a wildcard DNS record at Vercel (`*.openclawsolar.com`) and each deployment becomes accessible at its subdomain automatically.

### 6c. Cheaper Alternative
Pre-render static HTML in n8n using a template engine (Handlebars/Liquid), upload the HTML + video to Supabase Storage, serve it through a Cloudflare Worker that maps `[slug].openclawsolar.com` → `storage/prospects/{slug}/index.html`.

---

## Step 7 — Multi-Channel Outreach

### 7a. Day 0 — Email
Use Claude API to generate copy. Short, direct, no marketing speak:
> **Subject:** your roof at {address.street} + {federalITC} in federal credit expiring July 4
>
> Hey {first_name},
>
> Pulled the satellite history of {company} at {address}. Roof is at year {roofAge}, at the replacement window.
>
> Made you a 15-second flyover showing what it looks like with solar + the full federal credit math.
>
> {video_thumbnail} → {microsite_url}
>
> — {roofer_first_name}

### 7b. Day 3 — Second Email
If no reply, reframe around the deadline:
> **Subject:** 82 days left on that {federalITC} credit
>
> {first_name}, checking back. You have 82 days to safe harbor that solar project before the federal credit expires on July 4. After that it's zero.
>
> The reroof + solar stack lands you at {total_cost} with {federalITC} of that covered by the feds.
>
> {microsite_url}

### 7c. Day 5 — LinkedIn
Connection request + short soft DM:
> Hey {first_name}, Chris from {roofer_name}. Sent you a flyover of {company}'s roof last week — worth a 15 min call?

### 7d. Day 7 — SMS
If you have mobile:
> {first_name}, {roofer_first_name} from {roofer_name}. Quick one — did you see the video I sent of {company}'s roof? {microsite_url}

---

## Step 8 — Reply Handling + Booking

### 8a. Inbox Classifier
Every reply hits a Claude API call that classifies it:
* **Interested** — Auto-send calendar link
* **Not_Now** — Snooze for 30 days
* **Wrong_Person** — Re-enrich at same parent company
* **Unsubscribe** — Mark dead
* **Question** — Notify the roofer to respond manually

### 8b. Calendar Auto-send
For interested replies, drop a Cal.com link into a pre-written reply in the roofer's voice.

### 8c. Dashboard
Supabase Realtime → Next.js Dashboard showing:
* Pipeline stage counts
* Current activity feed
* Booked calls today
* Federal credit dollars flagged
* Days to July 4

---

## Scaling Tips
* **Batch Google Solar API calls.** Each call is ~$2. Queue calls during off-peak and cache aggressively.
* **Warm your email infrastructure** 30 days before you need it.
* **Rotate 5 inboxes per domain**, 3 domains minimum.
* **Pre-render 10 video templates** during setup, not per prospect.
* **Target one metro at a time.** Trying to do 10 cities in parallel will melt your database.

---

## Cost Per Prospect (End to End)

| Item | Cost |
| :--- | :--- |
| Parcel Data | $0.01 |
| Satellite Image | $0.002 |
| Google Solar API | $0.10 |
| OpenCorporates + Enrichment | $0.40 |
| Email Verification | $0.005 |
| Claude API (Copy + Classification) | $0.02 |
| Veo 3 Video | $2.00 |
| FFmpeg Compositing | Free |
| Microsite Deployment | $0.001 |
| Email Sending | $0.005 |
| SMS (if used) | $0.01 |
| **Total** | **~$2.55** |

---

## What to Build First (V1 MVP)
1. **Day 1-2:** Parcel sourcing + Supabase schema
2. **Day 3-4:** Google Maps Static + Google Solar API, pixel projection math
3. **Day 5-6:** Owner enrichment waterfall
4. **Day 7:** Claude email copy generation + Instantly integration (skip video for v1)
5. **Day 8:** Static microsite template (no video, just the satellite image + panel overlay)
6. **Day 9:** Send 50 real emails, see what happens

---

## Why This Works
1. **Real Deadline.** July 4, 2026 is a hard federal cutoff.
2. **Real Math.** The Google Solar API is insurance-adjuster-grade.
3. **Real Owner.** You're not emailing `info@`.
4. **Real Urgency.** The video ends with a countdown timer.
