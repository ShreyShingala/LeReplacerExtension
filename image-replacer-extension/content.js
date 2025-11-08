
//const PLACEHOLDER_URL = "https://cdn.bap-software.net/2024/02/22165839/testdebug2.jpg";
const GOAT_IMAGE = "goat.png";
const SUNSHINE_BG = "sunshine.jpg";
let observer = null;
let fullScanTimer = null;
let isScanning = false; // Prevent multiple simultaneous scans
const FULL_SCAN_DEBOUNCE_MS = 80; // small debounce to batch rapid mutations
const REPLACED_CLASS = 'replaced';
const NO_PERSON_FLAG = 'noperson';
const MIN_PIXEL_AREA = 5000; // skip tiny images (w*h)
const INCREASE_OVERALL_SIZE = 1.5;

// Face detection state
let faceDetector = null;
const detectionCache = new Map();
let downloadsEnabled = true; // Default to enabled

/**
 * Check if the current page is displaying a single image file
 */
function isImagePage() {
  // Check if the page is just displaying an image file directly
  const contentType = document.contentType || '';
  const isImageContentType = contentType.startsWith('image/');
  
  // Check if body only contains a single img element
  const bodyChildren = document.body?.children || [];
  const hasSingleImage = bodyChildren.length === 1 && bodyChildren[0]?.tagName === 'IMG';
  
  return isImageContentType || hasSingleImage;
}

/**
 * Replace the direct image page with face-detected version
 */
async function handleDirectImagePage() {
  if (!isImagePage()) return;
  
  const img = document.querySelector('img');
  if (!img) return;
  
  console.log('[Image Replacer] Detected direct image page, processing...');
  
  // Wait for image to load
  if (!img.complete) {
    await new Promise(resolve => {
      img.onload = resolve;
      img.onerror = resolve;
    });
  }
  
  // Check for faces and replace
  const result = await imageContainsFaceCached(img);
  if (result.hasFace && result.dataUrl) {
    replaceImageElement(img, result.dataUrl);
    
    // Save if downloads enabled
    if (downloadsEnabled) {
      console.log('[Image Replacer] Downloads enabled - saving image');
      try {
        chrome.runtime.sendMessage({
          type: 'save-detected-image',
          dataUrl: result.dataUrl,
          originalSrc: img.src
        }, (response) => {
          if (response && response.success) {
            console.log('[Image Replacer] Saved detected image to downloads');
          }
        });
      } catch (e) {
        console.error('[Image Replacer] Error saving image:', e);
      }
    }
  }
}

/**
 * Check if current page is a Google page (search or homepage)
 */
function isGooglePage() {
  const hostname = window.location.hostname.toLowerCase();
  const url = window.location.href.toLowerCase();
  
  // Check for regular Google pages
  const isGoogleDomain = hostname === 'www.google.com' || hostname === 'google.com';
  
  // Check for Chrome new tab page
  const isNewTab = url.startsWith('chrome://newtab') || 
                   url.startsWith('chrome-search://local-ntp') ||
                   hostname === 'newtab';
  
  return isGoogleDomain || isNewTab;
}

/**
 * Apply sunshine background and LeBron color theme to Google pages
 */
