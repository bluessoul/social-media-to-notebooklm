'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const https = require('https');
const { execFileSync } = require('child_process');

const STANDARD_BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const KEY1 = 'PJLKMNOI3xyz021wvrpqstouHCFBDEGAnhikjlmgfZbacedYRXTSUVQW!56789+4';
const KEY2 = 'PJKLMNOI3xyz012wvprqstuoHBCDEFGAnhijklmgfZabcdeYXRSTUVWQ!56789+4';

function isDoc88Url(value) {
  try {
    const url = new URL(String(value));
    const host = url.hostname.toLowerCase();
    return ['doc88.com', 'www.doc88.com'].includes(host) && /^\/p-\d+\.html$/i.test(url.pathname);
  } catch {
    return false;
  }
}

function doc88Id(value) {
  const url = new URL(String(value));
  const match = url.pathname.match(/^\/p-(\d+)\.html$/i);
  if (!match) throw new Error('Doc88 链接格式应为 https://www.doc88.com/p-数字.html');
  return match[1];
}

function customBase64Decode(value, key) {
  const translated = String(value).trim().replace(/[^=]/g, char => {
    const index = key.indexOf(char);
    return index >= 0 ? STANDARD_BASE64[index] : char;
  });
  return Buffer.from(translated, 'base64').toString('utf8');
}

function customBase64Encode(value, key) {
  const encoded = Buffer.from(String(value), 'utf8').toString('base64');
  return encoded.replace(/[A-Za-z0-9+/]/g, char => key[STANDARD_BASE64.indexOf(char)] || char);
}

function decodeXmlEntities(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function xmlTag(xml, name) {
  const match = String(xml).match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return match ? decodeXmlEntities(match[1].trim()) : '';
}

function xmlAttribute(attributes, name) {
  const match = String(attributes).match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return match ? decodeXmlEntities(match[1]) : '';
}

function parseDoc88Xml(xml) {
  const source = String(xml || '').trim();
  if (!source) throw new Error('Doc88 数据接口返回为空。');
  if (xmlTag(source, 'p_404') === '1') throw new Error('Doc88 文档不存在或不可预览。');

  const structureMatch = source.match(/<p_struct\b[^>]*>([\s\S]*?)<\/p_struct>/i);
  if (!structureMatch) throw new Error('Doc88 返回中未找到页面结构。');
  const structure = structureMatch[1];
  const headers = [...structure.matchAll(/<h\b([^>]*)>([\s\S]*?)<\/h>/gi)].map(match => ({
    level: Number(xmlAttribute(match[1], 'n')),
    chunkSize: xmlAttribute(match[1], 'n') ? decodeXmlEntities(match[2].trim()) : ''
  }));
  const nestedPages = [...structure.matchAll(/<p\b([^>]*)>\s*<e>([\s\S]*?)<\/e>\s*<w>([\s\S]*?)<\/w>\s*<h>([\s\S]*?)<\/h>\s*<p>([\s\S]*?)<\/p>\s*<l>([\s\S]*?)<\/l>\s*<\/p>/gi)].map(match => ({
    page: Number(xmlAttribute(match[1], 'n')),
    level: Number(decodeXmlEntities(match[2]).trim()),
    width: decodeXmlEntities(match[3]).trim() || '612',
    height: decodeXmlEntities(match[4]).trim() || '858',
    headSize: decodeXmlEntities(match[5]).trim(),
    chunkSize: decodeXmlEntities(match[6]).trim()
  }));
  const selfClosingPages = [...structure.matchAll(/<p\b([^>]*?)\/>/gi)].map(match => {
    const attributes = match[1];
    return {
      page: Number(xmlAttribute(attributes, 'n')),
      level: Number(xmlAttribute(attributes, 'e')),
      width: xmlAttribute(attributes, 'w') || '612',
      height: xmlAttribute(attributes, 'h') || '858',
      headSize: xmlAttribute(attributes, 'p'),
      chunkSize: xmlAttribute(attributes, 'l')
    };
  });
  const pages = (nestedPages.length ? nestedPages : selfClosingPages).sort((a, b) => a.page - b.page);

  if (!headers.length || !pages.length) throw new Error('Doc88 页面结构为空。');
  return {
    pCode: xmlTag(source, 'p_code'),
    title: xmlTag(source, 'p_name') || `Doc88 ${xmlTag(source, 'p_code')}`,
    pSwf: xmlTag(source, 'p_swf'),
    ebtHost: xmlTag(source, 'p_ebthost') || 'https://cdn2.doc88.com',
    headers,
    pages
  };
}

function normalizeEncodedConfig(config) {
  const headerInfo = String(config.headerInfo || '').replace(/"/g, '').split(',').filter(Boolean);
  const pageInfo = customBase64Decode(config.pageInfo, KEY1).split(',').filter(Boolean).map((value, index) => {
    const [level, width, height, headSize, chunkSize] = value.split('-');
    return { page: index + 1, level: Number(level), width, height, headSize, chunkSize };
  });
  return {
    pCode: config.p_code,
    title: config.p_name || `Doc88 ${config.p_code}`,
    pSwf: config.p_swf,
    ebtHost: config.ebt_host || 'https://cdn2.doc88.com',
    headers: headerInfo.map((chunkSize, index) => ({ level: index + 1, chunkSize })),
    pages: pageInfo
  };
}

function requestBuffer(url, redirects = 0) {
  if (redirects > 5) return Promise.reject(new Error('Doc88 重定向次数过多。'));
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
        Referer: 'https://www.doc88.com/',
        'Accept-Encoding': 'identity'
      }
    }, response => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        resolve(requestBuffer(new URL(response.headers.location, url).toString(), redirects + 1));
        return;
      }
      const chunks = [];
      response.on('data', chunk => chunks.push(Buffer.from(chunk)));
      response.on('end', () => {
        const body = Buffer.concat(chunks);
        if ((response.statusCode || 500) >= 400) {
          reject(new Error(`Doc88 请求失败 HTTP ${response.statusCode}: ${url}`));
          return;
        }
        resolve(body);
      });
    });
    request.on('error', reject);
    request.setTimeout(60000, () => request.destroy(new Error(`Doc88 请求超时: ${url}`)));
  });
}

