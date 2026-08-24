# Social Media to NotebookLM

[中文](README.md) · [English](README.en.md) · [Español](README.es.md)

**Local-first content capture and NotebookLM handoff**

将微信公众号、LinkedIn、小红书、哔哩哔哩、YouTube、Telegram、Doc88 和 EML 内容整理为可审查、可复用、可继续导入 NotebookLM 的本地文件。

默认流程是：本地提取 → 生成文件 → 用户核验 → 可选交接 NotebookLM。使用 `--no-upload --handoff-notebooklm` 时只生成成果物和交接清单，不会自动上传。

本项目不是 NotebookLM 的官方产品，也不是 NotebookLM 客户端；它专注于多平台内容获取、格式化和本地交接。

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

## 支持的输入

| 输入 | 识别方式 | 主要输出 |
| --- | --- | --- |
| 微信公众号 | `https://mp.weixin.qq.com/s/...` | Markdown、在线 Markdown、PDF、图片目录 |
| LinkedIn | 动态或长文章链接 | Markdown、在线 Markdown、PDF、图片目录 |
| 小红书 | 单篇笔记或分享短链接 | Markdown、在线 Markdown、PDF、图片目录 |
| 哔哩哔哩 | `bilibili.com/video/BV...` 或 `b23.tv` | 官方/AI 字幕 SRT、JSON、NotebookLM Markdown |
| Telegram | 官方导出的 JSON 文件 | 按日期组织的 Markdown、交接清单 |
| Doc88 | `https://www.doc88.com/p-数字.html` | PDF、交接清单 |
| EML | 单个 `.eml` 文件或包含 `.eml` 的目录 | 邮件 Markdown、附件名称清单、交接清单 |


## 安装

需要 Node.js 18 或更高版本：

```powershell
cd <技能目录>
npm install
npx playwright install chromium
```

在 Codex 中安装：

```powershell
python <skill-installer>/scripts/install-skill-from-github.py `
  --repo bluessoul/social-media-to-notebooklm --path .
```

EML 转换还需要 Python 3。程序会依次尝试 `EML_PYTHON_EXE`、Codex 自带 Python、`py -3`、`python` 和 `python3`。

## 基本用法

```powershell
.\run.bat --url "https://mp.weixin.qq.com/s/..."
.\run.bat --url "https://www.linkedin.com/posts/..."
.\run.bat --url "https://www.xiaohongshu.com/explore/..."
.\run.bat --url "https://www.bilibili.com/video/BV..."
```

第一次运行会询问保存位置。也可以直接指定或修改默认保存位置：

```powershell
.\run.bat --set-output "D:\NotebookLM\archives"
```

常用参数：

```text
--url <链接>              网页或视频链接
--file <文件或目录>       Telegram JSON、EML 文件或 EML 目录
--output <目录>           B站字幕输出目录
--set-output <目录>       设置文章、邮件和文档类任务的默认保存位置
--no-upload               跳过 NotebookLM 上传询问
--upload                  保留旧版命令行直接上传行为
--handoff-notebooklm      生成 NotebookLM 交接清单，不自动上传
--help                    显示帮助
```

## EML 邮件转换

```powershell
.\run.bat --file "D:\Mail\message.eml" --no-upload --handoff-notebooklm
.\run.bat --file "D:\Mail\Export" --no-upload --handoff-notebooklm
```

支持单个邮件或目录中的 `.eml` 文件。每封邮件生成 Markdown；目录输入额外生成合并归档 Markdown。正文优先使用纯文本，缺少纯文本时将 HTML 转换为 Markdown，同时保留主题、地址、日期和附件名称。当前只记录附件名称，不会提取附件二进制内容。

如 Python 不在 PATH 中，可以指定解释器：

```powershell
$env:EML_PYTHON_EXE = "D:\Tools\Python312\python.exe"
```

## Telegram 聊天记录

```powershell
.\run.bat --file "D:\Telegram\ChatExport.json" --no-upload --handoff-notebooklm
```

支持日期分节、消息与回复锚点、富文本、代码块、链接、媒体标记、系统事件、投票和回应统计。输出 `<群组名>_history.md` 及交接清单。

## 哔哩哔哩字幕

```powershell
.\run.bat --url "https://www.bilibili.com/video/BV..." --output "D:\Subtitles"
```

字幕优先级为官方字幕（WBI 接口失败时回退普通接口）→ 已登录浏览器中的中文 AI 字幕 → 报告不可用。AI 字幕需要以 CDP 端口启动已登录浏览器：

```text
chrome.exe --remote-debugging-port=9223
```

当前只处理单个视频，可使用 URL 中的 `?p=2` 指定分P。无官方或 AI 字幕时，只有显式传入 `--fallback-to-asr` 才会运行本地 ASR；ASR 需要 `faster-whisper`、`yt-dlp` 和可用的 Python 环境。

也可以运行独立的本地 MCP server：

```powershell
node .\mcp\bilibili-server.js
```

MCP 只生成本地文件，不自动上传 NotebookLM。公开项目比较基线见 [references/bilibili-public-projects.md](references/bilibili-public-projects.md)。

## Doc88 文档

```powershell
.\run.bat --url "https://www.doc88.com/p-74980400939797.html" --no-upload --handoff-notebooklm
```

Doc88 默认尝试浏览器 Canvas 导出 PDF；浏览器渲染失败时回退到 PH/PK → SWF → FFDec/Presse 资源解析。回退转换需要 Java 17 或更高版本、ffdec 和 presse：

```powershell
$env:DOC88_FFDEC_JAR = "D:\Tools\ffdec\ffdec.jar"
$env:DOC88_PRESSE_EXE = "D:\Tools\presse.exe"
```

Doc88 支持中断后复用输出目录中的 `.doc88-work-<文档ID>` 临时成果；成功生成最终 PDF 后清理该目录。详细说明见 [references/doc88.md](references/doc88.md)。

## NotebookLM 交接

交接模式只生成文件和 JSON 清单，不从 Node.js 端上传：

1. 报告成果物和交接清单的完整路径。
2. 询问用户是否进入 NotebookLM 上传流程；用户拒绝时停止。
3. 文章优先 PDF 或在线 Markdown，B站优先 NotebookLM Markdown，Telegram/EML 优先 Markdown，Doc88 使用 PDF。
4. 用户确认后，再运行 NotebookLM 技能的认证、Notebook 选择和最终上传流程。
5. 失败时保留本地文件和交接清单，不删除成果物。

## 开发检查

```powershell
npm test
node --check lib/eml-converter.js
python -c "from pathlib import Path; compile(Path('lib/eml_to_md.py').read_text(encoding='utf-8'), 'lib/eml_to_md.py', 'exec')"
```

## 致谢

- Doc88 资源解析与页面重组的实现思路参考并致谢 [cmy2008/doc88_extractor](https://github.com/cmy2008/doc88_extractor)。
- EML 转换部分参考本工作区提供的 `Emltomd` 项目，并采用 Python 标准库解析 MIME 邮件、优先提取纯文本正文的思路。

## 隐私与安全边界

- 默认只在本地生成和保存结果，不会自动上传 NotebookLM。
- Cookie、登录态和服务凭据通过本地环境变量或已登录浏览器提供，不应写入仓库。
- Telegram 导出文件、EML 邮件、字幕、PDF、日志和截图可能包含个人或受版权保护的内容，请不要提交到 Git。
- 使用 `--no-upload` 可跳过 NotebookLM 上传询问；使用 `--handoff-notebooklm` 只生成交接清单。
- 请仅处理你有权访问和归档的内容，并遵守来源平台的条款、版权和隐私要求。