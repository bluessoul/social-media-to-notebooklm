# Social Media to NotebookLM

**Local-first content capture and NotebookLM handoff**

Collect content from WeChat, LinkedIn, Xiaohongshu, Bilibili, YouTube, Telegram, Doc88, and EML files into reviewable, reusable local artifacts that can be handed off to NotebookLM.

**Language:** [中文](README.md) · [English](README.en.md) · [Español](README.es.md)

This is not an official NotebookLM product or client. It focuses on multi-platform content capture, formatting, local archiving, and controlled handoff.

## Why use it

- **Local-first:** Generate Markdown, PDF, SRT, and JSON locally before upload.
- **Multi-platform:** Handle articles, video subtitles, Telegram exports, Doc88 previews, and EML archives.
- **Controlled handoff:** NotebookLM upload is optional and requires user confirmation.
- **Traceable sources:** Preserve source URLs, video IDs, timestamps, and handoff metadata.

```text
URL / Telegram / EML export
          ↓
    local extraction
          ↓
 Markdown / PDF / SRT / JSON
          ↓
      user review
          ↓
 optional NotebookLM handoff
```

## Supported inputs

| Input | Main outputs |
| --- | --- |
| WeChat Official Account | Markdown, online Markdown, PDF, image directory |
| LinkedIn | Markdown, online Markdown, PDF, image directory |
| Xiaohongshu | Markdown, online Markdown, PDF, image directory |
| Bilibili | Official/AI subtitle SRT, JSON, NotebookLM Markdown |
| Telegram JSON export | Date-organized Markdown and handoff manifest |
| Doc88 preview | PDF and handoff manifest |
| EML file or directory | Email Markdown, attachment-name list, handoff manifest |

## Installation

Requires Node.js 18 or later:

```powershell
cd <skill-directory>
npm install
npx playwright install chromium
```

Install in Codex:

```powershell
python <skill-installer>/scripts/install-skill-from-github.py `
  --repo bluessoul/social-media-to-notebooklm --path .
```

EML conversion also requires Python 3. The tool tries `EML_PYTHON_EXE`, Codex's bundled Python, `py -3`, `python`, and `python3`.

## Basic usage

```powershell
.\run.bat --url "https://mp.weixin.qq.com/s/..."
.\run.bat --url "https://www.linkedin.com/posts/..."
.\run.bat --url "https://www.xiaohongshu.com/explore/..."
.\run.bat --url "https://www.bilibili.com/video/BV..."
```

For Telegram JSON or EML:

```powershell
.\run.bat --file "D:\Telegram\ChatExport.json" --no-upload --handoff-notebooklm
.\run.bat --file "D:\Mail\message.eml" --no-upload --handoff-notebooklm
```

Common options:

```text
--url <URL>                 Web or video URL
--file <file-or-directory>  Telegram JSON, EML file, or EML directory
--output <directory>        Bilibili subtitle output directory
--set-output <directory>    Set the default archive directory
--no-upload                 Skip the NotebookLM upload prompt
--upload                    Keep the legacy direct-upload behavior
--handoff-notebooklm        Generate a handoff manifest without uploading
--help                      Show help
```

## Bilibili subtitles

The priority is official subtitles (WBI API, then the standard API) → Chinese AI subtitles from an already logged-in Chrome/Edge browser → an explicit unavailable result.

AI subtitle capture requires a logged-in browser with CDP enabled:

```text
chrome.exe --remote-debugging-port=9223
```

Only explicit `--fallback-to-asr` enables local ASR. It requires `faster-whisper`, `yt-dlp`, and a working Python environment.

## Doc88

Doc88 preview pages can be exported to PDF through browser Canvas rendering, with an optional FFDec/Presse fallback. See [references/doc88.md](references/doc88.md).

## NotebookLM handoff

Handoff mode only creates local files and a JSON manifest. It does not upload from Node.js.

1. Review the generated artifacts and manifest.
2. Choose the recommended upload source.
3. Confirm before using a separate NotebookLM upload workflow.
4. Keep local artifacts if upload fails.

## Privacy and security boundaries

- Results are generated locally by default; NotebookLM upload is not automatic.
- Provide cookies, login sessions, and service credentials through local environment variables or an already logged-in browser. Never commit them.
- Telegram exports, EML files, subtitles, PDFs, logs, and screenshots may contain personal or copyrighted content. Do not commit them.
- Process only content you are authorized to access and archive.
- Follow the terms, copyright rules, and privacy requirements of each source platform.

## Development checks

```powershell
npm test
node --check lib/eml-converter.js
```

## Disclaimer

This project is unofficial and is not affiliated with Google or NotebookLM.
