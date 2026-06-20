# Consent-Aware Privacy Firewall

Browser extension (Manifest V3) that locally scans ChatGPT prompts for sensitive personal data and consent statements, and provides inline protections.

Install (developer):
1. Open Chrome, go to `chrome://extensions` and enable Developer mode.
2. Click `Load unpacked` and select the `consent-aware-privacy-firewall-extension` folder.

For maintained synthetic detection examples, run the automated test suite from the repository root with `npm test`.

Notes:
- All scanning runs locally in the browser.
- No prompt text is sent to external servers.
- Audit logs in chrome.storage.local store only metadata and a sanitized latest preview.

Limitations & future work:
- Add per-site DOM adapters for robust ChatGPT selector handling.
- Improve SA ID checksum validation and more advanced name extraction.
- Add unit tests and i18n.
