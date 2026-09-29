"""로컬 웹 서버 — python serve.py [포트]  →  http://127.0.0.1:8090/

**127.0.0.1 에만 묶는다.** 이 PC 에서 LAN 에 열린 문은 rag_project 의 8080 하나뿐이라는
원칙(rag_project/CLAUDE.md)을 지킨다. 다른 기기에서 하려면 --lan 을 붙인다 - 정적 파일이라
비밀은 없지만, 열어 두는 것은 의도해서 해야 한다.

index.html 은 file:// 로 더블클릭해도 돈다. 서버는 브라우저의 자동 재생·캐시 정책이
file:// 에서 다르게 굴 때를 위한 것이다.
"""

from __future__ import annotations

import http.server
import os
import re
import socketserver
import sys
import webbrowser
from functools import partial

ROOT = os.path.dirname(os.path.abspath(__file__))
_RANGE = re.compile(r"^bytes=(\d*)-(\d*)$")


class _Slice:
    """파일의 [start, start+n) 만 읽히게 한다 - copyfile 이 Range 밖을 보내지 않게."""

    def __init__(self, f, n: int):
        self.f, self.n = f, n

    def read(self, size: int = -1) -> bytes:
        if self.n <= 0:
            return b""
        size = self.n if size is None or size < 0 else min(size, self.n)
        data = self.f.read(size)
        self.n -= len(data)
        return data

    def close(self) -> None:
        self.f.close()


class Handler(http.server.SimpleHTTPRequestHandler):
    # Windows 레지스트리가 .js 를 text/plain 으로 매핑해 둔 PC 가 있다
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".js": "text/javascript", ".mp3": "audio/mpeg", ".ogg": "audio/ogg",
                      ".css": "text/css"}

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Accept-Ranges", "bytes")
        super().end_headers()

    # 표준 SimpleHTTPRequestHandler 는 Range 를 모른다. 그러면 브라우저가 BGM 의 아직 받지 않은
    # 구간으로 건너뛰지 못한다 (2026-09-29: 150초 곡에서 currentTime 지정이 무시됐다).
    def send_head(self):
        rng = self.headers.get("Range")
        path = self.translate_path(self.path)
        m = _RANGE.match(rng.strip()) if rng else None
        if not m or os.path.isdir(path) or not os.path.isfile(path):
            return super().send_head()
        f = open(path, "rb")
        size = os.fstat(f.fileno()).st_size
        start, end = m.groups()
        if start == "":                                  # bytes=-N : 끝에서 N 바이트
            start, end = max(0, size - int(end or 0)), size - 1
        else:
            start, end = int(start), min(int(end) if end else size - 1, size - 1)
        if start >= size or start > end:
            f.close()
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{size}")
            self.end_headers()
            return None
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.end_headers()
        f.seek(start)
        return _Slice(f, end - start + 1)

    def log_message(self, fmt, *args):
        pass


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    port = int(args[0]) if args else 8090
    host = "0.0.0.0" if "--lan" in sys.argv else "127.0.0.1"
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer((host, port), partial(Handler, directory=ROOT)) as httpd:
        url = f"http://127.0.0.1:{port}/"
        print(f"FrameDragon: {url}  (Ctrl+C 로 종료)")
        if "--no-browser" not in sys.argv:
            webbrowser.open(url)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
