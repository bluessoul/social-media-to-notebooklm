function parseArguments(args) {
  const result = { targetUrl: '', setOutput: '', forceUpload: false, skipUpload: false, help: false };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--url' && args[i + 1]) result.targetUrl = args[++i];
    else if (arg === '--set-output' && args[i + 1]) result.setOutput = args[++i];
    else if (arg === '--notebooklm' || arg === '--upload') result.forceUpload = true;
    else if (arg === '--no-upload') result.skipUpload = true;
    else if (arg === '--help' || arg === '-h') result.help = true;
    else if (!arg.startsWith('-') && !result.targetUrl) result.targetUrl = arg;
  }
  return result;
}

function validateTargetUrl(value) {
  let url;
  try { url = new URL(value); } catch { return { valid: false, message: '链接格式不正确。请提供完整的社交媒体或 B 站视频链接。' }; }
  if (!['http:', 'https:'].includes(url.protocol)) return { valid: false, message: '链接必须以 http:// 或 https:// 开头。' };
  const host = url.hostname.toLowerCase();
  if (host === 'mp.weixin.qq.com' || host.endsWith('.linkedin.com') || host === 'linkedin.com' || host === 'xiaohongshu.com' || host.endsWith('.xiaohongshu.com') || host === 'xhslink.com' || host.endsWith('.xhslink.com') || host === 'xhslink.cn' || host.endsWith('.xhslink.cn') || host === 'bilibili.com' || host.endsWith('.bilibili.com') || host === 'b23.tv') return { valid: true };
  return { valid: false, message: '目前只支持微信公众号、LinkedIn、小红书和哔哩哔哩视频链接。' };
}

module.exports = { parseArguments, validateTargetUrl };
