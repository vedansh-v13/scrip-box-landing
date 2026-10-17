# Scripbox PMS Phase 3 — Antigravity Asset Kit

This is a starter folder structure for the Phase 3 hero prototype. It does not contain official Scripbox assets yet.

## Folder checklist

- `assets/brand/`
  - `logo.svg` — official logo/SVG, if available
  - `fonts/` — approved font files (only if licensed/available)
  - `tokens.md` — verified colours, font families/weights, spacing values
- `assets/current-page/`
  - `current-mobile.png` — current hero screenshot
  - `instagram-in-app.png` — screenshot inside Instagram browser
  - Optional viewport captures: `390x640.png`, `390x844.png`, `360x640.png`
- `assets/ads/`
  - `ad-1.png` — “This is the part where you stop managing it alone…”
  - `ad-2.png` — “You made your First Crore…”
- `assets/form-screens/`
  - `q1.png`, `q2.png`, `q3.png`, `contact.png`, `call-time.png`, `thank-you.png`
- `assets/reference/`
  - 2–3 mobile competitor screenshots; structure inspiration only
- `hero/`
  - Agent-generated prototype, screenshots and `REPORT.md`

## Step-by-step asset collection

1. Open the live PMS page: https://lp.scripbox.com/pms
2. On a phone, capture the first screen and a full-page screenshot. Open the page from an Instagram ad/in-app browser and capture that first screen too.
3. In Chrome desktop, open the page and use DevTools → Inspect. Check **Computed** styles for colours and font-family; check **Network** and filter by **Font** to identify font files. Save verified values in `assets/brand/tokens.md`. Only copy/download fonts if you have permission to use them.
4. Get the official logo from Scripbox brand/marketing materials or the website's SVG asset. Prefer a provided brand file over recreating it.
5. Open Meta Ads Library: https://www.facebook.com/ads/library/ . Search for Scripbox, find the two exact ads in the prompt, and save their creatives. If they are not available, ask the campaign/marketing owner for exports.
6. On the live page, tap the CTA and capture each existing form screen: Q1, Q2, Q3, contact, call-time, and Thank You. Use dummy data only.
7. Capture 2–3 competitor mobile pages for layout reference; do not copy their branding or content.
8. Review every file and remove any personal/customer information before giving the folder to Antigravity.

## Before starting the agent

Paste this instruction at the top of the prompt:

“First inspect every file under `/assets`. Do not start implementation until you have listed the files found and the expected assets missing. Use only verified brand assets and claims. Do not invent replacements. If a missing asset blocks a requirement, use the fallback already specified in the brief or list it under Questions for review. Continue only after the inventory is reported.”

## Open questions to flag

- Confirm the definition of the 100 KB critical-payload limit: compressed transfer size or uncompressed resource size.
- Confirm approval for the “Flexible fee options, no exit load” line.
- Verify permission/accuracy for “22+ years of experience” before launch.
- Confirm what browser automation/testing tools are available in the Antigravity environment.

## Note

The asset directories are intentionally empty. The kit does not claim that assets have been collected or verified.