function applyGoogleBackground() {
  if (!isGooglePage()) return;
  
  const sunshineUrl = chrome.runtime.getURL(SUNSHINE_BG);
  
  // Apply to body
  document.body.style.backgroundImage = `url('${sunshineUrl}')`;
  document.body.style.backgroundSize = 'cover';
  document.body.style.backgroundPosition = 'center';
  document.body.style.backgroundRepeat = 'no-repeat';
  document.body.style.backgroundAttachment = 'fixed';
  
  // Inject LeBron-themed color scheme
  const style = document.createElement('style');
  style.id = 'lebron-theme';
  style.textContent = `
    /* LeBron James Color Theme - Brown, Orange, Gold */
    
    /* Google Search Bar */
    .RNNXgb, .SDkEP, input[type="text"], textarea {
      background-color: rgba(139, 90, 43, 0.15) !important;
      border-color: #D4A574 !important;
    }
    
    /* Search Bar on Focus */
    .RNNXgb:focus-within, input[type="text"]:focus, textarea:focus {
      background-color: rgba(212, 165, 116, 0.2) !important;
      border-color: #FFA500 !important;
      box-shadow: 0 1px 6px rgba(212, 165, 116, 0.5) !important;
    }
    
    /* Buttons */
    .FPdoLc input[type="submit"], button, .gNO89b {
      background-color: #8B5A2B !important;
      color: #FFD700 !important;
      border: 1px solid #D4A574 !important;
    }
    
    .FPdoLc input[type="submit"]:hover, button:hover {
      background-color: #6B4423 !important;
      box-shadow: 0 2px 8px rgba(139, 90, 43, 0.4) !important;
    }
    
    /* Links */
    a, .LC20lb {
      color: #FF8C00 !important;
    }
    
    a:visited {
      color: #CD853F !important;
    }
    
    a:hover {
      color: #FFA500 !important;
    }
    
    /* Search Result Titles */
    h1, h2, h3, .LC20lb {
      color: #8B4513 !important;
    }
    
    /* Google Logo */
    #logo img, .lnXdpd {
      filter: sepia(0.6) saturate(1.5) hue-rotate(-10deg) !important;
    }
    
    /* Cards and Containers */
    .g, .hlcw0c, .ULSxyf, .related-question-pair, .kp-wholepage {
      background-color: rgba(255, 248, 220, 0.85) !important;
      border-color: #D4A574 !important;
    }
    
    /* Dropdown menus */
    .EIlDfe, .UUbT9, select {
      background-color: rgba(139, 90, 43, 0.1) !important;
      border-color: #D4A574 !important;
    }
    
    /* Nav buttons and tabs */
    .hdtb-mitem a, .MBeuO {
      color: #8B5A2B !important;
    }
    
    .hdtb-mitem.hdtb-msel, .MBeuO.Kindmi {
      color: #FF8C00 !important;
      border-bottom-color: #FFA500 !important;
    }
    
    /* Info cards/snippets */
    .kno-rdesc, .kno-fv, .ayRjaf {
      background-color: rgba(255, 248, 220, 0.9) !important;
      color: #5C4033 !important;
    }
    
    /* Suggestions and autocomplete */
    .erkvQe, .sbct {
      background-color: rgba(255, 248, 220, 0.95) !important;
      border-color: #D4A574 !important;
    }
    
    .sbct:hover, .sbqs_c:hover {
      background-color: rgba(212, 165, 116, 0.3) !important;
    }
    
    /* Text colors for better contrast */
    .VwiC3b, .MUxGbd, .yXK7lf, .r025kc, span, div {
      color: #4A3528 !important;
    }
    
    /* Top navigation bar */
    .gb_Vd, .gb_Be {
      background-color: rgba(139, 90, 43, 0.3) !important;
      border-color: #D4A574 !important;
    }
    
    /* Footer */
    .SJajHc, footer {
      background-color: rgba(92, 64, 51, 0.8) !important;
      color: #FFD700 !important;
    }
    
    /* Image results overlay */
    .ivg-i, .iKjWAf {
      background-color: rgba(255, 248, 220, 0.95) !important;
      border-color: #D4A574 !important;
    }
  `;
  
  // Remove old style if exists
  const oldStyle = document.getElementById('lebron-theme');
  if (oldStyle) oldStyle.remove();
  
  // Add new style
  document.head.appendChild(style);
  
  console.log('[Image Replacer] Applied sunshine background and LeBron color theme to Google page');
}

/**
 * Initialize Chrome's Face Detection API
 */
async function initFaceDetector() {
  try {
    if (faceDetector) return faceDetector;

    // Check if Face Detection API is available
    if (!('FaceDetector' in window)) {
      console.warn('[Image Replacer] Face Detection API not available. Using fallback mode.');
      console.warn('[Image Replacer] To enable: chrome://flags/#enable-experimental-web-platform-features');
      return null;
    }

    faceDetector = new FaceDetector({ maxDetectedFaces: 5, fastMode: true });
    console.log('[Image Replacer] ✓ Face Detection API initialized');
    return faceDetector;
  } catch (err) {
    console.error('[Image Replacer] Error initializing Face Detector:', err);
    return null;
  }
}

/**
 * Fallback: Simple heuristic to detect likely photos (when Face API unavailable)
 * Checks aspect ratio and size - photos are usually landscape/portrait rectangles
 */
function isLikelyPhoto(img) {
  try {
    const w = img.naturalWidth || img.width || 0;
    const h = img.naturalHeight || img.height || 0;
    
    if (w === 0 || h === 0) return false;
    
    const aspectRatio = w / h;
    const area = w * h;
    
    // Photos are typically:
    // - Larger than 50,000 pixels (not tiny icons)
    // - Aspect ratio between 0.5 (portrait) and 2.0 (landscape)
    // - Not extremely wide (like banners)
    const isPhotoSize = area > 50000;
    const isPhotoAspect = aspectRatio >= 0.5 && aspectRatio <= 2.0;
    
    return isPhotoSize && isPhotoAspect;
  } catch (err) {
    return false;
  }
}

