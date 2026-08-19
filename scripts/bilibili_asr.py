"""Explicit local ASR fallback for Bilibili videos."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True)
    parser.add_argument("--bvid", required=True)
    parser.add_argument("--page", type=int, default=1)
    parser.add_argument("--model", choices=["tiny", "base", "small"], default="small")
    args = parser.parse_args()

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print("ASR_UNAVAILABLE: install faster-whisper in the configured Python environment", file=sys.stderr)
        return 2

    ytdlp = os.environ.get("YTDLP_EXECUTABLE") or shutil.which("yt-dlp")
    if not ytdlp:
        print("ASR_UNAVAILABLE: yt-dlp executable was not found", file=sys.stderr)
        return 2

    with tempfile.TemporaryDirectory(prefix="bilibili-asr-") as temp_dir:
        output = str(Path(temp_dir) / "audio.%(ext)s")
        command = [ytdlp, "--no-playlist", "-f", "bestaudio/best", "--output", output, args.url]
        try:
            child_env = os.environ.copy()
            for secret_name in ("BILIBILI_COOKIE", "SESSDATA", "bili_jct", "DedeUserID"):
                child_env.pop(secret_name, None)
            completed = subprocess.run(command, check=False, capture_output=True, text=True, timeout=3600, env=child_env)
        except OSError as exc:
            print(f"ASR_UNAVAILABLE: {exc}", file=sys.stderr)
            return 2
        if completed.returncode != 0:
            print(completed.stderr[-2000:] or "ASR_FAILED: yt-dlp failed", file=sys.stderr)
            return 3

        audio_files = list(Path(temp_dir).glob("audio.*"))
        if not audio_files:
            print("ASR_FAILED: yt-dlp produced no audio file", file=sys.stderr)
            return 3

        try:
            model = WhisperModel(args.model, device="cpu", compute_type="int8")
            segments, info = model.transcribe(str(audio_files[0]), vad_filter=True)
            items = [{"from": float(segment.start), "to": float(segment.end), "content": segment.text.strip()} for segment in segments if segment.text.strip()]
        except Exception as exc:
            print(f"ASR_FAILED: {exc}", file=sys.stderr)
            return 4

    print(json.dumps({"bvid": args.bvid, "page": args.page, "language": getattr(info, "language", None), "model": args.model, "items": items}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
