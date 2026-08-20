const readline = require('readline');
const path = require('path');
const { getTranscript, searchTranscript, exportArtifacts } = require('../lib/bilibili-subtitles');

const tools = [
  { name: 'get_video_transcript', description: '读取 Bilibili 官方字幕、浏览器 AI 字幕，或在显式开启时使用本地 ASR。', inputSchema: { type: 'object', properties: { url: { type: 'string' }, fallback_to_asr: { type: 'boolean', default: false }, asr_model: { type: 'string', enum: ['tiny', 'base', 'small'], default: 'small' } }, required: ['url'] } },
  { name: 'search_transcript', description: '在单个 Bilibili 视频字幕中搜索关键词并返回时间点。', inputSchema: { type: 'object', properties: { url: { type: 'string' }, query: { type: 'string' }, from: { type: 'number' }, to: { type: 'number' }, fallback_to_asr: { type: 'boolean', default: false }, asr_model: { type: 'string', enum: ['tiny', 'base', 'small'], default: 'small' } }, required: ['url', 'query'] } },
  { name: 'export_notebooklm_artifacts', description: '生成本地 SRT、JSON、NotebookLM Markdown 和交接清单；不会上传。', inputSchema: { type: 'object', properties: { url: { type: 'string' }, output_dir: { type: 'string' }, fallback_to_asr: { type: 'boolean', default: false }, asr_model: { type: 'string', enum: ['tiny', 'base', 'small'], default: 'small' } }, required: ['url', 'output_dir'] } }
];

function response(id, result) { process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`); }
function error(id, code, message) { response(id, { isError: true, content: [{ type: 'text', text: `${code}: ${message}` }] }); }
function textResult(value) { return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }], structuredContent: value }; }

async function callTool(name, args) {
  if (!args || typeof args.url !== 'string') throw new Error('INVALID_ARGUMENT: url is required');
  const result = await getTranscript({ url: args.url, fallbackToAsr: args.fallback_to_asr === true, asrModel: args.asr_model || 'small' });
  if (name === 'get_video_transcript') return textResult(result);
  if (name === 'search_transcript') return textResult({ ...result, matches: searchTranscript(result, args.query, args.from, args.to) });
  if (name === 'export_notebooklm_artifacts') return textResult(await exportArtifacts(result, path.resolve(args.output_dir)));
  throw new Error('METHOD_NOT_FOUND: unknown tool');
}

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on('line', async line => {
  if (!line.trim()) return;
  let message; try { message = JSON.parse(line); } catch { return; }
  if (message.method === 'notifications/initialized') return;
  if (message.method === 'initialize') return response(message.id, { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'social-media-to-notebooklm-bilibili', version: '1.0.0' } });
  if (message.method === 'tools/list') return response(message.id, { tools });
  if (message.method === 'tools/call') { try { return response(message.id, await callTool(message.params?.name, message.params?.arguments || {})); } catch (err) { return error(message.id, 'BILIBILI_TOOL_ERROR', err.message); } }
  if (message.id !== undefined) error(message.id, 'METHOD_NOT_FOUND', message.method || 'unknown method');
});