/**
 * Detect if image contains a face using Chrome's native API (or fallback)
 * Returns the detected faces array if found, or null if none
 */
async function imageContainsFace(img) {
  try {
    const detector = await initFaceDetector();
    
    // Try Face Detection API first
    if (detector) {
      const bitmap = await createImageBitmap(img);
      const faces = await detector.detect(bitmap);
      
      if (faces.length > 0) {
        console.log(`[Image Replacer] Face detected in image (${faces.length} face(s)):`, img.src);
        return faces; // Return the faces array with bounding boxes
      }
      
      return null;
    }
    
    // Fallback: Use heuristic detection
    const isPhoto = isLikelyPhoto(img);
    if (isPhoto) {
      console.log('[Image Replacer] Likely photo detected (fallback mode):', img.src);
      return []; // Return empty array to indicate "yes but no face data"
    }
    return null;
    
  } catch (err) {
    console.error('[Image Replacer] Error during face detection:', err);
    // On error, fall back to heuristic
    return isLikelyPhoto(img) ? [] : null;
  }
}

/**
 * Draw overlay image on detected faces and return a data URL
 */
async function drawFacesOnImage(img, faces) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    
    const ctx = canvas.getContext('2d');
    
    // Draw the original image
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    
    // Draw overlay image on each face
    if (faces && faces.length > 0) {
      // Load the GOAT (LeBron James) overlay image
      const overlayImg = await new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        // Use the GOAT image
        img.src = chrome.runtime.getURL(GOAT_IMAGE);
      });
      
      // Draw overlay on each detected face
      faces.forEach(face => {
        const box = face.boundingBox;
        
        // Center the overlay on the detected face and scale by INCREASE_OVERALL_SIZE
        const scale = INCREASE_OVERALL_SIZE || 1.5;
        const newW = box.width * scale;
        const newH = box.height * scale + 20; // slight vertical increase for better fit
        const newX = box.x - (newW - box.width) / 2;
        const newY = box.y - (newH - box.height) / 2;
        ctx.drawImage(overlayImg, newX, newY, newW, newH);
      });
    }
    
    /* BOUNDING BOX CODE - Uncomment to show green rectangles instead of overlay 
    if (faces && faces.length > 0) {
      ctx.strokeStyle = '#00FF00'; // Green color
      ctx.lineWidth = Math.max(3, canvas.width / 200); // Scale line width with image size
      ctx.fillStyle = 'rgba(0, 255, 0, 0.2)'; // Semi-transparent green fill
      
      faces.forEach(face => {
        const box = face.boundingBox;
        
        // Draw rectangle
        ctx.strokeRect(box.x, box.y, box.width, box.height);
        ctx.fillRect(box.x, box.y, box.width, box.height);
        
        // Draw label
        ctx.fillStyle = '#00FF00';
        ctx.font = `${Math.max(16, canvas.width / 40)}px Arial`;
        const confidence = Math.round((face.score || 1) * 100);
        ctx.fillText(`Face ${confidence}%`, box.x, box.y - 5);
      });
    }*/
   
    
    // Convert canvas to data URL
    return canvas.toDataURL('image/jpeg', 0.9);
  } catch (err) {
    console.error('[Image Replacer] Error drawing faces:', err);
    return null;
  }
}

/**
 * Cached face detection to avoid re-processing the same images
 * Returns object with { hasFace: boolean, faces: array, dataUrl: string }
 */
async function imageContainsFaceCached(img) {
  try {
    const src = img.currentSrc || img.src || '';
    if (!src) return { hasFace: false, faces: null, dataUrl: null };

    // Return cached result if available
    if (detectionCache.has(src)) {
      return detectionCache.get(src);
    }

    // Otherwise run detection and cache result
    const faces = await imageContainsFace(img);
    const hasFace = faces !== null;
    
    let dataUrl = null;
    if (hasFace) {
      // Draw faces on image (now async to load overlay image)
      dataUrl = await drawFacesOnImage(img, faces);
    }
    
    const result = { hasFace, faces, dataUrl };
    detectionCache.set(src, result);
    return result;
  } catch (err) {
    console.error('[Image Replacer] Error in cached face detection:', err);
    return { hasFace: false, faces: null, dataUrl: null };
  }
}

