const test = require('node:test');
const assert = require('node:assert/strict');
const { extractVideoRef, validateBilibiliUrl, validateSubtitleUrl, signWbi, normalizeItems, searchTranscript, toSrt } = require('../lib/bilibili-subtitles');

test('parses BV and page number', () => {
  assert.deepEqual(extractVideoRef('https://www.bilibili.com/video/BV1AbCdEfGhJ/?p=3'), { bvid: 'BV1AbCdEfGhJ', p: 3 });
});

test('accepts Bilibili video URLs and rejects arbitrary navigation targets', () => {
  assert.doesNotThrow(() => validateBilibiliUrl('https://www.bilibili.com/video/BV1AbCdEfGhJ'));
  assert.throws(() => validateBilibiliUrl('https://example.com/video/BV1AbCdEfGhJ'), /只允许/);
  assert.throws(() => validateBilibiliUrl('https://www.bilibili.com/'), /视频链接/);
});

test('allows only official subtitle hosts', () => {
  assert.equal(validateSubtitleUrl('https://api.bilibili.com/x/player/wbi/v2'), 'https://api.bilibili.com/x/player/wbi/v2');
  assert.throws(() => validateSubtitleUrl('https://evil.example/subtitle.json'), /官方地址/);
});

test('creates deterministic WBI fields and normalizes duplicate/buffer captions', () => {
  const signed = signWbi({ aid: 1, cid: 2 }, 'a'.repeat(32), 'b'.repeat(32));
  assert.equal(typeof signed.w_rid, 'string');
  assert.equal(typeof signed.wts, 'number');
  const items = normalizeItems([{ from: 0, to: 1, content: '正在缓冲' }, { from: 1, to: 2, content: '你好' }, { from: 1.4, to: 2.4, content: '你好' }]);
  assert.deepEqual(items.map(item => item.content), ['你好']);
});

test('searches transcript and returns timestamp jump links', () => {
  const result = { url: 'https://www.bilibili.com/video/BV1AbCdEfGhJ', p: 2, items: normalizeItems([{ from: 12.3, to: 14, content: '测试关键词' }, { from: 20, to: 21, content: '其他内容' }]) };
  const matches = searchTranscript(result, '关键词');
  assert.equal(matches.length, 1);
  assert.match(matches[0].jumpUrl, /p=2&t=12\.30/);
  assert.match(toSrt(matches), /00:00:12,300/);
});
