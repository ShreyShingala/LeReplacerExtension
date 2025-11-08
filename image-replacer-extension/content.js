const PLACEHOLDER_URL = "https://cdn.bap-software.net/2024/02/22165839/testdebug2.jpg";

function replaceImages() {
  const images = Array.from(document.images);

  if (!images.length) {
    console.log("[Image Replacer] No images found on this page.");
    return;
  }

  images.forEach((img, index) => {
    const originalSrc = img.currentSrc || img.src;
    img.dataset.originalSrc = originalSrc;
    img.src = PLACEHOLDER_URL;
    console.log(`[Image Replacer] Replaced image #${index + 1}: ${originalSrc || "(empty src)"} -> ${PLACEHOLDER_URL}`);
  });
}

function handleState(enabled) {
  if (enabled) {
    replaceImages();
  } else {
    console.log("[Image Replacer] Extension is disabled; skipping image replacement.");
  }
}

chrome.storage.sync.get({ enabled: true }, (result) => {
  handleState(Boolean(result.enabled));
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "toggle-image-replacement") {
    handleState(message.enabled);
    sendResponse({ status: "ok" });
  }
});

