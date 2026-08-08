# Social Media to NotebookLM

将微信公众号、LinkedIn、小红书内容，以及哔哩哔哩视频字幕整理为可离线保存、可继续导入 NotebookLM 的文件。

## 支持平台

- 微信公众号文章
- LinkedIn 动态和长文
- 小红书单篇图文笔记
- 哔哩哔哩视频字幕：官方字幕和播放器中的“中文 AI”字幕
- Telegram 聊天记录 JSON：自动转换为高清 Markdown 离线文档与 NotebookLM 格式

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

## 基本用法

```powershell
.\run.bat --url "https://mp.weixin.qq.com/s/..."
.\run.bat --url "https://www.linkedin.com/posts/..."
.\run.bat --url "https://www.xiaohongshu.com/explore/..."
```

文章类任务会生成本地 Markdown、在线 Markdown、PDF 和图片目录。

## Telegram 聊天记录转换

```powershell
.\run.bat --file "D:\Path\To\ChatExport.json"
```

将 Telegram 导出的 JSON 聊天文件转换为适合阅读和 NotebookLM 知识库构建的 Markdown 文档：
- 按天分类 `## 📅 YYYY-MM-DD`
- 消息内部链接与回复关联 (`<a id="msg-xx"></a>`)
- 代码块、图文附件、系统事件、投票及回应处理

## B 站字幕

```powershell
.\run.bat --url "https://www.bilibili.com/video/BV..." --output "D:\Subtitles"
```

程序按以下顺序工作：

1. 请求 B 站官方字幕接口；
2. 如果没有可下载的官方字幕，连接已登录的 Chrome/Edge；
3. 打开字幕菜单并选择“中文 AI”；
4. 实时观察播放器字幕 DOM，输出带时间轴的 SRT 和 JSON 文件。

AI 字幕模式需要先登录 B 站，并用 CDP 端口启动浏览器：

```text
chrome.exe --remote-debugging-port=9223
```

脚本也会尝试 Edge 的 9222 端口。输出文件示例：

```text
bilibili-output/BVxxxxxxxxxx_native.srt
bilibili-output/BVxxxxxxxxxx_native.json
bilibili-output/BVxxxxxxxxxx_ai-browser.srt
bilibili-output/BVxxxxxxxxxx_ai-browser.json
```

JSON 会保留来源类型、原始链接、BV 号和每条字幕的起止时间。

## 参数

```text
--url <链接>             目标链接，也可以直接作为第一个参数
--output <目录>          B 站字幕输出目录
--playback-rate <倍速>   AI 字幕捕获倍速，默认 4
--set-output <目录>      设置文章类任务的默认保存位置
--no-upload              跳过 NotebookLM 上传询问
--help                   查看帮助
```

## 开发检查

```powershell
npm test
node --check lib/bilibili-subtitles.js
```

## 说明

本项目只读取用户已经登录并且页面实际显示的内容。AI 字幕捕获依赖 B 站播放器当前提供的字幕 DOM；如果视频没有字幕、页面未登录或浏览器未开启 CDP，程序会明确报告失败原因。
