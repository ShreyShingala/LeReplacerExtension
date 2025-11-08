
const PLACEHOLDER_URL = "https://cdn.bap-software.net/2024/02/22165839/testdebug2.jpg";
const FULL_SCAN_DEBOUNCE_MS = 80;
const REPLACED_CLASS = "replaced";
const METRICS_MAX_IMAGES = 3;
const CLICK_FLUSH_DEBOUNCE_MS = 750;
const SCROLL_REPORT_THROTTLE_MS = 1500;
const EVENT_LIMIT = 50;

let observer = null;
let fullScanTimer = null;
let clickFlushTimer = null;
let scrollReportTimer = null;

const seenImageSources = new Set();
const metricsState = {
  initialized: false,
  listenersBound: false,
  topImages: [],
  maxScrollDepth: 0
};

let clickBuffer = [];

function normalizeSource(src) {
  if (!src) return "";
  const trimmed = String(src).trim();
  if (!trimmed) return "";
  try {
    return new URL(trimmed, window.location.href).href;
  } catch (err) {
    return trimmed;
  }
}

function sendToBackground(type, payload) {
  if (!chrome?.runtime?.sendMessage) return;
  try {
    chrome.runtime.sendMessage({ type, payload }, () => {
    });
  } catch (error) {
    console.warn("[Image Replacer] Failed to send message:", error);
  }
}

function collectInitialImages(limit = METRICS_MAX_IMAGES) {
  const sources = Array.from(document.images || [])
    .map((img) => normalizeSource(img.currentSrc || img.src || ""))
    .filter(Boolean);

  const unique = [];
  for (const src of sources) {
    if (!unique.includes(src)) {
      unique.push(src);
    }
    if (unique.length >= limit) break;
  }

  return unique;
}

function captureInitialPageView() {
  if (metricsState.initialized) return;

  const sources = collectInitialImages(METRICS_MAX_IMAGES);
  metricsState.topImages = [...sources];
  sources.forEach((src) => seenImageSources.add(src));

  metricsState.maxScrollDepth = Math.round(computeScrollDepth());

  sendToBackground("track-page-view", {
    title: document.title || "",
    url: window.location.href,
    topImages: sources
  });

  // Report initial scroll depth
  sendToBackground("track-scroll-depth", {
    maxScrollDepth: metricsState.maxScrollDepth
  });

  metricsState.initialized = true;
}

function scheduleScrollReport() {
  if (scrollReportTimer) return;
  scrollReportTimer = setTimeout(() => {
    scrollReportTimer = null;
    sendToBackground("track-scroll-depth", {
      maxScrollDepth: metricsState.maxScrollDepth
    });
  }, SCROLL_REPORT_THROTTLE_MS);
}

function recordTopImage(src) {
  const normalized = normalizeSource(src);
  if (!normalized) return;

  if (!seenImageSources.has(normalized) && metricsState.topImages.length < METRICS_MAX_IMAGES) {
    seenImageSources.add(normalized);
    metricsState.topImages.push(normalized);
  }

  sendToBackground("track-image-sources", {
    topImages: [...metricsState.topImages]
  });
}

function bufferClickText(text) {
  if (!text) return;
  clickBuffer.push(text);
  if (clickBuffer.length > EVENT_LIMIT) {
    clickBuffer = clickBuffer.slice(-EVENT_LIMIT);
  }

  if (clickFlushTimer) {
    clearTimeout(clickFlushTimer);
  }

  clickFlushTimer = setTimeout(() => {
    flushClicks();
  }, CLICK_FLUSH_DEBOUNCE_MS);
}

function flushClicks() {
  if (!clickBuffer.length) return;
  sendToBackground("track-clicks", { clicks: [...clickBuffer] });
  clickBuffer = [];
  if (clickFlushTimer) {
    clearTimeout(clickFlushTimer);
    clickFlushTimer = null;
  }
}

