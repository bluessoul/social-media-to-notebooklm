---
name: social-media-to-notebooklm
description: "微信公众号、LinkedIn、小红书、哔哩哔哩、Doc88 与 EML 内容提取，以及 Telegram 聊天记录 JSON 转换归档和 NotebookLM 交接技能。支持文章归档、B 站官方/AI 字幕导出、Doc88 PDF、EML 邮件 Markdown 与 Telegram 聊天记录转换，并在 AI 助手/Codex 中保存完成后按用户确认进入 NotebookLM 上传流程。"
---

## v1.5 使用方式更新

- 不再自动抓取预设文章；必须提供受支持平台的单篇链接或 B 站视频链接。
- 第一次使用时设置保存位置。以后会自动使用该位置；只有使用 `--set-output "<保存位置>"` 时才会修改。
- 可使用 `--help` 查看参数；使用 `--no-upload` 跳过 NotebookLM 上传询问。
- 在 Codex 中使用 `--no-upload --handoff-notebooklm` 完成保存后交接；用户确认前不得上传。
- 需要 Node.js 18 或更高版本。
- 支持 Doc88 预览文档链接（`https://www.doc88.com/p-数字.html`），提取为 PDF 并生成 NotebookLM 交接清单。
- Doc88 PDF 转换需要 Java 17、ffdec 和 presse；可通过 `DOC88_FFDEC_JAR`、`DOC88_PRESSE_EXE` 指定转换器路径。
- 支持单个 `.eml` 文件或包含 `.eml` 文件的目录，转换为 Markdown、附件名称清单和 NotebookLM 交接清单。
- EML 转换需要 Python 3；可通过 `EML_PYTHON_EXE` 指定 Python 解释器路径。
- EML 的详细输入、输出和限制见 [references/eml.md](references/eml.md)。


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

其他参数：

* `--set-output <目录>`：设置文章类任务的默认保存位置
* `--no-upload`：跳过旧版命令行 NotebookLM 上传
* `--upload`：保留旧版命令行直接上传行为
* `--handoff-notebooklm`：生成 NotebookLM 交接清单；应与 `--no-upload` 一起使用

### Telegram 聊天记录导出转换

```powershell
{baseDir}\run.bat --file "D:\Path\To\ChatExport.json" --no-upload --handoff-notebooklm
```
或直接传入 JSON 路径：
```powershell
{baseDir}\run.bat "D:\Path\To\ChatExport.json" --no-upload --handoff-notebooklm
```

支持自动解析 Telegram 官方导出的 JSON 格式，转换为格式规整、便于阅读和 NotebookLM 分析的高质量 Markdown (`<群组名>_history.md`)，并自动生成 NotebookLM 交接清单。
- **日期导航**: 按日期建立 `## 📅 YYYY-MM-DD` 目录分节。
- **消息与回复交叉链接**: 自动建立 `<a id="msg-ID"></a>` 锚点，回复引用可直接在 Markdown 中点击跳转。
- **富文本与代码高亮**: 完整转换粗体、斜体、代码、pre 代码块、文本链接及引用。
- **元数据与媒体标记**: 优雅渲染系统操作（邀请/移除成员、置顶消息等）、投票统计、回应数及媒体文件类型。

### EML 邮件转换

```powershell
{baseDir}\run.bat --file "D:\Mail\message.eml" --no-upload --handoff-notebooklm
{baseDir}\run.bat --file "D:\Mail\Export" --no-upload --handoff-notebooklm
```

支持单个邮件或目录中的 `.eml` 文件。每封邮件生成 Markdown；目录输入额外生成合并归档 Markdown。正文优先使用纯文本，缺少纯文本时将 HTML 转换为 Markdown，同时保留主题、地址、日期和附件名称。附件二进制内容不会被自动另存。转换器由 Node.js 调用 `lib/eml_to_md.py`，只使用 Python 标准库。

### B 站字幕导出

```powershell
{baseDir}\run.bat --url "https://www.bilibili.com/video/BV..." --output "D:\\Subtitles"
```

在 Codex 对话中，文章或 B 站字幕任务完成后应使用交接模式：

```powershell
{baseDir}\run.bat --url "<Target_URL>" --no-upload --handoff-notebooklm
```

脚本先请求视频官方字幕轨道；没有官方轨道时，再尝试连接端口 9222/9223 的 Chrome/Edge，打开字幕菜单并选择 `中文 AI`，随后以加速播放实时捕获字幕。使用 AI 字幕时请先在该浏览器登录 B 站，并用 `--remote-debugging-port=9223` 启动浏览器。

