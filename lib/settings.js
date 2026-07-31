const fs = require('fs');
const path = require('path');

const SETTINGS_FILE = 'settings.json';

function settingsPath(baseDir) { return path.join(baseDir, SETTINGS_FILE); }

function loadSettings(baseDir) {
  const filePath = settingsPath(baseDir);
  if (!fs.existsSync(filePath)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return typeof parsed === 'object' && parsed ? parsed : {};
  } catch {
    return {};
  }
}

function saveOutputDirectory(baseDir, outputDir) {
  const resolved = path.resolve(outputDir);
  fs.mkdirSync(resolved, { recursive: true });
  fs.accessSync(resolved, fs.constants.W_OK);
  fs.writeFileSync(settingsPath(baseDir), JSON.stringify({ outputDir: resolved }, null, 2) + '\n', 'utf8');
  return resolved;
}

module.exports = { loadSettings, saveOutputDirectory, settingsPath };
