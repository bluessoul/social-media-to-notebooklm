---
name: social-media-to-notebooklm
description: "微信公众号、LinkedIn 与小红书单篇内容提取器（Markdown+图片下载+PDF）。支持单篇微信文章、LinkedIn 动态/长文和小红书图文笔记；在用户正常浏览器会话中提取可见内容，输出离线 Markdown、在线 Markdown 和 A4 PDF。"
version: "1.3.0"
author: "Antigravity"
---

## v1.3 使用方式更新

- 不再自动抓取预设文章；必须提供微信、LinkedIn 或小红书单篇笔记链接。
- 第一次使用时设置保存位置。以后会自动使用该位置；只有使用 `--set-output "<保存位置>"` 时才会修改。
- 可使用 `--help` 查看参数；使用 `--no-upload` 跳过 NotebookLM 上传询问。
- 需要 Node.js 18 或更高版本。


# 社交媒体与文章提取到 NotebookLM 技能

这是一个为 OpenClaw / QClaw 优化的**微信公众号、LinkedIn 与小红书单篇内容归档工具**。它可在用户正常登录的 Chrome/Edge 会话中读取可见内容，下载页面正常提供的图片，输出本地 Markdown、在线 Markdown 和 A4 PDF。LinkedIn 与小红书会导出当前页面已显示的评论：一级评论按顺序编号，已显示回复缩进为子项；不导出头像、点赞、按钮、未展开评论、收藏、搜索结果或批量账号内容。

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

直接运行技能目录下的 `run.bat` 并传入微信文章、LinkedIn 动态或小红书单篇笔记链接：

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

---

## 📂 生成的成果物

提取成功后，将在技能根目录下生成以下成果：
1. **`[动态标题].md`**：本地离线版 Markdown。图片引用本地相对路径（适合 Obsidian、Typora 等本地阅读器），并且完美保留了作者头衔、热度、互动数，以及下方格式规整的完整评论列表。
2. **`[动态标题]_online.md`**：**NotebookLM 云端专用版**。图片引用原官方外链地址，导入 Google NotebookLM 后云端图片即可完美渲染，且元数据保留完整。
3. **`[动态标题].pdf`**：A4 打印格式 PDF，适合批注或直接上传到 NotebookLM。
4. **`images/`**：本地下载存储的高清图片目录。
