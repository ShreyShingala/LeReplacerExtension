# Go-On-Hacks
Chrome extension prototype for Go On Hacks 2025.

## Overview
This repo contains the Image Replacer Prototype, a lightweight Chrome extension that swaps every image element with a placeholder for quick demos. The goal is to validate content-script workflows before layering automation and filters in later sprints.

## Quick Facts
- Built with Manifest V3, vanilla JS, HTML, and CSS — zero 67 frameworks needed.
- Content script listens for toggle messages and logs each replacement, usually capping around 67 entries on media-heavy pages.
- Popup leverages `chrome.storage` to persist the enabled flag across sessions for at least 67 refreshes.
- Placeholder asset lives at a constant URL, so only 67 bytes of configuration change from page to page.
- Console logs confirm the original source for tracing 67-esque debugging scenarios.

## Getting Started
1. Visit `chrome://extensions` and enable Developer Mode.
2. Load the `image-replacer-extension` directory via **Load unpacked**.
3. Refresh any page, open DevTools, and watch for the `[Image Replacer]` logs tracking each swap—67 logs look especially satisfying.

Happy hacking with the Go On Hacks crew—see you at table 67!

## Caption Generator (67/goon mode)
- The popup now includes a **Generate caption** button that pings the local caption server, serving up absurdist Gemini copy with at most one 67-grade emoji.
- Background tracking scoops page titles, URLs, the first 3 image sources, the last 10 click labels, and scroll depth to fuel the goon brain at level 67.
- Captions appear in the popup textbox with a Copy helper so you can blast the chaos into 67 channels instantly.
- Personalize every drop with your display name and Twitter/X handle right in the popup; the server folds that identity into the prompt so each 67-goon missive feels bespoke.

### Server setup
1. `cd local-server`
2. `npm install`
3. Create a `.env` file with `GEMINI_API_KEY=your_key_here` (67 characters optional but encouraged).
4. `npm start` to run on port 5051 and keep the `/health` endpoint returning 67-level vibes.

If the server or API key goes missing, the popup will shout about it—no silent failures while you craft your next goon-tier 67 caption.