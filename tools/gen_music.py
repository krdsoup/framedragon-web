"""BGM 을 로컬 ACE-Step 1.5 로 만든다.

rag API 의 POST /v1/audio/music (Phase 16). lyrics 를 생략하면 연주곡이다.

두 가지 모드:
  기본          TRACKS → assets/bgm/<id>.mp3 (한 곡에 한 번)
  --candidates  CANDIDATES → assets/bgm_candidates/<id>-<변형>-<시드>.mp3 + 지표
                → tools/make_audition.py 로 청취 페이지를 만들어 사람이 고른다

## 맵 BGM 을 다시 만든 이유 (2026-09-29)

처음 battle·enemy·boss 는 "깨지는 전자음", "중국풍 반복" 으로 들렸다. 재 보니 2~12kHz 가
잡음처럼 평탄했다(평탄도 0.25~0.32, 어쿠스틱 곡은 0.04~0.07). 프롬프트의 `retro synth`·
`electric bass`·`1990s rpg` 가 원인으로 보인다.

**ACE-Step 은 cfg 1 이라 네거티브 프롬프트가 먹지 않는다** (rag/backends/comfy_audio.py).
그래서 "신스 빼 줘" 가 아니라 쓰고 싶은 악기만 적는다. 후보 프롬프트에는 synth · retro ·
electric · 8-bit · rpg · 1990s 를 쓰지 않는다.

실행:  <venv>/python tools/gen_music.py [--id battle] [--force]
       <venv>/python tools/gen_music.py --candidates [--track battle] [--seeds 3]
"""

from __future__ import annotations

import argparse
import json
import sys
import time

import httpx

from audio_metrics import measure
from common import RAG_URL, ROOT, rag_key

OUT = ROOT / "assets" / "bgm"
CAND = ROOT / "assets" / "bgm_candidates"
LOG = ROOT / "tools" / "out" / "music_log.jsonl"
CAND_INDEX = ROOT / "tools" / "out" / "bgm_candidates.json"

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

# 변형 B 의 가사 자리에 섹션 태그만 넣는다 - 곡에 구성(전개)이 생기는지 보려는 것.
# 효과는 미검증이다. 가사처럼 부르면 그 후보는 버린다.
SECTIONS = "[Intro]\n\n[Verse]\n\n[Chorus]\n\n[Bridge]\n\n[Chorus]\n\n[Outro]"
CLEAN = "acoustic instruments, clean studio recording, instrumental"

CANDIDATES = {
    "battle": [
        {"v": "A", "duration": 150, "bpm": 128, "keyscale": "D minor", "lyrics": None,
         "prompt": "heroic western fantasy orchestral battle march, full symphony orchestra, driving string "
                   f"ostinato, bold french horn melody, trumpets, snare drum and timpani, cinematic European "
                   f"adventure film score, {CLEAN}"},
        {"v": "B", "duration": 150, "bpm": 124, "keyscale": "E minor", "lyrics": SECTIONS,
         "prompt": "medieval European folk orchestra battle theme, acoustic strings, oboe and flute melody, "
                   f"french horns, frame drums and tambourine, energetic and brave, celtic fantasy adventure, {CLEAN}"},
    ],
    "enemy": [
        {"v": "A", "duration": 150, "bpm": 112, "keyscale": "C minor", "lyrics": None,
         "prompt": "tense dark orchestral march of an approaching army, low strings ostinato, muted brass stabs, "
                   f"war drums, timpani rolls, ominous European symphonic film score, {CLEAN}"},
        {"v": "B", "duration": 150, "bpm": 108, "keyscale": "A minor", "lyrics": SECTIONS,
         "prompt": "suspenseful dark chamber orchestra, cellos and double basses ostinato, bassoon, low clarinet, "
                   f"orchestral bass drum, creeping menace, European film score, {CLEAN}"},
    ],
    "boss": [
        {"v": "A", "duration": 120, "bpm": 150, "keyscale": "C minor", "lyrics": None,
         "prompt": "epic dark gothic orchestral boss battle, full symphony orchestra, cathedral pipe organ, "
                   "fast staccato strings, heavy timpani and cymbals, powerful brass, European dark fantasy "
                   f"film score, {CLEAN}"},
        {"v": "B", "duration": 120, "bpm": 144, "keyscale": "C minor", "lyrics": SECTIONS,
         "prompt": "epic dark gothic orchestral boss battle with choir, choir singing ahh, pipe organ, fast strings, "
                   f"heavy timpani, brass, European dark fantasy film score, {CLEAN}"},
    ],
}