async function fetchDoc88Config(url) {
  if (!isDoc88Url(url)) throw new Error('Doc88 链接格式不受支持。');
  const id = doc88Id(url);
  const apiUrl = `https://www.doc88.com/doc.php?act=info&p_code=${id}`;
  try {
    const encodedXml = (await requestBuffer(apiUrl)).toString('utf8').trim();
    const xml = encodedXml.startsWith('<') ? encodedXml : customBase64Decode(encodedXml, KEY2);
    const parsed = parseDoc88Xml(xml);
    parsed.pCode = parsed.pCode || id;
    return parsed;
  } catch (apiError) {
    const html = (await requestBuffer(url)).toString('utf8');
    const match = html.match(/m_main\.init\("([^"]+)"\);/);
    if (!match) throw new Error(`Doc88 页面配置获取失败：${apiError.message}`);
    try {
      return normalizeEncodedConfig(JSON.parse(customBase64Decode(match[1], KEY1)));
    } catch (fallbackError) {
      throw new Error(`Doc88 页面配置解码失败：${fallbackError.message}`);
    }
  }
}

function pageResourceUrls(config, page) {
  const header = config.headers.find(item => item.level === page.level);
  if (!header) throw new Error(`缺少 Doc88 页面层级 ${page.level} 的 PH 资源。`);
  const phName = `getebt-${customBase64Encode(`${page.level}-0-${header.chunkSize}-${config.pSwf}`, KEY2)}.ebt`;
  const pkName = `getebt-${customBase64Encode(`${page.level}-${page.headSize}-${page.chunkSize}-${config.pSwf}-${page.page}-${config.pCode}`, KEY2)}.ebt`;
  return {
    phUrl: `${config.ebtHost.replace(/\/$/, '')}/${phName}`,
    pkUrl: `${config.ebtHost.replace(/\/$/, '')}/${pkName}`,
    phName,
    pkName
  };
}

function makeSwf(phData, pkData) {
  const ph = zlib.inflateSync(phData.subarray(40));
  ph.writeUInt32LE(ph.length, 4);
  const pk = zlib.inflateSync(pkData.subarray(32));
  const swf = Buffer.concat([ph, pk, Buffer.from([64, 0, 0, 0])]);
  swf.writeUInt32LE(swf.length, 4);
  swf[19] = 1;
  return swf;
}

function safeTitle(value) {
  return String(value || 'doc88-document').replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 120) || 'doc88-document';
}

function findFile(candidates) {
  return candidates.map(item => item && path.resolve(item)).find(item => item && fs.existsSync(item));
}

