"""이미지를 로컬 ComfyUI 로 만든다 → assets/raw/<kind>/<id>.png

rag API 의 POST /v1/images/generations (Phase 16) 를 부른다. 모델은 z-image
(Apache 2.0, 상업 가능) - 응답의 meta.license 를 로그에 남겨 확인한다.

- 이미 있는 파일은 건너뛴다 (중단 후 재개). 다시 뽑으려면 파일을 지우거나 --force.
- 이미지 한 장마다 qwen3:14b 가 VRAM 에서 쫓겨난다(meta.vram_evicted). 그래서
  대사 생성(gen_story.py)을 **먼저** 끝내고 이것을 돌린다 - 번갈아 부르면 교체가 매번 붙는다.
- comfy_gate 가 동시 1 이라 순차로 부른다. 429 면 잠시 뒤 다시.

실행:  <venv>/python tools/gen_images.py [--kind sprite] [--id leon] [--force]
"""

from __future__ import annotations

import argparse
import json
import sys
import time

import httpx

from asset_spec import specs
from common import RAG_URL, ROOT, rag_key

RAW = ROOT / "assets" / "raw"
LOG = ROOT / "tools" / "out" / "images_log.jsonl"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--kind", action="append")
    ap.add_argument("--id", action="append")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--seed-offset", type=int, default=0, help="다른 그림을 원할 때")
    args = ap.parse_args()

    todo = [s for s in specs()
            if (not args.kind or s["kind"] in args.kind) and (not args.id or s["id"] in args.id)]
    LOG.parent.mkdir(parents=True, exist_ok=True)
    headers = {"Authorization": f"Bearer {rag_key()}"}
    t_all = time.time()
    with httpx.Client(headers=headers, timeout=300) as client:
        for i, s in enumerate(todo, 1):
            dest = RAW / s["kind"] / f"{s['id']}.png"
            if dest.exists() and not args.force:
                continue
            dest.parent.mkdir(parents=True, exist_ok=True)
            body = {"model": "z-image", "prompt": s["prompt"], "size": s["size"],
                    "seed": s["seed"] + args.seed_offset}
            for attempt in range(20):
                t0 = time.time()
                r = client.post(f"{RAG_URL}/v1/images/generations", json=body)
                if r.status_code != 429:
                    break
                time.sleep(5)                      # 음악·다른 이미지가 게이트를 쥐고 있다
            r.raise_for_status()
            data = r.json()
            item = data["data"][0]
            url = item["url"]
            if url.startswith("/"):              # 서버가 상대 경로를 준다
                url = RAG_URL + url
            img = client.get(url)
            img.raise_for_status()
            dest.write_bytes(img.content)
            meta = data.get("meta", {})
            dt = time.time() - t0
            print(f"[{i}/{len(todo)}] {s['kind']}/{s['id']} {s['size']} {dt:.1f}s "
                  f"license={meta.get('license')} evicted={meta.get('vram_evicted')}", flush=True)
            with LOG.open("a", encoding="utf-8") as f:
                f.write(json.dumps({"kind": s["kind"], "id": s["id"], "size": s["size"],
                                    "seed": item.get("seed"), "elapsed_s": round(dt, 1),
                                    "license": meta.get("license"),
                                    "commercial_use": meta.get("commercial_use"),
                                    "duration_ms": meta.get("duration_ms"),
                                    "vram_evicted": meta.get("vram_evicted")},
                                   ensure_ascii=False) + "\n")
    print(f"done in {time.time() - t_all:.0f}s")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
