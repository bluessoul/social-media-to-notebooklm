const fs = require('fs');
const path = require('path');

function sourceTypeForUrl(url) {
  const value = String(url || '').toLowerCase();
  if (value.includes('mp.weixin.qq.com')) return 'wechat';
  if (value.includes('linkedin.com')) return 'linkedin';
  if (value.includes('xiaohongshu.com') || value.includes('xhslink.com')) return 'xiaohongshu';
  if (value.includes('bilibili.com') || value.includes('b23.tv')) return 'bilibili';
  return 'unknown';
}

function existingFile(filePath) {
  if (!filePath) return null;
  const absolute = path.resolve(filePath);
  return fs.existsSync(absolute) ? absolute : null;
}

function compactFiles(files) {
  return Object.fromEntries(Object.entries(files).filter(([, value]) => value));
}

function buildArticleHandoff({ sourceUrl, title, outputDir, files, attachmentFile }) {
  const normalizedFiles = compactFiles({
    local_markdown: existingFile(files.localMarkdown),
    online_markdown: existingFile(files.onlineMarkdown),
    pdf: existingFile(files.pdf),
    attachment_pdf: existingFile(attachmentFile ? path.join(outputDir, attachmentFile) : null)
  });

  return {
    version: 1,
    source_type: sourceTypeForUrl(sourceUrl),
    source_url: sourceUrl,
    title: title || 'article',
    files: normalizedFiles,
    suggested_upload: normalizedFiles.pdf ? 'pdf' : (normalizedFiles.online_markdown ? 'online_markdown' : null)
  };
}

function buildBilibiliMarkdown({ url, bvid, source, title, items }) {
  const rows = (items || []).filter(item => item && item.content).map((item, index) => {
    const start = Number(item.from || 0).toFixed(2);
    const end = Number(item.to || Number(item.from || 0) + 2).toFixed(2);
    return `${index + 1}. **${start}s - ${end}s**\n   ${String(item.content).trim()}`;
  });

  return [
    `# ${title || 'B站字幕'}`,
    '',
    `- **原始链接**: ${url}`,
    `- **BV号**: ${bvid || '未知'}`,
    `- **字幕来源**: ${source || 'unknown'}`,
    '',
    '---',
    '',
    '## 字幕内容',
    '',
    rows.join('\n\n'),
    ''
  ].join('\n');
}

function buildBilibiliHandoff({ url, bvid, source, title, outputDir, files }) {
  const normalizedFiles = compactFiles({
    srt: existingFile(files.srt),
    json: existingFile(files.json),
    notebooklm_markdown: existingFile(files.notebooklmMarkdown)
  });

  return {
    version: 1,
    source_type: 'bilibili',
    source_url: url,
    title: title || bvid || 'B站字幕',
    files: normalizedFiles,
    suggested_upload: normalizedFiles.notebooklm_markdown ? 'notebooklm_markdown' : null
  };
}

function buildTelegramHandoff({ file, title, messageCount, outputDir, files }) {
  const normalizedFiles = compactFiles({
    markdown: existingFile(files.markdown),
    json: existingFile(files.json)
  });

  return {
    version: 1,
    source_type: 'telegram',
    source_file: file,
    title: title || 'Telegram Chat Export',
    message_count: messageCount,
    files: normalizedFiles,
    suggested_upload: normalizedFiles.markdown ? 'markdown' : null
  };
}

function writeHandoff(outputDir, safeTitle, payload) {
  const handoffPath = path.join(outputDir, `${safeTitle}_notebooklm_handoff.json`);
  fs.writeFileSync(handoffPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return handoffPath;
}

module.exports = {
  sourceTypeForUrl,
  buildArticleHandoff,
  buildBilibiliMarkdown,
  buildBilibiliHandoff,
  buildTelegramHandoff,
  writeHandoff
};

