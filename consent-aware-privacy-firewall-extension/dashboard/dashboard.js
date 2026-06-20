/* dashboard.js — SPA renderer for Consent-Aware Privacy Firewall */
document.addEventListener('DOMContentLoaded', () => {
  const main = document.getElementById('main-content');
  const navIds = ['dashboard','policies','audit','analytics','settings'];

  // route state
  let state = { page: 'dashboard' };

  function setActiveNav(id) {
    navIds.forEach(n => {
      const el = document.getElementById('nav-' + n);
      if (!el) return;
      el.classList.toggle('active', n === id);
    });
  }

  // simple helpers
  async function getCounters() {
    const total = (await CAFStorage.get(CAFStorage.KEYS.totalScans)) || 0;
    const pii = (await CAFStorage.get(CAFStorage.KEYS.piiFoundCount)) || 0;
    const high = (await CAFStorage.get(CAFStorage.KEYS.highRiskCount)) || 0;
    const masked = (await CAFStorage.get(CAFStorage.KEYS.maskedCount)) || 0;
    const revoked = (await CAFStorage.get(CAFStorage.KEYS.revokedConsentCount)) || 0;
    return { total, pii, high, masked, revoked };
  }

  async function readAudit() {
    const audits = (await CAFStorage.get(CAFStorage.KEYS.auditLogs)) || [];
    if (audits.length > 25) {
      const trimmed = audits.slice(0, 25);
      await CAFStorage.set({ [CAFStorage.KEYS.auditLogs]: trimmed });
      return trimmed;
    }
    return audits;
  }
  async function readLatest() { return (await CAFStorage.get(CAFStorage.KEYS.latestInspection)) || null; }

  // renderers
  async function renderDashboardPage() {
    setActiveNav('dashboard');
    const counters = await getCounters();
    const latest = await readLatest();
    const audits = await readAudit();

    // Only completed content scans belong in the risk distribution. MASKED and
    // KEEP are user actions, not additional risk observations.
    const riskAudits = audits.filter(a => a.actionTaken === 'INSPECTED');
    const dist = { LOW:0, MEDIUM:0, HIGH:0 };
    riskAudits.forEach(a=> { const r = (a.riskLevel||'LOW').toUpperCase(); if (dist[r]!==undefined) dist[r]++; });
    const totalAudits = riskAudits.length;
    const lowPct = totalAudits ? Math.round((dist.LOW / totalAudits) * 100) : 0;
    const mediumPct = totalAudits ? Math.round((dist.MEDIUM / totalAudits) * 100) : 0;

    main.innerHTML = `
      <header class="caf-topbar"><div>System Status: <strong id="sys-status">Active</strong></div>
        <div><button id="btn-audit">View Audit Logs</button> <button id="btn-settings">Open Settings</button></div>
      </header>
      <section class="cards">
        <div class="card">
          <h3>System Summary</h3>
          <div class="summary-grid">
            <div class="summary-stat"><span>Total Scans</span><strong>${counters.total}</strong></div>
            <div class="summary-stat pii"><span>PII Found</span><strong>${counters.pii}</strong></div>
            <div class="summary-stat danger"><span>High Risk</span><strong>${counters.high}</strong></div>
            <div class="summary-stat success"><span>Masked</span><strong>${counters.masked}</strong></div>
            <div class="summary-stat warning"><span>Consent Revoked</span><strong>${counters.revoked}</strong></div>
            <div class="summary-stat"><span>Latest Risk</span><strong>${(latest && latest.riskLevel) ? latest.riskLevel : '-'}</strong></div>
          </div>
        </div>
        <div class="card risk-card">
          <h3>Risk Distribution</h3>
          <div class="donut-wrap">
            <div class="donut ${totalAudits ? '' : 'empty'}" style="--low:${lowPct};--medium:${mediumPct}"><div><strong>${totalAudits}</strong><span>risk scans</span></div></div>
            <div class="chart-legend">
              <div><i class="low-dot"></i><span>Low</span><strong>${dist.LOW}</strong></div>
              <div><i class="medium-dot"></i><span>Medium</span><strong>${dist.MEDIUM}</strong></div>
              <div><i class="high-dot"></i><span>High</span><strong>${dist.HIGH}</strong></div>
            </div>
          </div>
        </div>
      </section>
      <section class="tables">
        <div class="card full">
          <h3>Recent Audit Events</h3>
          <table><thead><tr><th>Time</th><th>Site</th><th>Risk</th><th>Decision</th><th>Entities</th></tr></thead>
            <tbody>${audits.slice(0,5).map(a=>`<tr><td>${new Date(a.timestamp).toLocaleString()}</td><td>${a.website||''}</td><td>${a.riskLevel||''}</td><td>${a.decision||''}</td><td>${(a.entityTypes||[]).slice(0,3).join(', ')}</td></tr>`).join('')}</tbody>
          </table>
        </div>
      </section>
    `;

    document.getElementById('btn-audit').addEventListener('click', ()=>navigateTo('audit'));
    document.getElementById('btn-settings').addEventListener('click', ()=>navigateTo('settings'));
  }

  async function renderPoliciesPage() {
    setActiveNav('policies');
    const defaults = { detectSAID:true, detectEmail:true, detectPhone:true, detectCC:true, detectHealth:true, detectLocation:true, detectNames:true, detectConsent:true, warnBeforeSend:true, strictMode:false, scores:{high:50,med:20,low:5,consentRevoked:30,consentDenied:20,consentGrantedDiscount: -10} };
    const policies = await CAFStorage.get('caf_policies') || defaults;

    main.innerHTML = `
      <header class="caf-topbar"><div>Policies</div><div></div></header>
      <section class="cards">
        <div class="card">
          <h3>Detection Toggles</h3>
          <div><label><input type="checkbox" id="p-said" ${policies.detectSAID? 'checked':''}/> Detect South African ID numbers</label></div>
          <div><label><input type="checkbox" id="p-email" ${policies.detectEmail? 'checked':''}/> Detect Email Addresses</label></div>
          <div><label><input type="checkbox" id="p-phone" ${policies.detectPhone? 'checked':''}/> Detect Phone Numbers</label></div>
          <div><label><input type="checkbox" id="p-cc" ${policies.detectCC? 'checked':''}/> Detect Credit Cards</label></div>
          <div><label><input type="checkbox" id="p-health" ${policies.detectHealth? 'checked':''}/> Detect Health Information</label></div>
          <div><label><input type="checkbox" id="p-location" ${policies.detectLocation? 'checked':''}/> Detect Location Information</label></div>
          <div><label><input type="checkbox" id="p-names" ${policies.detectNames? 'checked':''}/> Detect Person Names</label></div>
          <div><label><input type="checkbox" id="p-consent" ${policies.detectConsent? 'checked':''}/> Detect Consent Language</label></div>
          <div><label><input type="checkbox" id="p-warn" ${policies.warnBeforeSend? 'checked':''}/> Warn Before Sending</label></div>
          <div><label><input type="checkbox" id="p-strict" ${policies.strictMode? 'checked':''}/> Strict Mode</label></div>
        </div>
        <div class="card">
          <h3>Risk Scoring Settings</h3>
          <div><label>HIGH entity score <input id="s-high" type="number" value="${policies.scores.high}"/></label></div>
          <div><label>MEDIUM entity score <input id="s-med" type="number" value="${policies.scores.med}"/></label></div>
          <div><label>LOW entity score <input id="s-low" type="number" value="${policies.scores.low}"/></label></div>
          <div><label>Consent revoked score <input id="s-revoked" type="number" value="${policies.scores.consentRevoked}"/></label></div>
          <div><label>Consent denied score <input id="s-denied" type="number" value="${policies.scores.consentDenied}"/></label></div>
          <div><label>Consent granted discount <input id="s-discount" type="number" value="${policies.scores.consentGrantedDiscount}"/></label></div>
          <div style="margin-top:8px"><button id="save-policies">Save Policies</button> <button id="reset-policies">Reset Defaults</button></div>
        </div>
      </section>
    `;

    document.getElementById('save-policies').addEventListener('click', async ()=>{
      const p = {
        detectSAID: !!document.getElementById('p-said').checked,
        detectEmail: !!document.getElementById('p-email').checked,
        detectPhone: !!document.getElementById('p-phone').checked,
        detectCC: !!document.getElementById('p-cc').checked,
        detectHealth: !!document.getElementById('p-health').checked,
        detectLocation: !!document.getElementById('p-location').checked,
        detectNames: !!document.getElementById('p-names').checked,
        detectConsent: !!document.getElementById('p-consent').checked,
        warnBeforeSend: !!document.getElementById('p-warn').checked,
        strictMode: !!document.getElementById('p-strict').checked,
        scores: { high: Number(document.getElementById('s-high').value||0), med: Number(document.getElementById('s-med').value||0), low: Number(document.getElementById('s-low').value||0), consentRevoked: Number(document.getElementById('s-revoked').value||0), consentDenied: Number(document.getElementById('s-denied').value||0), consentGrantedDiscount: Number(document.getElementById('s-discount').value||0) }
      };
      await CAFStorage.set({ 'caf_policies': p });
      alert('Policies saved');
    });
    document.getElementById('reset-policies').addEventListener('click', async ()=>{ await CAFStorage.set({ 'caf_policies': defaults }); renderPoliciesPage(); });
  }

  async function renderAuditLogsPage() {
    setActiveNav('audit');
    const audits = await readAudit();
    main.innerHTML = `
      <header class="caf-topbar"><div>Audit Logs</div><div><button id="export-json">Export Logs</button> <button id="clear-all">Clear Logs</button></div></header>
      <section class="card full">
        <div style="margin-bottom:8px"><label>Filter Risk: <select id="f-risk"><option value="">Any</option><option>LOW</option><option>MEDIUM</option><option>HIGH</option></select> Decision: <select id="f-decision"><option value="">Any</option><option>ALLOW</option><option>WARN</option><option>BLOCK</option></select> Consent: <select id="f-consent"><option value="">Any</option><option>GRANTED</option><option>DENIED</option><option>REVOKED</option><option>UNKNOWN</option></select></div>
        <table id="full-audit"><thead><tr><th>Time</th><th>Site</th><th>Consent</th><th>Score</th><th>Risk</th><th>Decision</th><th>Entities</th><th>Action</th></tr></thead><tbody></tbody></table>
      </section>
    `;
    const tb = document.querySelector('#full-audit tbody'); tb.innerHTML='';
    audits.forEach(a=>{ const tr = document.createElement('tr'); tr.innerHTML = `<td>${new Date(a.timestamp).toLocaleString()}</td><td>${a.website||''}</td><td>${a.consentStatus||''}</td><td>${a.riskScore||''}</td><td>${a.riskLevel||''}</td><td>${a.decision||''}</td><td>${(a.entityTypes||[]).join(', ')}</td><td>${a.actionTaken||''}</td>`; tr.style.cursor='pointer'; tr.addEventListener('click', ()=>{ alert(JSON.stringify(a, null, 2)); }); tb.appendChild(tr); });
    document.getElementById('export-json').addEventListener('click', async ()=>{ const all = await CAFStorage.readAll(); const blob = new Blob([JSON.stringify(all, null,2)], { type:'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download='caf-logs.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); });
    document.getElementById('clear-all').addEventListener('click', async ()=>{ if(!confirm('Clear all audit logs?')) return; await CAFStorage.set({ [CAFStorage.KEYS.auditLogs]: [] }); renderAuditLogsPage(); });
    // filters
    document.getElementById('f-risk').addEventListener('change', applyAuditFilter);
    document.getElementById('f-decision').addEventListener('change', applyAuditFilter);
    document.getElementById('f-consent').addEventListener('change', applyAuditFilter);
    function applyAuditFilter(){ const fr=document.getElementById('f-risk').value; const fd=document.getElementById('f-decision').value; const fc=document.getElementById('f-consent').value; Array.from(tb.querySelectorAll('tr')).forEach(tr=>{ const tds=tr.children; const risk=tds[4].innerText; const dec=tds[5].innerText; const cons=tds[2].innerText; tr.style.display = ( (fr && risk!==fr) || (fd && dec!==fd) || (fc && cons!==fc) )? 'none':''; }); }
  }

  async function renderAnalyticsPage() {
    setActiveNav('analytics');
    const audits = await readAudit();
    // Entity totals are aggregated across the complete retained audit log.
    const freq = {};
    audits.forEach(a=> (a.entityTypes||[]).forEach(t=> freq[t]=(freq[t]||0)+1));
    const common = Object.keys(freq).sort((a,b)=>freq[b]-freq[a]).slice(0,5);

    main.innerHTML = `
      <header class="caf-topbar"><div>Analytics</div><div></div></header>
      <section class="card full">
        <div class="analytics-heading"><div><h3>Most Common Entities</h3><p>Combined counts across all ${audits.length} retained audit logs.</p></div><span class="log-window">25-log window</span></div>
        <div class="entity-list">${common.length ? common.map((c, index)=>`<div class="entity-row"><span class="entity-rank">${index + 1}</span><strong>${c}</strong><div class="entity-bar"><span style="width:${Math.round((freq[c] / freq[common[0]]) * 100)}%"></span></div><b>${freq[c]}</b></div>`).join('') : '<div class="empty-state">No entities have been detected yet.</div>'}</div>
      </section>
    `;
  }

  async function renderSettingsPage() {
    setActiveNav('settings');
    const settings = await CAFStorage.get('caf_settings') || { enabled:true, scanning:true, warnBeforeSend:true, localLogging:true, previewStorage:true, iconPosition:'bottom-right', maskStyle:'stars' };

    main.innerHTML = `
      <header class="caf-topbar"><div>Settings</div><div></div></header>
      <section class="cards">
        <div class="card">
          <h3>General</h3>
          <div><label><input type="checkbox" id="s-enabled" ${settings.enabled? 'checked':''}/> Enable Extension</label></div>
          <div><label><input type="checkbox" id="s-scanning" ${settings.scanning? 'checked':''}/> Enable Scanning</label></div>
          <div><label><input type="checkbox" id="s-warn" ${settings.warnBeforeSend? 'checked':''}/> Warn Before Sending</label></div>
          <div><label><input type="checkbox" id="s-log" ${settings.localLogging? 'checked':''}/> Local Audit Logging</label></div>
          <div><label><input type="checkbox" id="s-preview" ${settings.previewStorage? 'checked':''}/> Dashboard Preview Storage</label></div>
        </div>
        <div class="card">
          <h3>UI</h3>
          <div>Icon Position: <select id="s-icon"><option value="inside">inside textbox</option><option value="above">above textbox</option><option value="bottom-right">bottom right of page</option></select></div>
          <div>Masking Style: <select id="s-mask"><option value="stars">stars</option><option value="labels">labels</option><option value="partial">partial mask</option></select></div>
        </div>
      </section>
      <section class="card full">
        <h3>Data Controls</h3>
        <div><button id="clear-latest">Clear Latest Inspection</button> <button id="clear-logs-2">Clear Audit Logs</button> <button id="reset-all">Reset All Extension Data</button></div>
      </section>
      <section class="card full">
        <h3>About</h3>
        <div>Consent-Aware Privacy Firewall — version 1.0</div>
        <div style="margin-top:8px">Privacy: All scanning happens locally in your browser. Prompt text is not sent to any server.</div>
      </section>
    `;

    document.getElementById('s-icon').value = settings.iconPosition;
    document.getElementById('s-mask').value = settings.maskStyle;

    document.getElementById('clear-latest').addEventListener('click', async ()=>{ await CAFStorage.set({ [CAFStorage.KEYS.latestInspection]: null }); alert('Latest inspection cleared'); });
    document.getElementById('clear-logs-2').addEventListener('click', async ()=>{ if(!confirm('Clear all audit logs?')) return; await CAFStorage.set({ [CAFStorage.KEYS.auditLogs]: [] }); alert('Audit logs cleared'); });
    document.getElementById('reset-all').addEventListener('click', async ()=>{ if(!confirm('Reset all extension data?')) return; await chrome.storage.local.clear(); alert('All data cleared'); });

    ['s-enabled','s-scanning','s-warn','s-log','s-preview','s-icon','s-mask'].forEach(id=>{ const el=document.getElementById(id); if(!el) return; el.addEventListener('change', async ()=>{ const newSettings = { enabled: document.getElementById('s-enabled').checked, scanning: document.getElementById('s-scanning').checked, warnBeforeSend: document.getElementById('s-warn').checked, localLogging: document.getElementById('s-log').checked, previewStorage: document.getElementById('s-preview').checked, iconPosition: document.getElementById('s-icon').value, maskStyle: document.getElementById('s-mask').value }; await CAFStorage.set({ 'caf_settings': newSettings }); }); });
  }

  // navigation
  function navigateTo(page) { state.page = page; if (page === 'dashboard') renderDashboardPage(); else if (page === 'policies') renderPoliciesPage(); else if (page === 'audit') renderAuditLogsPage(); else if (page === 'analytics') renderAnalyticsPage(); else if (page === 'settings') renderSettingsPage(); }

  // bind sidebar
  navIds.forEach(n => { const el = document.getElementById('nav-' + n); if (!el) return; el.addEventListener('click', ()=>navigateTo(n)); });

  // start
  navigateTo('dashboard');

  // listen for storage changes to refresh
  if (chrome && chrome.storage && chrome.storage.onChanged) chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local') navigateTo(state.page); });
});
