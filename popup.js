function initPopup() {
  const enableToggle = document.getElementById('enableToggle');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');

  if (!enableToggle || !statusDot || !statusText) {
    throw new Error('Popup DOM elements not found');
  }

  function updateUI(enabled) {
    enableToggle.checked = enabled;
    statusDot.classList.toggle('on', enabled);
    statusDot.classList.toggle('off', !enabled);
    statusText.textContent = enabled ? 'Active on claude.ai' : 'Disabled';
  }

  chrome.storage.local.get(['claudeRtlEnabled'], (result) => {
    const enabled = result.claudeRtlEnabled !== false;
    updateUI(enabled);
  });

  enableToggle.addEventListener('change', () => {
    const enabled = enableToggle.checked;
    chrome.storage.local.set({ claudeRtlEnabled: enabled }, () => {
      if (chrome.runtime.lastError) {
        statusText.textContent = 'Error saving setting';
        return;
      }
      updateUI(enabled);
    });
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { initPopup };
}

if (typeof window !== 'undefined' && typeof module === 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPopup);
  } else {
    initPopup();
  }
}