**不要把官方接口为空、页面快照中的“暂无字幕”，或 `CDP_UNAVAILABLE` 当作“视频没有字幕”。** 三者只说明当前路径未取得字幕。只有实际展开播放器字幕菜单后，确认没有可见的 `中文 AI` 选项，才可以报告该 AI 字幕不可用。

### Codex 中的中文 AI 回退

当命令行返回 `CDP_UNAVAILABLE`，且任务在 Codex 对话中执行时，改用已连接的 Chrome 会话完成 AI 字幕导出；不要要求用户先重启浏览器，也不要直接结束任务。详细且可复用的步骤见 [references/bilibili-ai-subtitle-fallback.md](references/bilibili-ai-subtitle-fallback.md)。核心顺序为：

1. 打开原始 B 站视频，等待播放器就绪，再展开字幕菜单。
2. 用可见的 `[data-lan="ai-zh"]` 选项选择中文 AI；以“字幕已切换至 中文”或实际出现的字幕文本为成功信号。
3. 在开始捕获前将播放位置复位至 `00:00`。优先使用播放器受控的 CDP 通道；不要依赖截图坐标或续播位置。
4. 已验证的快速路径是：从 `00:00` 重置后，以 `8.0x` 播放并每 `0.1` 秒采样一次，直到媒体结束。按实际字幕变化采样并去除“正在缓冲”等播放器状态文字；只有字幕明显漏段或持续缓冲时，才降回 `4x` 重试。
5. 导出 `BV*_ai-browser.srt/json`、`*_notebooklm.md` 和 `*_notebooklm_handoff.json`。检查首条时间接近 0、末条接近视频时长、无缓冲状态行和无相邻重复字幕。

---

## 📂 生成的成果物

提取成功后，将在技能根目录下生成以下成果：
1. **`[动态标题].md`**：本地离线版 Markdown。图片引用本地相对路径（适合 Obsidian、Typora 等本地阅读器），并且完美保留了作者头衔、热度、互动数，以及下方格式规整的完整评论列表。
2. **`[动态标题]_online.md`**：**NotebookLM 云端专用版**。图片引用原官方外链地址，导入 Google NotebookLM 后云端图片即可完美渲染，且元数据保留完整。
3. **`[动态标题].pdf`**：A4 打印格式 PDF，适合批注或直接上传到 NotebookLM。
4. **`images/`**：本地下载存储的高清图片目录。
5. B 站视频额外生成 **`<BV>_native.srt/json`** 或 **`<BV>_ai-browser.srt/json`**，JSON 保留时间轴、来源和原始链接。
6. 交接模式额外生成 **`<安全标题>_notebooklm_handoff.json`**；B 站额外生成 **`<BV>_<来源>_notebooklm.md`**，原始 JSON/SRT 保留不变。

## Codex → NotebookLM 交接流程

交接模式只生成文件和交接清单，不从 Node.js 端上传。读取清单后继续使用已安装的 NotebookLM 技能，并严格按以下顺序操作：

1. 报告生成的文件和交接清单路径。
2. 询问是否进入 NotebookLM 上传流程；用户拒绝时停止，不运行 `source add`。
3. 文章默认推荐 PDF，并允许选择 PDF、`_online.md`、两者和已下载附件；不要默认上传本地图片引用的普通 `.md`。
4. B 站默认选择 `*_notebooklm.md`；原始 `.json` 和 `.srt` 只归档，不直接上传。
5. 用户同意后，运行 `notebooklm auth check --test --json` 和 `notebooklm list --json`，列出现有 Notebook，并提供新建选项。
6. 显示最终上传摘要，包括完整文件路径、目标 Notebook 标题和完整 Notebook ID，再次请求明确确认。
7. 只有用户最终确认后，才对每个选中文件运行：

```powershell
notebooklm source add "<完整文件路径>" --notebook "<完整Notebook ID>" --json
```

8. 报告每个文件的 source ID 和处理状态。失败时保留交接清单，提供重试或跳过选项，不删除本地文件。

直接运行 `--upload` 时保留原有命令行兼容行为；该模式不属于 Codex 对话交接流程。NotebookLM CLI 路径应通过 PATH 或 `NOTEBOOKLM_EXE` 发现，不要写入用户专属硬编码路径。
