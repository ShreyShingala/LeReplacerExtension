const toggleButton = document.getElementById("toggle");
const generateButton = document.getElementById("generate");
const tweetButton = document.getElementById("generateTweet");
const copyButton = document.getElementById("copy");
const tweetNowButton = document.getElementById("tweetNow");
const captionField = document.getElementById("caption");
const statusEl = document.getElementById("status");
const tweetInfoEl = document.getElementById("tweetInfo");
const nameInput = document.getElementById("name");
const handleInput = document.getElementById("handle");
const fadeImagesButton = document.getElementById("fadeImages");

const cameraButton = document.getElementById("cameraButton");

function updateToggleButton(enabled) {
  toggleButton.textContent = enabled ? "Disable face detection" : "Enable face detection";
}

function updateCameraButton(enabled) {
  cameraButton.textContent = enabled ? "Disable camera" : "Open Camera";
}

function updateFadeImagesButton(enabled) {
  fadeImagesButton.textContent = enabled ? "Fade to LeBron (ON)" : "Fade to LeBron (OFF)";
  fadeImagesButton.style.background = enabled 
    ? "linear-gradient(135deg, #f44336 0%, #da190b 100%)" 
    : "linear-gradient(135deg, #ff6b35 0%, #ff8c42 100%)";
}

function setStatus(message = "", isError = false) {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.toggle("error", Boolean(isError));
  if (tweetInfoEl) {
    tweetInfoEl.style.display = "none";
    tweetInfoEl.textContent = "";
  }
}

function getActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs[0]);
    });
  });
}

function resetActionButtons() {
  if (generateButton) {
    generateButton.disabled = false;
    generateButton.textContent = "Generate caption";
  }
  if (tweetButton) {
    tweetButton.disabled = false;
    tweetButton.textContent = "Generate & Tweet";
  }
  if (tweetNowButton) {
    tweetNowButton.disabled = !captionField?.value?.trim();
    tweetNowButton.textContent = "Tweet now";
  }
}

function sanitizeHandle(rawHandle = "") {
  const trimmed = rawHandle.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("@")) return trimmed.slice(0, 32);
  return `@${trimmed}`.slice(0, 32);
}

function getProfilePayload() {
  const name = (nameInput?.value || "").trim().slice(0, 60);
  const handle = sanitizeHandle(handleInput?.value || "");
  return { name, handle };
}

function cacheProfile() {
  const { name, handle } = getProfilePayload();
  chrome.storage.sync.set({ creatorName: name, creatorHandle: handle }, () => {
    if (chrome.runtime.lastError) {
      console.warn("Failed to store profile:", chrome.runtime.lastError.message);
    }
  });
  if (handleInput) handleInput.value = handle;
}

chrome.storage.sync.get({ enabled: true, creatorName: "", creatorHandle: "", fadeImagesToLeBron: false }, (result) => {
  const enabled = Boolean(result.enabled);
  const fadeImagesToLeBron = Boolean(result.fadeImagesToLeBron);
  
  updateToggleButton(enabled);
  updateFadeImagesButton(fadeImagesToLeBron);
  
  toggleButton.disabled = false;
  resetActionButtons();

  if (nameInput) nameInput.value = result.creatorName || "";
  if (handleInput) handleInput.value = sanitizeHandle(result.creatorHandle || "");
  
  fadeImagesButton.disabled = false;
  
  // Initialize camera button
  if (cameraButton) {
    cameraButton.disabled = false;
    cameraButton.textContent = "Open Camera";
  }
});

toggleButton.addEventListener("click", async () => {
  toggleButton.disabled = true;

  chrome.storage.sync.get({ enabled: true }, async (result) => {
    const enabled = !Boolean(result.enabled);

    chrome.storage.sync.set({ enabled }, async () => {
      updateToggleButton(enabled);
      const activeTab = await getActiveTab();

      if (activeTab?.id) {
        chrome.tabs.sendMessage(activeTab.id, {
          type: "toggle-image-replacement",
          enabled
        });
      }
      toggleButton.disabled = false;
    });
  });
});

cameraButton.addEventListener("click", async () => {
  try {
    // Open camera page in a new window
    chrome.windows.create({
      url: chrome.runtime.getURL('camera.html'),
      type: 'popup',
      width: 700,
      height: 600
    });
  } catch (error) {
    console.error('Error opening camera:', error);
    setStatus('Failed to open camera', true);
  }
});

