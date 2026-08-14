# Social Media to NotebookLM

将微信公众号、LinkedIn、小红书内容、哔哩哔哩视频字幕和 Telegram 聊天记录整理为可离线保存、可继续导入 NotebookLM 的文件。

默认流程是先在本地生成并核验文件，再由用户确认是否上传 NotebookLM。使用 `--no-upload --handoff-notebooklm` 可以只生成交接清单，不会自动上传。

## 支持平台

- 微信公众号文章
- LinkedIn 动态和长文
- 小红书单篇图文笔记
- 哔哩哔哩视频字幕：官方字幕和播放器中的“中文 AI”字幕
- Telegram 聊天记录 JSON：转换为按日期组织的 Markdown，并生成 NotebookLM 交接清单

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
  --repo bluessoul/Anything-to-notebooklm --path .
```

## 基本用法

```powershell
.\run.bat --url "https://mp.weixin.qq.com/s/..."
.\run.bat --url "https://www.linkedin.com/posts/..."
.\run.bat --url "https://www.xiaohongshu.com/explore/..."
```

文章类任务会生成本地 Markdown、在线 Markdown、PDF 和图片目录。需要交接 NotebookLM 时：

```powershell
.\run.bat --url "https://mp.weixin.qq.com/s/..." --no-upload --handoff-notebooklm
```

该模式会生成包含绝对路径和建议上传文件的 `*_notebooklm_handoff.json`；它只完成本地归档和交接，不执行上传。

## Doc88 文档提取

支持 `https://www.doc88.com/p-数字.html` 预览文档链接。程序会读取文档页面结构，下载并重组页面资源，生成单个 PDF，并可生成 NotebookLM 交接清单。

```powershell
.\run.bat --url "https://www.doc88.com/p-74980400939797.html" --no-upload --handoff-notebooklm
```

Doc88 PDF 转换需要 Java 17 或更高版本、ffdec 和 presse。可以通过环境变量指定转换器：

```powershell
$env:DOC88_FFDEC_JAR = "D:\Tools\ffdec\ffdec.jar"
$env:DOC88_PRESSE_EXE = "D:\Tools\presse.exe"
```

也可以将 `ffdec/ffdec.jar` 和 `presse(.exe)` 放在技能目录中。转换器不随本项目分发；仅使用 `--no-upload --handoff-notebooklm` 时，程序不会自动上传到 NotebookLM。

## Telegram 聊天记录转换

```powershell
.\run.bat --file "D:\Path\To\ChatExport.json"
```

需要交接 NotebookLM 时：

```powershell
.\run.bat --file "D:\Path\To\ChatExport.json" --no-upload --handoff-notebooklm
```

程序会将 Telegram 导出的 JSON 聊天文件转换为适合阅读和 NotebookLM 知识库构建的 Markdown 文档，并支持：

- 按天分类 `## 📅 YYYY-MM-DD`
- 消息内部链接与回复关联（`<a id="msg-xx"></a>`）
- 代码块、图片、视频、文件、音频、系统事件、投票及回应处理
- `<群组名>_history.md` 和 `<群组名>_telegram_handoff.json`

## B 站字幕

```powershell
.\run.bat --url "https://www.bilibili.com/video/BV..." --output "D:\Subtitles"
```

程序按以下顺序工作：

1. 请求 B 站官方字幕接口；
2. 如果没有可下载的官方字幕，连接已登录的 Chrome/Edge；
3. 打开字幕菜单并选择“中文 AI”；
4. 从视频开始位置实时观察播放器字幕 DOM，输出带时间轴的 SRT 和 JSON 文件；
5. 使用 `--handoff-notebooklm` 时，额外生成带时间戳的 NotebookLM Markdown 和交接清单。

AI 字幕模式需要先登录 B 站，并用 CDP 端口启动浏览器：

```text
chrome.exe --remote-debugging-port=9223
```

AI 字幕捕获默认从 `00:00` 开始。命令行捕获默认使用 `4x`，在 Codex 中进行已连接浏览器回退时使用已验证的 `8x`、不超过 `0.1` 秒的采样间隔；只有出现漏段或持续缓冲时才降速重试。不能仅凭官方接口为空、页面显示“暂无字幕”或 `CDP_UNAVAILABLE` 判断视频没有字幕。

脚本也会尝试 Edge 的 9222 端口。输出文件示例：

```text
bilibili-output/BVxxxxxxxxxx_native.srt
bilibili-output/BVxxxxxxxxxx_native.json
bilibili-output/BVxxxxxxxxxx_ai-browser.srt
bilibili-output/BVxxxxxxxxxx_ai-browser.json
bilibili-output/BVxxxxxxxxxx_ai-browser_notebooklm.md
bilibili-output/BVxxxxxxxxxx_ai-browser_notebooklm_handoff.json
```

使用 `--handoff-notebooklm` 时，交接清单建议上传 Markdown，而不是原始 JSON。JSON 会保留来源类型、原始链接、BV 号和每条字幕的起止时间。

## 参数

```text
--url <链接>             目标链接，也可以直接作为第一个参数
--output <目录>          B 站字幕输出目录
--playback-rate <倍速>   B 站浏览器捕获倍速，默认 4
--set-output <目录>      设置文章类任务的默认保存位置
--upload                 抓取后直接上传到 NotebookLM
--no-upload              跳过 NotebookLM 上传询问
--handoff-notebooklm     生成 NotebookLM 交接清单，不自动上传
--help                   查看帮助
```

## 致谢

Doc88 资源解析与页面重组的实现思路参考并致谢 [cmy2008/doc88_extractor](https://github.com/cmy2008/doc88_extractor)。本项目在此基础上采用 Node.js 原生实现，并整合了现有的 NotebookLM 交接流程。

## 开发检查

```powershell
npm test
node --check lib/bilibili-subtitles.js
```

测试覆盖参数解析、文章交接、B 站字幕 Markdown/交接清单、Telegram JSON 转 Markdown/交接清单和输出目录设置。

## 说明

本项目只读取用户已经登录并且页面实际显示的内容。AI 字幕捕获依赖 B 站播放器当前提供的字幕 DOM；如果视频没有字幕、页面未登录或浏览器未开启 CDP，程序会明确报告失败原因。
