// Background service worker - Server tracking and caption generation

// ============ SERVER TRACKING STATE ============
const CLICK_LIMIT = 50;
const SERVER_BASE_URL = "http://localhost:5051";

const eventState = {
  page: {
    title: "",
    url: "",
    timestamp: null
  },
  topImages: [],
  imageMeta: [],
  pageContext: {
    description: "",
    headings: [],
    excerpt: ""
  },
  detectedNames: [],
  clicks: [],
  maxScrollDepth: 0,
  lastUpdated: null
};

function mergeUniqueStrings(current = [], incoming = [], limit = Infinity) {
  const set = new Set(current);
  incoming.forEach((value) => {
    if (typeof value === "string" && value.trim()) {
      set.add(value.trim());
    }
  });

  return Array.from(set).slice(0, limit);
}

function mergeImageMeta(current = [], incoming = [], limit = 5) {
  const existing = [...current];

  incoming.forEach((entry) => {
    if (!entry || typeof entry !== "object") return;
    const normalizedSrc = typeof entry.src === "string" ? entry.src : "";
    if (!normalizedSrc) return;

    const existingIndex = existing.findIndex((item) => item.src === normalizedSrc);
    const safeEntry = {
      src: normalizedSrc,
      alt: typeof entry.alt === "string" ? entry.alt.slice(0, 140) : "",
      context: typeof entry.context === "string" ? entry.context.slice(0, 160) : ""
    };

    if (existingIndex >= 0) {
      existing[existingIndex] = {
        ...existing[existingIndex],
        ...safeEntry
      };
    } else {
      existing.push(safeEntry);
    }
  });

  return existing.slice(0, limit);
}

function sanitizeClickText(text) {
  if (!text) return "";
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  return trimmed.slice(0, 140);
}

function updatePageData(payload = {}) {
  const {
    title,
    url,
    topImages = [],
    imageMeta = [],
    pageContext = {},
    detectedNames = []
  } = payload;

  eventState.page.title = title || eventState.page.title || "";
  eventState.page.url = url || eventState.page.url || "";
  eventState.page.timestamp = Date.now();
  if (Array.isArray(topImages) && topImages.length) {
    eventState.topImages = topImages.slice(0, 3);
  }
  eventState.imageMeta = mergeImageMeta(eventState.imageMeta, Array.isArray(imageMeta) ? imageMeta : []);

  const incomingContext = {
    description:
      typeof pageContext.description === "string"
        ? pageContext.description.trim().slice(0, 300)
        : "",
    headings: Array.isArray(pageContext.headings)
      ? mergeUniqueStrings(eventState.pageContext.headings, pageContext.headings, 5)
      : eventState.pageContext.headings,
    excerpt:
      typeof pageContext.excerpt === "string"
        ? pageContext.excerpt.trim().slice(0, 320)
        : ""
  };

  eventState.pageContext = {
    description: incomingContext.description || eventState.pageContext.description,
    headings: incomingContext.headings,
    excerpt: incomingContext.excerpt || eventState.pageContext.excerpt
  };

  eventState.detectedNames = mergeUniqueStrings(eventState.detectedNames, detectedNames, 6);
  eventState.lastUpdated = Date.now();
}

function updateClicks(clickTexts = []) {
  const sanitized = clickTexts
    .map(sanitizeClickText)
    .filter(Boolean);

  if (!sanitized.length) return;

  const newestFirst = sanitized.reverse();

  eventState.clicks = newestFirst
    .concat(eventState.clicks || [])
    .slice(0, CLICK_LIMIT);

  eventState.lastUpdated = Date.now();
}

function updateScrollDepth(depth = 0) {
  const numericDepth = Number(depth) || 0;
  if (numericDepth > eventState.maxScrollDepth) {
    eventState.maxScrollDepth = Math.min(100, numericDepth);
    eventState.lastUpdated = Date.now();
  }
}

async function postToServer(path, body) {
  try {
    await fetch(`${SERVER_BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
  } catch (error) {
    console.warn("[Image Replacer] Failed to reach local server:", error);
  }
}

function snapshotState() {
  return {
    page: { ...eventState.page },
    topImages: [...eventState.topImages],
    imageMeta: [...eventState.imageMeta],
    pageContext: { ...eventState.pageContext, headings: [...eventState.pageContext.headings] },
    detectedNames: [...eventState.detectedNames],
    clicks: [...eventState.clicks.slice(0, 10)],
    maxScrollDepth: eventState.maxScrollDepth,
    lastUpdated: eventState.lastUpdated
  };
}

async function handleGenerateCaption(sendResponse, profile) {
  const payload = {
    ...snapshotState(),
    profile: profile
      ? {
          name: typeof profile.name === "string" ? profile.name.slice(0, 60) : "",
          handle: typeof profile.handle === "string" ? profile.handle.slice(0, 32) : ""
        }
      : undefined
  };

  try {
    const response = await fetch(`${SERVER_BASE_URL}/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      const message = errorBody?.error || `Server responded with status ${response.status}`;
      sendResponse({ ok: false, error: message });
      return;
    }

    const data = await response.json();
    if (typeof data?.caption !== "string") {
      sendResponse({ ok: false, error: "Server response missing caption text." });
      return;
    }

    sendResponse({ ok: true, caption: data.caption });
  } catch (error) {
    sendResponse({ ok: false, error: error.message || "Failed to fetch caption." });
  }
}

// ============ MESSAGE HANDLER ============
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== "object") return;

  const { type, payload } = message;

  // Server tracking messages
  switch (type) {
    case "track-page-view":
      updatePageData(payload);
      postToServer("/ingest", snapshotState());
      break;
    case "track-clicks":
      updateClicks(payload?.clicks || []);
      postToServer("/ingest", snapshotState());
      break;
    case "track-scroll-depth":
      updateScrollDepth(payload?.maxScrollDepth);
      postToServer("/ingest", snapshotState());
      break;
    case "track-image-sources":
      updatePageData({ topImages: payload?.topImages || [] });
      postToServer("/ingest", snapshotState());
      break;
    case "track-page-context":
      updatePageData(payload || {});
      postToServer("/ingest", snapshotState());
      break;
    case "generate-caption":
      handleGenerateCaption(sendResponse, payload?.profile);
      return true;
  }

  return false;
});

console.log('[Background] Service worker loaded (Server tracking + Caption generation)');
