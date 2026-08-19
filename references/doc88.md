# Doc88 文档提取

使用现有入口：

```powershell
{baseDir}\run.bat --url "https://www.doc88.com/p-74980400939797.html" --no-upload --handoff-notebooklm
```

默认流程会自动启动无头浏览器，打开 Doc88 预览页，点击展开全部页面，逐页滚动触发加载，读取 `page_i` Canvas 并合成为 PDF。该流程等价于 Doc88Downloader Tampermonkey 脚本，但不需要用户手动安装脚本或点击按钮。

如果浏览器方式失败（例如页面要求滑块验证、继续阅读确认，或实际页数未全部加载），程序自动回退到资源解析流程：从 Doc88 读取预览文档配置，下载 PH/PK 页面资源，合成为 SWF，再调用 ffdec 生成逐页 PDF，最后使用 presse 合并为单个 PDF。回退流程优先使用技能目录中的 JDK 17。

PDF 转换器配置：

- `DOC88_FFDEC_JAR`：ffdec.jar 的完整路径。
- `DOC88_PRESSE_EXE`：presse 或 presse.exe 的完整路径。
- 也可以将 `ffdec/ffdec.jar` 与 `presse(.exe)` 放在技能目录中。

仅生成交接清单时，使用 `--no-upload --handoff-notebooklm`。程序不会自动上传，需在 Codex 中得到用户确认后再进入 NotebookLM 流程。

可用 `DOC88_METHOD=resource` 强制使用资源解析回退方式；默认不要设置该变量。

资源解析会在输出目录保留 `.doc88-work-<文档ID>` 作为断点目录，记录 `progress.json` 并复用已完成的 SWF/PDF。若外层执行被中断，重新运行同一链接即可继续；成功生成最终 PDF 后自动清理。排错时可设置 `DOC88_KEEP_WORK=1` 保留成功后的中间文件。

## 致谢

Doc88 资源解析与页面重组的实现思路参考并致谢 [cmy2008/doc88_extractor](https://github.com/cmy2008/doc88_extractor)。本技能在此基础上采用 Node.js 原生实现，并整合了现有的 NotebookLM 交接流程。
