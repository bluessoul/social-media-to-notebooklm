const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { findPython, processEmlInput } = require('../lib/eml-converter');

test('converts an EML file to Markdown with metadata and attachment names', { skip: !findPython() }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'social-media-eml-convert-'));
  try {
    const source = path.join(root, 'sample.eml');
    const outputDir = path.join(root, 'output');
    fs.writeFileSync(source, [
      'From: sender@example.com',
      'To: receiver@example.com',
      'Subject: Test EML message',
      'MIME-Version: 1.0',
      'Content-Type: multipart/mixed; boundary="part-boundary"',
      '',
      '--part-boundary',
      'Content-Type: text/plain; charset="utf-8"',
      '',
      'Hello from the EML test.',
      '',
      '--part-boundary',
      'Content-Type: application/pdf',
      'Content-Disposition: attachment; filename="report.pdf"',
      'Content-Transfer-Encoding: base64',
      '',
      'JVBERi0xLjQ=',
      '--part-boundary--',
      ''
    ].join('\r\n'), 'utf8');

    const result = processEmlInput({ inputPath: source, outputDir });
    const markdown = fs.readFileSync(result.markdown, 'utf8');
    assert.equal(result.email_count, 1);
    assert.match(markdown, /# Test EML message/);
    assert.match(markdown, /Hello from the EML test/);
    assert.match(markdown, /report\.pdf/);
    assert.deepEqual(result.attachments, ['report.pdf']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
