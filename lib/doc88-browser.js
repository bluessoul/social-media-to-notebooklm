'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { PDFDocument } = require('pdf-lib');

function safeTitle(value) {
  return String(value || 'doc88-document').replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 120) || 'doc88-document';
}

async function waitForCanvas(page, id, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = JSON.parse(await page.evaluate((canvasId) => JSON.stringify((() => {
      const canvas = document.getElementById(canvasId);
      return canvas ? { ready: canvas.width > 0 && canvas.height > 0 } : { ready: false };
    })()), id));
    if (state.ready) return;
    await page.waitForTimeout(100);
  }
  throw new Error(`Doc88 浏览器导出超时：未准备好 ${id}。`);
}

async function loadAllPages(page, timeoutMs) {
  const gate = await page.locator('#continue_page').innerText().catch(() => '');
  if (/拖动滑块|验证码|继续阅读/.test(gate)) {
    throw new Error('Doc88 页面要求完成滑块验证或继续阅读确认，浏览器自动路径无法绕过该交互。');
  }
  await page.evaluate(() => {
    const continuePage = document.getElementById('continue_page');
    const moreButton = continuePage && continuePage.querySelector('.iconfont.more');
    if (moreButton) moreButton.click();
  });
  await page.waitForTimeout(2000);

  for (let round = 0; round < 80; round += 1) {
    const blocks = page.locator('div.page_pb[id^="pagepb_"]');
    const count = await blocks.count();
    if (!count) throw new Error('Doc88 页面中未找到可加载的页面容器。');

    for (let index = 0; index < count; index += 1) {
      const block = blocks.nth(index);
      await block.scrollIntoViewIfNeeded();
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const done = await block.evaluate((node) => !node.textContent.trim().endsWith('%'));
        if (done) break;
        await page.waitForTimeout(100);
      }
      const done = await block.evaluate((node) => !node.textContent.trim().endsWith('%'));
      if (!done) throw new Error(`Doc88 浏览器导出超时：第 ${index + 1} 页仍在加载。`);
    }

    const canvasCount = await page.locator('canvas[id^="page_"]').count();
    if (canvasCount >= count) return;
    await page.waitForTimeout(500);
  }
  throw new Error('Doc88 浏览器导出失败：页面数量在加载过程中未稳定。');
}

async function readCanvases(page) {
  const idsJson = await page.evaluate(() => JSON.stringify([...document.querySelectorAll('canvas[id^="page_"]')]
    .map(canvas => canvas.id)
    .filter(id => /^page_\d+$/.test(id))
    .sort((a, b) => Number(a.slice(5)) - Number(b.slice(5)))));
  const ids = JSON.parse(idsJson);
  if (!ids.length) throw new Error('Doc88 页面加载完成，但未找到 page_i Canvas。');
  const bodyText = await page.locator('body').innerText();
  const expectedMatch = bodyText.match(/页数[：:]\s*(\d+)/);
  const expectedCount = expectedMatch ? Number(expectedMatch[1]) : null;
  if (expectedCount && ids.length < expectedCount) {
    throw new Error(`Doc88 浏览器导出只加载了 ${ids.length}/${expectedCount} 页。`);
  }

  const pages = [];
  for (const id of ids) {
    await waitForCanvas(page, id, 60000);
    const result = JSON.parse(await page.evaluate((canvasId) => JSON.stringify((() => {
      const canvas = document.getElementById(canvasId);
      try {
        return { width: canvas.width, height: canvas.height, dataUrl: canvas.toDataURL('image/png') };
      } catch (error) {
        return { error: error.message };
      }
    })()), id));
    if (result.error) throw new Error(`Doc88 Canvas ${id} 无法导出：${result.error}`);
    pages.push(result);
  }
  return pages;
}

async function createPdf(pages, pdfPath) {
  const pdf = await PDFDocument.create();
  for (const item of pages) {
    const png = await pdf.embedPng(Buffer.from(item.dataUrl.split(',')[1], 'base64'));
    const page = pdf.addPage([item.width || png.width, item.height || png.height]);
    page.drawImage(png, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
  }
  fs.writeFileSync(pdfPath, await pdf.save());
  if (!fs.existsSync(pdfPath) || fs.statSync(pdfPath).size === 0) throw new Error('Doc88 浏览器导出未生成有效 PDF。');
}

async function extractDoc88Browser({ url, outputDir, headless = true }) {
  fs.mkdirSync(outputDir, { recursive: true });
  const browser = await chromium.launch({ headless });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    const title = await page.locator('h1[title]').first().getAttribute('title').catch(() => null) || await page.title();
    await loadAllPages(page, 60000);
    const canvases = await readCanvases(page);
    const pdfPath = path.join(outputDir, `${safeTitle(title)}.pdf`);
    await createPdf(canvases, pdfPath);
    return { title: title.trim() || 'Doc88 document', pageCount: canvases.length, pdfPath, method: 'browser-canvas' };
  } finally {
    await browser.close();
  }
}

module.exports = { extractDoc88Browser, safeTitle };
