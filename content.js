// content.js - Smart Autofill Content Script
// Runs on every page. Listens for fill commands from the popup or background.
// All field detection and value writing happens here.

'use strict';

// ============================================================
// KEYWORD MAPS
// Each profile key maps to an array of detection keywords.
// Keywords are matched against the combined hints string built
// from name, id, placeholder, label text, aria-label, etc.
// Longer matches score higher, which helps resolve ambiguity.
// ============================================================

const FIELD_KEYWORDS = {
  firstName: [
    'first name', 'firstname', 'given name', 'fname', 'first_name', 'forename', 'first nm',
  ],
  lastName: [
    'last name', 'lastname', 'surname', 'lname', 'last_name', 'family name', 'last nm',
  ],
  fullName: [
    'full name', 'fullname', 'full_name', 'legal name', 'applicant name', 'candidate name',
    'your name',
  ],
  email: [
    'email address', 'email addr', 'e-mail address', 'e_mail', 'email', 'e-mail',
    'confirm email', 'verify email',
  ],
  phone: [
    'phone number', 'telephone number', 'mobile number', 'cell number', 'contact number',
    'phone', 'telephone', 'mobile', 'cell',
  ],
  street: [
    'street address', 'address line 1', 'address line1', 'address1', 'mailing address',
    'street', 'addr1',
  ],
  city: [
    'city', 'town', 'municipality', 'city/town',
  ],
  state: [
    'state/province', 'state / province', 'province/state', 'state or province',
    'state', 'province', 'region',
  ],
  zip: [
    'zip code', 'postal code', 'post code', 'zip/postal', 'postcode', 'zip', 'postal',
  ],
  country: [
    'country of residence', 'country name', 'country', 'nation',
  ],
  linkedin: [
    'linkedin url', 'linkedin profile', 'linked in url', 'linkedin link', 'linkedin',
    'linked-in', 'linked in',
  ],
  github: [
    'github url', 'github profile', 'github link', 'git hub url', 'github', 'git hub',
  ],
  website: [
    'personal website', 'personal site', 'portfolio url', 'portfolio link', 'personal url',
    'website url', 'portfolio website', 'portfolio', 'website',
  ],
  university: [
    'university name', 'school name', 'college name', 'institution name', 'alma mater',
    'university', 'school', 'college', 'institution',
  ],
  degree: [
    'degree type', 'degree level', 'highest degree', 'education level', 'qualification',
    'degree',
  ],
  major: [
    'field of study', 'area of study', 'area of concentration', 'major field',
    'concentration', 'discipline', 'subject', 'major',
  ],
  graduationDate: [
    'graduation date', 'grad date', 'expected graduation', 'graduation year',
    'date of graduation', 'graduated', 'graduation',
  ],
  gpa: [
    'grade point average', 'grade point', 'cumulative gpa', 'gpa',
  ],
  currentJobTitle: [
    'current job title', 'current position', 'current role', 'current title',
    'present job title', 'job title', 'title',
  ],
  targetJobTitle: [
    'desired job title', 'desired position', 'desired role', 'target job title',
    'position of interest', 'applying for position', 'position applying for',
  ],
  yearsExperience: [
    'years of experience', 'years of relevant experience', 'total years experience',
    'years experience', 'total experience', 'experience years',
    'how many years of experience',
  ],
  authorizedToWork: [
    'authorized to work in the united states', 'legally authorized to work',
    'authorized to work in the us', 'work authorization', 'work eligibility',
    'authorized to work', 'eligible to work', 'legally eligible',
  ],
  requireSponsorship: [
    'require visa sponsorship', 'require sponsorship', 'need visa sponsorship',
    'need sponsorship', 'will you require sponsorship', 'visa sponsorship required',
    'sponsorship required', 'sponsorship', 'visa',
  ],
  salaryExpectation: [
    'desired salary', 'expected salary', 'salary expectation', 'salary requirement',
    'pay expectation', 'desired compensation', 'compensation expectation',
    'salary', 'compensation', 'pay',
  ],
  availability: [
    'earliest start date', 'available start date', 'when can you start',
    'start date availability', 'availability date', 'start date', 'availability',
    'available',
  ],
  pronouns: [
    'preferred pronouns', 'gender pronouns', 'pronouns',
  ],
  bio: [
    'tell us about yourself', 'tell us more about yourself', 'describe yourself',
    'about yourself', 'cover letter', 'personal statement', 'professional summary',
    'executive summary', 'about me', 'bio', 'summary', 'about',
  ],
};

