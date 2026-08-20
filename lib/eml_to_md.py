"""Convert EML files to readable Markdown using only Python's standard library."""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
from email import policy
from email.header import decode_header, make_header
from email.parser import BytesParser
from html.parser import HTMLParser
from pathlib import Path


def decode_header_value(value: str | None) -> str:
    if not value:
        return ""
    try:
        return str(make_header(decode_header(value))).replace("\r", " ").replace("\n", " ")
    except (LookupError, UnicodeError, ValueError):
        return str(value).replace("\r", " ").replace("\n", " ")


def decode_part(part) -> str:
    payload = part.get_payload(decode=True)
    if payload is None:
        raw_payload = part.get_payload()
        return raw_payload if isinstance(raw_payload, str) else ""
    charset = part.get_content_charset() or "utf-8"
    try:
        return payload.decode(charset, errors="replace")
    except (LookupError, TypeError):
        return payload.decode("utf-8", errors="replace")


class HTMLToMarkdown(HTMLParser):
    BLOCK_TAGS = {
        "address", "article", "aside", "blockquote", "dd", "div", "dl", "dt",
        "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2", "h3",
        "h4", "h5", "h6", "header", "hr", "li", "main", "nav", "ol", "p",
        "pre", "section", "table", "tr", "ul",
    }

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.skip_depth = 0
        self.in_pre = False
        self.link_url: str | None = None
        self.list_stack: list[tuple[str, int]] = []

    def _text(self) -> str:
        return "".join(self.parts)

    def _ensure_newline(self) -> None:
        if self._text() and not self._text().endswith("\n"):
            self.parts.append("\n")

    def _ensure_blank_line(self) -> None:
        text = self._text().rstrip("\n")
        if text:
            self.parts.append("\n\n")

    def handle_starttag(self, tag: str, attrs) -> None:
        tag = tag.lower()
        if tag in {"script", "style", "head", "svg"}:
            self.skip_depth += 1
            return
        if self.skip_depth:
            return
        attributes = dict(attrs)
        if tag in {"h1", "h2", "h3", "h4", "h5", "h6"}:
            self._ensure_blank_line()
            self.parts.append("#" * int(tag[1]) + " ")
        elif tag == "p":
            self._ensure_blank_line()
        elif tag in {"div", "section", "article", "header", "footer", "main", "aside"}:
            self._ensure_newline()
        elif tag == "br":
            self._ensure_newline()
        elif tag == "hr":
            self._ensure_blank_line()
            self.parts.append("---\n\n")
        elif tag == "blockquote":
            self._ensure_blank_line()
            self.parts.append("> ")
        elif tag == "ul":
            self._ensure_newline()
            self.list_stack.append(("ul", 0))
        elif tag == "ol":
            self._ensure_newline()
            self.list_stack.append(("ol", 0))
        elif tag == "li":
            self._ensure_newline()
            if self.list_stack:
                list_type, number = self.list_stack[-1]
                number += 1
                self.list_stack[-1] = (list_type, number)
                prefix = f"{number}. " if list_type == "ol" else "- "
            else:
                prefix = "- "
            self.parts.append(prefix)
        elif tag in {"strong", "b"}:
            self.parts.append("**")
        elif tag in {"em", "i"}:
            self.parts.append("*")
        elif tag == "code" and not self.in_pre:
            self.parts.append("`")
        elif tag == "pre":
            self._ensure_blank_line()
            self.parts.append("```\n")
            self.in_pre = True
        elif tag == "a":
            self.link_url = attributes.get("href")
            if self.link_url:
                self.parts.append("[")

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag in {"script", "style", "head", "svg"}:
            if self.skip_depth:
                self.skip_depth -= 1
            return
        if self.skip_depth:
            return
        if tag in {"h1", "h2", "h3", "h4", "h5", "h6", "p", "div", "section", "article", "header", "footer", "main", "aside", "li", "tr"}:
            self._ensure_newline()
        elif tag in {"ul", "ol"}:
            self._ensure_newline()
            if self.list_stack:
                self.list_stack.pop()
        elif tag == "blockquote":
            self._ensure_newline()
        elif tag in {"strong", "b"}:
            self.parts.append("**")
        elif tag in {"em", "i"}:
            self.parts.append("*")
        elif tag == "code" and not self.in_pre:
            self.parts.append("`")
        elif tag == "pre":
            self._ensure_newline()
            self.parts.append("```\n\n")
            self.in_pre = False
        elif tag == "a" and self.link_url:
            self.parts.append(f"]({self.link_url})")
            self.link_url = None

    def handle_data(self, data: str) -> None:
        if self.skip_depth:
            return
        if self.in_pre:
            self.parts.append(data)
        else:
            self.parts.append(re.sub(r"\s+", " ", html.unescape(data)))

    def convert(self, source: str) -> str:
        try:
            self.feed(source)
            self.close()
        except Exception:
            return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", source)).strip()
        result = self._text()
        result = re.sub(r"[ \t]+\n", "\n", result)
        result = re.sub(r"\n{3,}", "\n\n", result)
        return result.strip()


