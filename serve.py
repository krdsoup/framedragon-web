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
import socketserver
import sys
import webbrowser
from functools import partial

ROOT = os.path.dirname(os.path.abspath(__file__))


class Handler(http.server.SimpleHTTPRequestHandler):
    # Windows 레지스트리가 .js 를 text/plain 으로 매핑해 둔 PC 가 있다
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".js": "text/javascript", ".mp3": "audio/mpeg", ".css": "text/css"}

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

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