function isVisibleInViewport(img) {
  try {
    const rect = img.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom >= 0 && rect.right >= 0 && rect.top <= (window.innerHeight || document.documentElement.clientHeight) && rect.left <= (window.innerWidth || document.documentElement.clientWidth);
  } catch (e) {
    return false;
  }
}

function replaceImageElement(img, dataUrl) {
  try {
    if (!img || !dataUrl) return;

    // If it's already marked with the class AND already points to a data URL, skip
    const alreadyMarked = img.classList && img.classList.contains(REPLACED_CLASS);
    const isDataUrl = img.src && img.src.startsWith('data:');
    if (alreadyMarked && isDataUrl) return;

    // Save originals so we can restore later
    const currentSrc = img.currentSrc || img.src || "";
    if (currentSrc) img.dataset.originalSrc = currentSrc;

    if (img.srcset) img.dataset.originalSrcset = img.srcset;
    // common lazy attributes
    if (img.dataset && img.dataset.src) img.dataset.originalDataSrc = img.dataset.src;

    // Replace sources with the face-annotated image
    try { img.src = dataUrl; } catch (e) { }
    if (img.srcset) try { img.srcset = ''; } catch (e) { } // Clear srcset
    if (img.dataset && img.dataset.src) img.dataset.src = dataUrl;

    // Mark as replaced both with class and dataset flag
    try { img.classList.add(REPLACED_CLASS); } catch (e) { }
    img.dataset.replaced = 'true';

    console.log(`[Image Replacer] Replaced image with face annotations: ${currentSrc || "(empty src)"}`);
  } catch (err) {
    console.error("[Image Replacer] Error replacing image element:", err);
  }
}

function restoreImageElement(img) {
  try {
    if (!img) return;

    // Only restore those we previously changed
    const wasReplaced = img.dataset && img.dataset.replaced === 'true';
    if (!wasReplaced && !(img.classList && img.classList.contains(REPLACED_CLASS))) return;

    if (img.dataset.originalSrc !== undefined) img.src = img.dataset.originalSrc;
    if (img.dataset.originalSrcset !== undefined) img.srcset = img.dataset.originalSrcset;
    if (img.dataset.originalDataSrc !== undefined) img.dataset.src = img.dataset.originalDataSrc;

    // Clean up markers
    try { img.classList.remove(REPLACED_CLASS); } catch (e) { }
    delete img.dataset.replaced;
    delete img.dataset.originalSrc;
    delete img.dataset.originalSrcset;
    delete img.dataset.originalDataSrc;

    // also remove noperson markers if present
    try { img.classList.remove(NO_PERSON_FLAG); } catch (e) { }
    delete img.dataset[NO_PERSON_FLAG];

    console.log("[Image Replacer] Restored image to original src.");
  } catch (err) {
    console.error("[Image Replacer] Error restoring image element:", err);
  }
}

async function scanAndReplace() {
  // Prevent multiple simultaneous scans
  if (isScanning) {
    console.log("[Image Replacer] Scan already in progress, skipping...");
    return;
  }
  
  isScanning = true;
  
  try {
    const images = Array.from(document.images || []);
    if (!images.length) {
      console.log("[Image Replacer] No images found on this page.");
      return;
    }

    console.log(`[Image Replacer] Scanning ${images.length} images...`);

    // Process images intelligently: only check images without noperson flag
    for (const img of images) {
      try {
        // Skip images already replaced
        if (img.classList && img.classList.contains(REPLACED_CLASS)) continue;
        
        // Skip those explicitly marked no-person (already checked, no face found)
        if (img.dataset && img.dataset[NO_PERSON_FLAG] === 'true') continue;

        // Skip tiny images (icons/logos)
        const w = img.naturalWidth || img.width || 0;
        const h = img.naturalHeight || img.height || 0;
        if (w * h < MIN_PIXEL_AREA) continue;

        // Only run detection for visible images to save CPU
        if (!isVisibleInViewport(img)) continue;

        const result = await imageContainsFaceCached(img);
        if (result.hasFace && result.dataUrl) {
          // Face detected = person present, replace with annotated image
          replaceImageElement(img, result.dataUrl);
          
          // Save the annotated image to downloads folder (only if downloads enabled)
          if (downloadsEnabled) {
            console.log('[Image Replacer] Downloads enabled - saving image');
            try {
              chrome.runtime.sendMessage({
                type: 'save-detected-image',
                dataUrl: result.dataUrl,
                originalSrc: img.src
              }, (response) => {
                if (response && response.success) {
                  console.log('[Image Replacer] Saved detected image to downloads');
                }
              });
            } catch (e) {
              console.error('[Image Replacer] Error saving image:', e);
            }
          } else {
            console.log('[Image Replacer] Downloads disabled - skipping save');
          }
        } else {
          // No face detected = mark as no-person so we don't check again
          try { img.dataset[NO_PERSON_FLAG] = 'true'; } catch (e) { }
          if (img.classList) try { img.classList.add(NO_PERSON_FLAG); } catch (e) { }
        }
      } catch (e) {
        // per-image errors should not break the scan
        console.error('[Image Replacer] Error processing image:', e);
      }
    }
    
    console.log("[Image Replacer] Scan complete.");
  } finally {
    isScanning = false;
  }
}

