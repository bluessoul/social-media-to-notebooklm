const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const TurndownService = require('turndown');
const { execSync } = require('child_process');
const readline = require('readline');
const os = require('os');
const { parseArguments, validateTargetUrl } = require('./lib/arguments');
const { loadSettings, saveOutputDirectory } = require('./lib/settings');
const { buildArticleHandoff, buildDoc88Handoff, buildEmlHandoff, writeHandoff } = require('./lib/handoff');

// Parse arguments
const cli = parseArguments(process.argv.slice(2));
const targetUrl = cli.targetUrl;
const forceUpload = cli.forceUpload;
const skipUpload = cli.skipUpload;
const handoffNotebooklm = cli.handoffNotebooklm;
const isWeChat = targetUrl.includes('mp.weixin.qq.com');
const isLinkedIn = targetUrl.includes('linkedin.com');
const isXiaohongshu = targetUrl.includes('xiaohongshu.com') || targetUrl.includes('xhslink.com');
let exportDir = '';

// Helper to delay execution (async sleep)

// Normalize Unicode Mathematical Alphanumeric Symbols to plain ASCII
function normalizeUnicode(text) {
  if (!text) return text;
  return text.replace(/[\u{1D400}-\u{1D7FF}]/gu, (c) => {
    const cp = c.codePointAt(0);
    // Bold Uppercase A-Z: U+1D400 -> U+0041
    if (cp >= 0x1D400 && cp <= 0x1D419) return String.fromCodePoint(cp - 0x1D400 + 0x0041);
    // Bold Lowercase a-z: U+1D41A -> U+0061
    if (cp >= 0x1D41A && cp <= 0x1D433) return String.fromCodePoint(cp - 0x1D41A + 0x0061);
    // Bold Digits 0-9: U+1D7CE -> U+0030
    if (cp >= 0x1D7CE && cp <= 0x1D7D7) return String.fromCodePoint(cp - 0x1D7CE + 0x0030);
    // Italic Uppercase A-Z: U+1D434 -> U+0041
    if (cp >= 0x1D434 && cp <= 0x1D44D) return String.fromCodePoint(cp - 0x1D434 + 0x0041);
    // Italic Lowercase a-z: U+1D44E -> U+0061
    if (cp >= 0x1D44E && cp <= 0x1D467) return String.fromCodePoint(cp - 0x1D44E + 0x0061);
    return c;
  });
}

function escapeHtml(text) {
  return String(text || '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to write files safely with retry logic to bypass cloud-sync file locking (e.g. OneDrive, Xiaomi Cloud)
async function safeWriteFile(filePath, content, options = 'utf8') {
  const maxRetries = 5;
  const delay = 200;
  for (let i = 0; i < maxRetries; i++) {
    try {
      await fs.promises.writeFile(filePath, content, options);
      return;
    } catch (err) {
      if ((err.code === 'EBUSY' || err.code === 'EPERM') && i < maxRetries - 1) {
        console.warn(`File ${filePath} is locked or busy. Retrying in ${delay}ms... (${i + 1}/${maxRetries})`);
        await sleep(delay);
      } else {
        throw err;
      }
    }
  }
}

// Helper to get YYYYMMDD_HHmmss timestamp
function getFormattedTimestamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}_${hours}${minutes}${seconds}`;
}

// Helper to ask user questions in console adaptively (supporting non-TTY polling)
async function askQuestionAdaptive(query, tempFileName, defaultValue) {
  const isInteractive = process.stdin.isTTY === true;
  
  if (isInteractive) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    return new Promise(resolve => rl.question(query, ans => {
      rl.close();
      const trimmed = ans.trim();
      resolve(trimmed === '' ? defaultValue : trimmed);
    }));
  } else {
    const tempDir = os.tmpdir();
    const tempFilePath = path.join(tempDir, tempFileName);
    
    if (fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (e) {}
    }
    
    console.log(`\n💬 [PROMPT INPUT REQUIRED]`);
    console.log(query);
    console.log(`👉 Since this is a non-interactive environment, please write your response to this file:`);
    console.log(`   ${tempFilePath}`);
    console.log(`Waiting up to 120 seconds for response... (write the file to proceed, or let it timeout to use default "${defaultValue}")`);
    
    const timeout = 120000;
    const interval = 1000;
    let elapsed = 0;
    
    while (elapsed < timeout) {
      await sleep(interval);
      elapsed += interval;
      
      if (fs.existsSync(tempFilePath)) {
        try {
          const content = fs.readFileSync(tempFilePath, 'utf8').trim();
          if (content.length > 0) {
            console.log(`📥 Read response from file: "${content}"`);
            try {
              fs.unlinkSync(tempFilePath);
            } catch (e) {}
            return content;
          }
        } catch (readErr) {}
      }
    }
    
    console.log(`⏰ Timeout reached (120s). Proceeding with default: "${defaultValue}"`);
    return defaultValue;
  }
}

async function configureOutputDirectory() {
  if (cli.setOutput) {
    const saved = saveOutputDirectory(__dirname, cli.setOutput);
    console.log(`保存位置已更新为: ${saved}`);
    return saved;
  }

  const settings = loadSettings(__dirname);
  if (settings.outputDir) {
    try {
      const saved = saveOutputDirectory(__dirname, settings.outputDir);
      console.log(`使用已保存的位置: ${saved}`);
      return saved;
    } catch (err) {
      console.warn(`已保存的位置无法使用: ${settings.outputDir}`);
    }
  }

  const chosen = await askQuestionAdaptive(
    '首次使用：请输入文件保存位置。以后会自动使用此位置；需要修改时请运行 --set-output "新位置"： ',
    'social_media_notebooklm_output_dir.txt',
    ''
  );
  if (!chosen) {
    throw new Error('尚未设置保存位置。请重新运行并输入保存位置，或使用 --set-output "保存位置"。');
  }
  const saved = saveOutputDirectory(__dirname, chosen);
  console.log(`保存位置已设置为: ${saved}`);
  return saved;
}

function showHelp() {
  console.log(`用法:
  run.bat --url "微信、LinkedIn、小红书、B站或 Doc88 链接"
  run.bat --file "邮件.eml 或邮件目录"
  run.bat "微信、LinkedIn、小红书、B站、Doc88 链接或邮件路径"
  run.bat --set-output "保存位置"

选项:
  --set-output <路径>  设置或修改默认保存位置
  --upload             抓取后直接上传到 NotebookLM
  --no-upload          抓取后不询问 NotebookLM 上传
  --handoff-notebooklm 抓取后生成 NotebookLM 交接清单（与 --no-upload 一起使用）
  --help               显示本说明`);
}

function explainError(error) {
  const message = error && error.message ? error.message : String(error);
  if (/保存位置|EACCES|EPERM|ENOENT/.test(message)) return `无法写入保存位置。请检查路径和权限，然后使用 --set-output 重新设置。详情：${message}`;
  if (/Timeout|timeout|selector|Content container/.test(message)) return `没有找到可提取的文章内容。网页可能改版、尚未登录或链接不支持。详情：${message}`;
  if (/net::|ERR_|Navigation/.test(message)) return `网页无法打开。请检查网络和链接是否有效。详情：${message}`;
  return `处理失败：${message}`;
}

function quoteCommandPath(commandPath) {
  return `"${String(commandPath).replace(/"/g, '""')}"`;
}

