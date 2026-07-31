---
name: social-media-to-notebooklm
description: "微信公众号、LinkedIn、小红书与哔哩哔哩内容提取器。支持文章归档和 B 站官方/AI 字幕导出；在用户正常浏览器会话中提取可见内容并输出离线文件。"
version: "1.4.0"
author: "Antigravity"
---

## v1.4 使用方式更新

- 不再自动抓取预设文章；必须提供受支持平台的单篇链接或 B 站视频链接。
- 第一次使用时设置保存位置。以后会自动使用该位置；只有使用 `--set-output "<保存位置>"` 时才会修改。
- 可使用 `--help` 查看参数；使用 `--no-upload` 跳过 NotebookLM 上传询问。
- 需要 Node.js 18 或更高版本。


# 社交媒体与文章提取到 NotebookLM 技能

这是一个为 OpenClaw / QClaw 优化的**微信公众号、LinkedIn、小红书与哔哩哔哩内容归档工具**。它可在用户正常登录的 Chrome/Edge 会话中读取可见内容，下载页面正常提供的图片，输出本地 Markdown、在线 Markdown 和 A4 PDF。B 站字幕采用官方字幕接口优先；当视频只提供播放器中的“中文 AI”字幕时，通过 CDP 连接已登录浏览器，实时观察字幕 DOM 并导出 SRT/JSON。

---

## 🛠️ 前置准备与运行环境

### 1. 运行依赖安装
在第一次运行前，需要在本技能目录下安装 Node.js 依赖和 Chromium 内核：
```bash
cd {baseDir}
npm install
npx playwright install chromium
```

### 2. 浏览器登录继承
由于 LinkedIn 具有极强的人机识别与登录墙（Authwall），本技能通过 Chrome DevTools Protocol (CDP) 自动与您已经打开的 **Edge 浏览器（端口 9222）** 或 **Chrome 浏览器（端口 9223）** 建立调试连接。
* **使用建议：** 建议您在常用浏览器（如 Chrome）启动快捷方式中加上参数 `--remote-debugging-port=9223`。只要您在浏览器中登录了 LinkedIn，技能在运行时就会完美继承您的登录会话，免去账号密码登录和人机验证的烦恼！

### 3. 免疫防锁死与云盘冲突
本技能内置了自主安全写入重试机制，当您的工作区处于小米云盘、OneDrive 等同步云端或是文件被预览软件独占锁死时，脚本会自动尝试 5 次并在锁死时自动生成备份本地版，100% 免疫 EBUSY 错误！

---

## 🚀 运行命令

直接运行技能目录下的 `run.bat` 并传入受支持链接：

```powershell
{baseDir}\run.bat --url "<Target_URL>"
```
或者直接作为第一个参数：
```powershell
{baseDir}\run.bat "<Target_URL>"
```

### 参数说明
* `--url` / 第一个参数：要提取的文章链接。支持：
  * 微信公众号文章（格式如 `https://mp.weixin.qq.com/s/...`）
  * LinkedIn 动态/长文章（格式如 `https://www.linkedin.com/feed/update/urn:li:activity:...` 或 `https://www.linkedin.com/posts/...`）
  * 小红书单篇图文笔记（格式如 `https://www.xiaohongshu.com/explore/...` 或分享短链接）
  * 哔哩哔哩视频（格式如 `https://www.bilibili.com/video/BV...`）

### B 站字幕导出

```powershell
{baseDir}\run.bat --url "https://www.bilibili.com/video/BV..." --output "D:\\Subtitles"
```

脚本先请求视频官方字幕轨道；如果没有可下载的官方轨道，会连接端口 9222/9223 的 Chrome/Edge，打开字幕菜单并选择 `中文 AI`，随后以加速播放实时捕获字幕。使用 AI 字幕时请先在该浏览器登录 B 站，并用 `--remote-debugging-port=9223` 启动浏览器。

---

## 📂 生成的成果物

提取成功后，将在技能根目录下生成以下成果：
1. **`[动态标题].md`**：本地离线版 Markdown。图片引用本地相对路径（适合 Obsidian、Typora 等本地阅读器），并且完美保留了作者头衔、热度、互动数，以及下方格式规整的完整评论列表。
2. **`[动态标题]_online.md`**：**NotebookLM 云端专用版**。图片引用原官方外链地址，导入 Google NotebookLM 后云端图片即可完美渲染，且元数据保留完整。
3. **`[动态标题].pdf`**：A4 打印格式 PDF，适合批注或直接上传到 NotebookLM。
4. **`images/`**：本地下载存储的高清图片目录。
5. B 站视频额外生成 **`<BV>_native.srt/json`** 或 **`<BV>_ai-browser.srt/json`**，JSON 保留时间轴、来源和原始链接。
