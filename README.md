# Social Media to NotebookLM

将网页文章、视频字幕、Telegram 聊天记录、Doc88 预览文档和 EML 邮件归档为适合本地阅读及 NotebookLM 导入的文件。

默认流程是先在本地生成并核验文件，再由用户明确确认是否进入 NotebookLM 上传流程。使用 `--no-upload --handoff-notebooklm` 时只生成成果物和交接清单，不会自动上传。

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

转换单个邮件：

```powershell
.\run.bat --file "D:\Mail\message.eml" --no-upload --handoff-notebooklm
```

转换一个目录中的全部 `.eml` 文件：

```powershell
.\run.bat --file "D:\Mail\Export" --no-upload --handoff-notebooklm
```

转换结果包括：

- 每封邮件一个 Markdown 文件；目录输入还会生成合并的邮件归档 Markdown。
- 邮件主题、发件人、收件人、抄送、回复地址和日期。
- 优先使用纯文本正文；没有纯文本时将 HTML 正文转换为 Markdown。
- 邮件附件名称清单。当前不会解码或另存附件二进制内容。
- `*_eml_notebooklm_handoff.json` 交接清单，默认建议上传合并 Markdown。

如 Python 不在 PATH 中，可以指定解释器：

```powershell
$env:EML_PYTHON_EXE = "D:\Tools\Python312\python.exe"
.\run.bat --file "D:\Mail\message.eml" --no-upload --handoff-notebooklm
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

程序优先请求官方字幕；没有官方字幕时，可通过已登录并启用 CDP 的 Chrome/Edge 捕获播放器中的“中文 AI”字幕。启动浏览器示例：

```text
chrome.exe --remote-debugging-port=9223
```

使用 `--handoff-notebooklm` 时会额外生成带时间轴的 NotebookLM Markdown 和交接清单；原始 SRT/JSON 保留用于归档。

## Doc88 文档

```powershell
.\run.bat --url "https://www.doc88.com/p-74980400939797.html" --no-upload --handoff-notebooklm
```

Doc88 PDF 转换需要 Java 17 或更高版本、ffdec 和 presse。转换器不随本项目分发，可通过环境变量指定：

```powershell
$env:DOC88_FFDEC_JAR = "D:\Tools\ffdec\ffdec.jar"
$env:DOC88_PRESSE_EXE = "D:\Tools\presse.exe"
```

也可以将 `ffdec/ffdec.jar` 与 `presse(.exe)` 放在技能目录中。详细说明见 [references/doc88.md](references/doc88.md)。

## NotebookLM 交接

交接模式只生成文件和 JSON 清单，不从 Node.js 端上传：

1. 报告成果物和交接清单的完整路径。
2. 询问用户是否进入 NotebookLM 上传流程；用户拒绝时停止。
3. 根据来源推荐上传文件：文章优先 PDF 或在线 Markdown，B站优先 NotebookLM Markdown，Telegram/EML 优先 Markdown，Doc88 使用 PDF。
4. 用户确认后，再运行 NotebookLM 技能的认证、Notebook 选择和最终上传流程。
5. 失败时保留本地文件和交接清单，不删除成果物。

## 开发检查

```powershell
npm test
node --check lib/eml-converter.js
python -c "from pathlib import Path; compile(Path('lib/eml_to_md.py').read_text(encoding='utf-8'), 'lib/eml_to_md.py', 'exec')"
```

测试覆盖参数识别、EML 转 Markdown、EML 交接清单、Doc88 资源重组、文章交接、B站字幕交接、Telegram JSON 转换和输出目录设置。

## 致谢

- Doc88 资源解析与页面重组的实现思路参考并致谢 [cmy2008/doc88_extractor](https://github.com/cmy2008/doc88_extractor)。
- EML 转换部分参考本工作区提供的 `Emltomd` 项目，并保留其使用 Python 标准库解析 MIME 邮件、优先提取纯文本正文的思路。