function discoverNotebookLmCommand() {
  const configured = process.env.NOTEBOOKLM_EXE;
  if (configured && fs.existsSync(configured)) return quoteCommandPath(configured);
  try {
    const candidates = execSync('where.exe notebooklm', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split(/\r?\n/)
      .map(value => value.trim())
      .filter(Boolean);
    if (candidates.length) return quoteCommandPath(candidates[0]);
  } catch (e) {}
  return 'notebooklm';
}

// Helper to interactively ask and upload files to Google NotebookLM if the CLI is authenticated
async function uploadToNotebookLM(filePath, articleTitle) {
  try {
    console.log('\nChecking Google NotebookLM CLI authentication status...');
    
    // 1. Run auth check to see if the CLI is authenticated (using standard python scripts path if available to ensure rookiepy access, or global notebooklm command)
    let authOk = false;
    const cmdPrefix = discoverNotebookLmCommand();

    try {
      const authOutput = execSync(`${cmdPrefix} auth check --test --json`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const authData = JSON.parse(authOutput);
      if (authData.status === 'ok' && authData.checks && authData.checks.token_fetch === true) {
        authOk = true;
      }
    } catch (e) {}
    
    if (!authOk) {
      if (forceUpload) {
        console.error('\n❌ Error: Google NotebookLM CLI authentication check failed.');
        console.error('Please run "notebooklm login" in your terminal first to authenticate.');
        process.exit(1);
      } else {
        console.log('💡 Note: Google NotebookLM CLI is not authenticated. Sync to Google NotebookLM skipped.');
        console.log('To enable auto-upload, run "notebooklm login" in your terminal to authenticate.');
        return null;
      }
    }
    
    console.log('🚀 Authenticated NotebookLM CLI detected!');
    
    // 2. Ask the user if they want to upload (skip if forceUpload is set)
    let wantUpload = 'n';
    if (forceUpload) {
      wantUpload = 'y';
      console.log('🤖 Non-interactive environment: Uploading automatically without prompting.');
    } else {
      wantUpload = await askQuestionAdaptive(
        `❓ 是否将本文章同步上传到 Google NotebookLM？(y/n, 默认 n): `,
        'notebooklm_upload_choice.txt',
        'n'
      );
    }
    if (wantUpload.toLowerCase() !== 'y' && wantUpload.toLowerCase() !== 'yes') {
      console.log('Sync to Google NotebookLM skipped.');
      return null;
    }
    
    // 3. Fetch list of available notebooks
    console.log('Fetching available NotebookLM workspaces...');
    let notebooks = [];
    try {
      const listOutput = execSync(`${cmdPrefix} list --json`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const listData = JSON.parse(listOutput);
      if (listData.notebooks && listData.notebooks.length > 0) {
        notebooks = listData.notebooks;
      }
    } catch (e) {
      console.error('Failed to retrieve NotebookLM list:', e.message);
      return null;
    }
    
    if (notebooks.length === 0) {
      console.log('No existing notebooks found in your account.');
    }
    
    // 4. Print the list of notebooks and let the user choose
    console.log('\n==== 可用的 NotebookLM 笔记本 ====');
    notebooks.forEach((n, idx) => {
      console.log(`[${idx + 1}] ${n.title} (ID: ${n.id.substring(0, 8)}...)`);
    });
    console.log(`[${notebooks.length + 1}] 🆕 新建一个 Notebook...`);
    console.log('=================================');
    
    const choiceStr = await askQuestionAdaptive(
      `请选择要上传的笔记本编号 (1-${notebooks.length + 1}, 默认 1): `,
      'notebooklm_notebook_choice.txt',
      '1'
    );
    let choice = parseInt(choiceStr);
    if (isNaN(choice) || choice < 1 || choice > notebooks.length + 1) {
      choice = 1;
    }
    
    let notebookId = '';
    let notebookTitle = '';
    
    if (choice === notebooks.length + 1) {
      // User chose to create a new notebook
      const newTitle = await askQuestionAdaptive(
        '请输入新建 Notebook 的标题 (默认 Social Media Clips): ',
        'notebooklm_notebook_title.txt',
        'Social Media Clips'
      );
      const finalTitle = newTitle || 'Social Media Clips';
      console.log(`Creating new notebook: "${finalTitle}"...`);
      try {
        const createOutput = execSync(`${cmdPrefix} create "${finalTitle}" --json`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        const createData = JSON.parse(createOutput);
        if (createData.notebook && createData.notebook.id) {
          notebookId = createData.notebook.id;
          notebookTitle = createData.notebook.title;
          console.log(`Created new notebook successfully: "${notebookTitle}" (${notebookId})`);
        }
      } catch (e) {
        console.error('Failed to create new notebook:', e.message);
        return null;
      }
    } else {
      // User selected an existing notebook
      const selected = notebooks[choice - 1];
      notebookId = selected.id;
      notebookTitle = selected.title;
      console.log(`Selected notebook: "${notebookTitle}" (${notebookId})`);
    }
    
    if (!notebookId) {
      console.warn('Could not determine a valid notebook workspace. Synchronize aborted.');
      return null;
    }
    
    // 5. Upload the source file using the selected/created notebook ID
    console.log(`Uploading source file to NotebookLM: "${path.basename(filePath)}"...`);
    execSync(`${cmdPrefix} source add "${filePath}" --notebook "${notebookId}"`, { stdio: 'inherit' });
    console.log(`✅ Successfully uploaded and synced "${articleTitle}" to Google NotebookLM [${notebookTitle}]!`);
    
    return { notebookId, cmdPrefix };
  } catch (err) {
    console.warn('Failed to upload to NotebookLM:', err.message);
    return null;
  }
}

async function run() {
  if (cli.help) {
    showHelp();
    return;
  }
  if (!targetUrl && cli.setOutput) {
    await configureOutputDirectory();
    return;
  }
  if (!targetUrl) {
    showHelp();
    throw new Error('没有提供文章链接；不会执行抓取。');
  }
  const validation = validateTargetUrl(targetUrl);
  if (!validation.valid) throw new Error(validation.message);

  if (validation.type === 'telegram_json') {
    const { processTelegramExport } = require('./lib/telegram-converter');
    exportDir = await configureOutputDirectory();
    const result = processTelegramExport({
      jsonPath: targetUrl,
      outputDir: exportDir,
      options: cli
    });
    console.log('[成功] Telegram 聊天记录导出完成:');
    console.log(`- title: ${result.title}`);
    console.log(`- message count: ${result.messageCount}`);
    console.log(`- Markdown: ${result.markdownPath}`);
    if (result.handoffPath) {
      console.log(`- NotebookLM handoff: ${result.handoffPath}`);
    }
    return;
  }

  if (validation.type === 'eml') {
    const { processEmlInput } = require('./lib/eml-converter');
    exportDir = await configureOutputDirectory();
    const result = processEmlInput({ inputPath: targetUrl, outputDir: exportDir });
    console.log('[成功] EML 邮件转换完成:');
    console.log(`- 标题: ${result.title}`);
    console.log(`- 邮件数: ${result.email_count}`);
    console.log(`- Markdown: ${result.markdown}`);
    if (result.attachments && result.attachments.length) {
      console.log(`- 附件清单: ${result.attachments.join(', ')}`);
    }
    if (result.failed && result.failed.length) {
      console.warn(`- 失败文件数: ${result.failed.length}`);
    }
    if (handoffNotebooklm) {
      const handoff = buildEmlHandoff({
        sourcePath: targetUrl,
        title: result.title,
        emailCount: result.email_count,
        attachments: result.attachments,
        files: { markdown: result.markdown }
      });
      const safeTitle = result.title.replace(/[\\/:*?"<>|]/g, '_');
      const handoffPath = writeHandoff(exportDir, `${safeTitle}_eml`, handoff);
      console.log(`- NotebookLM 交接清单: ${handoffPath}`);
    }
    if (!skipUpload && !handoffNotebooklm) await uploadToNotebookLM(result.markdown, result.title);
    return;
  }

  exportDir = await configureOutputDirectory();
  if (validation.type === 'doc88') {
    const { extractDoc88 } = require('./lib/doc88');
    const { extractDoc88Browser } = require('./lib/doc88-browser');
    console.log(`Target Doc88 URL: ${targetUrl}`);
    let result;
    if (process.env.DOC88_METHOD === 'resource') {
      result = await extractDoc88({ url: targetUrl, outputDir: exportDir, baseDir: __dirname });
    } else {
      try {
        console.log('Doc88: 使用浏览器渲染方式加载全部页面并导出 Canvas PDF...');
        result = await extractDoc88Browser({ url: targetUrl, outputDir: exportDir });
      } catch (browserError) {
        console.warn(`Doc88 浏览器导出失败，自动回退资源解析方式：${browserError.message}`);
        result = await extractDoc88({ url: targetUrl, outputDir: exportDir, baseDir: __dirname });
      }
    }
    console.log(`[成功] Doc88 文档提取完成:`);
    console.log(`- 标题: ${result.title}`);
    console.log(`- 文档 ID: ${result.pCode}`);
    console.log(`- 页数: ${result.pageCount}`);
    console.log(`- 方法: ${result.method || 'resource-swf'}`);
    console.log(`- PDF: ${result.pdfPath}`);
    const autoHandoff = !forceUpload;
    if (handoffNotebooklm || autoHandoff) {
      const handoff = buildDoc88Handoff({
        url: targetUrl,
        title: result.title,
        pCode: result.pCode,
        pageCount: result.pageCount,
        files: { pdf: result.pdfPath }
      });
      const handoffPath = writeHandoff(exportDir, result.title.replace(/[\\/:*?"<>|]/g, '_'), handoff);
      console.log(`- NotebookLM 交接清单: ${handoffPath}`);
    }
    if (forceUpload && !skipUpload) await uploadToNotebookLM(result.pdfPath, result.title);
    return;
  }
  console.log(`Target URL: ${targetUrl}`);
  console.log('Launching browser...');
  let browser;
  let context;
  let isCdp = false;
  let isPersistent = false;
  
  // Step 1: Try connecting via CDP to active Edge (9222) or Chrome (9223)
  const cdpPorts = [9222, 9223];
  for (const port of cdpPorts) {
    try {
      console.log(`Attempting to connect to active browser via CDP (port ${port})...`);
      browser = await chromium.connectOverCDP(`http://localhost:${port}`);
      isCdp = true;
      console.log(`Connected via CDP on port ${port} successfully! Inheriting active session.`);
      const contexts = browser.contexts();
      if (contexts.length > 0) {
        context = contexts[0];
      } else {
        context = await browser.newContext();
      }
      break;
    } catch (cdpErr) {
      console.warn(`CDP browser on port ${port} not active or available.`);
    }
  }

  // Step 2: Fallback to launching Playwright with C:\ChromeDebug persistent context
  if (!context && !browser) {
    const chromeDebugDir = 'C:\\ChromeDebug';
    if (fs.existsSync(chromeDebugDir)) {
      try {
        console.log(`Attempting to launch Playwright with persistent context: ${chromeDebugDir}`);
        context = await chromium.launchPersistentContext(chromeDebugDir, {
          channel: 'chrome',
          headless: true,
          ignoreDefaultArgs: ['--enable-automation'],
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          viewport: { width: 1280, height: 1000 }
        });
        isPersistent = true;
        console.log('Launched Playwright with persistent ChromeDebug context successfully! Inheriting login state.');
      } catch (persistErr) {
        console.warn(`Failed to launch with persistent context (possibly locked by another browser): ${persistErr.message}`);
      }
    }
  }

  // Step 3: Fallback to fresh headless browser
  if (!context && !browser) {
    console.log('Falling back to fresh headless browser...');
    browser = await chromium.launch({ 
      headless: true,
      ignoreDefaultArgs: ['--enable-automation']
    });
    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 1000 }
    });
  }
  
  // Apply stealth scripts to bypass bot detection
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined
    });
    Object.defineProperty(navigator, 'languages', {
      get: () => ['zh-CN', 'zh', 'en']
    });
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5]
    });
  });
  
  const page = await context.newPage();

  try {
    console.log(`Navigating to: ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    
    // Wait for the main content to load
    console.log('Waiting for content container...');
    if (isWeChat) {
      await page.waitForSelector('#js_content', { timeout: 15000 });
    } else if (isLinkedIn) {
      await page.waitForSelector('.feed-shared-update-v2, article, main', { timeout: 15000 });
    } else if (isXiaohongshu) {
      await page.waitForSelector('#detail-title, #detail-desc, .note-content, main', { timeout: 15000 });
    } else {
      await page.waitForSelector('body', { timeout: 15000 });
    }
    
    // Scroll down slowly to trigger lazy loading. On Xiaohongshu this also
    // loads comments that appear naturally for the signed-in session. It
    // deliberately never clicks any "more comments" or reply-expansion UI.
    console.log(isXiaohongshu
      ? 'Scrolling to load currently visible Xiaohongshu comments...'
      : 'Scrolling down to trigger image loading...');
    await page.evaluate(async (isXiaohongshuPage) => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 100;
        let stablePasses = 0;
        let previousHeight = 0;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;

          // Allow a few stable passes for comment lazy-loading. This does not
          // expand collapsed comment threads or trigger any hidden-content UI.
          if (scrollHeight === previousHeight && totalHeight >= scrollHeight) stablePasses += 1;
          else stablePasses = 0;
          previousHeight = scrollHeight;

          if ((totalHeight >= scrollHeight && stablePasses >= (isXiaohongshuPage ? 12 : 0)) || totalHeight > (isXiaohongshuPage ? 16000 : 10000)) {
            clearInterval(timer);
            resolve();
          }
        }, 100);
      });
    }, isXiaohongshu);
    
    // Give a short pause for any final image loading scripts to execute
    await page.waitForTimeout(2000);
    
    // Extract metadata and prepare image replacement in browser context
    console.log('Extracting article structure...');
    const articleData = await page.evaluate((url) => {
      const isWeChat = url.includes('mp.weixin.qq.com');
      const isLinkedIn = url.includes('linkedin.com');
      const isXiaohongshu = url.includes('xiaohongshu.com') || url.includes('xhslink.com');
      
      let contentEl = null;
      let title = 'Untitled';
      let author = '';
      let date = '';
      let headline = '';
      let reactionsCount = '';
      let commentsCount = '';
      let commentsList = [];
      let xhsOrderedImageUrls = [];
      
      if (isWeChat) {
        contentEl = document.querySelector('#js_content');
        if (!contentEl) return null;
        
        title = document.querySelector('#activity-name')?.textContent?.trim() || 'Untitled';
        author = document.querySelector('#profileBt a')?.textContent?.trim() || 
                 document.querySelector('.profile_nickname')?.textContent?.trim() || '';
        
        // Try to extract date
        const dateEl = document.querySelector('#publish-date');
        if (dateEl) {
          date = dateEl.textContent.trim();
        } else if (window.ct) {
          try {
            const timestamp = parseInt(window.ct) * 1000;
            const d = new Date(timestamp);
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            date = `${year}-${month}-${day}`;
          } catch (e) {}
        }
        
        if (!date) {
          const htmlText = document.body.innerHTML;
          const dateMatch = htmlText.match(/var\s+publish_time\s*=\s*"([^"]+)"/) || 
                            htmlText.match(/publish_time\s*:\s*"([^"]+)"/) ||
                            htmlText.match(/var\s+ct\s*=\s*"([^"]+)"/) ||
                            htmlText.match(/ct\s*:\s*"([^"]+)"/);
          if (dateMatch) {
            const val = dateMatch[1];
            if (/^\d+$/.test(val)) {
              try {
                const d = new Date(parseInt(val) * 1000);
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                date = `${year}-${month}-${day}`;
              } catch (e) {}
            } else {
              date = val;
            }
          }
        }
      } else if (isLinkedIn) {
        // Select the main post card including comments
        contentEl = document.querySelector('article.main-feed-activity-card') ||
                    document.querySelector('.feed-shared-update-v2') || 
                    document.querySelector('article') || 
                    document.querySelector('main') ||
                    document.querySelector('.core-rail');
        if (!contentEl) return null;
        
        // Find author name
        const authorEl = contentEl.querySelector('.update-components-actor__title') ||
                         contentEl.querySelector('.feed-shared-actor__title') ||
                         contentEl.querySelector('.feed-shared-actor__name') ||
                         contentEl.querySelector('.ca-actor__name') ||
                         contentEl.querySelector('.update-components-actor__meta-link') ||
                         contentEl.querySelector('a[href*="/in/"]');
                         
        author = authorEl ? authorEl.textContent.trim().replace(/\s+/g, ' ') : '';
        if (!author) {
          const namedProfile = [...contentEl.querySelectorAll('a[href*="/in/"]')].find(link => link.textContent.trim());
          author = namedProfile ? namedProfile.textContent.trim().replace(/\s+/g, ' ') : 'LinkedIn 用户';
        }
        // Clean up duplicate names, verification badges, and follow states if text got joined
        if (author) {
          author = author.replace(/•?\s*(Following|Verified|FollowingVerified)\s*/gi, '').trim();
          const half = Math.floor(author.length / 2);
          if (half > 0 && author.substring(0, half) === author.substring(half)) {
            author = author.substring(0, half);
          }
        }
        
        // Try to extract a meaningful title for this LinkedIn post
        let extractedTitle = '';
        // Try og:title meta tag
        const ogTitleEl = document.querySelector('meta[property="og:title"]');
        if (ogTitleEl) extractedTitle = ogTitleEl.content.trim();
        // Fallback to document.title (LinkedIn sets this to something like "Author's Post on LinkedIn: ...")
        if (!extractedTitle) extractedTitle = (document.title || '').trim();
        if (/^Post\s*\|\s*LinkedIn$/i.test(extractedTitle)) extractedTitle = '';
        if (extractedTitle.length > 120 || /^#/.test(extractedTitle)) extractedTitle = '';
        // Fallback: use first line of post text as title
        if (!extractedTitle || extractedTitle.length < 5) {
          const textEl = document.querySelector('.feed-shared-text__text-view') ||
                         document.querySelector('.update-components-text') ||
                         document.querySelector('.feed-shared-update-v2__description');
          if (textEl) {
            const firstLine = textEl.textContent.trim().split('\n')[0].trim();
            if (firstLine.length > 5 && firstLine.length < 200) {
              extractedTitle = firstLine;
            }
          }
        }
        title = extractedTitle || `${author} 的 LinkedIn 动态`;
        
        // Find post age/date
        const dateEl = contentEl.querySelector('.update-components-actor__sub-description') ||
                       contentEl.querySelector('.update-components-actor__subtext') ||
                       contentEl.querySelector('.update-components-actor__meta') ||
                       contentEl.querySelector('.feed-shared-actor__sub-text') ||
                       contentEl.querySelector('.ca-actor__time') ||
                       contentEl.querySelector('time');
        date = dateEl ? dateEl.textContent.trim().replace(/\s+/g, ' ') : '';
        if (date.includes('•')) {
          const parts = date.split('•').map(p => p.trim());
          date = parts.join(' • ');
        }
        
        // Find author headline
        const headlineEl = contentEl.querySelector('.update-components-actor__description') ||
                           contentEl.querySelector('.feed-shared-actor__description') ||
                           contentEl.querySelector('.ca-actor__headline');
        headline = headlineEl ? headlineEl.textContent.trim().replace(/\s+/g, ' ') : '';
        if (headline) {
          const half = Math.floor(headline.length / 2);
          if (half > 0 && headline.substring(0, half) === headline.substring(half)) {
            headline = headline.substring(0, half);
          }
        }
        
        // Find Reactions count
        const reactionsEl = contentEl.querySelector('.social-details-social-counts__reactions-count, .social-details-social-counts__social-exports');
        reactionsCount = reactionsEl ? reactionsEl.textContent.trim().replace(/\s+/g, ' ') : '';
        
        // Find Comments count
        const commentsCountEl = contentEl.querySelector('.social-details-social-counts__comments, .social-details-social-counts__num-comments, a[href*="post_social-actions-comments"]');
        commentsCount = commentsCountEl ? commentsCountEl.textContent.trim().replace(/\s+/g, ' ') : '';
        
        // Extract comments list
        contentEl.querySelectorAll('.comments-comment-item, .comments-comments-list__comment-item').forEach(c => {
          const cAuthorEl = c.querySelector('.comments-comment-meta__description-title, .comments-post-meta__name');
          const cHeadlineEl = c.querySelector('.comments-comment-meta__description-subtitle, .comments-post-meta__headline');
          const cTextEl = c.querySelector('.comments-comment-item__main-content, .comments-comment-item__text');
          const cTimeEl = c.querySelector('.comments-comment-item__timestamp, .comments-comment-item__time');
          
          if (cAuthorEl && cTextEl) {
            let commenter = cAuthorEl.textContent.trim().replace(/\s+/g, ' ');
            const cHalf = Math.floor(commenter.length / 2);
            if (cHalf > 0 && commenter.substring(0, cHalf) === commenter.substring(cHalf)) {
              commenter = commenter.substring(0, cHalf);
            }
            
            commentsList.push({
              author: commenter,
              headline: cHeadlineEl ? cHeadlineEl.textContent.trim().replace(/\s+/g, ' ') : '',
              text: cTextEl.textContent.trim(),
              time: cTimeEl ? cTimeEl.textContent.trim() : ''
            });
          }
        });

        // Public LinkedIn pages use a different DOM. Build a comment tree when it is available.
        const publicCommentSections = [...contentEl.querySelectorAll('section.comment')];
        if (publicCommentSections.length) {
          const nodes = new Map();
          publicCommentSections.forEach(section => {
            const authorEl = section.querySelector('.comment__author');
            const textEl = section.querySelector('.comment__text');
            if (!authorEl || !textEl) return;
            nodes.set(section, {
              author: authorEl.textContent.trim().replace(/\s+/g, ' '),
              headline: '',
              text: textEl.textContent.trim(),
              time: section.querySelector('.comment__duration-since, time')?.textContent?.trim() || '',
              replies: []
            });
          });
          const roots = [];
          nodes.forEach((item, section) => {
            const parent = section.parentElement?.closest('section.comment');
            const parentItem = parent ? nodes.get(parent) : null;
            if (parentItem) parentItem.replies.push(item);
            else roots.push(item);
          });
          commentsList = roots;
        }
      } else if (isXiaohongshu) {
        const titleEl = document.querySelector('#detail-title, #noteContainer .title, .note-content .title, [class*="note-title"]');
        const descEl = document.querySelector('#detail-desc, .note-content .desc, [class*="note-desc"]');
        const mediaEl = document.querySelector('#noteContainer, .note-content, [class*="note-detail"], main');
        if (!mediaEl) return null;
        contentEl = mediaEl;
        title = titleEl?.textContent?.trim() || descEl?.textContent?.trim().split('\n')[0]?.slice(0, 80) || '小红书笔记';
        author = (document.querySelector('#noteContainer .author, .author .name, [class*="author"] [class*="name"], [class*="user"] [class*="name"]')?.textContent?.trim() || '小红书用户').replace(/关注$/, '').trim();
        date = document.querySelector('.date, [class*="date"], [class*="time"]')?.textContent?.trim() || '';

        // Keep visible note text and note media only. Do not carry comments, avatars, or controls into the body.
        const noteClone = document.createElement('div');
        if (titleEl) noteClone.appendChild(titleEl.cloneNode(true));
        if (descEl && descEl !== titleEl) noteClone.appendChild(descEl.cloneNode(true));
        mediaEl.querySelectorAll('img').forEach(img => {
          if (!img.closest('.comments-container, .avatar, [class*="avatar"], [class*="comment"]')) noteClone.appendChild(img.cloneNode(true));
        });
        contentEl = noteClone.childNodes.length ? noteClone : mediaEl;

        // Xiaohongshu's DOM contains recommendation cards, avatars, lazy-load
        // placeholders and sometimes duplicated carousel nodes.  The page's
        // serialized note state contains the authoritative imageList in the
        // order used by the post.  Prefer it so image_1 always means the first
        // image published by the author, rather than the first <img> in DOM.
        try {
          const noteId = (location.pathname.match(/[0-9a-f]{20,}/i) || [])[0];
          const stateScript = [...document.scripts]
            .map(script => script.textContent || '')
            .find(text => text.includes('"imageList"') && (!noteId || text.includes(noteId)));
          if (stateScript) {
            const imageListStart = stateScript.indexOf('"imageList"');
            const arrayStart = stateScript.indexOf('[', imageListStart);
            if (arrayStart >= 0) {
              let depth = 0;
              let quote = false;
              let escaped = false;
              let arrayEnd = -1;
              for (let i = arrayStart; i < stateScript.length; i++) {
                const ch = stateScript[i];
                if (quote) {
                  if (escaped) escaped = false;
                  else if (ch === '\\') escaped = true;
                  else if (ch === '"') quote = false;
                  continue;
                }
                if (ch === '"') { quote = true; continue; }
                if (ch === '[') depth++;
                else if (ch === ']') {
                  depth--;
                  if (depth === 0) { arrayEnd = i; break; }
                }
              }
              if (arrayEnd > arrayStart) {
                const rawImageList = stateScript.slice(arrayStart, arrayEnd + 1);
                const imageList = JSON.parse(rawImageList);
                xhsOrderedImageUrls = imageList.map(item =>
                  item?.urlDefault || item?.urlPre ||
                  item?.infoList?.find(info => info?.imageScene === 'WB_DFT')?.url ||
                  item?.infoList?.[0]?.url || ''
                ).filter(Boolean);
              }
            }
          }
        } catch (error) {
          // Keep the DOM fallback below for older/partially rendered pages.
          xhsOrderedImageUrls = [];
        }

        if (xhsOrderedImageUrls.length) {
          const orderedMedia = document.createDocumentFragment();
          xhsOrderedImageUrls.forEach(src => {
            const image = document.createElement('img');
            image.setAttribute('src', src);
            orderedMedia.appendChild(image);
          });
          noteClone.querySelectorAll('img').forEach(img => img.remove());
          noteClone.appendChild(orderedMedia);
        }

        // Export only comments already visible on the page. Keep DOM order and reply hierarchy.
        const cleanComment = (item) => ({
          author: (item.querySelector('.author .name, .author')?.textContent?.trim() || '匿名用户').replace(/作者$/, '').trim(),
          time: item.querySelector('.info .date, .date')?.textContent?.trim() || '',
          text: item.querySelector('.content .note-text, .content')?.textContent?.trim() || '',
          replies: []
        });
        commentsList = [...document.querySelectorAll('.comments-container > .list-container > .parent-comment')]
          .map(root => {
            const rootItem = root.querySelector(':scope > .comment-item');
            if (!rootItem) return null;
            const item = cleanComment(rootItem);
            item.replies = [...root.querySelectorAll('.reply-container .comment-item-sub')].map(cleanComment);
            return item;
          })
          .filter(Boolean);
      }
      
      if (!contentEl) return null;
      
      const clone = contentEl.cloneNode(true);
      
      // Remove elements that are script blocks, empty placeholders, or QR code panels we don't want
      clone.querySelectorAll('script, style, iframe:not([src])').forEach(el => el.remove());
      
      // Clean up LinkedIn sign-in wrappers or action buttons (preserving the main commentary/text wrapper!)
      if (isLinkedIn) {
        // Strip out social action buttons, reactors list, comment box input forms, and commenter avatar images completely!
        clone.querySelectorAll([
          '.feed-shared-update-v2__control-menu',
          '.feed-shared-control-menu',
          '.social-actions',
          '.feed-shared-social-action-bar',
          '.social-details-social-activity',
          '.visually-hidden',
          'svg',
          'iframe',
          '.sign-in-modal',
          '.header__sign-in',
          '.registration-outcome-banner',
          '.feed-shared-update-v2__social-row',
          '.social-details-reactors-facepile',
          '.social-details-reactors-facepile-container',
          '.comments-comment-box',
          '.comments-comment-box__avatar-image',
          '.comments-comment-box__form',
          '.comments-comment-box__avatar-image--cr',
          '.comments-comment-item__avatar',
          '.main-feed-activity-card .comment',
          '.comments-comments-list',
          '.comments-comment-item',
          'section.comment',
          '.feed-shared-avatar-image',
          '.comments-post-meta__profile-picture',
          '.comments-comment-item img',
          // New selectors to guarantee complete removal of active user avatar/form and all commenter avatars/clutter:
          '[class*="comments-comment-box"]',
          '[class*="comments-sort-order-toggle"]',
          '.comments-sort-order-toggle',
          '[class*="comments-comment-meta__image-link"]',
          '[class*="comments-post-meta__image-link"]',
          '[class*="comments-comment-meta__actor-image"]',
          '[class*="comments-post-meta__actor-image"]',
          '[class*="comments-comment-item__avatar"]',
          '[class*="comments-post-meta__profile-picture"]',
          '[class*="comments-comment-entity"] img',
          '[class*="comments-comment-item"] img',
          '[class*="feed-shared-avatar-image"]',
          '[class*="comment-social-activity"]',
          '[class*="comment-options"]',
          '.comment-social-activity',
          '.comment-options-trigger',
          // Selectors to remove duplicate reactions icons row inside card body:
          '[class*="social-details-social-counts"]',
          '.social-details-social-counts',
          '[class*="social-detail-social-counts"]',
          '.social-detail-social-counts'
        ].join(',')).forEach(el => el.remove());

        // Remove buttons and artdeco-buttons only if they DO NOT wrap any images
        clone.querySelectorAll('button, .artdeco-button').forEach(btn => {
          if (!btn.querySelector('img')) {
            btn.remove();
          }
        });

        // Keep the total comment count, but remove LinkedIn interaction controls and sign-in prompts.
        clone.querySelectorAll([
          'a[href*="post_social-actions-reactions"]',
          'a[href*="post_like"]',
          'a[href*="post_comment"]',
          'a[href*="post_see-more-comments"]',
          'a[href*="feed-cta"]'
        ].join(',')).forEach(el => el.remove());
        clone.querySelectorAll('a, button, p, span, div').forEach(el => {
          const text = el.textContent.trim().replace(/\s+/g, ' ');
          if (/^(Like|Comment|Reply|See more comments|To view or add a comment|\.\.\.|…|\d+ Reactions)$/i.test(text)) el.remove();
        });
        clone.querySelectorAll('p').forEach(el => {
          if (/To view or add a comment/i.test(el.textContent)) el.remove();
        });

        // Metadata is rendered once in the PDF header; remove duplicate page chrome from the body.
        clone.querySelectorAll('[class*="actor"], [class*="duration"], time').forEach(el => el.remove());
        clone.querySelectorAll('a, button, div, span').forEach(el => {
          if (el.textContent.trim() === 'Report this post') el.remove();
        });
      }

      if (isXiaohongshu) {
        clone.querySelectorAll('button, svg, iframe, [class*="comment"], [class*="like"], [class*="collect"], [class*="share"], [class*="follow"]').forEach(el => el.remove());
      }
      
      // Normalize styled strong text
      clone.querySelectorAll('span, p, section, strong').forEach(el => {
        const style = el.getAttribute('style') || '';
        if (style.includes('font-weight: bold') || style.includes('font-weight: 700') || style.includes('font-weight: 600')) {
          if (el.tagName !== 'STRONG') {
            el.innerHTML = `<strong>${el.innerHTML}</strong>`;
          }
        }
      });
      
      // Process images
      const imgs = clone.querySelectorAll('img');
      const imgList = [];
      let imgCounter = 1;
      
      imgs.forEach((img) => {
        const rawSrc = img.getAttribute('src') || 
                       img.getAttribute('data-src') || 
                       img.getAttribute('data-delayed-url') ||
                       img.getAttribute('data-lilp-lazy-src');
        if (!rawSrc) return;

        // LinkedIn profile photos and interface assets are not post media.
        if (isLinkedIn && (/profile-(display|framed)photo|company-logo|static\.licdn\.com/i.test(rawSrc))) {
          img.remove();
          return;
        }
        
        // Skip base64 placeholders or tracking pixels or ads
        if (rawSrc.startsWith('data:') || rawSrc.includes('licdn.com/mpr/mpr') || rawSrc.length < 10 || rawSrc.includes('px.ads.linkedin.com') || rawSrc.includes('doubleclick') || rawSrc.includes('googleadx')) {
          img.remove();
          return;
        }
        
        // Zero-pad filenames so file explorers keep image_001, image_002, ...
        // in the same order as the rendered post (especially for 10+ images).
        const filename = `image_${String(imgCounter).padStart(3, '0')}`;
        imgCounter++;
        
        imgList.push({
          url: rawSrc,
          filename: filename,
          order: imgCounter - 1
        });

        img.setAttribute('alt', `${isXiaohongshu ? '小红书' : '文章'}图片 ${imgCounter - 1}`);
        
        // Mark for replacement in HTML
        img.setAttribute('src', `__LOCAL_IMAGE_${filename}__`);
        
        // Clean up raw attributes to keep HTML tidy
        img.removeAttribute('data-src');
        img.removeAttribute('data-delayed-url');
        img.removeAttribute('data-lilp-lazy-src');
        img.removeAttribute('crossorigin');
        img.removeAttribute('style');
        img.removeAttribute('class');
      });
      
      return {
        title,
        author,
        date,
        headline,
        reactionsCount,
        commentsCount,
        commentsList,
        html: clone.innerHTML,
        images: imgList,
        imageOrderSource: isXiaohongshu && xhsOrderedImageUrls.length ? 'xiaohongshu_note_imageList' : 'content_dom_order',
        isLinkedIn,
        isXiaohongshu
      };
    }, targetUrl);
    
    if (!articleData) {
      throw new Error('未找到可提取的内容。小红书可能要求先在浏览器中完成正常登录，或笔记已不可见。');
    }

        // Normalize Unicode math symbols in all text fields
    if (typeof normalizeUnicode === 'function') {
      articleData.title = normalizeUnicode(articleData.title);
      articleData.author = normalizeUnicode(articleData.author);
      articleData.headline = normalizeUnicode(articleData.headline);
      articleData.html = normalizeUnicode(articleData.html);
      if (articleData.commentsList) articleData.commentsList.forEach(c => {
        c.author = normalizeUnicode(c.author);
        c.headline = normalizeUnicode(c.headline);
        c.text = normalizeUnicode(c.text);
      });
    }

    // Sanitize title to be a safe Windows filename
    // Sanitize title to be a safe Windows filename AND URL-safe
    let safeTitle = (articleData.title || 'article')
      .replace(/[#<>:"\\/\\|?*\x00-\x1F]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .trim() || 'article';
    
    // Detect generic titles and rename to prevent overwriting
    const isGenericTitle = 
      /linkedin[_\s]*用户/i.test(safeTitle) || 
      /的[_\s]*linkedin[_\s]*动态/i.test(safeTitle) || 
      safeTitle === 'Untitled' || 
      safeTitle === 'article' ||
      !safeTitle.trim();
      
    if (isGenericTitle) {
      const timestamp = getFormattedTimestamp();
      const authorSafe = (articleData.author || 'LinkedIn').replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_').substring(0, 50);
      safeTitle = `${authorSafe}_${timestamp}`;
      console.log(`⚠️ Generic/empty title detected. Renaming export file prefix to: ${safeTitle}`);
    }
    
    // Check if this post contains an attached PDF document (document viewer inside iframe)
    if (isLinkedIn) {
      console.log('Checking for attached PDF documents/presentations...');
      const frames = page.frames();
      const docFrame = frames.find(f => f.url().includes('native-document.html'));
      
      if (docFrame) {
        console.log('Detected an attached PDF document iframe inside this post!');
        // Approach A: Try to get the direct download CDN link from the iframe DOM
        let downloadUrl = await docFrame.evaluate(() => {
          const dlLink = document.querySelector('a[href*="/feedshare-document-pdf" i]') || 
                         document.querySelector('a.ssplayer-virus-scan-container__download-button') ||
                         document.querySelector('[class*="download" i] a');
          return dlLink ? dlLink.href : null;
        });
        
        if (downloadUrl) {
          console.log(`Found direct PDF download URL: ${downloadUrl}`);
          console.log('Downloading PDF attachment via Playwright request context...');
          try {
            const attachmentFile = `${safeTitle}_attachment.pdf`;
            const attachmentPath = path.join(exportDir, attachmentFile);
            
            const response = await page.request.get(downloadUrl);
            if (response.status() === 200) {
              const buffer = await response.body();
              await safeWriteFile(attachmentPath, buffer, null);
              console.log(`-> Attachment PDF successfully downloaded and saved to: ${attachmentPath}`);
              articleData.attachmentFile = attachmentFile;
            } else {
              console.warn(`Failed to download PDF attachment directly (status: ${response.status()}). Trying button click...`);
            }
          } catch (downloadErr) {
            console.error('Failed to download PDF attachment directly:', downloadErr.message);
          }
        }
        
        // Approach B Fallback: Trigger download by clicking the topbar download button inside iframe
        if (!articleData.attachmentFile) {
          const downloadBtn = await docFrame.$('button.ssplayer-topbar-action-download, button[class*="download" i], [class*="ssplayer-topbar-action-download" i]');
          if (downloadBtn) {
            console.log('Initiating Playwright download event by clicking download button inside the iframe...');
            try {
              const attachmentFile = `${safeTitle}_attachment.pdf`;
              const attachmentPath = path.join(exportDir, attachmentFile);
              
              const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
              await downloadBtn.click();
              const download = await downloadPromise;
              await download.saveAs(attachmentPath);
              console.log(`-> Attachment PDF successfully downloaded via click and saved to: ${attachmentPath}`);
              articleData.attachmentFile = attachmentFile;
            } catch (clickErr) {
              console.warn('Could not download PDF attachment via button click:', clickErr.message);
            }
          } else {
            console.log('No visible download button found inside the document iframe.');
          }
        }
      } else {
        console.log('No document iframe detected on this post.');
      }
    }
    
    console.log(`Article Title: "${articleData.title}"`);
    console.log(`Author: ${articleData.author}`);
    console.log(`Date: ${articleData.date}`);
    console.log(`Found ${articleData.images.length} images to download.`);
    
    // Keep each article's local images isolated so multiple exports never overwrite image_1, image_2, ...
    const imageDirName = safeTitle;
    const imgDir = path.join(exportDir, 'images', imageDirName);
    const relativeImageDir = `./images/${imageDirName}`;
    if (!fs.existsSync(imgDir)) {
      fs.mkdirSync(imgDir, { recursive: true });
    }
    
    // Download images
    const pathMap = {};
    for (const img of articleData.images) {
      try {
        console.log(`Downloading: ${img.url}`);
        
        // Request the image via Playwright context (inherits browser session and cookies)
        const response = await page.request.get(img.url, {
          headers: {
            'Referer': isWeChat ? 'https://mp.weixin.qq.com/' : isXiaohongshu ? 'https://www.xiaohongshu.com/' : 'https://www.linkedin.com/'
          }
        });
        
        if (response.status() !== 200) {
          console.warn(`Failed to download image (status: ${response.status()}): ${img.url}`);
          continue;
        }
        
        const buffer = await response.body();
        
        // Determine file extension
        let ext = 'jpg';
        const urlObj = new URL(img.url);
        const wxFmt = urlObj.searchParams.get('wx_fmt');
        if (wxFmt && wxFmt !== 'other') {
          if (wxFmt === 'jpeg') ext = 'jpg';
          else ext = wxFmt;
        } else {
          const contentType = response.headers()['content-type'];
          if (contentType) {
            const match = contentType.match(/image\/(\w+)/);
            if (match) {
              ext = match[1];
              if (ext === 'jpeg') ext = 'jpg';
            }
          }
        }
        
        const finalFilename = `${img.filename}.${ext}`;
        const localFilePath = path.join(imgDir, finalFilename);
        await safeWriteFile(localFilePath, buffer, null);
        
        // Map the placeholder to the actual relative path
        pathMap[`__LOCAL_IMAGE_${img.filename}__`] = `${relativeImageDir}/${finalFilename}`;
        console.log(`-> Saved as ${relativeImageDir}/${finalFilename}`);
      } catch (err) {
        console.error(`Failed to download image ${img.url}:`, err.message);
      }
    }
    
    // Replace placeholders in HTML with local relative image paths
    let finalHtml = articleData.html;
    for (const [placeholder, localPath] of Object.entries(pathMap)) {
      finalHtml = finalHtml.split(placeholder).join(localPath);
    }
    
    // Replace placeholders with online original image URLs for a web/cloud-friendly version
    let finalHtmlOnline = articleData.html;
    for (const img of articleData.images) {
      const placeholder = `__LOCAL_IMAGE_${img.filename}__`;
      finalHtmlOnline = finalHtmlOnline.split(placeholder).join(img.url);
    }
    
    // Setup Turndown for high-quality Markdown conversion
    const turndownService = new TurndownService({
      headingStyle: 'atx',
      hr: '---',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced'
    });
    
    // Add custom Turndown rules if necessary
    turndownService.addRule('unwrapSection', {
      filter: ['section', 'div'],
      replacement: function (content) {
        return '\n\n' + content + '\n\n';
      }
    });
    
    console.log('Converting HTML to Markdown (Local and Online versions)...');
    
    // Generate local markdown
    let markdownContent = turndownService.turndown(finalHtml);
    markdownContent = markdownContent.replace(/^[ \t]+$/gm, '');
    markdownContent = markdownContent.replace(/\n{3,}/g, '\n\n');
    
    // Generate online markdown
    let markdownContentOnline = turndownService.turndown(finalHtmlOnline);
    markdownContentOnline = markdownContentOnline.replace(/^[ \t]+$/gm, '');
    markdownContentOnline = markdownContentOnline.replace(/\n{3,}/g, '\n\n');
    
    // Compile final Markdown versions
    let finalMarkdown = '';
    let finalMarkdownOnline = '';
    
    if (articleData.isLinkedIn) {
      let commentsMd = '';
      if (articleData.commentsList && articleData.commentsList.length > 0) {
        commentsMd = `\n\n---\n\n## 💬 评论区 (${articleData.commentsCount || articleData.commentsList.length})\n\n`;
        articleData.commentsList.forEach((c, idx) => {
          commentsMd += `### ${idx + 1}. ${c.author}\n`;
          if (c.headline) commentsMd += `_${c.headline}_\n`;
          if (c.time) commentsMd += `*${c.time}*\n`;
          commentsMd += `\n${c.text}\n\n`;
          (c.replies || []).forEach((reply, replyIdx) => {
            commentsMd += `> ↳ ${idx + 1}.${replyIdx + 1} ${reply.author}${reply.time ? ` · ${reply.time}` : ''}\n>\n> ${reply.text}\n\n`;
          });
        });
      }
      
      const metaInfo = [
        `- **作者**: ${articleData.author || '未知'}`,
        articleData.headline ? `- **头衔**: ${articleData.headline}` : null,
        `- **发表时间/热度**: ${articleData.date || '未知'}`,
        articleData.reactionsCount ? `- **互动数**: ${articleData.reactionsCount}` : null,
        `- **原文链接**: [LinkedIn 动态](${targetUrl})`
      ].filter(Boolean).join('\n');
      
      let attachmentMd = '';
      if (articleData.attachmentFile) {
        attachmentMd = `\n\n> 📎 **附件**: 本帖包含一份原版 PDF 文档，已自动为您下载并保存为本地文件：[${articleData.attachmentFile}](${articleData.attachmentFile})`;
      }
      
      finalMarkdown = `# ${articleData.title}
 
${metaInfo}${attachmentMd}
 
---
 
${markdownContent}
${commentsMd}
`;

      finalMarkdownOnline = `# ${articleData.title}
 
${metaInfo}${attachmentMd}
 
---
 
${markdownContentOnline}
${commentsMd}
`;
    } else if (articleData.isXiaohongshu) {
      let commentsMd = '';
      if (articleData.commentsList && articleData.commentsList.length > 0) {
        commentsMd = '\n\n---\n\n## 评论区（当前页面已显示）\n\n';
        articleData.commentsList.forEach((comment, index) => {
          commentsMd += `### ${index + 1}. ${comment.author}${comment.time ? ` · ${comment.time}` : ''}\n\n${comment.text}\n\n`;
          (comment.replies || []).forEach((reply, replyIndex) => {
            commentsMd += `> ↳ ${index + 1}.${replyIndex + 1} ${reply.author}${reply.time ? ` · ${reply.time}` : ''}\n>\n> ${reply.text}\n\n`;
          });
        });
      }
      const metaInfo = [
        `- **作者**: ${articleData.author || '未知'}`,
        `- **日期**: ${articleData.date || '未知'}`,
        `- **图片数量**: ${articleData.images.length}`,
        `- **图片顺序**: ${articleData.imageOrderSource === 'xiaohongshu_note_imageList' ? '按小红书笔记原始 imageList 顺序' : '按正文 DOM 顺序（回退）'}`,
        `- **原文链接**: [小红书笔记](${targetUrl})`
      ].join('\n');
      finalMarkdown = `# ${articleData.title}\n\n${metaInfo}\n\n---\n\n${markdownContent}${commentsMd}\n`;
      finalMarkdownOnline = `# ${articleData.title}\n\n${metaInfo}\n\n---\n\n${markdownContentOnline}${commentsMd}\n`;
    } else {
      const sourceLabel = articleData.isXiaohongshu ? '小红书笔记' : '微信公众号文章';
      finalMarkdown = `# ${articleData.title}
 
- **作者**: ${articleData.author || '未知'}
- **日期**: ${articleData.date || '未知'}
- **原文链接**: [${sourceLabel}](${targetUrl})
 
---
 
${markdownContent}
`;

      finalMarkdownOnline = `# ${articleData.title}
 
- **作者**: ${articleData.author || '未知'}
- **日期**: ${articleData.date || '未知'}
- **原文链接**: [${sourceLabel}](${targetUrl})
 
---
 
${markdownContentOnline}
`;
    }
    
    // Sanitize title to be a safe Windows filename
    const outputPath = path.join(exportDir, `${safeTitle}.md`);
    let localMarkdownPath = outputPath;
    try {
      await safeWriteFile(outputPath, finalMarkdown);
      console.log(`\nSuccess! Local Markdown file written to: ${outputPath}`);
    } catch (err) {
      if (err.code === 'EBUSY' || err.code === 'EPERM') {
        const fallbackPath = path.join(exportDir, `${safeTitle}_local.md`);
        console.warn(`\nWarning: ${outputPath} is locked by another program. Writing to fallback: ${fallbackPath}`);
        await safeWriteFile(fallbackPath, finalMarkdown);
        localMarkdownPath = fallbackPath;
      } else {
        throw err;
      }
    }
    
    const outputPathOnline = path.join(exportDir, `${safeTitle}_online.md`);
    let onlineMarkdownPath = outputPathOnline;
    try {
      await safeWriteFile(outputPathOnline, finalMarkdownOnline);
      console.log(`Success! Online Markdown file written to: ${outputPathOnline}`);
    } catch (err) {
      if (err.code === 'EBUSY' || err.code === 'EPERM') {
        const fallbackOnlinePath = path.join(exportDir, `${safeTitle}_online_fallback.md`);
        console.warn(`Warning: ${outputPathOnline} is locked by another program. Writing to fallback: ${fallbackOnlinePath}`);
        await safeWriteFile(fallbackOnlinePath, finalMarkdownOnline);
        onlineMarkdownPath = fallbackOnlinePath;
      } else {
        throw err;
      }
    }

    // Generate beautiful PDF using Playwright
    console.log('\nGenerating beautiful PDF with embedded images...');
    const pdfPath = path.join(exportDir, `${safeTitle}.pdf`);
    let generatedPdfPath = null;
    const tempHtmlPath = path.join(exportDir, `temp_${safeTitle}.html`);
    const structuredCommentsHtml = (articleData.isXiaohongshu || articleData.isLinkedIn) && articleData.commentsList?.length
      ? `<section class="xhs-comments"><h2>评论区（当前页面已显示${articleData.commentsCount ? ` · 共 ${escapeHtml(articleData.commentsCount)}` : ''}）</h2>${articleData.commentsList.map((comment, index) => {
          const replies = (comment.replies || []).map((reply, replyIndex) =>
            `<div class="xhs-reply"><strong>↳ ${index + 1}.${replyIndex + 1} ${escapeHtml(reply.author)}</strong>${reply.time ? `<span>${escapeHtml(reply.time)}</span>` : ''}<p>${escapeHtml(reply.text)}</p></div>`
          ).join('');
          return `<article class="xhs-comment"><h3>${index + 1}. ${escapeHtml(comment.author)}${comment.time ? `<span>${escapeHtml(comment.time)}</span>` : ''}</h3><p>${escapeHtml(comment.text)}</p>${replies}</article>`;
        }).join('')}</section>`
      : '';
    
    const beautifulHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${articleData.title}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif;
      line-height: 1.6;
      color: #191919;
      max-width: 800px;
      margin: 0 auto;
      padding: 30px 40px;
      background-color: #fff;
    }
    h1 {
      font-size: 26px;
      line-height: 1.4;
      margin-bottom: 12px;
      color: #191919;
      font-weight: 600;
    }
    body > h1, body > .metadata {
      display: block !important;
      visibility: visible !important;
      position: relative !important;
      z-index: 1;
    }
    .metadata {
      color: #666;
      font-size: 14px;
      margin-bottom: 25px;
      border-bottom: 1px solid #eee;
      padding-bottom: 15px;
    }
    .metadata div {
      margin-bottom: 6px;
    }
    .metadata a {
      color: #0a66c2;
      text-decoration: none;
    }
    .content {
      font-size: 16px;
      word-wrap: break-word;
      max-width: 100%;
    }
    /* Normalize source-page layouts into a clean document flow. */
    .content *, .content *::before, .content *::after { box-sizing: border-box; }
    .content [class] { position: static !important; float: none !important; transform: none !important; }
    .content div, .content section, .content article { width: auto !important; max-width: 100% !important; min-height: 0 !important; }
    .content div:empty, .content span:empty { display: none !important; }
    .content a { color: #0a66c2; text-decoration: none; word-break: break-word; }
    .content > * { margin: 0 0 1.2em; }
    .content p { text-align: left; white-space: pre-wrap; }
    .content h2, .content h3 { break-after: avoid; margin: 1.5em 0 .6em; }
    .content img { break-inside: avoid; page-break-inside: avoid; }
    img {
      max-width: 100%;
      height: auto;
      display: block;
      margin: 20px auto;
      border-radius: 6px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    }
    
    /* Support elegant stacking for multi-image grid structures */
    .update-components-image, [class*="update-components-image"] {
      display: flex;
      flex-direction: column;
      gap: 20px;
      margin: 20px auto;
      width: 100% !important;
    }
    
    /* Reset all absolute layouts, aspect-ratio paddings, and fixed widths/heights inside LinkedIn image grids */
    .update-components-image__container, [class*="update-components-image__container"],
    .update-components-image__container-wrapper, [class*="update-components-image__container-wrapper"],
    .update-components-image__image-link, [class*="update-components-image__image-link"],
    .ivm-image-view-model, [class*="ivm-image-view-model"],
    .ivm-view-attr__img-wrapper, [class*="ivm-view-attr__img-wrapper"] {
      width: 100% !important;
      max-width: 100% !important;
      height: auto !important;
      position: static !important;
      padding: 0 !important;
      margin: 0 !important;
      display: block !important;
      box-shadow: none !important;
      background: transparent !important;
    }
    
    .update-components-image img, [class*="update-components-image"] img {
      max-width: 100% !important;
      height: auto !important;
      display: block !important;
      margin: 0 auto !important;
      border-radius: 6px !important;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08) !important;
    }


    p {
      margin: 0 0 1.6em;
      text-align: justify;
    }
    strong {
      font-weight: 600;
      color: #111;
    }
    blockquote {
      border-left: 3px solid #dbdbdb;
      color: #666;
      padding: 5px 0 5px 15px;
      margin: 1.5em 0;
      background-color: #fafafa;
    }
    pre, code {
      font-family: Consolas, Monaco, "Andale Mono", monospace;
      background-color: #f7f7f7;
      border-radius: 3px;
    }
    code {
      padding: 2px 5px;
      font-size: 14px;
    }
    pre {
      padding: 15px;
      overflow-x: auto;
      line-height: 1.45;
      border: 1px solid #e8e8e8;
    }
    pre code {
      padding: 0;
      background-color: transparent;
      font-size: 13px;
    }
    
    /* LinkedIn Specific Layout elements inside HTML */
    .feed-shared-update-v2 {
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 20px;
      background: #fff;
    }
    .update-components-actor {
      display: flex;
      align-items: center;
      margin-bottom: 16px;
      border-bottom: 1px solid #f0f0f0;
      padding-bottom: 16px;
    }
    .update-components-actor__avatar {
      margin-right: 12px;
    }
    .update-components-actor__avatar img {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      margin: 0;
      box-shadow: none;
    }
    .update-components-actor__meta {
      display: flex;
      flex-direction: column;
    }
    .update-components-actor__title {
      font-size: 16px;
      font-weight: 600;
      color: #191919;
      margin: 0;
    }
    .update-components-actor__description {
      font-size: 12px;
      color: #666;
      margin: 2px 0 0 0;
    }
    .update-components-actor__subtext {
      font-size: 11px;
      color: #888;
      margin-top: 2px;
    }
    .update-components-text {
      font-size: 15px;
      line-height: 1.6;
      color: #191919;
      white-space: pre-wrap;
      margin-bottom: 16px;
    }
    .comments-comments-list, [class*="comments-comments-list"] {
      margin-top: 25px;
      border-top: 1px solid #e0e0e0;
      padding-top: 20px;
    }
    .comments-comment-item, [class*="comments-comment-item"], .comments-comment-entity, [class*="comments-comment-entity"] {
      display: flex;
      flex-direction: column;
      margin-bottom: 16px;
      padding: 16px;
      background: #f8f9fa;
      border-radius: 8px;
      border: 1px solid #f0f0f0;
    }
    .comments-comment-item__avatar img, [class*="comments-comment-item__avatar"] img,
    .comments-comment-meta__image-link, [class*="comments-comment-meta__image-link"] {
      display: none !important;
    }
    .comments-comment-item__content-body, [class*="comments-comment-item__content-body"] {
      flex-grow: 1;
    }
    .comments-comment-meta__description-title, [class*="comments-comment-meta__description-title"] {
      font-size: 13.5px;
      font-weight: 600;
      color: #191919;
      display: inline-block;
    }
    .comments-comment-meta__description-subtitle, [class*="comments-comment-meta__description-subtitle"] {
      font-size: 11px;
      color: #666;
      margin-top: 2px;
    }
    .comments-comment-item__main-content, [class*="comments-comment-item__main-content"] {
      font-size: 13px;
      color: #191919;
      line-height: 1.5;
      margin-top: 8px;
      white-space: pre-wrap;
    }
    .comments-comment-item__timestamp, [class*="comments-comment-item__timestamp"],
    .comments-comment-meta__data, [class*="comments-comment-meta__data"] {
      font-size: 11px;
      color: #888;
      float: right;
    }

    /* Xiaohongshu comments: preserve visible reply hierarchy without avatars or interaction controls */
    .xhs-comments { margin-top: 34px; border-top: 1px solid #ddd; padding-top: 20px; }
    .xhs-comments h2 { font-size: 20px; margin: 0 0 16px; }
    .xhs-comment { break-inside: avoid; border: 1px solid #e6e6e6; border-radius: 8px; padding: 14px 16px; margin: 12px 0; }
    .xhs-comment h3 { font-size: 15px; margin: 0 0 8px; }
    .xhs-comment h3 span, .xhs-reply span { color: #777; font-size: 12px; font-weight: normal; margin-left: 8px; }
    .xhs-comment > p, .xhs-reply p { margin: 0; font-size: 14px; white-space: pre-line; text-align: left; }
    .xhs-reply { border-left: 3px solid #c93b55; margin: 12px 0 0 16px; padding: 8px 12px; background: #fff8f8; }
    .xhs-reply strong { font-size: 13px; }
    .xhs-reply p { margin-top: 5px; }

    /* Print optimizations */
    @media print {
      body {
        padding: 0;
      }
      h1, h2, h3 { break-after: avoid; }
      .metadata, .xhs-comment, .xhs-reply { break-inside: avoid; page-break-inside: avoid; }
      a {
        color: #333;
      }
    }
  </style>
</head>
<body>
  <h1>${articleData.title}</h1>
  <div class="metadata">
    <div><strong>作者:</strong> ${articleData.author || '未知'}</div>
    ${articleData.headline ? `<div><strong>头衔:</strong> ${articleData.headline}</div>` : ''}
    <div><strong>发表时间/热度:</strong> ${articleData.date || '未知'}</div>
    ${articleData.reactionsCount ? `<div><strong>互动数:</strong> ${articleData.reactionsCount}</div>` : ''}
    <div><strong>原文链接:</strong> <a href="${targetUrl}">${isWeChat ? '微信公众号文章' : isXiaohongshu ? '小红书笔记' : 'LinkedIn 动态'} (${targetUrl})</a></div>
  </div>
  ${articleData.attachmentFile ? `
  <div style="background-color: #f0f7ff; border: 1px solid #c2e0ff; border-radius: 6px; padding: 12px 16px; margin: 0 0 25px 0; font-size: 14px; color: #004085; display: flex; align-items: center; gap: 10px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
    <span style="font-size: 20px; vertical-align: middle;">📎</span>
    <div style="line-height: 1.5;">
      <strong>附带文档</strong>：本帖附带了一份原版 PDF 演示文件，已为您自动下载并安全保存为本地文件：
      <a href="${articleData.attachmentFile}" style="color: #0056b3; font-weight: 600; text-decoration: underline; word-break: break-all;">${articleData.attachmentFile}</a>
    </div>
  </div>
  ` : ''}
  <div class="content">
    ${finalHtml}
  </div>
  ${structuredCommentsHtml}
</body>
</html>`;
 
    try {
      await safeWriteFile(tempHtmlPath, beautifulHtml);
      
      const pdfPage = await context.newPage();
      // Navigate to the local temp HTML file using absolute file URL
      const fileUrl = 'file:///' + tempHtmlPath.replace(/\\/g, '/');
      console.log(`Loading temp HTML in browser: ${fileUrl}`);
      
      await pdfPage.goto(fileUrl, { waitUntil: 'networkidle', timeout: 60000 });
      
      // Wait another short second to ensure layout is completely stable
      await pdfPage.waitForTimeout(1000);
      
      // Attempt resilient PDF rendering
      try {
        await pdfPage.pdf({
          path: pdfPath,
          format: 'A4',
          margin: {
            top: '18mm',
            bottom: '18mm',
            left: '16mm',
            right: '16mm'
          },
          printBackground: true,
          displayHeaderFooter: true,
          headerTemplate: '<div></div>',
          footerTemplate: '<div style="width:100%;font-size:9px;color:#777;text-align:center;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>'
        });
        generatedPdfPath = pdfPath;
        console.log(`Success! Beautiful PDF written to: ${pdfPath}`);
      } catch (pdfErr) {
        if (pdfErr.code === 'EBUSY' || pdfErr.code === 'EPERM' || pdfErr.message.includes('EBUSY') || pdfErr.message.includes('locked')) {
          const fallbackPdfPath = path.join(exportDir, `${safeTitle}_fallback.pdf`);
          console.warn(`Warning: Main PDF file is locked. Writing to fallback: ${fallbackPdfPath}`);
          try {
            await pdfPage.pdf({
              path: fallbackPdfPath,
              format: 'A4',
              margin: {
                top: '20mm',
                bottom: '20mm',
                left: '20mm',
                right: '20mm'
              },
              printBackground: true
            });
            generatedPdfPath = fallbackPdfPath;
            console.log(`Success! Beautiful PDF written to fallback: ${fallbackPdfPath}`);
          } catch (fallbackErr) {
            const uniquePdfPath = path.join(exportDir, `${safeTitle}_clean.pdf`);
            console.warn(`Warning: Fallback PDF file is also locked. Writing to clean path: ${uniquePdfPath}`);
            try {
              await pdfPage.pdf({
                path: uniquePdfPath,
                format: 'A4',
                margin: {
                  top: '20mm',
                  bottom: '20mm',
                  left: '20mm',
                  right: '20mm'
                },
                printBackground: true
              });
              generatedPdfPath = uniquePdfPath;
              console.log(`Success! Beautiful PDF written to clean path: ${uniquePdfPath}`);
            } catch (cleanErr) {
              const timestampedPdfPath = path.join(exportDir, `${safeTitle}_${Date.now()}.pdf`);
              console.error(`Error: Clean PDF path is also locked. Writing to unique timestamped path: ${timestampedPdfPath}`);
              await pdfPage.pdf({
                path: timestampedPdfPath,
                format: 'A4',
                margin: {
                  top: '20mm',
                  bottom: '20mm',
                  left: '20mm',
                  right: '20mm'
                },
                printBackground: true
              });
              generatedPdfPath = timestampedPdfPath;
              console.log(`Success! Beautiful PDF written to timestamped path: ${timestampedPdfPath}`);
            }
          }
        } else {
          throw pdfErr;
        }
      }
      
      await pdfPage.close();
    } catch (err) {
      console.error('Failed to generate PDF:', err.message);
    } finally {
      // Clean up the temp HTML file
      if (fs.existsSync(tempHtmlPath)) {
        try {
          fs.unlinkSync(tempHtmlPath);
        } catch (unlinkErr) {
          console.warn('Failed to clean up temp HTML file:', unlinkErr.message);
        }
      }
    }
    
    if (handoffNotebooklm) {
      const handoff = buildArticleHandoff({
        sourceUrl: targetUrl,
        title: articleData.title,
        outputDir: exportDir,
        files: {
          localMarkdown: localMarkdownPath,
          onlineMarkdown: onlineMarkdownPath,
          pdf: generatedPdfPath
        },
        attachmentFile: articleData.attachmentFile
      });
      const handoffPath = writeHandoff(exportDir, safeTitle, handoff);
      console.log(`NotebookLM 交接清单已生成: ${handoffPath}`);
    }

    // Trigger the legacy command-line upload only when handoff mode is not active.
    const targetFileForSync = onlineMarkdownPath || localMarkdownPath;
    if (!skipUpload && !handoffNotebooklm && fs.existsSync(targetFileForSync)) {
      const syncResult = await uploadToNotebookLM(targetFileForSync, articleData.title);
      
      // Also upload attachment to the SAME selected notebook if it exists and user had uploaded the main article
      if (syncResult && syncResult.notebookId && articleData.attachmentFile) {
        const attachmentPath = path.join(exportDir, articleData.attachmentFile);
        if (fs.existsSync(attachmentPath)) {
          console.log('\nDetected attached PDF document. Syncing attachment to the same notebook...');
          try {
            execSync(`${syncResult.cmdPrefix} source add "${attachmentPath}" --notebook "${syncResult.notebookId}"`, { stdio: 'inherit' });
            console.log(`✅ Successfully uploaded attached PDF to the same NotebookLM workspace!`);
          } catch (attachErr) {
            console.warn('Failed to upload attachment:', attachErr.message);
          }
        }
      }
    }
    
  } catch (error) {
    console.error(explainError(error));
    try {
      const errorScreenshotPath = path.join(exportDir, 'error_screenshot.png');
      await page.screenshot({ path: errorScreenshotPath });
      console.log(`Saved debug screenshot of the error page to: ${errorScreenshotPath}`);
    } catch (screenshotErr) {
      console.error('Failed to take debug screenshot:', screenshotErr.message);
    }
  } finally {
    if (page) {
      try {
        await page.close();
      } catch (e) {}
    }
    if (isPersistent && context) {
      try {
        await context.close();
        console.log('Persistent browser context closed.');
      } catch (e) {}
    } else if (browser && !isCdp) {
      try {
        await browser.close();
        console.log('Browser closed.');
      } catch (e) {}
    } else if (browser && isCdp) {
      console.log('CDP connection closed.');
    }
  }
}

run();