function requestCaption({ postToTwitter = false } = {}) {
  const activeButton = postToTwitter ? tweetButton : generateButton;
  const secondaryButton = postToTwitter ? generateButton : tweetButton;

  if (activeButton) {
    activeButton.disabled = true;
    activeButton.textContent = postToTwitter ? "Generating & tweeting..." : "Generating...";
  }
  if (secondaryButton) secondaryButton.disabled = true;

  setStatus(
    postToTwitter
      ? "Summoning a caption and pushing it to X/Twitter..."
      : "Summoning a 67/goon caption..."
  );

  const profile = getProfilePayload();
  const payload = { profile };

  if (postToTwitter) {
    payload.postToTwitter = true;
    const customTweet = captionField.value.trim();
    if (customTweet.length) {
      payload.tweetText = customTweet.slice(0, 280);
    }
  }

  chrome.runtime.sendMessage({ type: "generate-caption", payload }, (response) => {
    resetActionButtons();

    if (chrome.runtime.lastError) {
      setStatus("Failed to reach local caption server. Is it running?", true);
      return;
    }

    if (!response?.ok) {
      const message = response?.error || "Caption request failed.";
      setStatus(message, true);
      return;
    }

    if (response.caption) {
      captionField.value = response.caption;
    }
    copyButton.disabled = !response.caption;

    if (postToTwitter) {
      if (response.tweeted) {
        setStatus("Caption posted to X/Twitter successfully!");
        if (tweetInfoEl && response.tweetText) {
          tweetInfoEl.textContent = response.tweetText;
          tweetInfoEl.style.display = "block";
        }
      } else if (response.tweetError) {
        setStatus(`Caption ready, but tweeting failed: ${response.tweetError}`, true);
      } else {
        setStatus("Caption ready, but tweet was not sent.", true);
      }
    } else {
      setStatus("Caption ready.");
    }
  });
}

generateButton?.addEventListener("click", () => requestCaption({ postToTwitter: false }));
tweetButton?.addEventListener("click", () => requestCaption({ postToTwitter: true }));

copyButton?.addEventListener("click", async () => {
  const caption = captionField.value.trim();
  if (!caption) return;

  try {
    await navigator.clipboard.writeText(caption);
    setStatus("Copied to clipboard!");
  } catch (error) {
    setStatus("Clipboard permission denied.", true);
  }
});

// Tweet the currently edited caption immediately
tweetNowButton?.addEventListener("click", () => {
  const caption = captionField.value.trim();
  if (!caption) {
    setStatus("No caption to tweet.", true);
    return;
  }

  tweetNowButton.disabled = true;
  tweetNowButton.textContent = "Posting...";
  setStatus("Posting caption to X/Twitter...");

  const profile = getProfilePayload();
  const payload = { profile, postToTwitter: true, tweetText: caption.slice(0, 280) };

  chrome.runtime.sendMessage({ type: "generate-caption", payload }, (response) => {
    resetActionButtons();

    if (chrome.runtime.lastError) {
      setStatus("Failed to reach local caption server. Is it running?", true);
      return;
    }

    if (!response?.ok) {
      const message = response?.error || "Caption request failed.";
      setStatus(message, true);
      return;
    }

    if (response.tweeted) {
      setStatus("Caption posted to X/Twitter successfully!");
      if (tweetInfoEl && response.tweetText) {
        tweetInfoEl.textContent = response.tweetText;
        tweetInfoEl.style.display = "block";
      }
    } else if (response.tweetError) {
      setStatus(`Caption ready, but tweeting failed: ${response.tweetError}`, true);
    } else {
      setStatus("Caption ready, but tweet was not sent.", true);
    }
  });
});

nameInput?.addEventListener("blur", cacheProfile);
handleInput?.addEventListener("blur", cacheProfile);
nameInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    cacheProfile();
  }
});
handleInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    cacheProfile();
  }
});

// Fade all images to LeBron (toggle)
fadeImagesButton.addEventListener("click", async () => {
  fadeImagesButton.disabled = true;
  
  chrome.storage.sync.get({ fadeImagesToLeBron: false }, (result) => {
    const fadeImagesToLeBron = !Boolean(result.fadeImagesToLeBron);
    
    chrome.storage.sync.set({ fadeImagesToLeBron }, async () => {
      updateFadeImagesButton(fadeImagesToLeBron);
      fadeImagesButton.disabled = false;
      
      // Notify content script of the change
      const activeTab = await getActiveTab();
      if (activeTab?.id) {
        chrome.tabs.sendMessage(activeTab.id, {
          type: "toggle-fade-images",
          enabled: fadeImagesToLeBron
        });
      }
    });
  });
});

// Enable/disable tweetNow and copy button based on caption field content
captionField?.addEventListener("input", () => {
  const has = Boolean(captionField.value.trim());
  if (copyButton) copyButton.disabled = !has;
  if (tweetNowButton) tweetNowButton.disabled = !has;
});