function extractClickText(event) {
  if (!event) return "";
  const path = typeof event.composedPath === "function" ? event.composedPath() : [];
  const candidates = path.length ? path : [event.target];

  for (const node of candidates) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) continue;
    const el = node;

    const labelCandidates = [
      el.innerText,
      el.getAttribute?.("aria-label"),
      el.getAttribute?.("alt"),
      el.getAttribute?.("title"),
      el.value
    ];

    for (const candidate of labelCandidates) {
      if (typeof candidate !== "string") continue;
      const cleaned = candidate.replace(/\s+/g, " ").trim();
      if (cleaned) {
        return cleaned.slice(0, 120);
      }
    }
  }

  if (event.target && event.target.nodeType === Node.TEXT_NODE) {
    const text = String(event.target.textContent || "").replace(/\s+/g, " ").trim();
    return text.slice(0, 120);
  }

  return "";
}

function handleClick(event) {
  const text = extractClickText(event);
  if (text) {
    bufferClickText(text);
  }
}

function computeScrollDepth() {
  const doc = document.documentElement || document.body;
  if (!doc) return 0;

  const scrollTop = window.scrollY ?? doc.scrollTop ?? document.body.scrollTop ?? 0;
  const viewportHeight = window.innerHeight || doc.clientHeight || 0;
  const scrollHeight = doc.scrollHeight || document.body.scrollHeight || 0;

  if (!scrollHeight) return 0;
  if (scrollHeight <= viewportHeight) return 100;

  const depth = ((scrollTop + viewportHeight) / scrollHeight) * 100;
  return Math.max(0, Math.min(100, depth));
}

function handleScroll() {
  const depth = Math.round(computeScrollDepth());
  if (depth > metricsState.maxScrollDepth) {
    metricsState.maxScrollDepth = depth;
    scheduleScrollReport();
  }
}

function initMetricsTracking() {
  if (metricsState.listenersBound) return;

  captureInitialPageView();

  document.addEventListener("click", handleClick, true);
  window.addEventListener("scroll", handleScroll, { passive: true });
  window.addEventListener("beforeunload", flushClicks);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flushClicks();
    }
  });

  metricsState.listenersBound = true;
}

function replaceImageElement(img) {
  try {
    if (!img) return;

    const alreadyMarked = img.classList && img.classList.contains(REPLACED_CLASS);
    const isPlaceholder = img.src === PLACEHOLDER_URL || img.currentSrc === PLACEHOLDER_URL;
    if (alreadyMarked && isPlaceholder) return;

    const currentSrc = img.currentSrc || img.src || "";
    if (currentSrc) {
      img.dataset.originalSrc = currentSrc;
      recordTopImage(currentSrc);
    }

    if (img.srcset) img.dataset.originalSrcset = img.srcset;
    if (img.dataset && img.dataset.src) img.dataset.originalDataSrc = img.dataset.src;

    try {
      img.src = PLACEHOLDER_URL;
    } catch (e) {
      // ignore per-image assignment errors
    }

    if (img.srcset) {
      try {
        img.srcset = PLACEHOLDER_URL;
      } catch (e) {
        // ignore
      }
    }

    if (img.dataset && img.dataset.src) {
      img.dataset.src = PLACEHOLDER_URL;
    }

    try {
      img.classList.add(REPLACED_CLASS);
    } catch (e) {
      // ignore
    }
    img.dataset.replaced = "true";

    console.log(`[Image Replacer] Replaced image: ${currentSrc || "(empty src)"} -> ${PLACEHOLDER_URL}`);
  } catch (err) {
    console.error("[Image Replacer] Error replacing image element:", err);
  }
}

function restoreImageElement(img) {
  try {
    if (!img) return;

    const wasReplaced = img.dataset && img.dataset.replaced === "true";
    if (!wasReplaced && !(img.classList && img.classList.contains(REPLACED_CLASS))) return;

    if (img.dataset.originalSrc !== undefined) img.src = img.dataset.originalSrc;
    if (img.dataset.originalSrcset !== undefined) img.srcset = img.dataset.originalSrcset;
    if (img.dataset.originalDataSrc !== undefined) img.dataset.src = img.dataset.originalDataSrc;

    try {
      img.classList.remove(REPLACED_CLASS);
    } catch (e) {
      // ignore
    }
    delete img.dataset.replaced;
    delete img.dataset.originalSrc;
    delete img.dataset.originalSrcset;
    delete img.dataset.originalDataSrc;

    console.log("[Image Replacer] Restored image to original src.");
  } catch (err) {
    console.error("[Image Replacer] Error restoring image element:", err);
  }
}

