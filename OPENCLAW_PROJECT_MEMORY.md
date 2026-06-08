# OpenClaw Project Memory

This is the source of truth for the product direction. Do not treat a single address, sample property, or demo page as the product. The microsite is a dynamic proposal template generated for many prospects.

## Main Idea

OpenClaw is a system that finds commercial buildings with aging roofs, models real solar economics on the actual building, renders solar panels onto that specific roof, generates a cinematic personalized video proposal, publishes a prospect-specific microsite, and drives multi-channel outreach until a call is booked.

The workflow is:

1. Pull commercial buildings from parcel records.
2. Filter for the aging-roof window and strong commercial solar fit.
3. Fetch/derive the property visual spine from Google:
   - Google Earth / 3D-style property imagery for the actual building.
   - Google Solar API heatmap / solar data for roof potential and production context.
4. Use Google Solar API data for real panel placements, output, roof segment information, heatmap context, and project economics.
5. Identify the real human decision maker behind LLC/property ownership.
6. Send the Google Earth 3D property image and Google Solar heatmap/solar context into Gemini omni for video generation.
7. Composite panel overlays, incentive math, countdowns, and personalized proposal details.
8. Publish a dynamic microsite at `/proposal/[slug]`.
9. Send email, LinkedIn, SMS, and direct mail outreach.
10. Classify replies and route interested owners to booking.

## Google API Key Source

Use `GOOGLE_MAPS_API_KEY` for the Google Cloud APIs in this project. The enabled APIs for that key are:

- Geocoding API
- Google Earth Engine API
- Map Tiles API
- Maps JavaScript API
- Maps Static API
- Places API
- Places API (New)
- Solar API
- Street View Static API

Prospect intake must use Google Places so operators can only save real, selected property addresses. Do not accept arbitrary typed address strings as a valid prospect location.

Prospect intake should include a visual verification step before Gemini omni generation: show the selected property target from Google Earth/3D imagery when available; if Earth rendering is unavailable, show a Google Maps satellite fallback with a clear warning. Also show a Solar API heatmap/solar preview so the operator can verify the target and solar data before sending the prospect into video generation.

## Product Boundaries

- The admin console is for final proposal products.
- The prospect CRM is separate and handles raw/in-flight leads.
- A proposal page is not about one hard-coded location. It must work for any prospect record.
- Sample properties are only placeholders for design preview.
- The microsite should feel like a personalized engineering/sales proposal, not a generic landing page.
- Do not drift into unrelated residential/home-energy product copy unless explicitly asked. Residential VEO/scrollytelling references can inform motion and cinematic presentation, but OpenClaw's core product is commercial roof solar prospecting and proposal generation.

## Dynamic Microsite Inputs

The proposal microsite should be designed around these dynamic fields:

- `company_name`
- `address`
- `city`
- `owner_name`
- `owner_title`
- `sqft`
- `year_built`
- `roof_age`
- `industry`
- `satellite_image_url`
- `panel_svg_url`
- `video_url`
- `video_thumbnail_url`
- `panel_count`
- `system_kw`
- `yearly_kwh`
- `yearly_savings`
- `savings_25yr`
- `system_cost`
- `incentive_amount`
- `microsite_url`

## Claude Design Prompt For The Microsite

Use this prompt when asking Claude Design to create the proposal microsite:

```text
Design a premium dynamic microsite template for OpenClaw.

File to create:
OpenClaw Proposal Microsite.html

This is not a one-off page for one location. This is the reusable public proposal template for /proposal/[slug]. It will be populated dynamically for many commercial building prospects.

OpenClaw product context:
OpenClaw finds commercial buildings with aging roofs, models real solar economics on their actual roof, renders solar panels onto the building, generates a cinematic personalized flyover, publishes a microsite, and sends outreach to the owner to book a call.

The page visitor:
A commercial property owner, CEO, CFO, facilities director, or operations leader who received a personalized proposal for their building. They should feel like this report was made specifically for their property.

Brand direction:
Premium industrial intelligence report. Cinematic, precise, technical, and credible. It should feel like a high-end commercial solar proposal, not a generic SaaS landing page.

Existing OpenClaw console direction:
Charcoal + bronze, thin rules, dense data, monospace labels, expressive serif headings, technical report feel.

Use these default colors:
--accent: #c08a4b
--accent-soft: #d8a866
--accent-deep: #9a6c38
--bg0: #131316
--bg1: #1a1a1f
--bg2: #212128
--ink: #ece9e3

Important:
Do not hard-code the page around one address.
Do not make this a generic landing page.
Do not make it card-heavy marketing fluff.
Do not use purple, blue-purple, beige, cream, or default startup gradients.
Do not explain the interface in visible instructional text.
Use sample data only to demonstrate the dynamic template.

Dynamic fields available:
company_name
address
city
owner_name
owner_title
sqft
year_built
roof_age
industry
satellite_image_url
panel_svg_url
video_url
video_thumbnail_url
panel_count
system_kw
yearly_kwh
yearly_savings
savings_25yr
system_cost
incentive_amount
microsite_url

Required first viewport:
Create a full-bleed cinematic hero using the prospect video if available, otherwise the satellite image with panel overlay. Text should sit over the media, not inside a card.

Hero must include:
- OpenClaw brand mark
- "Prepared for [company_name]"
- [address], [city]
- Primary headline focused on the proposal for this building
- Primary CTA: Book a walkthrough
- Secondary CTA: View savings model
- Key numbers visible immediately: system size, year 1 savings, 25-year net, incentive amount

Page structure:

1. Cinematic proposal hero
Use video/satellite imagery as the visual spine. The building is the hero, not a generic illustration.

2. Executive summary
Short, direct summary of why this property is a fit:
- aging roof window
- commercial solar potential
- available incentive stack
- why now
- next recommended action

3. Building intelligence
Report-style building facts:
- square footage
- year built
- roof age
- roof condition/replacement timing
- owner/contact block
- parcel/building profile

4. Solar layout and roof model
Show a satellite/panel overlay viewer with technical readouts:
- panel count
- usable roof
- azimuth
- shading
- annual generation
- system size

5. Financial model
Use a ledger/table format, not marketing cards.
Show:
- system cost
- incentive amount
- year 1 savings
- 25-year savings/net
- payback
- blended energy rate
- annual generation

6. Personalized flyover
Large video player section with a cinematic proposal-video feel.
If video is not available, show a polished "flyover queued" state.

7. Outreach/decision section
Show the recommended next step:
- schedule walkthrough
- confirm roof assumptions
- installer/engineering review
- safe-harbor or incentive timing if applicable

8. Footer
OpenClaw Solar
Small assumptions/disclaimer text

Interaction and motion:
- Subtle page-load reveals
- Number counters
- Video/player progress treatment
- Smooth hover states
- No flashy motion
- Respect reduced motion

Responsive behavior:
Desktop should feel like a premium proposal/report with strong media, dense data, and clear CTA.
Mobile should preserve the same hierarchy, with the video/imagery still visible and the financial model readable.

Sample data for preview only:
Use 2-3 sample prospects internally if needed to prove the design is reusable. Do not make the design depend on one property.

Example sample values:
Company: Britannia Logistics Holdings Inc.
Address: 1480 Britannia Road E
City: Mississauga
Owner: Harjeet Sandhu
Sqft: 142,500
Year built: 1998
Panels: 2,840
System size: 1,136 kW
Annual generation: 1,462,000 kWh
Year 1 savings: $214,900
25-year net: $4.28M
Incentive: $385K
Roof age: 19 years
Video length: 0:48

Output:
Create a single self-contained HTML design file with CSS and JS included. Make it polished enough that Codex can implement it into the Next.js /proposal/[slug] route using dynamic prospect data.
```