def _generate(client: httpx.Client, body: dict) -> tuple[bytes, dict, float]:
    t0 = time.time()
    for _ in range(60):
        r = client.post(f"{RAG_URL}/v1/audio/music", json=body)
        if r.status_code != 429:                      # 다른 생성이 게이트를 쥐고 있다
            break
        time.sleep(5)
    r.raise_for_status()
    data = r.json()
    url = data["data"][0]["url"]
    if url.startswith("/"):                           # 서버가 상대 경로를 준다
        url = RAG_URL + url
    f = client.get(url)
    f.raise_for_status()
    return f.content, data.get("meta", {}), time.time() - t0


def _log(row: dict) -> None:
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with LOG.open("a", encoding="utf-8") as fp:
        fp.write(json.dumps(row, ensure_ascii=False) + "\n")


def run_tracks(client: httpx.Client, ids: list[str] | None, force: bool) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for t in TRACKS:
        if ids and t["id"] not in ids:
            continue
        dest = OUT / f"{t['id']}.mp3"
        if dest.exists() and not force:
            continue
        body = {k: t[k] for k in ("prompt", "duration", "bpm", "keyscale")}
        body["seed"] = 1995 + len(t["id"])
        content, meta, dt = _generate(client, body)
        dest.write_bytes(content)
        print(f"{t['id']}: {t['duration']}s audio in {dt:.1f}s  {len(content)//1024} KB  "
              f"license={meta.get('license')}", flush=True)
        _log({"id": t["id"], "duration": t["duration"], "elapsed_s": round(dt, 1), "bytes": len(content),
              "license": meta.get("license"), "commercial_use": meta.get("commercial_use")})


def run_candidates(client: httpx.Client, tracks: list[str] | None, seeds: int, force: bool) -> None:
    CAND.mkdir(parents=True, exist_ok=True)
    index = json.loads(CAND_INDEX.read_text(encoding="utf-8")) if CAND_INDEX.exists() else {}
    for track, variants in CANDIDATES.items():
        if tracks and track not in tracks:
            continue
        for var in variants:
            for i in range(seeds):
                seed = 7000 + 100 * i + ord(var["v"])
                cid = f"{track}-{var['v']}-{seed}"
                dest = CAND / f"{cid}.mp3"
                if dest.exists() and cid in index and not force:
                    continue
                body = {k: var[k] for k in ("prompt", "duration", "bpm", "keyscale")}
                body["seed"] = seed
                if var["lyrics"]:
                    body["lyrics"] = var["lyrics"]
                content, meta, dt = _generate(client, body)
                dest.write_bytes(content)
                m = measure(dest)
                index[cid] = {"track": track, "variant": var["v"], "seed": seed, "file": dest.name,
                              "prompt": var["prompt"], "keyscale": var["keyscale"], "bpm": var["bpm"],
                              "sections": bool(var["lyrics"]), "elapsed_s": round(dt, 1),
                              "license": meta.get("license"), **m}
                CAND_INDEX.write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")
                print(f"{cid}: {var['duration']}s in {dt:.1f}s  flat {m['flat']} hf {m['hf']}% "
                      f"rms {m['rms']} rep {m['rep']}{'  [잡음 의심]' if m['noisy'] else ''}", flush=True)
                _log({"id": cid, "duration": var["duration"], "elapsed_s": round(dt, 1), "bytes": len(content),
                      "license": meta.get("license"), "commercial_use": meta.get("commercial_use")})


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--id", action="append")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--candidates", action="store_true")
    ap.add_argument("--track", action="append")
    ap.add_argument("--seeds", type=int, default=3)
    args = ap.parse_args()
    headers = {"Authorization": f"Bearer {rag_key()}"}
    with httpx.Client(headers=headers, timeout=600) as client:
        if args.candidates:
            run_candidates(client, args.track, args.seeds, args.force)
        else:
            run_tracks(client, args.id, args.force)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
