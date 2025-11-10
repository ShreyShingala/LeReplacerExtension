# **Winner of Best Pitch @ Go On Hacks 2025**

# LeReplacer - Chrome Extension

A Chrome extension that automatically detects and replaces images containing faces with LeBron James images, includes hand tracking camera controls, and features a caption generator for social media posts. Made because WE NEED TO SEE MORE LEBRON IN OUR INTERNET.

[YouTube demo](https://www.youtube.com/watch?v=ppbUnvcdWOQ)

## Inspiration:

Scrolling Instagram and getting tired of the same people over and over again? You need some LEBRON LeReplacer is a Chrome extension that will find faces, slap a LeBron on them, and make your internet 67% better. 

## Features

### Image Replacement
- **Face Detection**: Uses Chrome's native Shape Detection API (Face Detection) for ultra-fast face detection
- **Smart Replacement**: Only replaces images containing faces with LeBron James images
- **Dynamic Detection**: Uses MutationObserver to catch images added during infinite scroll
- **Fade to LeBron**: Replaces every single image to LeBon

### Camera & Hand Tracking (Mini Game)
- **Hand Detection**: Real-time hand tracking using Handtrack.js
- **Stroke Detection**: Detects hand stroking motion (up/down movements)
- **Progress Meter**: Visual progress bar that fills as you complete strokes

### Caption Generator (Twitter Bot)
- **Generate Captions**: Creates weird captions using Gemini API
- **Auto-Post to Twitter/X**: Automatically posts generated captions
- **Link to Twitter bot**: The twitter bot is https://x.com/Lebronsmygoat_ 

## Installation

### Option 1: Install from Zip File (For Sharing)

If you received this extension as a `.zip` file, follow these steps:

1. **Download the zip file** (e.g., `my-extension.zip`)

2. **Extract the zip file**:
   - **Windows**: Right-click the zip file → "Extract All..." → Choose a location
   - **Mac**: Double-click the zip file (it will extract automatically)
   - **Linux**: Right-click → "Extract Here" or use `unzip my-extension.zip`

3. **Open Chrome/Edge** and navigate to:
   ```
   chrome://extensions/
   ```
   Or in Edge:
   ```
   edge://extensions/
   ```

4. **Enable Developer Mode**:
   - Toggle the "Developer mode" switch in the top-right corner of the extensions page

5. **Load the Extension**:
   - Click the **"Load unpacked"** button
   - Navigate to the **extracted folder** (the folder that contains `manifest.json`)
   - Select the folder and click "Select Folder" (or "Open" on Mac)

6. **Verify Installation**:
   - The extension should appear in your extensions list
   - The extension icon should appear in your browser toolbar
   - If you see any errors, check the console for details