def html_to_markdown(source: str) -> str:
    return HTMLToMarkdown().convert(source)


def extract_body(message) -> tuple[str, str]:
    plain_parts: list[str] = []
    html_parts: list[str] = []
    parts = message.walk() if message.is_multipart() else [message]
    for part in parts:
        if part.is_multipart() or part.get_content_disposition() == "attachment":
            continue
        if part.get_content_type() == "text/plain":
            plain_parts.append(decode_part(part))
        elif part.get_content_type() == "text/html":
            html_parts.append(decode_part(part))
    if plain_parts:
        body = "\n\n".join(plain_parts).replace("\r\n", "\n").replace("\r", "\n").strip()
        if body:
            return body, "plain text"
    if html_parts:
        body = html_to_markdown("\n\n".join(html_parts))
        if body:
            return body, "HTML converted to Markdown"
    return "(No readable text body found.)", "none"


def attachment_names(message) -> list[str]:
    names: list[str] = []
    if not message.is_multipart():
        return names
    for part in message.walk():
        if part.is_multipart():
            continue
        filename = part.get_filename()
        disposition = part.get_content_disposition()
        if filename and (disposition == "attachment" or part.get_content_type() not in {"text/plain", "text/html"}):
            decoded = decode_header_value(filename)
            if decoded and decoded not in names:
                names.append(decoded)
    return names


def safe_filename(value: str) -> str:
    cleaned = re.sub(r"[\\/:*?\"<>|\r\n]", "_", value or "email")
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned[:120] or "email"


def build_markdown(message, source_path: Path) -> str:
    subject = decode_header_value(message.get("subject")) or source_path.stem
    lines = [f"# {subject}", "", "## Email details", ""]
    for label, value in [
        ("From", message.get("from")),
        ("To", message.get("to")),
        ("Cc", message.get("cc")),
        ("Reply-To", message.get("reply-to")),
        ("Date", message.get("date")),
    ]:
        decoded = decode_header_value(value)
        if decoded:
            lines.append(f"- **{label}:** {decoded}")
    attachments = attachment_names(message)
    if attachments:
        lines.extend(["", "## Attachments", ""])
        lines.extend(f"- `{name}`" for name in attachments)
    body, body_format = extract_body(message)
    lines.extend(["", f"## Body ({body_format})", "", body, ""])
    return "\n".join(lines)


def convert_file(source_path: Path, output_dir: Path) -> dict:
    with source_path.open("rb") as source_file:
        message = BytesParser(policy=policy.default).parse(source_file)
    subject = decode_header_value(message.get("subject")) or source_path.stem
    output_path = output_dir / f"{safe_filename(source_path.stem)}.md"
    output_path.write_text(build_markdown(message, source_path), encoding="utf-8")
    return {
        "source": str(source_path.resolve()),
        "markdown": str(output_path.resolve()),
        "subject": subject,
        "attachments": attachment_names(message),
    }


def collect_files(input_path: Path) -> list[Path]:
    if input_path.is_file():
        if input_path.suffix.lower() != ".eml":
            raise ValueError("输入文件必须是 .eml 文件。")
        return [input_path]
    if input_path.is_dir():
        return sorted((p for p in input_path.iterdir() if p.is_file() and p.suffix.lower() == ".eml"), key=lambda p: p.name.lower())
    raise FileNotFoundError(f"EML 文件或目录不存在: {input_path}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Convert EML files to Markdown.")
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args()
    files = collect_files(args.input.expanduser().resolve())
    if not files:
        raise ValueError(f"目录中未找到 .eml 文件: {args.input}")
    output_dir = args.output_dir.expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    converted: list[dict] = []
    failed: list[dict] = []
    for source_path in files:
        try:
            converted.append(convert_file(source_path, output_dir))
        except Exception as exc:
            failed.append({"source": str(source_path.resolve()), "error": str(exc)})
    if not converted:
        raise RuntimeError(json.dumps({"converted": [], "failed": failed}, ensure_ascii=False))

    if len(converted) == 1:
        combined_path = Path(converted[0]["markdown"])
    else:
        label = safe_filename(args.input.stem if args.input.is_file() else args.input.name)
        combined_path = output_dir / f"{label}_email_archive.md"
        combined = "\n\n---\n\n".join(Path(item["markdown"]).read_text(encoding="utf-8") for item in converted)
        combined_path.write_text(combined + "\n", encoding="utf-8")

    result = {
        "input": str(args.input.expanduser().resolve()),
        "output_dir": str(output_dir),
        "title": converted[0]["subject"] if len(converted) == 1 else (args.input.stem if args.input.is_file() else args.input.name),
        "email_count": len(converted),
        "markdown": str(combined_path.resolve()),
        "files": converted,
        "attachments": sorted({name for item in converted for name in item["attachments"]}),
        "failed": failed,
    }
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1)
