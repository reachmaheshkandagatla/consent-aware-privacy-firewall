// storage.js — helper wrapper around chrome.storage.local
(function () {
  const root = typeof window !== 'undefined' ? window : globalThis;
  const memoryStore = {};
  let chromeStorageDisabled = false;

  const KEYS = {
    totalScans: 'caf_totalScans',
    piiFoundCount: 'caf_piiFoundCount',
    highRiskCount: 'caf_highRiskCount',
    maskedCount: 'caf_maskedCount',
    revokedConsentCount: 'caf_revokedConsentCount',
    latestInspection: 'caf_latestInspection',
    auditLogs: 'caf_auditLogs',
    shieldPosition: 'caf_shieldPosition'
  };

  function storageArea() {
    if (chromeStorageDisabled) return null;
    try {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return null;
      return chrome.storage.local;
    } catch (err) {
      console.warn('CAFStorage storage area unavailable; using in-memory fallback.', err.message || err);
      chromeStorageDisabled = true;
      return null;
    }
  }

  function lastChromeError() {
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime) return null;
      return chrome.runtime.lastError || null;
    } catch (err) {
      chromeStorageDisabled = true;
      return err;
    }
  }

  function readFromMemory(key) {
    if (key === null) return Object.assign({}, memoryStore);
    return memoryStore[key];
  }

  async function get(key) {
    const storage = storageArea();
    if (!storage) return readFromMemory(key);

    return new Promise(res => {
      try {
        storage.get(key, r => {
          try {
            const err = lastChromeError();
            if (err) {
              console.warn('CAFStorage.get failed; using in-memory fallback.', err.message || err);
              chromeStorageDisabled = true;
              res(readFromMemory(key));
              return;
            }
            res(key === null ? r : r[key]);
          } catch (err) {
            console.warn('CAFStorage.get callback failed; using in-memory fallback.', err.message || err);
            chromeStorageDisabled = true;
            res(readFromMemory(key));
          }
        });
      } catch (err) {
        console.warn('CAFStorage.get unavailable; using in-memory fallback.', err.message || err);
        chromeStorageDisabled = true;
        res(readFromMemory(key));
      }
    });
  }

  async function set(obj) {
    const storage = storageArea();
    if (!storage) {
      Object.assign(memoryStore, obj);
      return;
    }

    return new Promise(res => {
      try {
        storage.set(obj, () => {
          try {
            const err = lastChromeError();
            if (err) {
              console.warn('CAFStorage.set failed; using in-memory fallback.', err.message || err);
              chromeStorageDisabled = true;
              Object.assign(memoryStore, obj);
            }
          } catch (err) {
            console.warn('CAFStorage.set callback failed; using in-memory fallback.', err.message || err);
            chromeStorageDisabled = true;
            Object.assign(memoryStore, obj);
          }
          res();
        });
      } catch (err) {
        console.warn('CAFStorage.set unavailable; using in-memory fallback.', err.message || err);
        chromeStorageDisabled = true;
        Object.assign(memoryStore, obj);
        res();
      }
    });
  }

  async function pushAudit(event) {
    const all = (await get(KEYS.auditLogs)) || [];
    all.unshift(event);
    const trimmed = all.slice(0, 25);
    await set({ [KEYS.auditLogs]: trimmed });
  }

  async function incrementCounters(info) {
    const total = (await get(KEYS.totalScans)) || 0;
    const pii = (await get(KEYS.piiFoundCount)) || 0;
    const high = (await get(KEYS.highRiskCount)) || 0;
    const masked = (await get(KEYS.maskedCount)) || 0;
    const revoked = (await get(KEYS.revokedConsentCount)) || 0;
    const countScan = info.countScan !== false;
    const piiIncrement = countScan
      ? Math.max(0, Number.isFinite(Number(info.piiCount)) ? Number(info.piiCount) : (info.piiFound ? 1 : 0))
      : 0;
    await set({
      [KEYS.totalScans]: total + (countScan ? 1 : 0),
      [KEYS.piiFoundCount]: pii + piiIncrement,
      [KEYS.highRiskCount]: high + (countScan && info.isHigh ? 1 : 0),
      [KEYS.maskedCount]: masked + (info.masked ? 1 : 0),
      [KEYS.revokedConsentCount]: revoked + (countScan && info.revoked ? 1 : 0)
    });
  }

  async function saveLatestInspection(obj) {
    // obj may contain sanitizedPrompt only (no full raw text)
    await set({ [KEYS.latestInspection]: obj });
  }

  async function readAll() {
    return get(null);
  }

  async function getShieldPosition() {
    return (await get(KEYS.shieldPosition)) || null;
  }

  async function setShieldPosition(pos) {
    // pos: { xPct: number, yPct: number }
    await set({ [KEYS.shieldPosition]: pos });
  }

  root.CAFStorage = { KEYS, get, set, pushAudit, incrementCounters, saveLatestInspection, readAll, getShieldPosition, setShieldPosition };
})();
