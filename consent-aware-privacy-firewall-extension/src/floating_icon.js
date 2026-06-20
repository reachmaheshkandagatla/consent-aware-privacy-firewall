// floating_icon.js
(function () {
  function createShield() {
    const el = document.createElement('div');
    el.className = 'caf-shield';
    el.style.position = 'absolute';
    el.style.width = '42px';
    el.style.height = '42px';
    el.style.borderRadius = '50%';
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
    el.style.boxShadow = '0 6px 18px rgba(2,24,60,0.18)';
    el.style.background = '#000000';
    el.style.cursor = 'pointer';
    el.style.zIndex = 2147483647;
    el.title = 'Consent-Aware Privacy Firewall';

    const svg = `
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-3z" fill="#fff"/>
        <path d="M9.5 12.5l1.8 1.8 3.7-4" stroke="rgba(255,255,255,0.95)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
    el.innerHTML = svg;
    // decorative ring
    el.style.border = '3px solid rgba(255,255,255,0.08)';

    // internal state
    el._caf_manualPosition = false;

    // restore saved position if available (async)
    try {
      if (window.CAFStorage && window.CAFStorage.getShieldPosition) {
        window.CAFStorage.getShieldPosition().then(pos => {
          if (pos && typeof pos.xPct === 'number' && typeof pos.yPct === 'number') {
            const left = Math.round((pos.xPct || 0) * window.innerWidth);
            const top = Math.round((pos.yPct || 0) * window.innerHeight);
            el.style.left = `${left}px`;
            el.style.top = `${top}px`;
            el._caf_manualPosition = true;
            window.requestAnimationFrame(() => keepVisible(el));
          }
        }).catch(()=>{});
      }
    } catch (e) { /* ignore */ }

    makeDraggable(el);
    return el;
  }

  function setColor(el, level) {
    if (!el) return;
    if (level === 'UNKNOWN') {
      el.style.background = '#000000';
      return;
    }
    const map = { LOW: ['#2ecc71','#20c997'], MEDIUM: ['#ffd166','#ffc107'], HIGH: ['#ff6b6b','#dc3545'] };
    const c = map[level] || ['#000000', '#000000'];
    el.style.background = `linear-gradient(180deg, ${c[0]}, ${c[1]})`;
  }

  function makeDraggable(el) {
    let dragging = false;
    let startX = 0, startY = 0, origLeft = 0, origTop = 0;
    let moved = false;
    let resizeFrame = null;

    function toNum(v) { return parseInt((v||'0').replace('px','')) || 0; }

    function onPointerDown(e) {
      e.preventDefault();
      dragging = true; moved = false;
      el.setPointerCapture && el.setPointerCapture(e.pointerId);
      startX = e.clientX; startY = e.clientY;
      origLeft = toNum(el.style.left) || el.getBoundingClientRect().left + window.scrollX;
      origTop = toNum(el.style.top) || el.getBoundingClientRect().top + window.scrollY;
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    }

    function onPointerMove(e) {
      if (!dragging) return;
      const dx = e.clientX - startX; const dy = e.clientY - startY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;
      let nx = origLeft + dx; let ny = origTop + dy;
      // constrain inside viewport (keep some padding)
      const pad = 8;
      nx = Math.max(window.scrollX + pad, Math.min(window.scrollX + window.innerWidth - el.offsetWidth - pad, nx));
      ny = Math.max(window.scrollY + pad, Math.min(window.scrollY + window.innerHeight - el.offsetHeight - pad, ny));
      el.style.left = `${Math.round(nx)}px`;
      el.style.top = `${Math.round(ny)}px`;
    }

    async function onPointerUp(e) {
      dragging = false;
      try { el.releasePointerCapture && el.releasePointerCapture(e.pointerId); } catch (e) {}
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      if (moved) {
        // save as percentage of viewport
        const rect = el.getBoundingClientRect();
        const xPct = (rect.left + window.scrollX) / window.innerWidth;
        const yPct = (rect.top + window.scrollY) / window.innerHeight;
        el._caf_manualPosition = true;
        try { if (window.CAFStorage && window.CAFStorage.setShieldPosition) await window.CAFStorage.setShieldPosition({ xPct, yPct }); } catch (e) {}
      }
    }

    // pointer events unify mouse/touch
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('resize', () => {
      if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = null;
        keepVisible(el);
      });
    });
  }

  function keepVisible(el) {
    if (!el || !el.isConnected) return;
    const pad = 8;
    const rect = el.getBoundingClientRect();
    const maxLeft = Math.max(pad, window.innerWidth - rect.width - pad);
    const maxTop = Math.max(pad, window.innerHeight - rect.height - pad);
    const left = Math.max(pad, Math.min(maxLeft, rect.left));
    const top = Math.max(pad, Math.min(maxTop, rect.top));
    if (left !== rect.left) el.style.left = `${Math.round(window.scrollX + left)}px`;
    if (top !== rect.top) el.style.top = `${Math.round(window.scrollY + top)}px`;
  }

  window.CAFFloatingIcon = { createShield, setColor, keepVisible };
})();
