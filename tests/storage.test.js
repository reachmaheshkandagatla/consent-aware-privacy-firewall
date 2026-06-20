const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function loadStorageWithoutChrome() {
  const storagePath = path.resolve(__dirname, '..', 'consent-aware-privacy-firewall-extension', 'src', 'storage.js');
  delete require.cache[require.resolve(storagePath)];
  delete global.window;
  delete global.chrome;
  delete global.CAFStorage;
  require(storagePath);
  return global.CAFStorage;
}

function loadStorageWithThrowingChrome() {
  const storagePath = path.resolve(__dirname, '..', 'consent-aware-privacy-firewall-extension', 'src', 'storage.js');
  delete require.cache[require.resolve(storagePath)];
  delete global.window;
  delete global.CAFStorage;
  global.chrome = {
    runtime: {},
    storage: {
      local: {
        get: () => {
          throw new Error('Extension context invalidated.');
        },
        set: () => {
          throw new Error('Extension context invalidated.');
        }
      }
    }
  };
  require(storagePath);
  return global.CAFStorage;
}

function loadStorageWithThrowingAccessors() {
  const storagePath = path.resolve(__dirname, '..', 'consent-aware-privacy-firewall-extension', 'src', 'storage.js');
  delete require.cache[require.resolve(storagePath)];
  delete global.window;
  delete global.CAFStorage;
  global.chrome = {};
  Object.defineProperty(global.chrome, 'storage', {
    get: () => {
      throw new Error('Extension context invalidated.');
    }
  });
  require(storagePath);
  return global.CAFStorage;
}

function loadStorageWithThrowingLastError() {
  const storagePath = path.resolve(__dirname, '..', 'consent-aware-privacy-firewall-extension', 'src', 'storage.js');
  delete require.cache[require.resolve(storagePath)];
  delete global.window;
  delete global.CAFStorage;
  global.chrome = {
    storage: {
      local: {
        get: (_key, callback) => callback({}),
        set: (_obj, callback) => callback()
      }
    }
  };
  Object.defineProperty(global.chrome, 'runtime', {
    get: () => {
      throw new Error('Extension context invalidated.');
    }
  });
  require(storagePath);
  return global.CAFStorage;
}

test('storage helper falls back to memory when chrome.storage.local is unavailable', async () => {
  const storage = loadStorageWithoutChrome();

  await storage.set({ [storage.KEYS.totalScans]: 3 });
  assert.equal(await storage.get(storage.KEYS.totalScans), 3);

  await storage.pushAudit({ actionTaken: 'INSPECTED' });
  assert.deepEqual(await storage.get(storage.KEYS.auditLogs), [{ actionTaken: 'INSPECTED' }]);

  const all = await storage.readAll();
  assert.equal(all[storage.KEYS.totalScans], 3);
  assert.deepEqual(all[storage.KEYS.auditLogs], [{ actionTaken: 'INSPECTED' }]);
});

test('audit storage retains only the 25 most recent events', async () => {
  const storage = loadStorageWithoutChrome();

  for (let id = 1; id <= 30; id += 1) {
    await storage.pushAudit({ id });
  }

  const audits = await storage.get(storage.KEYS.auditLogs);
  assert.equal(audits.length, 25);
  assert.equal(audits[0].id, 30);
  assert.equal(audits[24].id, 6);
});

test('scan counters count detected entities and action-only updates do not add scans', async () => {
  const storage = loadStorageWithoutChrome();

  await storage.incrementCounters({ piiCount: 2, isHigh: true, masked: false, revoked: false });
  await storage.incrementCounters({ countScan: false, masked: true });

  assert.equal(await storage.get(storage.KEYS.totalScans), 1);
  assert.equal(await storage.get(storage.KEYS.piiFoundCount), 2);
  assert.equal(await storage.get(storage.KEYS.highRiskCount), 1);
  assert.equal(await storage.get(storage.KEYS.maskedCount), 1);
});

test('storage helper handles invalidated extension context without rejecting', async () => {
  const storage = loadStorageWithThrowingChrome();

  await storage.set({ [storage.KEYS.maskedCount]: 1 });
  assert.equal(await storage.get(storage.KEYS.maskedCount), 1);
});

test('storage helper handles invalidated chrome accessors without rejecting', async () => {
  const storage = loadStorageWithThrowingAccessors();

  await storage.set({ [storage.KEYS.highRiskCount]: 2 });
  assert.equal(await storage.get(storage.KEYS.highRiskCount), 2);
});

test('storage helper handles invalidated runtime checks inside callbacks', async () => {
  const storage = loadStorageWithThrowingLastError();

  await storage.set({ [storage.KEYS.revokedConsentCount]: 4 });
  assert.equal(await storage.get(storage.KEYS.revokedConsentCount), 4);
});
