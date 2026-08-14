# Doc88 文档提取

使用现有入口：

```powershell
{baseDir}\run.bat --url "https://www.doc88.com/p-74980400939797.html" --no-upload --handoff-notebooklm
```

流程会从 Doc88 读取预览文档配置，下载 PH/PK 页面资源，合成为 SWF，再调用 ffdec 生成逐页 PDF，最后使用 presse 合并为单个 PDF。

PDF 转换器配置：

- `DOC88_FFDEC_JAR`：ffdec.jar 的完整路径。
- `DOC88_PRESSE_EXE`：presse 或 presse.exe 的完整路径。
- 也可以将 `ffdec/ffdec.jar` 与 `presse(.exe)` 放在技能目录中。

仅生成交接清单时，使用 `--no-upload --handoff-notebooklm`。程序不会自动上传，需在 Codex 中得到用户确认后再进入 NotebookLM 流程。

## 致谢

Doc88 资源解析与页面重组的实现思路参考并致谢 [cmy2008/doc88_extractor](https://github.com/cmy2008/doc88_extractor)。本技能在此基础上采用 Node.js 原生实现，并整合了现有的 NotebookLM 交接流程。
