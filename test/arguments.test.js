const test = require('node:test');
const assert = require('node:assert/strict');
const { parseArguments, validateTargetUrl } = require('../lib/arguments');

test('parses a URL and output-directory setting', () => {
  assert.deepEqual(parseArguments(['--set-output', 'D:/exports', '--url', 'https://mp.weixin.qq.com/s/example']), {
    targetUrl: 'https://mp.weixin.qq.com/s/example', setOutput: 'D:/exports', forceUpload: false, skipUpload: false, handoffNotebooklm: false, help: false
  });
});

test('parses the NotebookLM handoff flag without changing upload compatibility', () => {
  assert.deepEqual(parseArguments(['--url', 'https://mp.weixin.qq.com/s/example', '--no-upload', '--handoff-notebooklm']), {
    targetUrl: 'https://mp.weixin.qq.com/s/example', setOutput: '', forceUpload: false, skipUpload: true, handoffNotebooklm: true, help: false
  });
});

test('accepts WeChat, LinkedIn, Xiaohongshu, and Bilibili URLs', () => {
  assert.equal(validateTargetUrl('https://mp.weixin.qq.com/s/example').valid, true);
  assert.equal(validateTargetUrl('https://www.linkedin.com/posts/example').valid, true);
  assert.equal(validateTargetUrl('https://www.xiaohongshu.com/explore/example').valid, true);
  assert.equal(validateTargetUrl('https://xhslink.com/example').valid, true);
  assert.equal(validateTargetUrl('http://xhslink.cn/example').valid, true);
  assert.equal(validateTargetUrl('https://www.bilibili.com/video/BV1pgGc6BELe').valid, true);
  assert.equal(validateTargetUrl('https://example.com/article').valid, false);
  assert.equal(validateTargetUrl('not a url').valid, false);
});

test('accepts Doc88 preview URLs and rejects non-preview Doc88 pages', () => {
  assert.deepEqual(validateTargetUrl('https://www.doc88.com/p-74980400939797.html'), { valid: true, type: 'doc88' });
  assert.equal(validateTargetUrl('https://www.doc88.com/p-abc.html').valid, false);
});

test('accepts EML files and directories with EML files', () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'social-media-eml-arguments-'));
  try {
    const emlPath = path.join(root, 'message.eml');
    fs.writeFileSync(emlPath, 'From: sender@example.com\n\nHello', 'utf8');
    assert.deepEqual(validateTargetUrl(emlPath), { valid: true, type: 'eml' });
    assert.deepEqual(validateTargetUrl(root), { valid: true, type: 'eml' });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
