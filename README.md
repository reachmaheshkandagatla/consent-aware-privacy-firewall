# Consent-Aware Privacy Firewall (Chrome Extension)

A Manifest V3 Chrome extension that scans text typed into web editors (ChatGPT composer and other editors) for potentially sensitive information and consent-related language. All scanning is performed locally — no prompt text is sent to remote servers. The extension provides an inline shield and panel to inspect and mask sensitive values, a SPA dashboard for audits and settings, and a configurable detector.

## Features
- Real-time local scanning of editor text using `window.ConsentDetector`.
- Floating draggable shield with persistent position.
- Inline panel with actions: "Mask Personal Info" and "Keep Original".
- Default masking preserves health terms so users can discuss health topics while personal identifiers are redacted.
- Demo attachment scanning for PDF and DOCX uploads, processed locally in the browser.
- DOCX extraction supports standard central-directory and data-descriptor ZIP layouts produced by Word-compatible editors.
- PDF extraction scans both plain and common Flate-compressed text streams.
- A rolling window of 25 local audit logs and metrics stored in `chrome.storage.local`.
- Dashboard risk chart and aggregate most-common-entity analytics for quick demo interpretation.
- Dashboard scan metrics update only when editor content changes; page refreshes and duplicate browser events do not create scans.
- Typing is recorded once after 15 seconds of inactivity; empty editors remain black and are not logged as scans.
- Generic labeled names, student IDs, account references, API keys, and access tokens are masked locally.
- Assignment-style secret variables and textual DOB formats such as `16-june-1988` are detected; an empty editor uses a black shield.
- The floating shield is automatically kept inside the visible viewport when the browser is resized.
- Configurable detection patterns (`caf_patterns`) and policies via the dashboard.

## Quick install (Developer mode)
1. Open `chrome://extensions` in Chrome/Edge.
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked** and select the repository folder `Consent-Guardian/consent-aware-privacy-firewall-extension`.
4. Reload the target page (e.g., ChatGPT) and ensure the extension is enabled.

## Run locally
This project is a browser extension, so there is no `npm start` dev server. To run it locally, install dependencies, run the regression tests, then load the unpacked extension into Chrome or Edge.

From the repository root:

```bash
cd /path/to/Consent-Guardian
npm install
npm test
```

To launch Chrome with the extension loaded directly:

```bash
google-chrome \
  --user-data-dir=/tmp/consent-guardian-chrome \
  --load-extension=/path/to/Consent-Guardian/consent-aware-privacy-firewall-extension \
  https://chatgpt.com/
```

If `google-chrome` is not available on your system, open Chrome or Edge manually and use the unpacked extension flow above. Select this folder when prompted:

```text
/path/to/Consent-Guardian/consent-aware-privacy-firewall-extension
```

## Quick test checklist
- Type or paste a prompt containing an email, phone number, or other PII.
- The floating shield should appear near the editor.
- Drag the shield to a new position and reload the page — the shield should persist.
- Click the shield to open the panel and press **Mask Personal Info** — personal identifiers should be masked in the editor while detected health terms remain readable by default.
- Attach or drag a small PDF/DOCX containing PII — a local attachment warning should appear with detected entity types. The demo warns only; it does not rewrite uploaded files.
- Double-click the shield to open the dashboard (`dashboard/dashboard.html`) and inspect recent audits and counters.

## Developer notes
- Main content script: `src/content.js`
- Detector implementation: `src/detector.js`
- Masking helper: `src/masker.js`
- Floating shield: `src/floating_icon.js`
- Inline panel: `src/inline_panel.js`
- Storage wrapper: `src/storage.js`
- Dashboard SPA: `dashboard/` (HTML, JS, CSS)

Run detector and masker regression tests from the repository root:

```bash
npm test
```

Storage keys used (in `chrome.storage.local`): `caf_totalScans`, `caf_piiFoundCount`, `caf_highRiskCount`, `caf_maskedCount`, `caf_revokedConsentCount`, `caf_latestInspection`, `caf_auditLogs`, `caf_shieldPosition`.

## Privacy & Security
- All detection, masking, and audits are executed locally in the browser.
- The extension stores only minimal audit metadata and a sanitized prompt preview; it does not transmit raw prompt text to any server.
