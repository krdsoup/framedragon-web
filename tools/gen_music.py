"""BGM 을 로컬 ACE-Step 1.5 로 만든다 → assets/bgm/<id>.mp3

rag API 의 POST /v1/audio/music (Phase 16). lyrics 를 생략하면 연주곡이다.
엔진은 <audio loop> 로 돌리므로 곡 끝이 확 끊기지 않게 'loopable' 을 부탁한다
(보장은 안 된다 - 모델이 지키는지는 들어 봐야 안다).

실행:  <venv>/python tools/gen_music.py [--id battle] [--force]
"""

from __future__ import annotations

import argparse
import json
import sys
import time

import httpx

from common import RAG_URL, ROOT, rag_key

OUT = ROOT / "assets" / "bgm"
LOG = ROOT / "tools" / "out" / "music_log.jsonl"

TRACKS = [
    {"id": "title", "duration": 75, "bpm": 96, "keyscale": "D major",
     "prompt": "epic orchestral fantasy main theme, 1990s japanese rpg soundtrack, heroic french horns, "
               "sweeping strings, timpani, harp, noble and adventurous, instrumental"},
    {"id": "battle", "duration": 90, "bpm": 140, "keyscale": "A minor",
     "prompt": "1990s strategy rpg battle music, energetic retro synth orchestra, driving snare drums, "
               "bold brass melody, electric bass, tense but heroic, loopable, instrumental"},
    {"id": "enemy", "duration": 60, "bpm": 132, "keyscale": "E minor",
     "prompt": "1990s rpg enemy turn music, ominous marching snare, low brass stabs, dark strings ostinato, "
               "threatening, loopable, instrumental"},
    {"id": "boss", "duration": 90, "bpm": 150, "keyscale": "C minor",
     "prompt": "intense dark fantasy boss battle music, pipe organ, choir, fast staccato strings, "
               "heavy drums, dramatic, loopable, instrumental"},
    {"id": "camp", "duration": 60, "bpm": 80, "keyscale": "G major",
     "prompt": "peaceful medieval campfire music, acoustic guitar, wooden flute, soft harp, "
               "warm and calm, 1990s rpg town theme, loopable, instrumental"},
    {"id": "story", "duration": 60, "bpm": 72, "keyscale": "F major",
     "prompt": "gentle emotional fantasy story theme, solo piano and strings, bittersweet, "
               "1990s japanese rpg cutscene music, instrumental"},
    {"id": "victory", "duration": 20, "bpm": 120, "keyscale": "C major",
     "prompt": "short triumphant victory fanfare, bright brass and timpani, 1990s rpg battle won jingle, instrumental"},
    {"id": "gameover", "duration": 25, "bpm": 60, "keyscale": "D minor",
     "prompt": "sad slow game over music, lonely piano, soft strings, melancholic, instrumental"},
]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--id", action="append")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    LOG.parent.mkdir(parents=True, exist_ok=True)
    headers = {"Authorization": f"Bearer {rag_key()}"}
    with httpx.Client(headers=headers, timeout=400) as client:
        for t in TRACKS:
            if args.id and t["id"] not in args.id:
                continue
            dest = OUT / f"{t['id']}.mp3"
            if dest.exists() and not args.force:
                continue
            body = {k: t[k] for k in ("prompt", "duration", "bpm", "keyscale")}
            body["seed"] = 1995 + len(t["id"])
            for _ in range(30):
                t0 = time.time()
                r = client.post(f"{RAG_URL}/v1/audio/music", json=body)
                if r.status_code != 429:
                    break
                time.sleep(5)
            r.raise_for_status()
            data = r.json()
            url = data["data"][0]["url"]
            if url.startswith("/"):
                url = RAG_URL + url
            f = client.get(url)
            f.raise_for_status()
            dest.write_bytes(f.content)
            dt = time.time() - t0
            meta = data.get("meta", {})
            print(f"{t['id']}: {t['duration']}s audio in {dt:.1f}s  {len(f.content)//1024} KB  "
                  f"license={meta.get('license')}", flush=True)
            with LOG.open("a", encoding="utf-8") as fp:
                fp.write(json.dumps({"id": t["id"], "duration": t["duration"], "elapsed_s": round(dt, 1),
                                     "bytes": len(f.content), "license": meta.get("license"),
                                     "commercial_use": meta.get("commercial_use")}) + "\n")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
