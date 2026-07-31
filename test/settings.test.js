const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadSettings, saveOutputDirectory, settingsPath } = require('../lib/settings');

test('persists and reloads the chosen output directory', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'social-media-notebooklm-'));
  const output = path.join(base, 'exports');
  try {
    assert.equal(loadSettings(base).outputDir, undefined);
    const saved = saveOutputDirectory(base, output);
    assert.equal(loadSettings(base).outputDir, saved);
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});