function scheduleFullScan() {
  if (fullScanTimer) clearTimeout(fullScanTimer);
  fullScanTimer = setTimeout(async () => {
    fullScanTimer = null;
    try {
      console.log('[Image Replacer] Running scheduled scan...');
      await scanAndReplace();
    } catch (e) {
      console.error('[Image Replacer] Error during full scan:', e);
    }
  }, FULL_SCAN_DEBOUNCE_MS);
}

function startObserving() {
  if (observer) return; // already observing

  // Observe added nodes and attribute changes so images added during scroll/infinite-load are replaced
  observer = new MutationObserver((mutations) => {
    let sawRelevant = false;
    let newImageCount = 0;

    for (const m of mutations) {
      if (m.type === 'childList' && m.addedNodes && m.addedNodes.length) {
        m.addedNodes.forEach((node) => {
          if (node.nodeType !== Node.ELEMENT_NODE) return;

          // If an <img> was added directly
          if (node.tagName === 'IMG') {
            newImageCount++;
            sawRelevant = true;
            return;
          }

          // If a subtree was added, find images inside it
          const imgs = node.querySelectorAll ? node.querySelectorAll('img') : [];
          if (imgs.length) {
            newImageCount += imgs.length;
            sawRelevant = true;
          }
        });
      }

      // Attribute changes for lazy-loaded images that swap data-src -> src or update srcset
      if (m.type === 'attributes' && m.target && m.target.tagName === 'IMG') {
        // we'll schedule a full scan (covers attribute-based lazy loads)
        sawRelevant = true;
      }
    }

    if (sawRelevant) {
      if (newImageCount > 0) {
        console.log(`[Image Replacer] Detected ${newImageCount} new images, scheduling scan...`);
      }
      scheduleFullScan();
    }
  });

  observer.observe(document.documentElement || document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src', 'data-src', 'srcset']
  });

  // Initial pass
  scanAndReplace();
}

function stopObservingAndRestore() {
  if (observer) {
    try {
      observer.disconnect();
    } catch (e) {
      // ignore
    }
    observer = null;
  }

  if (fullScanTimer) {
    clearTimeout(fullScanTimer);
    fullScanTimer = null;
  }

  // Restore any replaced images
  const images = Array.from(document.images || []);
  images.forEach(restoreImageElement);
  
  // Clear detection cache
  detectionCache.clear();
}

function handleState(enabled) {
  if (enabled) {
    console.log('[Image Replacer] Enabling image replacement and observer.');
    startObserving();
  } else {
    console.log('[Image Replacer] Disabling image replacement and restoring originals.');
    stopObservingAndRestore();
  }
}

// Load initial settings
chrome.storage.sync.get({ enabled: true, downloadsEnabled: true }, (result) => {
  handleState(Boolean(result.enabled));
  downloadsEnabled = Boolean(result.downloadsEnabled);
  console.log(`[Image Replacer] Initial state - Downloads ${downloadsEnabled ? 'enabled' : 'disabled'}`);
});

// Apply Google background immediately if on Google page
applyGoogleBackground();

// Handle direct image pages
handleDirectImagePage();

// Listen for toggle messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "toggle-image-replacement") {
    handleState(message.enabled);
    sendResponse({ status: "ok" });
    return true;
  }
  
  if (message?.type === "toggle-downloads") {
    downloadsEnabled = message.enabled;
    console.log(`[Image Replacer] Downloads toggled to: ${downloadsEnabled ? 'enabled' : 'disabled'}`);
    sendResponse({ status: "ok" });
    return true;
  }
});

// Listen for storage changes (in case settings change from another tab)
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes.downloadsEnabled) {
    downloadsEnabled = Boolean(changes.downloadsEnabled.newValue);
    console.log(`[Image Replacer] Downloads updated from storage: ${downloadsEnabled ? 'enabled' : 'disabled'}`);
  }
});

