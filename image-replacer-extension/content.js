
//const PLACEHOLDER_URL = "https://cdn.bap-software.net/2024/02/22165839/testdebug2.jpg";
const GLUE_PLACEHOLDER = "goat.png";
let observer = null;
let fullScanTimer = null;
let isScanning = false; // Prevent multiple simultaneous scans
const FULL_SCAN_DEBOUNCE_MS = 80; // small debounce to batch rapid mutations
const REPLACED_CLASS = 'replaced';
const NO_PERSON_FLAG = 'noperson';
const MIN_PIXEL_AREA = 5000; // skip tiny images (w*h)

// Face detection state
let faceDetector = null;
const detectionCache = new Map();
let downloadsEnabled = true; // Default to enabled
let customOverlayImage = null; // Store custom uploaded image

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
      // Load the overlay image from extension files or custom upload
      const overlayImg = await new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        // Use custom image if uploaded, otherwise use default glue stain
        img.src = customOverlayImage || chrome.runtime.getURL(GLUE_PLACEHOLDER);
      });
      
      // Draw overlay on each detected face
      faces.forEach(face => {
        const box = face.boundingBox;
        
        // Draw the overlay image scaled to fit the face bounding box
        ctx.drawImage(overlayImg, box.x, box.y, box.width, box.height);
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
    }
    */
    
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

// Load custom overlay image if exists
chrome.storage.local.get(['overlayImage'], (result) => {
  if (result.overlayImage) {
    customOverlayImage = result.overlayImage;
    console.log('[Image Replacer] Custom overlay image loaded');
  }
});

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
  
  if (message?.type === "update-overlay-image") {
    customOverlayImage = message.dataUrl;
    console.log('[Image Replacer] Overlay image updated - clearing cache to re-process images');
    // Clear cache so images get re-processed with new overlay
    detectionCache.clear();
    // Re-scan to apply new overlay
    if (observer) {
      scanAndReplace();
    }
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

