# Smart Autofill

A Chrome extension that stores your personal profile locally and intelligently fills job application forms across any website.

All data is stored in `chrome.storage.local` - nothing leaves your browser and no external requests are made.

---

## How to Load in Chrome

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `smart-autofill-extension` folder
5. The extension icon appears in your toolbar

---

## First-Time Setup

Click the extension icon to open the popup. Fill in your profile fields and click **Save Profile**. You only need to do this once.

---

## Using the Extension

- Click the extension icon then **Fill This Page**
- Or press `Ctrl+Shift+F` (Windows/Linux) or `Cmd+Shift+F` (Mac)

After filling, the popup shows how many fields were detected and filled.

---

## Profile Fields

First/Last/Full Name, Email, Phone, Address, LinkedIn, GitHub, Website, University, Degree, Major, Graduation Date, GPA, Current Job Title, Target Job Title, Years of Experience, Authorized to Work in US, Require Visa Sponsorship, Salary Expectation, Availability, Pronouns, Bio.

---

## Field Detection

1. Checks the `autocomplete` attribute
2. Reads `name`, `id`, `placeholder`, `aria-label`, `data-*` attributes
3. Reads the associated label element text
4. Reads nearby sibling elements that act as visual labels
5. Scores all collected text against keyword dictionaries

---

## Supported Form Types

- Standard HTML inputs, textareas, selects
- Radio buttons and checkboxes
- Shadow DOM (Workday, custom components)
- Same-origin iframes
- React, Angular, Vue controlled inputs
- Multi-step forms via MutationObserver

---

## Known Limitations

- Cross-origin iframes: browser blocks access by design
- Custom JS dropdowns may need manual interaction
- File upload fields are skipped intentionally
- CAPTCHAs are detected and skipped

---

## File Structure

```
smart-autofill-extension/
  manifest.json
  content.js
  popup.html
  popup.js
  background.js
  icons/
  .gitignore
  README.md
```
