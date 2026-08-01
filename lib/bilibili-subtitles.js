const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { parseArguments } = require('./arguments');
const {
  buildBilibiliMarkdown,
  buildBilibiliHandoff,
  writeHandoff
} = require('./handoff');

const args = parseArguments(process.argv.slice(2));
const inputUrl = args.targetUrl;
if (!inputUrl || args.help) {
  console.log('用法: run.bat --url "https://www.bilibili.com/video/BV..." [--output <目录>] [--playback-rate 4] [--handoff-notebooklm]');
  process.exit(args.help ? 0 : 1);
}

function safeName(value) {
  return (value || 'bilibili-subtitles').replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 100) || 'bilibili-subtitles';
}
function stamp(seconds) {
  const ms = Math.max(0, Math.round(Number(seconds || 0) * 1000));
  const h = Math.floor(ms / 3600000); const m = Math.floor(ms % 3600000 / 60000);
  const s = Math.floor(ms % 60000 / 1000); const z = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(z).padStart(3, '0')}`;
}
function toSrt(items) {
  return items.filter(x => x.content).map((x, i) => `${i + 1}\n${stamp(x.from)} --> ${stamp(x.to || x.from + 2)}\n${x.content.trim()}\n`).join('\n');
}
function extractBvid(url) { const m = String(url).match(/\b(BV[0-9A-Za-z]{10})\b/i); return m && m[1]; }
async function json(url) { const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }

async function nativeSubtitle(url, bvid) {
  const pageList = await json(`https://api.bilibili.com/x/player/pagelist?bvid=${bvid}`);
  const cid = pageList?.data?.[0]?.cid;
  if (!cid) return null;
  const player = await json(`https://api.bilibili.com/x/player/v2?bvid=${bvid}&cid=${cid}`);
  const tracks = player?.data?.subtitle?.subtitles || [];
  if (!tracks.length) return null;
  const track = tracks.find(x => /zh|中文/i.test(`${x.lan} ${x.lan_doc}`)) || tracks[0];
  const subtitleUrl = String(track.subtitle_url || '').replace(/^\/\//, 'https://');
  const payload = await json(subtitleUrl);
  const body = payload.body || payload.data?.body || [];
  return { source: 'native', title: track.lan_doc || track.lan || '字幕', items: body.map(x => ({ from: x.from, to: x.to, content: x.content })) };
}

async function browserSubtitle(url, rate) {
  let browser;
  for (const port of [9222, 9223]) { try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`); break; } catch {} }
  if (!browser) throw new Error('找不到已开启 CDP 的 Chrome/Edge。请用 --remote-debugging-port=9223 启动浏览器，并在其中打开 B 站视频。');
  const contexts = browser.contexts(); const pages = contexts.flatMap(c => c.pages());
  const page = pages.find(p => /bilibili\.com|b23\.tv/i.test(p.url())) || pages[0];
  if (!page) throw new Error('CDP 浏览器中没有可用页面。');
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2500);
  const result = await page.evaluate(async (playbackRate) => {
    const click = (sel) => { const el = document.querySelector(sel); if (el) { el.click(); return true; } return false; };
    click('.bpx-player-ctrl-subtitle');
    await new Promise(r => setTimeout(r, 400));
    click('[data-lan="ai-zh"]');
    const video = document.querySelector('video');
    if (!video) throw new Error('没有找到视频元素。');
    const selector = '.bili-subtitle-x-subtitle-panel-major-group';
    const seen = new Map();
    const read = () => { document.querySelectorAll(selector).forEach(el => { const text = el.innerText.trim(); if (text) { const t = Number(video.currentTime.toFixed(2)); seen.set(`${t}:${text}`, { from: t, to: t + 3, content: text }); } }); };
    const observer = new MutationObserver(read); observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    video.currentTime = 0; video.playbackRate = Number(playbackRate) || 4; await video.play().catch(() => {});
    const started = Date.now();
    while (!video.ended && Date.now() - started < 6 * 60 * 60 * 1000) { read(); await new Promise(r => setTimeout(r, 250)); }
    read(); observer.disconnect(); video.pause();
    return [...seen.values()].sort((a, b) => a.from - b.from);
  }, rate);
  if (typeof browser.disconnect === 'function') browser.disconnect();
  return { source: 'ai-browser', title: '中文 AI', items: result };
}

(async () => {
  const bvid = extractBvid(inputUrl);
  if (!bvid) throw new Error('无法从链接识别 BV 号；请使用完整的 bilibili.com/video/BV... 链接。');
  let result;
  try { result = await nativeSubtitle(inputUrl, bvid); } catch (e) { console.warn(`官方字幕接口不可用，将尝试浏览器捕获：${e.message}`); }
  if (!result || !result.items.length) result = await browserSubtitle(inputUrl, Number(process.argv[process.argv.indexOf('--playback-rate') + 1]) || 4);
  if (!result.items.length) throw new Error('没有捕获到字幕。请确认视频存在字幕，并在浏览器中登录 B 站。');
  const outArg = process.argv.indexOf('--output');
  const outDir = outArg >= 0 && process.argv[outArg + 1] ? path.resolve(process.argv[outArg + 1]) : path.resolve(process.cwd(), 'bilibili-output');
  fs.mkdirSync(outDir, { recursive: true });
  const stem = `${bvid}_${result.source}`;
  const srtPath = path.join(outDir, `${stem}.srt`);
  const jsonPath = path.join(outDir, `${stem}.json`);
  fs.writeFileSync(srtPath, toSrt(result.items), 'utf8');
  fs.writeFileSync(jsonPath, JSON.stringify({ url: inputUrl, bvid, source: result.source, title: result.title, items: result.items }, null, 2), 'utf8');
  console.log(`字幕已导出: ${srtPath}`);

  if (args.handoffNotebooklm) {
    const notebooklmMarkdownPath = path.join(outDir, `${stem}_notebooklm.md`);
    const handoffTitle = `B站字幕 ${bvid}`;
    fs.writeFileSync(notebooklmMarkdownPath, buildBilibiliMarkdown({
      url: inputUrl,
      bvid,
      source: result.source,
      title: handoffTitle,
      items: result.items
    }), 'utf8');
    const handoffPath = writeHandoff(outDir, stem, buildBilibiliHandoff({
      url: inputUrl,
      bvid,
      source: result.source,
      title: handoffTitle,
      outputDir: outDir,
      files: { srt: srtPath, json: jsonPath, notebooklmMarkdown: notebooklmMarkdownPath }
    }));
    console.log(`NotebookLM 可上传 Markdown: ${notebooklmMarkdownPath}`);
    console.log(`NotebookLM 交接清单: ${handoffPath}`);
  }
})().catch(e => { console.error(`B 站字幕导出失败: ${e.message}`); process.exitCode = 1; });