// Maps the autocomplete attribute value directly to a profile key.
// This is the most reliable signal when present.
const AUTOCOMPLETE_MAP = {
  'given-name':         'firstName',
  'additional-name':    'firstName',
  'family-name':        'lastName',
  'name':               'fullName',
  'email':              'email',
  'tel':                'phone',
  'tel-national':       'phone',
  'street-address':     'street',
  'address-line1':      'street',
  'address-level2':     'city',
  'address-level1':     'state',
  'postal-code':        'zip',
  'country-name':       'country',
  'country':            'country',
  'url':                'website',
  'organization-title': 'currentJobTitle',
  'bday':               'availability',
};

// Input types and element patterns to skip entirely.
const SKIP_INPUT_TYPES = new Set([
  'file', 'submit', 'reset', 'button', 'image', 'hidden', 'color', 'range',
]);

// Keywords that indicate a CAPTCHA or human-verification field.
const CAPTCHA_CLUES = [
  'captcha', 'recaptcha', 'hcaptcha', 'i am not a robot', 'not a robot',
  'human verification', 'bot detection',
];

// Minimum score to consider a keyword match valid.
// Prevents filling unrelated fields based on coincidental short word matches.
const MIN_SCORE = 4;

// ============================================================
// MESSAGE LISTENER
// Receives fill or ping requests from popup.js or background.js.
// ============================================================

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'fill') {
    chrome.storage.local.get(['profile', 'enabled'], (data) => {
      if (data.enabled === false) {
        sendResponse({ filled: 0, detected: 0, disabled: true });
        return;
      }
      const result = fillPage(data.profile || {});
      sendResponse(result);
    });
    return true; // keeps the message channel open for async response
  }

  if (msg.action === 'ping') {
    sendResponse({ alive: true });
    return true;
  }
});

// ============================================================
// FILL ORCHESTRATOR
// Collects all fillable elements, classifies them, fills them.
// Installs a MutationObserver to catch dynamically added fields.
// ============================================================

function fillPage(profile) {
  const fields = collectFields(document);
  let filledCount = 0;
  let detectedCount = 0;

  for (const { element, hints } of fields) {
    const key = detectFieldKey(hints, element);
    if (!key) continue;

    detectedCount++;

    const value = resolveValue(key, profile, element);
    if (value === null || value === undefined || String(value).trim() === '') continue;

    const ok = fillElement(element, value, key);
    if (ok) filledCount++;
  }

  // Watch for new fields loaded after step transitions or country/state cascades.
  watchDynamicFields(profile);

  return {
    filled: filledCount,
    detected: detectedCount,
    total: fields.length,
  };
}

// ============================================================
// DOM TRAVERSAL
// Recursively walks the entire DOM, including:
//   - Shadow roots (pierced manually)
//   - Same-origin iframes (cross-origin are caught and skipped)
// Returns an array of { element, hints } objects.
// ============================================================

function collectFields(root) {
  const results = [];
  const seen = new WeakSet();

  function visit(node) {
    if (!node || seen.has(node)) return;
    seen.add(node);

    const tag = node.tagName;

    if (!tag) {
      // Document fragment or shadow root - walk its children
      if (node.children) {
        for (const child of node.children) visit(child);
      }
      return;
    }

    // Recurse into shadow DOM
    if (node.shadowRoot) {
      visit(node.shadowRoot);
    }

    // Recurse into same-origin iframes
    if (tag === 'IFRAME') {
      try {
        const doc = node.contentDocument;
        if (doc && doc.body) {
          visitChildren(doc.body);
        }
      } catch (_e) {
        // Cross-origin iframe - browser blocks access, skip silently.
      }
    }

    // Check if this node is a fillable form element
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      if (!seen.has(node)) {
        seen.add(node);
        if (!shouldSkipElement(node)) {
          results.push({ element: node, hints: collectHints(node) });
        }
      }
    }

    visitChildren(node);
  }

  function visitChildren(parent) {
    if (!parent.children) return;
    for (const child of parent.children) {
      visit(child);
    }
  }

  visitChildren(root.body || root);
  return results;
}

// ============================================================
// SKIP LOGIC
// Returns true if the element should not be filled.
// ============================================================

