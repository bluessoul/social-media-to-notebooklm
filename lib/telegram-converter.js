const fs = require('fs');
const path = require('path');
const { parseArguments } = require('./arguments');
const { loadSettings } = require('./settings');
const { buildTelegramHandoff, writeHandoff } = require('./handoff');

function formatTextEntity(elem) {
  if (typeof elem === 'string') {
    return elem;
  }
  if (!elem || typeof elem !== 'object') {
    return String(elem || '');
  }
  const type = elem.type;
  const text = elem.text || '';
  switch (type) {
    case 'bold':
      return `**${text}**`;
    case 'italic':
      return `*${text}*`;
    case 'strikethrough':
      return `~~${text}~~`;
    case 'underline':
      return `<u>${text}</u>`;
    case 'code':
      return `\`${text}\``;
    case 'pre': {
      const lang = elem.language || '';
      return `\n\`\`\`${lang}\n${text}\n\`\`\`\n`;
    }
    case 'blockquote': {
      const lines = text.split('\n');
      const quoted = lines.map(line => `> ${line}`).join('\n');
      return `\n${quoted}\n`;
    }
    case 'text_link': {
      const href = elem.href || '';
      return `[${text}](${href})`;
    }
    case 'link': {
      const href = elem.href || text;
      return `[${text}](${href})`;
    }
    default:
      return text;
  }
}

function parseText(textVal) {
  if (textVal == null) return '';
  if (typeof textVal === 'string') return textVal;
  if (Array.isArray(textVal)) {
    return textVal.map(formatTextEntity).join('');
  }
  return String(textVal);
}

