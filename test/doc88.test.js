const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('zlib');
const {
  customBase64Decode,
  customBase64Encode,
  makeSwf,
  pageResourceUrls,
  parseDoc88Xml
} = require('../lib/doc88');

test('round-trips Doc88 custom base64', () => {
  const value = JSON.stringify({ p_code: '74980400939797', p_name: 'GB_T 5019.5-2023' });
  assert.equal(customBase64Decode(customBase64Encode(value, 'PJKLMNOI3xyz012wvprqstuoHBCDEFGAnhijklmgfZabcdeYXRSTUVWQ!56789+4'), 'PJKLMNOI3xyz012wvprqstuoHBCDEFGAnhijklmgfZabcdeYXRSTUVWQ!56789+4'), value);
});

test('parses Doc88 page structure and builds resource URLs', () => {
  const config = parseDoc88Xml(`
    <doc><p_404>0</p_404><p_code>74980400939797</p_code>
    <p_name>GB_T 5019.5-2023</p_name><p_ebthost>https://ebt245.doc88.com</p_ebthost>
    <p_swf>2025-01-08-090420_demo</p_swf><p_struct>
      <h n="1">455235</h><p n="1" e="1" w="595" h="841" p="455235" l="3936"/>
    </p_struct></doc>`);
  assert.equal(config.title, 'GB_T 5019.5-2023');
  assert.equal(config.pages.length, 1);
  const urls = pageResourceUrls(config, config.pages[0]);
  assert.match(urls.phUrl, /^https:\/\/ebt245\.doc88\.com\/getebt-/);
  assert.match(urls.pkUrl, /\.ebt$/);
});

test('reassembles compressed PH and PK buffers into an SWF', () => {
  const ph = Buffer.alloc(24);
  ph.write('FWS', 0, 'ascii');
  const pk = Buffer.from('page-data');
  const phEbt = Buffer.concat([Buffer.alloc(40), zlib.deflateSync(ph)]);
  const pkEbt = Buffer.concat([Buffer.alloc(32), zlib.deflateSync(pk)]);
  const swf = makeSwf(phEbt, pkEbt);
  assert.equal(swf.subarray(0, 3).toString('ascii'), 'FWS');
  assert.equal(swf[19], 1);
  assert.equal(swf.readUInt32LE(4), swf.length);
});