function shouldSkipElement(el) {
  const type = (el.type || 'text').toLowerCase();

  if (SKIP_INPUT_TYPES.has(type)) return true;
  if (el.disabled) return true;
  if (el.readOnly) return true;

  // Skip if hidden via aria or style
  if (el.getAttribute('aria-hidden') === 'true') return true;
  if (el.closest('[aria-hidden="true"]')) return true;

  // Skip CAPTCHA containers by checking surrounding text and class names
  const contextText = getQuickHintText(el).toLowerCase();
  if (CAPTCHA_CLUES.some((clue) => contextText.includes(clue))) return true;

  // Skip elements with display:none or visibility:hidden
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return true;

  return false;
}

// ============================================================
// HINT COLLECTION
// Gathers every text clue associated with the element to use
// as raw material for keyword matching.
// ============================================================

function collectHints(el) {
  const parts = [];

  const add = (v) => {
    if (v && typeof v === 'string' && v.trim()) {
      parts.push(v.toLowerCase().trim());
    }
  };

  // Direct attributes
  add(el.name);
  add(el.id);
  add(el.getAttribute('autocomplete'));
  add(el.placeholder);
  add(el.getAttribute('aria-label'));
  add(el.getAttribute('data-field'));
  add(el.getAttribute('data-name'));
  add(el.getAttribute('data-label'));
  add(el.getAttribute('data-placeholder'));
  add(el.title);
  add(el.className);

  // Label element connected via the for= attribute
  const root = el.getRootNode();
  if (el.id) {
    try {
      const label = root.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label) add(label.textContent);
    } catch (_e) {}
  }

  // aria-labelledby - resolves to another element's text
  const labelledby = el.getAttribute('aria-labelledby');
  if (labelledby) {
    try {
      const labelEl = root.querySelector(`#${CSS.escape(labelledby)}`);
      if (labelEl) add(labelEl.textContent);
    } catch (_e) {}
  }

  // Wrapping label element
  const parentLabel = el.closest('label');
  if (parentLabel) add(parentLabel.textContent);

  // Sibling elements that commonly serve as visual labels
  const parent = el.parentElement;
  if (parent) {
    for (const sibling of parent.children) {
      if (sibling === el) continue;
      const sibTag = sibling.tagName;
      if (['LABEL', 'SPAN', 'DIV', 'P', 'LEGEND', 'H1', 'H2', 'H3', 'H4', 'STRONG', 'B', 'EM'].includes(sibTag)) {
        const text = sibling.textContent.trim();
        // Only add short strings - long ones are probably content, not labels
        if (text.length > 0 && text.length < 120) add(text);
      }
    }

    // Grandparent fieldset legend (common in radio/checkbox groups)
    const gp = parent.parentElement;
    if (gp) {
      const legend = gp.querySelector(':scope > legend');
      if (legend) add(legend.textContent);
      // Also check one more level up for deeply nested radio groups
      const ggp = gp.parentElement;
      if (ggp) {
        const legend2 = ggp.querySelector(':scope > legend');
        if (legend2) add(legend2.textContent);
      }
    }
  }

  return parts.join(' ');
}

// Lightweight version used only for CAPTCHA detection - no DOM traversal.
function getQuickHintText(el) {
  return [
    el.name, el.id, el.placeholder,
    el.getAttribute('aria-label'), el.getAttribute('class'),
  ].filter(Boolean).join(' ');
}

// ============================================================
// FIELD KEY DETECTION
// Scores the hints string against each keyword list.
// Returns the profile key with the highest score, or null.
// ============================================================

