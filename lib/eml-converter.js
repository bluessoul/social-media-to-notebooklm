'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PYTHON_SCRIPT = path.join(__dirname, 'eml_to_md.py');

function canRun(command, args = []) {
  try {
    execFileSync(command, [...args, '--version'], { stdio: ['ignore', 'ignore', 'ignore'] });
    return true;
  } catch {
    return false;
  }
}

function findPython() {
  const configured = process.env.EML_PYTHON_EXE;
  if (configured && fs.existsSync(configured) && canRun(configured)) {
    return { command: configured, args: [] };
  }
  if (process.env.USERPROFILE) {
    const bundled = path.join(process.env.USERPROFILE, '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'python', 'python.exe');
    if (fs.existsSync(bundled) && canRun(bundled)) return { command: bundled, args: [] };
  }
  if (canRun('py', ['-3'])) return { command: 'py', args: ['-3'] };
  if (canRun('python')) return { command: 'python', args: [] };
  if (canRun('python3')) return { command: 'python3', args: [] };
  return null;
}

function runPython(inputPath, outputDir) {
  const python = findPython();
  if (!python) {
    throw new Error('EML 转换需要 Python 3。请安装 Python，或设置 EML_PYTHON_EXE 指向 python.exe。');
  }
  try {
    const stdout = execFileSync(python.command, [
      ...python.args,
      PYTHON_SCRIPT,
      '--input', inputPath,
      '--output-dir', outputDir
    ], {
      encoding: 'utf8',
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    return JSON.parse(stdout.trim());
  } catch (error) {
    const stderr = error && error.stderr ? String(error.stderr).trim() : '';
    const stdout = error && error.stdout ? String(error.stdout).trim() : '';
    if (stdout) {
      try { return JSON.parse(stdout); } catch {}
    }
    throw new Error(stderr || error.message || 'EML 转换失败。');
  }
}

function processEmlInput({ inputPath, outputDir }) {
  const absoluteInput = path.resolve(inputPath);
  if (!fs.existsSync(absoluteInput)) throw new Error(`EML 文件或目录不存在: ${absoluteInput}`);
  const absoluteOutput = path.resolve(outputDir || path.dirname(absoluteInput));
  fs.mkdirSync(absoluteOutput, { recursive: true });
  const result = runPython(absoluteInput, absoluteOutput);
  if (!result || !result.markdown || !result.email_count) {
    throw new Error('EML 转换未生成可用的 Markdown 文件。');
  }
  return result;
}

module.exports = { findPython, processEmlInput, runPython };
