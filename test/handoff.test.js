const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  buildArticleHandoff,
  buildBilibiliMarkdown,
  buildBilibiliHandoff,
  buildDoc88Handoff,
  buildEmlHandoff,
  writeHandoff
} = require('../lib/handoff');

test('builds an article handoff with absolute existing file paths', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'social-media-handoff-'));
  try {
    const md = path.join(root, 'article.md');
    const online = path.join(root, 'article_online.md');
    const pdf = path.join(root, 'article.pdf');
    fs.writeFileSync(md, 'local', 'utf8');
    fs.writeFileSync(online, 'online', 'utf8');
    fs.writeFileSync(pdf, 'pdf', 'utf8');
    const handoff = buildArticleHandoff({
      sourceUrl: 'https://mp.weixin.qq.com/s/example',
      title: '文章',
      outputDir: root,
      files: { localMarkdown: md, onlineMarkdown: online, pdf },
      attachmentFile: ''
    });
    assert.equal(handoff.source_type, 'wechat');
    assert.equal(handoff.suggested_upload, 'pdf');
    assert.equal(handoff.files.pdf, path.resolve(pdf));
    assert.equal('missing' in handoff.files, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('renders Bilibili subtitles as uploadable Markdown and keeps timestamp data', () => {
  const markdown = buildBilibiliMarkdown({
    url: 'https://www.bilibili.com/video/BV1234567890',
    bvid: 'BV1234567890',
    source: 'native',
    title: '测试视频',
    items: [{ from: 1.2, to: 3.4, content: '第一句字幕' }]
  });
  assert.match(markdown, /测试视频/);
  assert.match(markdown, /1\.20s - 3\.40s/);
  assert.match(markdown, /第一句字幕/);
});

test('writes a Bilibili handoff without treating JSON as an upload source', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'social-media-bilibili-handoff-'));
  try {
    const srt = path.join(root, 'video.srt');
    const json = path.join(root, 'video.json');
    const md = path.join(root, 'video_notebooklm.md');
    [srt, json, md].forEach(file => fs.writeFileSync(file, 'content', 'utf8'));
    const handoff = buildBilibiliHandoff({
      url: 'https://www.bilibili.com/video/BV1234567890',
      bvid: 'BV1234567890',
      source: 'native',
      title: '测试视频',
      outputDir: root,
      files: { srt, json, notebooklmMarkdown: md }
    });
    const handoffPath = writeHandoff(root, 'BV1234567890_native', handoff);
    const parsed = JSON.parse(fs.readFileSync(handoffPath, 'utf8'));
    assert.equal(parsed.suggested_upload, 'notebooklm_markdown');
    assert.equal(parsed.files.json, path.resolve(json));
    assert.equal(parsed.files.notebooklm_markdown, path.resolve(md));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('builds a Doc88 handoff with the extracted PDF as the upload source', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'social-media-doc88-handoff-'));
  try {
    const pdf = path.join(root, 'GB_T_5019.5-2023.pdf');
    fs.writeFileSync(pdf, 'pdf', 'utf8');
    const handoff = buildDoc88Handoff({
      url: 'https://www.doc88.com/p-74980400939797.html',
      title: 'GB_T 5019.5-2023',
      pCode: '74980400939797',
      pageCount: 11,
      files: { pdf }
    });
    assert.equal(handoff.source_type, 'doc88');
    assert.equal(handoff.document_id, '74980400939797');
    assert.equal(handoff.page_count, 11);
    assert.equal(handoff.suggested_upload, 'pdf');
    assert.equal(handoff.files.pdf, path.resolve(pdf));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('builds an EML handoff with Markdown and attachment metadata', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'social-media-eml-handoff-'));
  try {
    const source = path.join(root, 'mail.eml');
    const markdown = path.join(root, 'mail.md');
    fs.writeFileSync(source, 'From: sender@example.com\n\nHello', 'utf8');
    fs.writeFileSync(markdown, '# Mail\n', 'utf8');
    const handoff = buildEmlHandoff({
      sourcePath: source,
      title: 'Mail',
      emailCount: 1,
      attachments: ['report.pdf'],
      files: { markdown }
    });
    assert.equal(handoff.source_type, 'eml');
    assert.equal(handoff.source_file, path.resolve(source));
    assert.equal(handoff.email_count, 1);
    assert.deepEqual(handoff.attachment_names, ['report.pdf']);
    assert.equal(handoff.suggested_upload, 'markdown');
    assert.equal(handoff.files.markdown, path.resolve(markdown));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
