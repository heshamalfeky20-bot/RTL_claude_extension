const RTLPro = (() => {
  'use strict';

  const DEBUG = false;
  function log(...args) { if (DEBUG) console.log('[ClaudeRTL]', ...args); }
  function warn(...args) { if (DEBUG) console.warn('[ClaudeRTL]', ...args); }

  const CONFIG = {
    DEBOUNCE_MS: 150,
    ARABIC_REGEX: /[\u0600-\u06FF\u0750-\u077F\u0870-\u089F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/,
    OBSERVER_CONFIG: { childList: true, subtree: true, characterData: true },
    MESSAGE_SELECTORS: [
      '.font-claude-message',
      '.prose',
      'div.assistant-message',
      'div.human-message',
      '[data-testid="user-message"]',
      '[data-testid="chat-message"]',
      '[data-testid="assistant-message"]',
      '.font-claude-response-body',
      '.standard-markdown',
      '[class*="message"][class*="claude"]',
    ],
    INPUT_SELECTORS: [
      'div.ProseMirror[contenteditable="true"]',
      '[data-testid="chat-input"] .ProseMirror',
      '[data-testid="chat-input"] [contenteditable="true"]',
    ],
    CONTENT_SELECTORS: 'p, ol, ul, h1, h2, h3, h4, h5, h6, blockquote',
    SEARCH_ROOT_SELECTORS: '[data-testid="chat-messages"], .chat-messages, main, [role="main"]',
  };

  let isEnabled = true;
  let debounceTimer = null;
  let observer = null;

  function containsArabic(text) {
    if (!text) return false;
    return CONFIG.ARABIC_REGEX.test(text);
  }

  function shouldSkipElement(el) {
    if (!el || !el.tagName) return true;
    const tag = el.tagName.toLowerCase();
    if (tag === 'pre' || tag === 'code' || tag === 'script' || tag === 'style' || tag === 'svg' || tag === 'math') {
      return true;
    }
    if (el.closest && el.closest('.katex, .katex-display, [data-testid="katex"], pre, code, .code-block, [data-testid="code-block"]')) {
      return true;
    }
    return false;
  }

  function applyRTL(el) {
    if (!el || el.classList.contains('claude-rtl-pro--rtl')) return;
    if (shouldSkipElement(el)) return;
    if (!containsArabic(el.textContent)) return;
    el.classList.add('claude-rtl-pro--rtl');
    log('Applied RTL to', el.tagName, el.className);
  }

  function removeRTL(el) {
    if (!el) return;
    el.classList.remove('claude-rtl-pro--rtl');
  }

  function walkAndApply(root = document.body) {
    if (!isEnabled || !root) {
      warn('walkAndApply skipped — enabled:', isEnabled, 'root:', !!root);
      return;
    }

    const messages = root.querySelectorAll(CONFIG.MESSAGE_SELECTORS.join(', '));
    log('Found', messages.length, 'message containers');

    messages.forEach(msg => {
      if (shouldSkipElement(msg)) return;
      msg.querySelectorAll(CONFIG.CONTENT_SELECTORS).forEach(applyRTL);
      applyRTL(msg);
    });

    if (messages.length === 0) {
      warn('No message containers found! Falling back to generic scan.');
      const chatContainers = root.querySelectorAll(CONFIG.SEARCH_ROOT_SELECTORS);
      const searchRoots = chatContainers.length > 0 ? Array.from(chatContainers) : [root];
      searchRoots.forEach(container => {
        container.querySelectorAll(CONFIG.CONTENT_SELECTORS).forEach(el => {
          if (containsArabic(el.textContent)) applyRTL(el);
        });
      });
    }

    let inputBox = null;
    for (const sel of CONFIG.INPUT_SELECTORS) {
      inputBox = document.querySelector(sel);
      if (inputBox) break;
    }

    if (inputBox) {
      const text = inputBox.textContent || '';
      if (containsArabic(text)) {
        inputBox.classList.add('claude-rtl-pro--input-rtl');
      } else {
        inputBox.classList.remove('claude-rtl-pro--input-rtl');
      }
    }
  }

  function onMutations() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      walkAndApply(getChatContainer());
    }, CONFIG.DEBOUNCE_MS);
  }

  function stopObserver() {
    if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
    if (observer) { observer.disconnect(); }
    log('MutationObserver stopped');
  }

  async function loadSettings() {
    try {
      const result = await chrome.storage.local.get(['claudeRtlEnabled']);
      isEnabled = result.claudeRtlEnabled !== false;
      log('Settings loaded, enabled:', isEnabled);
    } catch (e) {
      warn('Storage access failed:', e.message);
      isEnabled = true;
    }
    refresh();
  }

  function refresh() {
    if (!document.body) {
      warn('document.body not ready during refresh');
      setTimeout(refresh, 100);
      return;
    }

    if (isEnabled) {
      document.body.classList.add('claude-rtl-pro--active');
      startObserver();
      walkAndApply(getChatContainer());
    } else {
      document.body.classList.remove('claude-rtl-pro--active');
      stopObserver();
      document.querySelectorAll('.claude-rtl-pro--rtl').forEach(removeRTL);
      document.querySelectorAll('.claude-rtl-pro--input-rtl').forEach(el => el.classList.remove('claude-rtl-pro--input-rtl'));
    }
  }

  function cleanup() {
    stopObserver();
    if (document.body) {
      document.body.classList.remove('claude-rtl-pro--active');
    }
    document.querySelectorAll('.claude-rtl-pro--rtl').forEach(removeRTL);
    document.querySelectorAll('.claude-rtl-pro--input-rtl').forEach(el => el.classList.remove('claude-rtl-pro--input-rtl'));
  }

  function getChatContainer() {
    for (const sel of CONFIG.SEARCH_ROOT_SELECTORS) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return document.body;
  }

  function startObserver() {
    if (!document.body) {
      warn('document.body not ready, retrying in 100ms');
      setTimeout(startObserver, 100);
      return;
    }
    if (!observer) observer = new MutationObserver(onMutations);
    const target = getChatContainer();
    observer.observe(target, CONFIG.OBSERVER_CONFIG);
    log('MutationObserver started on', target.tagName, target.className);
  }

  function handleDirectToggle(message) {
    if (message.action === 'toggle') {
      isEnabled = message.enabled;
      log('Direct toggle:', isEnabled);
      refresh();
    }
  }

  function initBrowser() {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.claudeRtlEnabled) {
        isEnabled = changes.claudeRtlEnabled.newValue;
        log('Storage changed, enabled:', isEnabled);
        refresh();
      }
    });

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'getState') {
        sendResponse({ enabled: isEnabled });
      } else if (message.action === 'toggle') {
        handleDirectToggle(message);
        sendResponse({ enabled: isEnabled });
      }
    });

    chrome.commands.onCommand.addListener((command) => {
      if (command === 'toggle-rtl') {
        isEnabled = !isEnabled;
        chrome.storage.local.set({ claudeRtlEnabled: isEnabled });
        refresh();
      }
    });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', loadSettings);
    } else {
      loadSettings();
    }
  }

  return {
    CONFIG,
    containsArabic,
    shouldSkipElement,
    applyRTL,
    removeRTL,
    walkAndApply,
    loadSettings,
    refresh,
    startObserver,
    stopObserver,
    cleanup,
    initBrowser,
    get isEnabled() { return isEnabled; },
    set isEnabled(v) { isEnabled = v; },
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = RTLPro;
}

if (typeof window !== 'undefined' && typeof module === 'undefined') {
  RTLPro.initBrowser();
}
