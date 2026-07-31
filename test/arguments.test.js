const test = require('node:test');
const assert = require('node:assert/strict');
const { parseArguments, validateTargetUrl } = require('../lib/arguments');

test('parses a URL and output-directory setting', () => {
  assert.deepEqual(parseArguments(['--set-output', 'D:/exports', '--url', 'https://mp.weixin.qq.com/s/example']), {
    targetUrl: 'https://mp.weixin.qq.com/s/example', setOutput: 'D:/exports', forceUpload: false, skipUpload: false, help: false
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
