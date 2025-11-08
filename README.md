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