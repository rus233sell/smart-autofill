// popup.js - Popup UI logic
// Handles loading and saving the profile, triggering fills,
// and displaying the fill result count.

'use strict';

// All field keys that map to form inputs in popup.html
const FIELD_KEYS = [
  'firstName', 'lastName', 'fullName', 'pronouns',
  'email', 'phone',
  'street', 'city', 'state', 'zip', 'country',
  'linkedin', 'github', 'website',
  'university', 'degree', 'major', 'graduationDate', 'gpa',
  'currentJobTitle', 'targetJobTitle', 'yearsExperience',
  'authorizedToWork', 'requireSponsorship', 'salaryExpectation', 'availability',
  'bio',
];

document.addEventListener('DOMContentLoaded', () => {
  loadProfile();
  loadToggleState();
  document.getElementById('save-btn').addEventListener('click', saveProfile);
  document.getElementById('fill-btn').addEventListener('click', triggerFill);
  document.getElementById('enabled-toggle').addEventListener('change', onToggleChange);
});

function loadProfile() {
  chrome.storage.local.get('profile', (data) => {
    const profile = data.profile || {};
    for (const key of FIELD_KEYS) {
      const el = document.getElementById(`f-${key}`);
      if (!el) continue;
      if (profile[key] !== undefined && profile[key] !== null) el.value = profile[key];
    }
  });
}

function loadToggleState() {
  chrome.storage.local.get('enabled', (data) => {
    const enabled = data.enabled !== false;
    const toggle = document.getElementById('enabled-toggle');
    toggle.checked = enabled;
    updateToggleLabel(enabled);
  });
}

function onToggleChange(e) {
  const enabled = e.target.checked;
  chrome.storage.local.set({ enabled });
  updateToggleLabel(enabled);
}

function updateToggleLabel(enabled) {
  const label = document.getElementById('toggle-label');
  if (label) label.textContent = enabled ? 'On' : 'Off';
}

function saveProfile() {
  const profile = {};
  for (const key of FIELD_KEYS) {
    const el = document.getElementById(`f-${key}`);
    if (!el) continue;
    profile[key] = el.value.trim();
  }
  chrome.storage.local.set({ profile }, () => { showSaveConfirmation(); });
}

function showSaveConfirmation() {
  const status = document.getElementById('save-status');
  status.classList.add('visible');
  setTimeout(() => status.classList.remove('visible'), 2000);
}

async function triggerFill() {
  const fillBtn = document.getElementById('fill-btn');
  fillBtn.disabled = true;
  setFillResult('Filling...', '');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) { setFillResult('No active tab found.', 'warn'); fillBtn.disabled = false; return; }
    let response;
    try {
      response = await chrome.tabs.sendMessage(tab.id, { action: 'fill' });
    } catch (_e) {
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
        await sleep(150);
        response = await chrome.tabs.sendMessage(tab.id, { action: 'fill' });
      } catch (injectErr) { setFillResult('Cannot access this page.', 'warn'); fillBtn.disabled = false; return; }
    }
    if (!response) { setFillResult('No response from page.', 'warn'); }
    else if (response.disabled) { setFillResult('Autofill is disabled.', 'warn'); }
    else {
      const { filled, detected } = response;
      setFillResult(`Filled ${filled} of ${detected} detected fields`, filled > 0 ? 'success' : 'warn');
    }
  } catch (err) { setFillResult('Error: ' + err.message, 'warn'); }
  fillBtn.disabled = false;
}

function setFillResult(text, cls) {
  const el = document.getElementById('fill-result');
  el.textContent = text;
  el.className = 'fill-result' + (cls ? ` ${cls}` : '');
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