function sanitizeFilename(title) {
  return (title || 'telegram_export')
    .replace(/[\\/:*?"<>|\r\n]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
}

function convertTelegramJsonToMarkdown(data) {
  const chatTitle = data.name || 'Chat Export';
  const chatType = data.type || '';
  const chatId = data.id || '';
  const messages = Array.isArray(data.messages) ? data.messages : [];

  const lines = [];
  lines.push(`# ${chatTitle} 聊天记录\n`);
  lines.push(`- **群组名称**: ${chatTitle}`);
  if (chatType) lines.push(`- **群组类型**: ${chatType}`);
  if (chatId) lines.push(`- **群组 ID**: \`${chatId}\``);
  lines.push(`- **消息总数**: ${messages.length.toLocaleString('en-US')}\n`);
  lines.push('---\n');

  let currentDate = null;

  for (let i = 0; i < messages.length; i += 1) {
    const m = messages[i];
    const msgId = m.id;
    const msgType = m.type || 'message';
    const dateStr = m.date || '';

    const day = dateStr ? dateStr.slice(0, 10) : 'Unknown Date';
    const timePart = dateStr.length >= 19 ? dateStr.slice(11, 19) : dateStr;

    if (day !== currentDate) {
      currentDate = day;
      lines.push(`\n## 📅 ${currentDate}\n`);
    }

    const sender = m.from || m.actor || '未知发送者';
    lines.push(`<a id="msg-${msgId}"></a>`);

    if (msgType === 'service') {
      const action = m.action || '';
      let actionText = '';
      if (action === 'create_channel') {
        actionText = `创建了群组 **${m.title || ''}**`;
      } else if (action === 'invite_members') {
        const membersList = (m.members || []).filter(Boolean).map(String);
        const members = membersList.length ? membersList.join(', ') : '成员';
        actionText = `邀请了: **${members}**`;
      } else if (action === 'remove_members') {
        const membersList = (m.members || []).filter(Boolean).map(String);
        const members = membersList.length ? membersList.join(', ') : '成员';
        actionText = `移除了: **${members}**`;
      } else if (action === 'pin_message') {
        const targetId = m.message_id;
        actionText = `置顶了消息 [#\`${targetId}\`](#msg-${targetId})`;
      } else if (action === 'topic_created') {
        actionText = `创建了话题 **${m.title || ''}**`;
      } else if (action === 'topic_edit') {
        actionText = `编辑了话题 **${m.title || m.new_title || ''}**`;
      } else if (action === 'join_group_by_link') {
        actionText = '通过邀请链接加入群组';
      } else {
        actionText = `系统操作 (${action})`;
      }

      lines.push(`⚙️ **${sender}** ${actionText} · *\`${timePart}\`* *(#${msgId})*\n`);
      continue;
    }

    // Normal message
    lines.push(`### **${sender}** · *\`${timePart}\`* *(#${msgId})*`);

    if (m.reply_to_message_id) {
      lines.push(`> ↩️ *回复 [#\`${m.reply_to_message_id}\`](#msg-${m.reply_to_message_id})*`);
    }

    if (m.forwarded_from) {
      lines.push(`> ↗️ *转发自: ${m.forwarded_from}*`);
    }

    const body = parseText(m.text);
    if (body) {
      lines.push(`${body}\n`);
    }

    if (m.photo) {
      if (m.photo === '(File not included. Change data exporting settings to download.)') {
        lines.push('🖼️ *[图片 (未包含文件)]*\n');
      } else {
        lines.push(`🖼️ *[图片: \`${m.photo}\`]*\n`);
      }
    }

    if (m.file) {
      const fileVal = m.file;
      const fileName = m.file_name || '';
      const stickerEmoji = m.sticker_emoji || '';
      const mediaType = m.media_type || '';

      if (mediaType === 'sticker') {
        const emojiStr = stickerEmoji ? ` (${stickerEmoji})` : '';
        lines.push(`🎨 *[贴纸${emojiStr}: \`${fileName || fileVal}\`]*\n`);
      } else if (mediaType === 'voice_message') {
        lines.push(`🎙️ *[语音消息: \`${fileName || fileVal}\`]*\n`);
      } else if (mediaType === 'video_message') {
        lines.push(`📹 *[视频消息: \`${fileName || fileVal}\`]*\n`);
      } else if (mediaType === 'animation') {
        lines.push(`🎞️ *[动图: \`${fileName || fileVal}\`]*\n`);
      } else if (mediaType === 'audio_file') {
        lines.push(`🎵 *[音频: \`${fileName || fileVal}\`]*\n`);
      } else {
        if (fileVal === '(File not included. Change data exporting settings to download.)') {
          lines.push(`📎 *[文件: \`${fileName}\` (未包含文件)]*\n`);
        } else {
          lines.push(`📎 *[文件: \`${fileName || fileVal}\`]*\n`);
        }
      }
    }

    if (m.poll && typeof m.poll === 'object') {
      const poll = m.poll;
      lines.push(`📊 **投票: ${poll.question || ''}** (总票数: ${poll.total_voters || 0})`);
      for (const ans of poll.answers || []) {
        lines.push(`- ${ans.text || ''} (${ans.voters || 0} 票)`);
      }
      lines.push('');
    }

    if (Array.isArray(m.reactions)) {
      const reactStrs = m.reactions
        .filter(r => r && r.emoji)
        .map(r => `${r.emoji} ${r.count || 0}`);
      if (reactStrs.length) {
        lines.push(`👍 *[回应: ${reactStrs.join(' | ')}]*\n`);
      }
    }

    lines.push('---\n');
  }

  return lines.join('\n');
}

function processTelegramExport({ jsonPath, outputDir, options = {} }) {
  const absJsonPath = path.resolve(jsonPath);
  if (!fs.existsSync(absJsonPath)) {
    throw new Error(`JSON 文件不存在: ${absJsonPath}`);
  }

  const rawContent = fs.readFileSync(absJsonPath, 'utf8');
  const jsonData = JSON.parse(rawContent);

  const markdownContent = convertTelegramJsonToMarkdown(jsonData);

  const title = jsonData.name || path.basename(absJsonPath, '.json');
  const safeTitle = sanitizeFilename(title);

  const targetDir = outputDir ? path.resolve(outputDir) : path.dirname(absJsonPath);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const mdFilename = `${safeTitle}_history.md`;
  const mdFilePath = path.join(targetDir, mdFilename);
  fs.writeFileSync(mdFilePath, markdownContent, 'utf8');

  let handoffPath = null;
  if (options.handoffNotebooklm) {
    const handoffPayload = buildTelegramHandoff({
      file: absJsonPath,
      title: title,
      messageCount: Array.isArray(jsonData.messages) ? jsonData.messages.length : 0,
      outputDir: targetDir,
      files: {
        markdown: mdFilePath,
        json: absJsonPath
      }
    });
    handoffPath = writeHandoff(targetDir, `${safeTitle}_telegram`, handoffPayload);
  }

  return {
    title,
    safeTitle,
    jsonPath: absJsonPath,
    markdownPath: mdFilePath,
    handoffPath,
    messageCount: Array.isArray(jsonData.messages) ? jsonData.messages.length : 0
  };
}

// CLI execution
if (require.main === module) {
  const args = parseArguments(process.argv.slice(2));
  const settings = loadSettings(__dirname);

  const targetFile = args.targetUrl || process.argv.slice(2).find(a => !a.startsWith('-'));
  if (!targetFile) {
    console.error('错误: 请提供 Telegram 导出 JSON 文件路径。');
    process.exit(1);
  }

  const outDir = args.setOutput || settings.outputDir || '';

  try {
    const result = processTelegramExport({
      jsonPath: targetFile,
      outputDir: outDir,
      options: args
    });

    console.log(`[成功] Telegram 聊天记录导出完成:`);
    console.log(`- 标题: ${result.title}`);
    console.log(`- 消息数: ${result.messageCount.toLocaleString()}`);
    console.log(`- Markdown: ${result.markdownPath}`);
    if (result.handoffPath) {
      console.log(`- NotebookLM 交接清单: ${result.handoffPath}`);
    }
  } catch (err) {
    console.error(`[失败] ${err.message}`);
    process.exit(1);
  }
}

module.exports = {
  formatTextEntity,
  parseText,
  convertTelegramJsonToMarkdown,
  processTelegramExport
};
