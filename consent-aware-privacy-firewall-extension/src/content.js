// content.js — main logic: attach to ChatGPT prompt, scan, show shield, inline panel
/* content.js — main logic: attach to ChatGPT prompt, scan, show shield, inline panel */
(function () {
  // Record one scan after the user has stopped editing for 15 seconds.
  const DEBOUNCE_MS = 15000;
  // Polling fallback interval (ms) to detect changes in editors that don't emit input events reliably
  const POLL_INTERVAL_MS = 300;
  let timer = null;
  let currentEl = null;
  let shieldEl = null;
  let panelEl = null;
  let attachmentPanelEl = null;
  let _pollIntervalId = null;
  let _attachmentListenersAttached = false;
  const originalTextByElement = new WeakMap();
  const lastScannedTextByElement = new WeakMap();
  let latestOriginalSnapshot = null;

  function getTextFrom(el) {
    if (!el) return '';
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') return el.value;
    // Site-specific: ChatGPT's composer uses a ProseMirror area with id 'prompt-textarea'
    if (el.id === 'prompt-textarea') {
      try {
        // collect text from paragraph children to preserve line breaks
        const parts = Array.from(el.querySelectorAll('p')).map(p => (p.innerText || p.textContent || '').trim());
        const txtFromP = parts.filter(Boolean).join('\n\n');
        if (txtFromP && txtFromP.trim()) return txtFromP;
      } catch (e) { /* fallthrough */ }
    }
    // Prefer innerText for rendered text; fallback to textContent or aggregated child text
    let txt = el.innerText || el.textContent || '';
    if ((!txt || !txt.trim()) && el.isContentEditable) {
      // try to aggregate descendant text nodes (helps with nested spans)
      try {
        txt = Array.from(el.childNodes).map(n => n.textContent || '').join(' ').trim();
      } catch (e) { txt = el.textContent || ''; }
    }
    return txt || '';
  }

  function setTextTo(el, text) {
    if (!el) return;
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      el.value = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      el.innerText = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  function placeShieldNear(el, shield) {
    const rect = el.getBoundingClientRect();
    shield.style.top = `${window.scrollY + rect.top - 8}px`;
    shield.style.left = `${window.scrollX + rect.right - 40}px`;
    if (window.CAFFloatingIcon && window.CAFFloatingIcon.keepVisible) {
      window.CAFFloatingIcon.keepVisible(shield);
    }
  }

  function removePanel() { if (panelEl && panelEl.parentNode) panelEl.parentNode.removeChild(panelEl); panelEl = null; }

  function removeAttachmentPanel() {
    if (attachmentPanelEl && attachmentPanelEl.parentNode) attachmentPanelEl.parentNode.removeChild(attachmentPanelEl);
    attachmentPanelEl = null;
  }

  function clearStaleOriginalSnapshot(el, text) {
    const snapshot = originalTextByElement.get(el) || latestOriginalSnapshot;
    if (!snapshot) return;
    if (text !== snapshot.masked && text !== snapshot.original) {
      originalTextByElement.delete(el);
      if (latestOriginalSnapshot === snapshot) latestOriginalSnapshot = null;
    }
  }

  function safeStorageCall(promise) {
    Promise.resolve(promise).catch(err => {
      try {
        console.warn('CAF storage call ignored.', err && (err.message || err));
      } catch (e) { /* ignore */ }
    });
  }

  function refreshLastScan(el) {
    const text = getTextFrom(el);
    const scan = window.ConsentDetector.scan(text);
    window.__caf_last_scan = scan;
    CAFFloatingIcon.setColor(shieldEl, text.trim() ? (scan.riskLevel || 'UNKNOWN') : 'UNKNOWN');
    return scan;
  }

  function showPanel(scan) {
    removePanel();
    panelEl = CAFInlinePanel.buildPanel(scan, async () => {
      // Mask
      const original = getTextFrom(currentEl);
      const existingSnapshot = originalTextByElement.get(currentEl) || latestOriginalSnapshot;
      if (existingSnapshot && original === existingSnapshot.masked) {
        removePanel();
        return;
      }
      // Re-scan live text so stale panel offsets cannot corrupt it.
      const activeScan = window.ConsentDetector.scan(original);
      const masked = ConsentMasker.maskText(original, activeScan.entities);
      if (masked === original) {
        removePanel();
        return;
      }
      const snapshot = { original, masked };
      originalTextByElement.set(currentEl, snapshot);
      latestOriginalSnapshot = snapshot;
      setTextTo(currentEl, masked);
      // record metadata
      safeStorageCall(CAFStorage.pushAudit({ timestamp: Date.now(), website: location.hostname, consentStatus: activeScan.consentStatus, riskScore: activeScan.riskScore, riskLevel: activeScan.riskLevel, decision: activeScan.decision, entityTypes: activeScan.entities.map(e=>e.type), actionTaken: 'MASKED' }));
      safeStorageCall(CAFStorage.incrementCounters({ countScan: false, masked: true }));
      removePanel();
    }, async () => {
      // Keep original
      const currentText = getTextFrom(currentEl);
      const snapshot = originalTextByElement.get(currentEl) || latestOriginalSnapshot;
      if (snapshot && typeof snapshot.original === 'string' && currentText === snapshot.masked) {
        setTextTo(currentEl, snapshot.original);
        originalTextByElement.delete(currentEl);
        if (latestOriginalSnapshot === snapshot) latestOriginalSnapshot = null;
        if (currentEl) currentEl._caf_last_text = snapshot.original;
        refreshLastScan(currentEl);
      }
      safeStorageCall(CAFStorage.pushAudit({ timestamp: Date.now(), website: location.hostname, consentStatus: scan.consentStatus, riskScore: scan.riskScore, riskLevel: scan.riskLevel, decision: scan.decision, entityTypes: scan.entities.map(e=>e.type), actionTaken: 'KEEP' }));
      removePanel();
    }, () => { removePanel(); });

    document.body.appendChild(panelEl);
    // position near shield
    const sRect = shieldEl.getBoundingClientRect();
    panelEl.style.top = `${window.scrollY + sRect.bottom + 8}px`;
    panelEl.style.left = `${window.scrollX + sRect.left - 140}px`;
  }

  function buildAttachmentPanel(results) {
    const panel = document.createElement('div');
    panel.style.position = 'fixed';
    panel.style.right = '18px';
    panel.style.bottom = '18px';
    panel.style.width = '390px';
    panel.style.maxWidth = 'calc(100vw - 36px)';
    panel.style.maxHeight = '60vh';
    panel.style.overflow = 'auto';
    panel.style.background = '#fff';
    panel.style.border = '1px solid rgba(12, 35, 66, 0.14)';
    panel.style.boxShadow = '0 18px 50px rgba(10,30,80,0.18)';
    panel.style.borderRadius = '12px';
    panel.style.padding = '14px';
    panel.style.zIndex = 2147483647;
    panel.style.fontFamily = 'Inter, Arial, sans-serif';

    const title = document.createElement('div');
    title.style.fontWeight = 800;
    title.style.fontSize = '15px';
    title.textContent = 'Attachment privacy scan';
    panel.appendChild(title);

    const summary = document.createElement('div');
    summary.style.fontSize = '13px';
    summary.style.color = '#4c5d75';
    summary.style.marginTop = '6px';
    const riskyCount = results.filter(result => (result.scan.entities || []).length > 0).length;
    const errorCount = results.filter(result => result.error).length;
    summary.textContent = errorCount > 0
      ? `${errorCount} attachment${errorCount === 1 ? '' : 's'} could not be scanned.`
      : riskyCount > 0
        ? `${riskyCount} attachment${riskyCount === 1 ? '' : 's'} may contain personal information.`
        : 'No personal information was detected in supported attachments.';
    panel.appendChild(summary);

    for (const result of results) {
      const item = document.createElement('div');
      item.style.borderTop = '1px solid rgba(12, 35, 66, 0.10)';
      item.style.marginTop = '12px';
      item.style.paddingTop = '12px';

      const name = document.createElement('div');
      name.style.fontWeight = 700;
      name.style.fontSize = '13px';
      name.textContent = `${result.fileName} (${result.fileType})`;
      item.appendChild(name);

      if (result.error) {
        const error = document.createElement('div');
        error.style.color = '#9a3412';
        error.style.fontSize = '12px';
        error.style.marginTop = '6px';
        error.textContent = result.error;
        item.appendChild(error);
      } else {
        const meta = document.createElement('div');
        meta.style.fontSize = '12px';
        meta.style.color = '#667794';
        meta.style.marginTop = '4px';
        meta.textContent = `${result.scan.riskLevel || 'LOW'} risk (${result.scan.riskScore || 0})`;
        item.appendChild(meta);

        const entities = (result.scan.entities || []).slice(0, 8);
        if (entities.length > 0) {
          const list = document.createElement('div');
          list.style.display = 'flex';
          list.style.flexWrap = 'wrap';
          list.style.gap = '6px';
          list.style.marginTop = '8px';
          for (const entity of entities) {
            const chip = document.createElement('span');
            chip.style.fontSize = '12px';
            chip.style.background = '#eef4ff';
            chip.style.color = '#12376b';
            chip.style.padding = '4px 7px';
            chip.style.borderRadius = '999px';
            chip.textContent = entity.type;
            list.appendChild(chip);
          }
          item.appendChild(list);
        }
      }

      panel.appendChild(item);
    }

    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.justifyContent = 'flex-end';
    actions.style.marginTop = '12px';
    const close = document.createElement('button');
    close.textContent = 'Dismiss';
    close.style.border = 'none';
    close.style.borderRadius = '8px';
    close.style.padding = '9px 12px';
    close.style.background = '#0b66ff';
    close.style.color = '#fff';
    close.style.fontWeight = 700;
    close.style.cursor = 'pointer';
    close.onclick = removeAttachmentPanel;
    actions.appendChild(close);
    panel.appendChild(actions);

    return panel;
  }

  async function scanAttachmentFiles(files) {
    if (!window.CAFAttachmentScanner || !files || files.length === 0) return;
    const results = await window.CAFAttachmentScanner.scanFiles(files);
    if (results.length === 0) return;
    removeAttachmentPanel();
    attachmentPanelEl = buildAttachmentPanel(results);
    document.body.appendChild(attachmentPanelEl);
    for (const result of results) {
      safeStorageCall(CAFStorage.pushAudit({
        timestamp: Date.now(),
        website: location.hostname,
        consentStatus: result.scan.consentStatus,
        riskScore: result.scan.riskScore,
        riskLevel: result.scan.riskLevel,
        decision: result.scan.decision,
        entityTypes: (result.scan.entities || []).map(e => e.type),
        actionTaken: result.error ? 'ATTACHMENT_SCAN_FAILED' : 'ATTACHMENT_INSPECTED',
        attachmentName: result.fileName,
        attachmentType: result.fileType
      }));
    }
  }

  function attachAttachmentListeners() {
    if (_attachmentListenersAttached) return;
    _attachmentListenersAttached = true;
    document.addEventListener('change', event => {
      const target = event.target;
      if (target && target.matches && target.matches('input[type="file"]')) {
        scanAttachmentFiles(target.files);
      }
    }, true);
    document.addEventListener('drop', event => {
      const files = event.dataTransfer && event.dataTransfer.files;
      if (files && files.length > 0) {
        setTimeout(() => scanAttachmentFiles(files), 50);
      }
    }, true);
  }

  function onDoubleClick() {
    if (chrome.runtime && chrome.runtime.openOptionsPage) {
      try {
        chrome.runtime.openOptionsPage();
      } catch (e) {
        const url = chrome.runtime.getURL('dashboard/dashboard.html');
        window.open(url, '_blank');
      }
    } else {
      const url = chrome.runtime.getURL('dashboard/dashboard.html');
      window.open(url, '_blank');
    }
  }

  function updateForElement(el) {
    currentEl = el;
    if (!shieldEl) {
      shieldEl = CAFFloatingIcon.createShield();
      document.body.appendChild(shieldEl);
      shieldEl.addEventListener('click', () => {
        if (panelEl) { removePanel(); return; }
        // show inline panel based on last scan
        const last = window.__caf_last_scan || null;
        if (last) showPanel(last);
      });
      shieldEl.addEventListener('dblclick', onDoubleClick);
    }
    // Only auto-place near the active editor if the user hasn't manually moved the shield
    if (!shieldEl._caf_manualPosition) placeShieldNear(el, shieldEl);
  }

  function runScanForElement(el) {
    const text = getTextFrom(el);
    // Input, keyup, MutationObserver and polling can all report the same edit.
    // Persist metrics only once for each distinct editor value.
    if (lastScannedTextByElement.get(el) === text) return;
    lastScannedTextByElement.set(el, text);
    el._caf_last_text = text;
    if (!text.trim()) {
      const emptyScan = window.ConsentDetector.scan('');
      window.__caf_last_scan = emptyScan;
      CAFFloatingIcon.setColor(shieldEl, 'UNKNOWN');
      return;
    }
    clearStaleOriginalSnapshot(el, text);
    const scan = window.ConsentDetector.scan(text);
    window.__caf_last_scan = scan;
    // update shield color
    CAFFloatingIcon.setColor(shieldEl, scan.riskLevel || 'UNKNOWN');
    // store latestInspection with masked preview only
    const maskedPreview = ConsentMasker.maskText(text, scan.entities);
    safeStorageCall(CAFStorage.saveLatestInspection({ timestamp: Date.now(), website: location.hostname, sanitizedPrompt: maskedPreview, riskScore: scan.riskScore, riskLevel: scan.riskLevel }));
    // push minimal audit log
    safeStorageCall(CAFStorage.pushAudit({ timestamp: Date.now(), website: location.hostname, consentStatus: scan.consentStatus, riskScore: scan.riskScore, riskLevel: scan.riskLevel, decision: scan.decision, entityTypes: scan.entities.map(e=>e.type), actionTaken: 'INSPECTED' }));
    safeStorageCall(CAFStorage.incrementCounters({ piiCount: scan.entities.length, isHigh: scan.riskLevel==='HIGH', masked: false, revoked: scan.consentStatus==='REVOKED' }));
  }

  function debounceScan(el) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      runScanForElement(el);
    }, DEBOUNCE_MS);
  }

  function attach(el) {
    if (!el) return;
    if (el._caf_attached) return;
    el._caf_attached = true;
    el.addEventListener('input', () => { updateForElement(el); debounceScan(el); }, true);
    // respond quickly to paste events
    el.addEventListener('paste', () => { setTimeout(()=>{ updateForElement(el); debounceScan(el); }, 50); }, true);
    // also listen for keyup as additional fallback
    el.addEventListener('keyup', () => { updateForElement(el); debounceScan(el); }, true);
    el.addEventListener('focus', () => { updateForElement(el); }, true);
    el.addEventListener('blur', () => { /* leave shield visible */ }, true);
    // Observe element subtree and characterData changes to catch contenteditable edits
    try {
      if (!el._caf_mo) {
        const mo = new MutationObserver(() => {
          updateForElement(el);
          // Framework rendering and draft restoration are not user scans.
          // Keep the shield current without recording dashboard metrics.
          refreshLastScan(el);
        });
        mo.observe(el, { characterData: true, childList: true, subtree: true });
        el._caf_mo = mo;
      }
    } catch (e) { /* ignore */ }

    // Fallback: ensure a global poller runs to pick up changes on tricky editors
    if (!_pollIntervalId) {
      _pollIntervalId = setInterval(() => {
        try {
          if (currentEl) {
            const txt = getTextFrom(currentEl) || '';
            if (currentEl._caf_last_text !== txt) {
              currentEl._caf_last_text = txt;
              updateForElement(currentEl);
              // Polling is visual fallback only; it must not manufacture audit
              // events when a site restores or re-renders editor content.
              refreshLastScan(currentEl);
            }
          }
        } catch (e) { /* ignore */ }
      }, POLL_INTERVAL_MS);
    }
    // Treat the current value as the baseline. Loading or refreshing a page is
    // not a user scan and must not alter dashboard metrics.
    updateForElement(el);
    const initialText = getTextFrom(el);
    lastScannedTextByElement.set(el, initialText);
    el._caf_last_text = initialText;
    if (initialText) refreshLastScan(el);
  }

  // Cleanup when page unloads
  window.addEventListener('beforeunload', () => {
    if (_pollIntervalId) clearInterval(_pollIntervalId);
    _pollIntervalId = null;
  });

  function findEditors(root=document) {
    // Prefer ChatGPT-specific prompt textarea when present
    try {
      const chatPrompt = document.querySelector('#prompt-textarea');
      if (chatPrompt) return [chatPrompt];
    } catch (e) {}
    const sel = 'textarea, input[type=text], [contenteditable="true"], div[role="textbox"]';
    const nodes = Array.from(root.querySelectorAll(sel));
    return nodes;
  }

  function init() {
    attachAttachmentListeners();
    // attach to existing editors
    const nodes = findEditors(document);
    nodes.forEach(attach);

    // observe DOM for new editors
    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (!(node instanceof Element)) continue;
          const editors = findEditors(node);
          editors.forEach(attach);
        }
      }
    });
    mo.observe(document.body || document.documentElement, { childList: true, subtree: true });
  }

  // start
  setTimeout(init, 800);

})();
