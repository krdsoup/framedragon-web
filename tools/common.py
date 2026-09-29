"""생성 도구 공통 — 경로와 키.

키는 rag_project/.env 에서 읽는다. 이 디렉터리(framedragon-web)에 키를 복사하지 않는다 -
복사본이 생기면 어긋나고, 게임 파일과 함께 LAN 에 나갈 수도 있다.

- 게이트웨이(127.0.0.1:8082) 키: GATEWAY_API_KEY
- rag API(127.0.0.1:8080) 키: API_KEYS 의 첫 항목. **형식이 '이름:키,이름2:키2'** 라
  콤마로만 자르면 401 이다 (rag/config.py 의 key_to_name).
"""

from __future__ import annotations

import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent          # framedragon-web/
RAG_ROOT = ROOT.parent                                  # rag_project/
DESIGN = json.loads((ROOT / "tools" / "design.json").read_text(encoding="utf-8"))

GATEWAY_URL = os.environ.get("FD_GATEWAY_URL", "http://127.0.0.1:8082")
RAG_URL = os.environ.get("FD_RAG_URL", "http://127.0.0.1:8080")


def _dotenv() -> dict[str, str]:
    out: dict[str, str] = {}
    path = RAG_ROOT / ".env"
    if not path.exists():
        return out
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def gateway_key() -> str:
    key = os.environ.get("FD_GATEWAY_KEY") or _dotenv().get("GATEWAY_API_KEY", "")
    if not key:
        raise SystemExit("GATEWAY_API_KEY 가 없다 - rag_project/.env 를 확인하라")
    return key


def rag_key() -> str:
    key = os.environ.get("FD_RAG_KEY", "")
    if not key:
        for item in _dotenv().get("API_KEYS", "").split(","):
            name, sep, value = item.strip().partition(":")
            if sep and value.strip():
                key = value.strip()
                break
    if not key:
        raise SystemExit("API_KEYS 가 없다 - rag_project/.env 를 확인하라")
    return key


def write_js(path: Path, var: str, data) -> None:
    """게임은 file:// 에서도 열려야 해서 JSON 을 fetch 하지 않고 JS 전역으로 싣는다."""
    body = json.dumps(data, ensure_ascii=False, indent=1)
    path.write_text(f"// 생성 파일 - tools/ 의 스크립트가 쓴다. 손으로 고치면 재생성 때 덮인다.\n"
                    f"window.{var} = {body};\n", encoding="utf-8")
