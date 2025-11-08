const toggleButton = document.getElementById("toggle");

function updateButton(enabled) {
  toggleButton.textContent = enabled ? "Disable image replacement" : "Enable image replacement";
}

function getActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs[0]);
    });
  });
}

chrome.storage.sync.get({ enabled: true }, (result) => {
  const enabled = Boolean(result.enabled);
  updateButton(enabled);
  toggleButton.disabled = false;
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

