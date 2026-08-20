# EML 邮件归档

## 输入

使用 `--file` 传入单个 `.eml` 文件，或传入一个目录。目录模式只处理该目录第一层中的 `.eml` 文件，不递归扫描子目录。

```powershell
{baseDir}\run.bat --file "D:\Mail\message.eml" --no-upload --handoff-notebooklm
{baseDir}\run.bat --file "D:\Mail\Export" --no-upload --handoff-notebooklm
```

## 转换规则

- 使用 Python 标准库解析 MIME 邮件，不需要额外 Python 包。
- 优先提取 `text/plain`；没有可读纯文本时，将 `text/html` 转成 Markdown。
- 解码常见 MIME 标题编码，保留主题、发件人、收件人、抄送、回复地址和日期。
- 在 Markdown 中记录附件名称，但不提取或写出附件二进制内容。
- 单个输入生成一个 Markdown；目录输入为每封邮件生成 Markdown，并生成合并归档 Markdown。

## Python 发现顺序

1. `EML_PYTHON_EXE`
2. Codex 自带 Python（如果存在）
3. Windows `py -3`
4. `python`
5. `python3`

## NotebookLM 交接

使用 `--no-upload --handoff-notebooklm` 时，程序会生成 `*_eml_notebooklm_handoff.json`。清单中的 `suggested_upload` 为 `markdown`，`source_file` 保留原始 EML 文件或目录路径，`attachment_names` 保留附件名称列表。

## 致谢

EML 转换部分参考本工作区提供的 `Emltomd` 项目，并采用其 Python 标准库 MIME 解析与纯文本优先策略。
