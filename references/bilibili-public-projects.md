# B站字幕公开项目维护基线

核对日期：2026-08-17。

## 对照项目

- [lululu811/bilibili-subtitle-downloader](https://github.com/lululu811/bilibili-subtitle-downloader)：Python 批量工具，使用 yt-dlp，并实现 B站原生 API、WBI 签名和字幕 fallback。仓库在 2026-08-08 有推送，2026-08-17 仍有仓库更新记录；当前公开指标约 4 stars、1 fork。
- [XZXZZX-Ai/bilibili-mcp](https://github.com/XZXZZX-Ai/bilibili-mcp)：本地 MCP server，读取字幕和评论，并提供显式本地 faster-whisper ASR fallback。2026-08-17 有推送，当前公开指标约 14 stars、3 forks。
- [a-luoluo/bilibili-subtitle-extractor](https://github.com/a-luoluo/bilibili-subtitle-extractor)：浏览器扩展，通过捕获播放器加载的数据提取 CC/AI 字幕；适合单视频浏览器使用，不提供批量和 ASR。

## 本技能的取舍

本技能继续以 NotebookLM 本地归档为主，因此不直接复制公开项目的上传或账号管理逻辑。实现上吸收 WBI/API fallback、统一时间轴、字幕检索和显式本地 ASR；保留现有 CDP 中文 AI 字幕捕获、SRT/JSON、NotebookLM Markdown、handoff JSON 以及上传前确认边界。

## 维护与风险边界

上述日期和指标只是比较基线，不作为运行时依赖，也不代表项目质量保证。B站接口、字幕格式、播放器 DOM、Cookie 机制和风控可能变化。官方接口为空、页面显示“暂无字幕”或 CDP 不可用都不能单独证明视频没有字幕；只有检查播放器字幕菜单后才能确认 AI 字幕不可用。

本技能不绕过付费、会员、地区、私密、下架或其他访问限制。ASR 默认关闭，只有调用方显式开启时才下载音频并在本机转录。
