const toggleButton = document.getElementById("toggle");
const generateButton = document.getElementById("generate");
const copyButton = document.getElementById("copy");
const captionField = document.getElementById("caption");
const statusEl = document.getElementById("status");
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
}

function getActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs[0]);
    });
  });
}

function enableGenerateButton() {
  if (!generateButton) return;
  generateButton.disabled = false;
  generateButton.textContent = "Generate caption";
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
  enableGenerateButton();

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

function requestCaption() {
  if (!generateButton) return;

  generateButton.disabled = true;
  generateButton.textContent = "Generating...";
  setStatus("Summoning a 67/goon caption...");

  const profile = getProfilePayload();

  chrome.runtime.sendMessage({ type: "generate-caption", payload: { profile } }, (response) => {
    enableGenerateButton();

    if (chrome.runtime.lastError) {
      setStatus("Failed to reach local caption server. Is it running?", true);
      return;
    }

    if (!response?.ok) {
      const message = response?.error || "Caption request failed.";
      setStatus(message, true);
      return;
    }

    captionField.value = response.caption;
    copyButton.disabled = !response.caption;
    setStatus("Caption ready.");
  });
}

generateButton?.addEventListener("click", requestCaption);

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

