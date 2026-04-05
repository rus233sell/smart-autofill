// background.js - Service Worker
// Handles the Ctrl+Shift+F keyboard command.
// Sends a fill message to the active tab's content script.
// If the content script is not present, injects it first.

'use strict';

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'fill-page') return;

  let tab;
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = tabs[0];
  } catch (_e) {
    return;
  }

  if (!tab || !tab.id) return;

  // Skip extension pages and browser internal URLs
  const url = tab.url || '';
  if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('about:')) {
    return;
  }

  let response;

  try {
    // Attempt to reach the content script already running on the page
    response = await chrome.tabs.sendMessage(tab.id, { action: 'fill' });
  } catch (_e) {
    // Content script missing - inject it, then retry once
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: ['content.js'],
      });
      // Brief pause to let the script register its message listener
      await new Promise((r) => setTimeout(r, 150));
      response = await chrome.tabs.sendMessage(tab.id, { action: 'fill' });
    } catch (injectErr) {
      // Cannot inject on this page type (e.g. PDF viewer, store page)
      console.warn('Smart Autofill: could not inject on this page.', injectErr.message);
      return;
    }
  }

  // Store the last fill result so the popup can display it on next open
  if (response) {
    chrome.storage.local.set({ lastFillResult: response });
  }
});
