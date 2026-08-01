# B 站中文 AI 字幕回退

仅当本地字幕命令没有取得官方字幕，或报告 `CDP_UNAVAILABLE` 时读取本文件。该错误不能证明字幕不存在。

## 判定与选择

1. 使用 Codex 的 Chrome 控制能力打开原始视频 URL，等待播放器加载。
2. 展开 `[aria-label="字幕"]`，在播放器范围内寻找 `.bpx-player-ctrl-subtitle-language-item[data-lan="ai-zh"]`。
3. 如果存在多个匹配项，只点击唯一可见项。选择后必须验证“字幕已切换至 中文”提示，或读取播放器当前文本并确认实际字幕出现。
4. 只有播放器菜单中确实没有可见 `data-lan="ai-zh"` 时，才报告中文 AI 字幕不可用。

## 捕获

1. 通过该标签页的 CDP 能力将实际 `video` 元素复位到 `currentTime = 0`，并设置 `playbackRate = 8`。这是已验证的快速捕获路径；不要使用截图坐标点击进度条。
2. 在播放器容器中以 MutationObserver 或短轮询记录字幕变化。每条记录使用当时的 `video.currentTime`。
3. 从播放器文本中只保留时间行之前的动态字幕；丢弃菜单文字、互动提示和以“正在缓冲”开头的状态行。
4. 相同的连续字幕只保留一条；结束时间设为下一条开始时间减一个很小的间隔，末条设为视频时长。
5. 采样间隔必须不超过 `0.1` 秒。仅当 `8x` 出现明显漏段或持续缓冲时，才降回 `4x` 重试；不要因默认续播位置而从中途开始。

## 导出与核验

输出目录中保留以下文件：

- `<BV>_ai-browser.srt`
- `<BV>_ai-browser.json`
- `<BV>_ai-browser_notebooklm.md`
- `<BV>_ai-browser_notebooklm_handoff.json`

JSON 必须保留原始 URL、BV 号、`source: "ai-browser"` 和每段时间轴。Markdown 使用时间戳和字幕正文；交接清单默认选择 Markdown。导出后核验文件非空、首条接近 0 秒、末条接近媒体总时长，并随机检查缓冲提示未混入字幕。
