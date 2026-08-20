function parseArguments(args) {
  const result = {
    targetUrl: '',
    setOutput: '',
    forceUpload: false,
    skipUpload: false,
    handoffNotebooklm: false,
    help: false
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if ((arg === '--url' || arg === '--file') && args[i + 1]) result.targetUrl = args[++i];
    else if (arg === '--set-output' && args[i + 1]) result.setOutput = args[++i];
    else if (arg === '--notebooklm' || arg === '--upload') result.forceUpload = true;
    else if (arg === '--no-upload') result.skipUpload = true;
    else if (arg === '--handoff-notebooklm') result.handoffNotebooklm = true;
    else if (arg === '--help' || arg === '-h') result.help = true;
    else if (!arg.startsWith('-') && !result.targetUrl) result.targetUrl = arg;
  }
  return result;
}

function validateTargetUrl(value) {
  if (!value) return { valid: false, message: '请输入目标链接、EML 文件/目录或 Telegram 导出 JSON 文件路径。' };
  
  const fs = require('fs');
  if (String(value).toLowerCase().endsWith('.json') || (fs.existsSync(value) && String(value).toLowerCase().endsWith('.json'))) {
    return { valid: true, type: 'telegram_json' };
  }
  const inputPath = String(value);
  if (/\.eml$/i.test(inputPath)) return { valid: true, type: 'eml' };
  if (fs.existsSync(inputPath) && fs.statSync(inputPath).isDirectory()) {
    const hasEml = fs.readdirSync(inputPath).some(name => /\.eml$/i.test(name));
    if (hasEml) return { valid: true, type: 'eml' };
    return { valid: false, message: '指定目录中未找到 .eml 邮件文件。' };
  }

  let url;
  try { url = new URL(value); } catch { return { valid: false, message: '链接格式不正确，或未能找到有效的 EML/Telegram 文件。' }; }
  if (!['http:', 'https:'].includes(url.protocol)) return { valid: false, message: '链接必须以 http:// 或 https:// 开头。' };
  const host = url.hostname.toLowerCase();
  if (host === 'doc88.com' || host === 'www.doc88.com') {
    if (/^\/p-\d+\.html$/i.test(url.pathname)) return { valid: true, type: 'doc88' };
    return { valid: false, message: 'Doc88 链接应为 https://www.doc88.com/p-数字.html。' };
  }
  if (host === 'mp.weixin.qq.com' || host.endsWith('.linkedin.com') || host === 'linkedin.com' || host === 'xiaohongshu.com' || host.endsWith('.xiaohongshu.com') || host === 'xhslink.com' || host.endsWith('.xhslink.com') || host === 'xhslink.cn' || host.endsWith('.xhslink.cn') || host === 'bilibili.com' || host.endsWith('.bilibili.com') || host === 'b23.tv') return { valid: true, type: 'url' };
  return { valid: false, message: '目前支持微信公众号、LinkedIn、小红书、哔哩哔哩视频、Doc88 链接、EML 文件/目录，以及 Telegram 导出 JSON 文件。' };
}

module.exports = { parseArguments, validateTargetUrl };
