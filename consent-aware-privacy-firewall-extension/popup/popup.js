document.addEventListener('DOMContentLoaded', async () => {
  const totalEl = document.getElementById('total');
  const piiEl = document.getElementById('pii');
  const highEl = document.getElementById('high');
  const openBtn = document.getElementById('open-dashboard');
  const toggle = document.getElementById('toggle-scan');

  const total = await CAFStorage.get(CAFStorage.KEYS.totalScans) || 0;
  const pii = await CAFStorage.get(CAFStorage.KEYS.piiFoundCount) || 0;
  const high = await CAFStorage.get(CAFStorage.KEYS.highRiskCount) || 0;
  totalEl.textContent = total;
  piiEl.textContent = pii;
  highEl.textContent = high;

  openBtn.addEventListener('click', () => {
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
  });
});
