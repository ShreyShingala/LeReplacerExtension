const toggleButton = document.getElementById("toggle");
const toggleDownloadsButton = document.getElementById("toggleDownloads");
const openDownloadsButton = document.getElementById("openDownloads");
const resetButton = document.getElementById("reset");

function updateButton(enabled) {
  toggleButton.textContent = enabled ? "Disable face detection" : "Enable face detection";
}

function updateDownloadsButton(enabled) {
  toggleDownloadsButton.textContent = enabled ? "Disable auto-save" : "Enable auto-save";
  toggleDownloadsButton.style.backgroundColor = enabled ? "#f44336" : "#4CAF50";
}

function getActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs[0]);
    });
  });
}

chrome.storage.sync.get({ enabled: true, downloadsEnabled: true }, (result) => {
  const enabled = Boolean(result.enabled);
  const downloadsEnabled = Boolean(result.downloadsEnabled);
  updateButton(enabled);
  updateDownloadsButton(downloadsEnabled);
  toggleButton.disabled = false;
  toggleDownloadsButton.disabled = false;
});

toggleButton.addEventListener("click", async () => {
  toggleButton.disabled = true;

  chrome.storage.sync.get({ enabled: true }, async (result) => {
    const enabled = !Boolean(result.enabled);

    chrome.storage.sync.set({ enabled }, async () => {
      updateButton(enabled);
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

// Toggle downloads
toggleDownloadsButton.addEventListener("click", () => {
  toggleDownloadsButton.disabled = true;
  
  chrome.storage.sync.get({ downloadsEnabled: true }, (result) => {
    const downloadsEnabled = !Boolean(result.downloadsEnabled);
    
    chrome.storage.sync.set({ downloadsEnabled }, () => {
      updateDownloadsButton(downloadsEnabled);
      toggleDownloadsButton.disabled = false;
      
      // Notify content script of the change
      getActiveTab().then(activeTab => {
        if (activeTab?.id) {
          chrome.tabs.sendMessage(activeTab.id, {
            type: "toggle-downloads",
            enabled: downloadsEnabled
          });
        }
      });
    });
  });
});

// Open downloads folder
openDownloadsButton.addEventListener("click", () => {
  chrome.downloads.showDefaultFolder();
});

// Reset download counter
resetButton.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: 'reset-counter' }, (response) => {
    if (response && response.success) {
      alert('Download counter reset!');
    }
  });
});