function detectFieldKey(hints, el) {
  // Autocomplete attribute is the strongest signal - trust it first.
  const autocomplete = (el.getAttribute('autocomplete') || '').toLowerCase().trim();
  if (AUTOCOMPLETE_MAP[autocomplete]) return AUTOCOMPLETE_MAP[autocomplete];

  const hintsLower = hints.toLowerCase();
  let bestKey = null;
  let bestScore = 0;

  for (const [key, keywords] of Object.entries(FIELD_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (hintsLower.includes(kw)) {
        // Longer keyword = more specific = higher score.
        score += kw.length;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestKey = key;
    }
  }

  return bestScore >= MIN_SCORE ? bestKey : null;
}

// ============================================================
// VALUE RESOLUTION
// Maps a profile key to the value that should be written,
// applying phone formatting, date formatting, and name splitting.
// ============================================================

function resolveValue(key, profile, el) {
  const p = profile;

  switch (key) {
    case 'firstName':
      if (p.firstName) return p.firstName;
      if (p.fullName) return p.fullName.split(' ')[0] || '';
      return '';

    case 'lastName':
      if (p.lastName) return p.lastName;
      if (p.fullName) {
        const parts = p.fullName.split(' ');
        return parts.length > 1 ? parts.slice(1).join(' ') : '';
      }
      return '';

    case 'fullName':
      if (p.fullName) return p.fullName;
      return [p.firstName, p.lastName].filter(Boolean).join(' ');

    case 'email':           return p.email || '';
    case 'phone':           return formatPhone(p.phone || '', el);
    case 'street':          return p.street || '';
    case 'city':            return p.city || '';
    case 'state':           return p.state || '';
    case 'zip':             return p.zip || '';
    case 'country':         return p.country || '';
    case 'linkedin':        return p.linkedin || '';
    case 'github':          return p.github || '';
    case 'website':         return p.website || '';
    case 'university':      return p.university || '';
    case 'degree':          return p.degree || '';
    case 'major':           return p.major || '';
    case 'graduationDate':  return formatDateField(p.graduationDate || '', el);
    case 'gpa':             return p.gpa || '';
    case 'currentJobTitle': return p.currentJobTitle || '';
    case 'targetJobTitle':  return p.targetJobTitle || '';
    case 'yearsExperience': return p.yearsExperience || '';
    case 'authorizedToWork':    return p.authorizedToWork || '';
    case 'requireSponsorship':  return p.requireSponsorship || '';
    case 'salaryExpectation':   return p.salaryExpectation || '';
    case 'availability':    return formatDateField(p.availability || '', el);
    case 'pronouns':        return p.pronouns || '';
    case 'bio':             return p.bio || '';
    default:                return '';
  }
}

// ============================================================
// FILL DISPATCHER
// Routes to the correct strategy based on element type.
// ============================================================

function fillElement(el, value, key) {
  try {
    const tag = el.tagName;
    const type = (el.type || 'text').toLowerCase();

    if (tag === 'SELECT') {
      return fillSelect(el, value);
    }
    if (type === 'radio') {
      return fillRadio(el, value, key);
    }
    if (type === 'checkbox') {
      return fillCheckbox(el, value);
    }
    // All text-like inputs and textareas
    if (
      tag === 'TEXTAREA' ||
      ['text', 'email', 'tel', 'url', 'number', 'search', 'password', ''].includes(type)
    ) {
      return fillText(el, value);
    }
    return false;
  } catch (_e) {
    return false;
  }
}

// ============================================================
// TEXT INPUT / TEXTAREA
// Uses the native prototype setter so React, Angular, and Vue
// detect the change through their synthetic event system.
// A plain el.value = x assignment bypasses framework state.
// ============================================================

function fillText(el, value) {
  try {
    const proto =
      el.tagName === 'TEXTAREA'
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;

    const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;

    if (nativeSetter) {
      nativeSetter.call(el, value);
    } else {
      el.value = value;
    }

    // Dispatch events so framework-controlled inputs register the change.
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur',   { bubbles: true }));

    return true;
  } catch (_e) {
    return false;
  }
}

// ============================================================
// SELECT ELEMENT
// Finds the best-matching option by comparing the profile value
// against each option's visible text and value attribute.
// Uses a tiered scoring system to handle abbreviations
// (e.g. "CA" matching "California").
// ============================================================

function fillSelect(el, value) {
  if (!value) return false;
  const valueLower = value.toLowerCase().trim();

  let bestOption = null;
  let bestScore = 0;

  for (const option of el.options) {
    const optText  = option.text.toLowerCase().trim();
    const optValue = option.value.toLowerCase().trim();

    let score = 0;

    if (optText === valueLower || optValue === valueLower) {
      score = 100; // exact match
    } else if (optText.startsWith(valueLower) || valueLower.startsWith(optText)) {
      score = 60;
    } else if (optText.includes(valueLower) || valueLower.includes(optText)) {
      score = 40;
    } else if (optValue.includes(valueLower) || valueLower.includes(optValue)) {
      score = 30;
    }

    if (score > bestScore) {
      bestScore = score;
      bestOption = option;
    }
  }

  if (bestOption && bestScore > 0) {
    el.value = bestOption.value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur',   { bubbles: true }));
    return true;
  }

  return false;
}

// ============================================================
// RADIO BUTTONS
// Finds all radios with the same name attribute, then selects
// the one whose label best matches the profile value.
// Handles yes/no fields (authorized to work, sponsorship) with
// extra logic so "Yes" / "No" map correctly.
// ============================================================

function fillRadio(el, value, key) {
  const name = el.name;
  if (!name) return false;

  const valueLower = String(value).toLowerCase().trim();

  // Find the containing form or shadow root to scope the query
  const context = el.closest('form') || el.getRootNode();
  let radios;
  try {
    radios = context.querySelectorAll(`input[type="radio"][name="${CSS.escape(name)}"]`);
  } catch (_e) {
    return false;
  }

  let bestRadio = null;
  let bestScore = 0;

  const isYesValue = ['yes', 'true', '1', 'y'].includes(valueLower);
  const isNoValue  = ['no', 'false', '0', 'n'].includes(valueLower);

  for (const radio of radios) {
    const labelText = (getLabelText(radio, context) || radio.value || '').toLowerCase();

    let score = 0;

    if (labelText === valueLower || radio.value.toLowerCase() === valueLower) {
      score = 100;
    } else if (labelText.includes(valueLower)) {
      score = 50;
    }

    // Special handling for boolean-like profile fields
    if (key === 'authorizedToWork' || key === 'requireSponsorship') {
      const YES_CLUES = ['yes', 'true', 'i am', 'authorized', 'i will not', 'eligible'];
      const NO_CLUES  = ['no', 'false', 'not authorized', 'not eligible', 'i require', 'i will require', 'i need'];

      if (isYesValue && YES_CLUES.some((c) => labelText.includes(c))) score = Math.max(score, 80);
      if (isNoValue  && NO_CLUES.some((c) => labelText.includes(c)))  score = Math.max(score, 80);

      // For requireSponsorship: "Yes I need sponsorship" should map to "yes" value
      if (key === 'requireSponsorship') {
        if (isYesValue && ['require', 'need', 'will require', 'will need'].some((c) => labelText.includes(c))) score = Math.max(score, 80);
        if (isNoValue  && ['not require', 'not need', 'no sponsorship'].some((c) => labelText.includes(c))) score = Math.max(score, 80);
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestRadio = radio;
    }
  }

  if (bestRadio && bestScore > 0) {
    bestRadio.checked = true;
    bestRadio.dispatchEvent(new Event('change', { bubbles: true }));
    bestRadio.dispatchEvent(new Event('click',  { bubbles: true, cancelable: true }));
    return true;
  }

  return false;
}

// ============================================================
// CHECKBOX
// Checks or unchecks based on whether the profile value is truthy.
// ============================================================

function fillCheckbox(el, value) {
  const valueLower = String(value).toLowerCase().trim();
  const shouldCheck = ['yes', 'true', '1', 'y', 'checked', 'on'].includes(valueLower);

  if (el.checked !== shouldCheck) {
    el.checked = shouldCheck;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('click',  { bubbles: true, cancelable: true }));
  }
  return true;
}

// ============================================================
// LABEL TEXT LOOKUP
// Checks for-attribute labels, wrapping labels, and nearby text.
// Used by radio fill logic to find the human-readable option label.
// ============================================================

function getLabelText(el, context) {
  if (el.id) {
    try {
      const label = context.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label) return label.textContent.trim();
    } catch (_e) {}
  }

  const parentLabel = el.closest('label');
  if (parentLabel) return parentLabel.textContent.trim();

  // Check next sibling or parent sibling for label-like text
  const sibling = el.nextElementSibling;
  if (sibling && ['LABEL', 'SPAN', 'DIV'].includes(sibling.tagName)) {
    return sibling.textContent.trim();
  }

  return el.value || '';
}

