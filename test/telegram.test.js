const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  formatTextEntity,
  parseText,
  convertTelegramJsonToMarkdown,
  processTelegramExport
} = require('../lib/telegram-converter');

test('formatTextEntity correctly formats text entity types', () => {
  assert.equal(formatTextEntity('hello'), 'hello');
  assert.equal(formatTextEntity({ type: 'bold', text: 'bold text' }), '**bold text**');
  assert.equal(formatTextEntity({ type: 'italic', text: 'italic text' }), '*italic text*');
  assert.equal(formatTextEntity({ type: 'code', text: 'const x = 1;' }), '`const x = 1;`');
  assert.match(formatTextEntity({ type: 'pre', text: 'print(1)', language: 'python' }), /```python\nprint\(1\)\n```/);
  assert.equal(formatTextEntity({ type: 'text_link', text: 'Google', href: 'https://google.com' }), '[Google](https://google.com)');
});

test('convertTelegramJsonToMarkdown renders daily headings, replies, media, service events and polls', () => {
  const sampleJson = {
    name: 'AI Test Group',
    type: 'private_supergroup',
    id: 12345678,
    messages: [
      {
        id: 1,
        type: 'service',
        date: '2026-03-05T04:56:17',
        actor: 'Admin',
        action: 'create_channel',
        title: 'AI Test Group'
      },
      {
        id: 2,
        type: 'message',
        date: '2026-03-05T05:06:08',
        from: 'Alice',
        text: 'Hello world!'
      },
      {
        id: 3,
        type: 'message',
        date: '2026-03-05T05:10:00',
        from: 'Bob',
        reply_to_message_id: 2,
        text: [{ type: 'bold', text: 'Replying to Alice' }]
      },
      {
        id: 4,
        type: 'message',
        date: '2026-03-06T10:00:00',
        from: 'Charlie',
        poll: {
          question: 'Do you like AI?',
          total_voters: 10,
          answers: [
            { text: 'Yes', voters: 8 },
            { text: 'No', voters: 2 }
          ]
        }
      }
    ]
  };

  const md = convertTelegramJsonToMarkdown(sampleJson);
  assert.match(md, /# AI Test Group 聊天记录/);
  assert.match(md, /📅 2026-03-05/);
  assert.match(md, /📅 2026-03-06/);
  assert.match(md, /⚙️ \*\*Admin\*\* 创建了群组 \*\*AI Test Group\*\*/);
  assert.match(md, /### \*\*Alice\*\*/);
  assert.match(md, /↩️ \*回复 \[#`2`\]\(#msg-2\)\*/);
  assert.match(md, /\*\*Replying to Alice\*\*/);
  assert.match(md, /📊 \*\*投票: Do you like AI\?\*\*/);
});

test('processTelegramExport converts JSON file and generates NotebookLM handoff', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'telegram-test-'));
  try {
    const jsonPath = path.join(tmpDir, 'test_chat.json');
    const sampleData = {
      name: 'Sample Chat',
      type: 'supergroup',
      id: 9999,
      messages: [
        { id: 1, type: 'message', date: '2026-08-01T12:00:00', from: 'User1', text: 'Test message' }
      ]
    };
    fs.writeFileSync(jsonPath, JSON.stringify(sampleData, null, 2), 'utf8');

    const res = processTelegramExport({
      jsonPath,
      outputDir: tmpDir,
      options: { handoffNotebooklm: true }
    });

    assert.equal(res.title, 'Sample Chat');
    assert.equal(res.messageCount, 1);
    assert.equal(fs.existsSync(res.markdownPath), true);
    assert.equal(fs.existsSync(res.handoffPath), true);

    const handoffData = JSON.parse(fs.readFileSync(res.handoffPath, 'utf8'));
    assert.equal(handoffData.source_type, 'telegram');
    assert.equal(handoffData.suggested_upload, 'markdown');
    assert.equal(handoffData.files.markdown, path.resolve(res.markdownPath));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
