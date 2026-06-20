const path = require('node:path');

function loadExtensionScripts() {
  global.window = global;
  global.chrome = {
    storage: {
      local: {
        get: (_keys, callback) => callback({}),
        set: (_obj, callback) => {
          if (callback) callback();
        }
      }
    }
  };

  const root = path.resolve(__dirname, '..', '..');
  const detectorPath = path.join(root, 'consent-aware-privacy-firewall-extension', 'src', 'detector.js');
  const maskerPath = path.join(root, 'consent-aware-privacy-firewall-extension', 'src', 'masker.js');

  delete require.cache[require.resolve(detectorPath)];
  delete require.cache[require.resolve(maskerPath)];
  require(detectorPath);
  require(maskerPath);

  return {
    detector: global.window.ConsentDetector,
    masker: global.window.ConsentMasker
  };
}

module.exports = { loadExtensionScripts };