function scanAndReplace() {
  const images = Array.from(document.images || []);
  if (!images.length) {
    console.log("[Image Replacer] No images found on this page.");
    return;
  }

  images.forEach((img) => {
    const marked = img.classList && img.classList.contains(REPLACED_CLASS);
    const isPlaceholder = img.src === PLACEHOLDER_URL || img.currentSrc === PLACEHOLDER_URL;
    if (!marked || !isPlaceholder) replaceImageElement(img);
  });

  const sources = Array.from(document.querySelectorAll("source"));
  sources.forEach((s) => {
    try {
      const marked = s.dataset && s.dataset.replaced === "true";
      const isPlaceholder = s.srcset === PLACEHOLDER_URL;
      if (!marked || !isPlaceholder) {
        if (s.srcset) s.dataset.originalSrcset = s.srcset;
        s.srcset = PLACEHOLDER_URL;
        s.dataset.replaced = "true";
        if (s.classList) s.classList.add(REPLACED_CLASS);
        console.log("[Image Replacer] Replaced <source> srcset ->", PLACEHOLDER_URL);
      }
    } catch (e) {
      // ignore per-source errors
    }
  });

  const styled = Array.from(document.querySelectorAll("[style]"));
  styled.forEach((el) => {
    try {
      const style = el.style && el.style.backgroundImage;
      if (!style || style === "none") return;
      const marked = el.dataset && el.dataset.replaced === "true";
      const isPlaceholder = style.includes(PLACEHOLDER_URL);
      if (!marked || !isPlaceholder) {
        el.dataset.originalBackgroundImage = style;
        el.style.backgroundImage = `url("${PLACEHOLDER_URL}")`;
        el.dataset.replaced = "true";
        if (el.classList) el.classList.add(REPLACED_CLASS);
        console.log("[Image Replacer] Replaced inline background-image on element ->", PLACEHOLDER_URL);
      }
    } catch (e) {
      // ignore
    }
  });
}

function scheduleFullScan() {
  if (fullScanTimer) clearTimeout(fullScanTimer);
  fullScanTimer = setTimeout(() => {
    fullScanTimer = null;
    try {
      scanAndReplace();
    } catch (e) {
      console.error("[Image Replacer] Error during full scan:", e);
    }
  }, FULL_SCAN_DEBOUNCE_MS);
}

function startObserving() {
  if (observer) return;

  observer = new MutationObserver((mutations) => {
    let sawRelevant = false;

    for (const mutation of mutations) {
      if (mutation.type === "childList" && mutation.addedNodes && mutation.addedNodes.length) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType !== Node.ELEMENT_NODE) return;

          if (node.tagName === "IMG") {
            replaceImageElement(node);
            sawRelevant = true;
            return;
          }

          const imgs = node.querySelectorAll ? node.querySelectorAll("img") : [];
          if (imgs.length) {
            imgs.forEach(replaceImageElement);
            sawRelevant = true;
          }
        });
      }

      if (mutation.type === "attributes" && mutation.target && mutation.target.tagName === "IMG") {
        sawRelevant = true;
      }
    }

    if (sawRelevant) scheduleFullScan();
  });

  observer.observe(document.documentElement || document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["src", "data-src", "srcset"]
  });

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

  const images = Array.from(document.images || []);
  images.forEach(restoreImageElement);
}

function handleState(enabled) {
  if (enabled) {
    console.log("[Image Replacer] Enabling image replacement and observer.");
    startObserving();
  } else {
    console.log("[Image Replacer] Disabling image replacement and restoring originals.");
    stopObservingAndRestore();
  }
}

initMetricsTracking();

chrome.storage.sync.get({ enabled: true }, (result) => {
  handleState(Boolean(result.enabled));
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "toggle-image-replacement") {
    handleState(message.enabled);
    sendResponse({ status: "ok" });
  }
});

