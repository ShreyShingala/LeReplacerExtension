const CLICK_LIMIT = 50;
const SERVER_BASE_URL = "http://localhost:5051";

const eventState = {
  page: {
    title: "",
    url: "",
    timestamp: null
  },
  topImages: [],
  clicks: [],
  maxScrollDepth: 0,
  lastUpdated: null
};

function sanitizeClickText(text) {
  if (!text) return "";
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  return trimmed.slice(0, 140);
}

function updatePageData(payload = {}) {
  const { title, url, topImages = [] } = payload;

  eventState.page.title = title || eventState.page.title || "";
  eventState.page.url = url || eventState.page.url || "";
  eventState.page.timestamp = Date.now();

  if (Array.isArray(topImages) && topImages.length) {
    eventState.topImages = topImages.slice(0, 3);
  }

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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== "object") return;

  const { type, payload } = message;

  switch (type) {
    case "track-page-view": {
      updatePageData(payload);
      postToServer("/ingest", snapshotState());
      break;
    }
    case "track-clicks": {
      updateClicks(payload?.clicks || []);
      postToServer("/ingest", snapshotState());
      break;
    }
    case "track-scroll-depth": {
      updateScrollDepth(payload?.maxScrollDepth);
      postToServer("/ingest", snapshotState());
      break;
    }
    case "track-image-sources": {
      updatePageData({ topImages: payload?.topImages || [] });
      postToServer("/ingest", snapshotState());
      break;
    }
    case "generate-caption": {
      handleGenerateCaption(sendResponse, payload?.profile);
      return true;
    }
    default:
      break;
  }

  return false;
});