function converterPaths(baseDir) {
  const extractorDir = process.env.DOC88_EXTRACTOR_DIR || '';
  return {
    ffdec: findFile([
      process.env.DOC88_FFDEC_JAR,
      path.join(baseDir, 'ffdec', 'ffdec.jar'),
      path.join(extractorDir, 'ffdec', 'ffdec.jar')
    ]),
    presse: findFile([
      process.env.DOC88_PRESSE_EXE,
      path.join(baseDir, 'presse.exe'),
      path.join(baseDir, 'presse'),
      path.join(extractorDir, 'presse.exe'),
      path.join(extractorDir, 'presse')
    ])
  };
}

function convertSwfsToPdf({ swfDir, pageCount, pdfPath, baseDir }) {
  const converters = converterPaths(baseDir);
  if (!converters.ffdec || !converters.presse) {
    throw new Error('Doc88 已下载并合成 SWF，但缺少 PDF 转换器。请设置 DOC88_FFDEC_JAR 和 DOC88_PRESSE_EXE，或将 ffdec/presse 放入技能目录。');
  }
  const pdfDir = path.join(swfDir, 'pdf');
  fs.mkdirSync(pdfDir, { recursive: true });
  for (let page = 1; page <= pageCount; page += 1) {
    const pageSwf = path.join(swfDir, `${page}.swf`);
    const pageOut = path.join(pdfDir, `${page}`);
    fs.mkdirSync(pageOut, { recursive: true });
    execFileSync('java', ['-jar', converters.ffdec, '-format', 'frame:pdf', '-zoom', '1', '-select', '1', '-export', 'frame', pageOut, pageSwf], { stdio: 'pipe' });
    const generated = path.join(pageOut, `${page}.swf`, 'frames.pdf');
    const alternate = path.join(pageOut, 'frames.pdf');
    const source = fs.existsSync(generated) ? generated : alternate;
    if (!source) throw new Error(`ffdec 未生成第 ${page} 页 PDF。`);
    fs.copyFileSync(source, path.join(pdfDir, `${page}.pdf`));
  }
  execFileSync(converters.presse, ['merge', path.join(pdfDir, '*.pdf'), '--optimize', '-o', pdfPath], { stdio: 'pipe' });
  if (!fs.existsSync(pdfPath) || fs.statSync(pdfPath).size === 0) throw new Error('presse 未生成有效 PDF。');
  return pdfPath;
}

function ensureDoc88Converters(baseDir) {
  const converters = converterPaths(baseDir);
  if (!converters.ffdec || !converters.presse) {
    throw new Error('Doc88 需要 PDF 转换器。请设置 DOC88_FFDEC_JAR 和 DOC88_PRESSE_EXE，或将 ffdec/presse 放入技能目录。');
  }
  try {
    execFileSync('java', ['-version'], { stdio: 'pipe' });
  } catch {
    throw new Error('Doc88 需要 Java 17 或更高版本，且 java 必须位于 PATH 中。');
  }
}

async function extractDoc88({ url, outputDir, baseDir }) {
  fs.mkdirSync(outputDir, { recursive: true });
  const config = await fetchDoc88Config(url);
  const title = config.title;
  const safe = safeTitle(title);
  const pdfPath = path.join(outputDir, `${safe}.pdf`);
  const phCache = new Map();
  let workDir = '';
  try {
    ensureDoc88Converters(baseDir);
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc88-'));
    for (const page of config.pages) {
      const resources = pageResourceUrls(config, page);
      if (!phCache.has(page.level)) phCache.set(page.level, await requestBuffer(resources.phUrl));
      const pk = await requestBuffer(resources.pkUrl);
      const swf = makeSwf(phCache.get(page.level), pk);
      fs.writeFileSync(path.join(workDir, `${page.page}.swf`), swf);
      console.log(`Doc88: 已处理第 ${page.page}/${config.pages.length} 页`);
    }
    convertSwfsToPdf({ swfDir: workDir, pageCount: config.pages.length, pdfPath, baseDir });
    return { title, pCode: config.pCode, pageCount: config.pages.length, pdfPath };
  } catch (error) {
    if (workDir) error.message = `${error.message}（临时文件保留在 ${workDir}）`;
    throw error;
  } finally {
    if (workDir && fs.existsSync(pdfPath)) fs.rmSync(workDir, { recursive: true, force: true });
  }
}

module.exports = {
  customBase64Decode,
  customBase64Encode,
  doc88Id,
  extractDoc88,
  fetchDoc88Config,
  isDoc88Url,
  makeSwf,
  pageResourceUrls,
  parseDoc88Xml,
  requestBuffer
};