// ============================================================
// PHONE FORMATTING
// Detects the expected format from placeholder or maxlength,
// then formats the stored phone number to match.
// ============================================================

function formatPhone(rawPhone, el) {
  if (!rawPhone) return '';

  const digits = rawPhone.replace(/\D/g, '');
  if (!digits) return rawPhone;

  const d10 = digits.slice(-10); // last 10 digits
  const placeholder = (el.placeholder || '').toLowerCase();
  const maxLen = el.maxLength;

  // International format: +15555555555
  if (placeholder.includes('+1') || (placeholder.startsWith('+') && !placeholder.includes('('))) {
    return `+1${d10}`;
  }

  // With leading country code but no plus: 15555555555
  if (maxLen === 11) {
    return `1${d10}`;
  }

  // Parenthesis format: (555) 555-5555
  if (placeholder.includes('(') || placeholder.match(/\(\d/)) {
    return `(${d10.slice(0, 3)}) ${d10.slice(3, 6)}-${d10.slice(6)}`;
  }

  // Dot-separated: 555.555.5555
  if (placeholder.includes('.') && placeholder.match(/\d\.\d/)) {
    return `${d10.slice(0, 3)}.${d10.slice(3, 6)}.${d10.slice(6)}`;
  }

  // Default: dash-separated 555-555-5555
  return `${d10.slice(0, 3)}-${d10.slice(3, 6)}-${d10.slice(6)}`;
}

// ============================================================
// DATE FORMATTING
// Detects the expected date format from placeholder, data-format,
// or field name hints, then converts the stored date string.
// ============================================================

function formatDateField(rawDate, el) {
  if (!rawDate) return '';

  const placeholder = (el.placeholder || '').toUpperCase().replace(/\s+/g, '');
  const dataFmt     = (el.getAttribute('data-format') || '').toUpperCase().replace(/\s+/g, '');
  const combined    = placeholder + ' ' + dataFmt;

  let targetFormat = 'MM/DD/YYYY'; // US default

  if (/YYYY[-\/]MM[-\/]DD/.test(combined)) {
    targetFormat = 'YYYY-MM-DD';
  } else if (/DD[-\/]MM[-\/]YYYY/.test(combined)) {
    targetFormat = 'DD/MM/YYYY';
  } else if (/MM[-\/]DD[-\/]YYYY/.test(combined)) {
    targetFormat = 'MM/DD/YYYY';
  } else if (/MMMM|MONTHYYYY|MONTH/.test(combined)) {
    targetFormat = 'Month YYYY';
  } else if (/^\s*YYYY\s*$/.test(combined) || /YEAR/.test(combined)) {
    targetFormat = 'YYYY';
  }

  return convertDate(rawDate, targetFormat);
}

// Parses a date string into components and reformats it.
// Accepts YYYY-MM-DD, MM/DD/YYYY, or 4-digit year-only strings.
function convertDate(raw, targetFormat) {
  if (!raw) return '';

  let year, month, day;

  const iso  = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const us   = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const yrMo = raw.match(/^(\d{4})-(\d{2})$/);
  const yr   = raw.match(/^(\d{4})$/);

  if (iso)  { [, year, month, day] = iso; }
  else if (us)   { [, month, day, year] = us; }
  else if (yrMo) { year = yrMo[1]; month = yrMo[2]; day = '01'; }
  else if (yr)   { year = yr[1]; month = '01'; day = '01'; }
  else return raw; // unrecognized - pass through as-is

  const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');

  switch (targetFormat) {
    case 'MM/DD/YYYY': return `${mm}/${dd}/${year}`;
    case 'YYYY-MM-DD': return `${year}-${mm}-${dd}`;
    case 'DD/MM/YYYY': return `${dd}/${mm}/${year}`;
    case 'Month YYYY': return `${MONTHS[parseInt(month, 10) - 1]} ${year}`;
    case 'YYYY':       return String(year);
    default:           return raw;
  }
}

// ============================================================
// MUTATION OBSERVER
// After the initial fill pass, watches for new fields that
// appear due to step transitions or dependent field reveals
// (e.g. the State dropdown that appears after Country is set).
// Re-runs fillPage with a debounce to avoid hammering the DOM.
// Disconnects after 5 minutes or 5 fill cycles.
// ============================================================

function watchDynamicFields(profile) {
  let debounceTimer = null;
  let fillCycles = 0;
  const MAX_CYCLES = 5;

  const observer = new MutationObserver((mutations) => {
    const hasNewFormElements = mutations.some((m) =>
      [...m.addedNodes].some((n) => {
        if (n.nodeType !== 1) return false;
        const tag = n.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
        if (n.querySelector) return n.querySelector('input, textarea, select') !== null;
        return false;
      })
    );

    if (!hasNewFormElements) return;

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      fillPage(profile);
      fillCycles++;
      if (fillCycles >= MAX_CYCLES) observer.disconnect();
    }, 700);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Hard stop after 5 minutes regardless of cycle count
  setTimeout(() => observer.disconnect(), 300000);
}
