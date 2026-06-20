// inline_panel.js — inline details panel that appears on shield click
(function () {
  function buildPanel(scan, onMask, onKeep, onCancel) {
    const panel = document.createElement('div');
    panel.className = 'caf-panel';
    panel.style.position = 'absolute';
    panel.style.width = '360px';
    panel.style.background = 'linear-gradient(180deg,#ffffff,#fbfdff)';
    panel.style.boxShadow = '0 20px 40px rgba(10,30,80,0.12)';
    panel.style.borderRadius = '12px';
    panel.style.padding = '14px';
    panel.style.zIndex = 2147483647;
    panel.style.fontFamily = 'Inter, Arial, sans-serif';

    // arrow pointer
    const arrow = document.createElement('div');
    arrow.style.position = 'absolute';
    arrow.style.top = '-12px';
    arrow.style.left = '24px';
    arrow.style.width = '24px';
    arrow.style.height = '12px';
    arrow.style.background = 'transparent';
    arrow.innerHTML = `<svg width="24" height="12" viewBox="0 0 24 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 12L0 0h24L12 12z" fill="#fff"/></svg>`;
    panel.appendChild(arrow);

    const top = document.createElement('div');
    top.style.display = 'flex';
    top.style.alignItems = 'center';
    top.style.gap = '12px';

    const iconWrap = document.createElement('div');
    iconWrap.style.width = '44px';
    iconWrap.style.height = '44px';
    iconWrap.style.borderRadius = '50%';
    iconWrap.style.display = 'flex';
    iconWrap.style.alignItems = 'center';
    iconWrap.style.justifyContent = 'center';
    iconWrap.style.background = '#28a745';
    iconWrap.style.boxShadow = '0 6px 18px rgba(40,167,69,0.16)';
    iconWrap.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-3z" fill="#fff"/><path d="M9.5 12.5l1.8 1.8 3.7-4" stroke="rgba(255,255,255,0.95)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    top.appendChild(iconWrap);

    const titleWrap = document.createElement('div');
    const title = document.createElement('div'); title.innerHTML = '<strong style="font-size:15px">Privacy Firewall</strong>';
    const sub = document.createElement('div'); sub.style.fontSize = '13px'; sub.style.color = '#667794'; sub.textContent = `Consent: ${scan.consentStatus || 'UNKNOWN'}`;
    titleWrap.appendChild(title); titleWrap.appendChild(sub);
    top.appendChild(titleWrap);

    const badge = document.createElement('div'); badge.style.marginLeft = 'auto'; badge.style.color = '#495468'; badge.style.fontSize = '12px'; badge.textContent = `${scan.riskLevel || 'LOW'} (${scan.riskScore||0})`;
    top.appendChild(badge);

    panel.appendChild(top);

    const message = document.createElement('div'); message.style.marginTop = '12px'; message.style.fontSize = '13px'; message.style.color = '#16223b';
    if (!scan.entities || scan.entities.length === 0) message.textContent = 'No sensitive items detected.';
    else message.textContent = 'Sensitive items were detected in your prompt.';
    panel.appendChild(message);

    const contentRow = document.createElement('div'); contentRow.style.display = 'flex'; contentRow.style.gap = '12px'; contentRow.style.marginTop = '14px';

    const leftCol = document.createElement('div'); leftCol.style.flex = '1';
    const maskBtn = document.createElement('button'); maskBtn.textContent = 'Mask Personal Info';
    maskBtn.style.background = 'linear-gradient(90deg,#0b84ff,#0066ff)';
    maskBtn.style.color = '#fff'; maskBtn.style.border = 'none'; maskBtn.style.padding = '12px 14px'; maskBtn.style.borderRadius = '10px'; maskBtn.style.fontWeight = 700; maskBtn.style.cursor = 'pointer';
    maskBtn.onclick = onMask;
    leftCol.appendChild(maskBtn);

    const rightCol = document.createElement('div'); rightCol.style.display = 'flex'; rightCol.style.flexDirection = 'column'; rightCol.style.justifyContent = 'center'; rightCol.style.alignItems = 'flex-start'; rightCol.style.minWidth = '120px';
    const keepBtn = document.createElement('button'); keepBtn.textContent = 'Keep Original'; keepBtn.style.background = 'transparent'; keepBtn.style.border = 'none'; keepBtn.style.color = '#0b3b76'; keepBtn.style.padding = '10px'; keepBtn.style.cursor = 'pointer'; keepBtn.onclick = onKeep;
    rightCol.appendChild(keepBtn);

    contentRow.appendChild(leftCol); contentRow.appendChild(rightCol);
    panel.appendChild(contentRow);

    const list = document.createElement('div'); list.style.marginTop = '12px'; list.style.maxHeight = '120px'; list.style.overflow = 'auto';
    if (!scan.entities || scan.entities.length === 0) {
      // nothing
    } else {
      for (const e of scan.entities) {
        const item = document.createElement('div'); item.style.fontSize = '13px'; item.style.padding = '8px 0'; item.style.display = 'flex'; item.style.justifyContent = 'space-between';
        const left = document.createElement('div'); left.textContent = `${e.type}`;
        const right = document.createElement('div'); right.textContent = `${e.text || e.value || ''}`;
        item.appendChild(left); item.appendChild(right); list.appendChild(item);
      }
    }
    panel.appendChild(list);

    const footer = document.createElement('div'); footer.style.marginTop = '12px'; footer.style.fontSize = '12px'; footer.style.color = '#9aa7bf'; footer.textContent = 'Processed locally. No prompt text leaves your browser.';
    panel.appendChild(footer);

    return panel;
  }

  window.CAFInlinePanel = { buildPanel };
})();
