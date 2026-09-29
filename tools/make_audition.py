"""BGM 후보 청취 페이지 · 고른 곡 반영 · 곡별 음량 보정.

  build   tools/out/bgm_candidates.json → tools/out/audition.html
          serve.py 를 띄우고 http://127.0.0.1:8090/tools/out/audition.html 에서 듣는다
  pick    battle=<후보ID> enemy=<후보ID> boss=<후보ID>
          → assets/bgm/<곡>.mp3 로 복사. 원래 곡은 assets/bgm_candidates/old-<곡>.mp3 로 남긴다
  meta    assets/bgm/*.mp3 의 음량을 재서 js/data/bgm_meta.js (곡별 gain) 를 쓴다

"중국풍"·"반복감"은 지표로 못 잰다. 그래서 사람이 듣고 고른다. 지표는 1차 거름일 뿐이다.
"""

from __future__ import annotations

import html
import json
import shutil
import sys
from pathlib import Path

from audio_metrics import NOISY_HF, measure
from common import ROOT, write_js

BGM = ROOT / "assets" / "bgm"
CAND = ROOT / "assets" / "bgm_candidates"
INDEX = ROOT / "tools" / "out" / "bgm_candidates.json"
PAGE = ROOT / "tools" / "out" / "audition.html"
TARGET_RMS = -21.0          # 곡 사이 음량을 여기에 맞춘다. 볼륨은 1을 못 넘으니 큰 곡을 줄이는 쪽이다
VARIANT = {"A": "교향악 · [instrumental]", "B": "포크 오케스트라 · 섹션 태그"}


def build() -> None:
    index = json.loads(INDEX.read_text(encoding="utf-8"))
    current = {t: measure(BGM / f"{t}.mp3") for t in ("battle", "enemy", "boss") if (BGM / f"{t}.mp3").exists()}
    rows = []
    for track in ("battle", "enemy", "boss"):
        cands = sorted((c for c in index.values() if c["track"] == track), key=lambda c: (c["hf"], c["flat"]))
        if not cands:
            continue
        cur = current.get(track)
        rows.append(f"<h2>{track} <small>후보 {len(cands)}</small></h2><table><tr><th>ID</th><th>변형</th><th>듣기</th>"
                    "<th>8kHz↑</th><th>평탄도</th><th>RMS</th><th>반복도</th><th></th></tr>")
        if cur:
            rows.append(f"<tr class='cur'><td>지금 곡</td><td>(처음 생성)</td><td><audio controls preload='none' "
                        f"src='../../assets/bgm/{track}.mp3'></audio></td><td>{cur['hf']}%</td><td>{cur['flat']}</td>"
                        f"<td>{cur['rms']}</td><td>{cur['rep']}</td><td></td></tr>")
        for c in cands:
            harsh = c["hf"] > NOISY_HF
            rows.append(
                f"<tr><td><code>{c['file'][:-4]}</code></td><td>{VARIANT[c['variant']]}<br><small>{c['keyscale']} · {c['bpm']}bpm</small></td>"
                f"<td><audio controls preload='none' src='../../assets/bgm_candidates/{html.escape(c['file'])}'></audio></td>"
                f"<td class='{'bad' if harsh else ''}'>{c['hf']}%</td><td>{c['flat']}</td><td>{c['rms']}</td><td>{c['rep']}</td>"
                f"<td>{'<b class=bad>고역 과다</b>' if harsh else ''}</td></tr>")
        rows.append("</table>")
    PAGE.write_text(f"""<!doctype html><html lang="ko"><meta charset="utf-8"><title>BGM 후보 청취</title>
<style>
body {{ font-family: "Malgun Gothic", sans-serif; background: #0e1430; color: #e8ecff; margin: 24px; }}
h1 {{ color: #d8b25a; }} h2 {{ color: #ffe7b0; margin-top: 28px; }} small {{ color: #9aa6c8; }}
table {{ border-collapse: collapse; width: 100%; }} td, th {{ padding: 6px 10px; border-bottom: 1px solid #2a3560; text-align: left; }}
tr.cur {{ background: #1c2650; }} .bad {{ color: #ff8a8a; }} audio {{ width: 320px; }} code {{ color: #9fd4ff; }}
.note {{ background: #16204a; border: 1px solid #d8b25a; border-radius: 6px; padding: 10px 14px; line-height: 1.6; }}
</style>
<h1>맵 BGM 후보</h1>
<div class="note">
곡마다 하나씩 골라 <b>ID</b>를 알려 주면 반영한다 (<code>make_audition.py pick battle=ID enemy=ID boss=ID</code>).<br>
<b>8kHz↑</b> 는 날카로운 고역의 비율이다 — 처음 곡의 "깨지는 전자음"은 battle 이 4.45% 였다. 1.5% 를 넘으면 표시한다.<br>
<b>평탄도</b>는 참고만 하라. 스네어·심벌 같은 타악기도 높게 나와 잡음과 구별하지 못한다 (조용한 곡 0.04~0.07).<br>
<b>반복도</b>는 4초 블록끼리 얼마나 비슷한지(상대값). 낮을수록 전개가 많다. "중국풍"은 지표로 못 잰다 — 귀로 고른다.<br>
변형 B 는 가사 자리에 섹션 태그만 넣었다. 노래를 부르면 버린다.
</div>
{''.join(rows)}
</html>""", encoding="utf-8")
    print(f"wrote {PAGE.relative_to(ROOT)} - http://127.0.0.1:8090/tools/out/audition.html")


def pick(args: list[str]) -> None:
    index = json.loads(INDEX.read_text(encoding="utf-8"))
    for a in args:
        track, _, cid = a.partition("=")
        c = index.get(cid)
        if not c or c["track"] != track:
            raise SystemExit(f"{a}: {track} 의 후보가 아니다")
        dest = BGM / f"{track}.mp3"
        old = CAND / f"old-{track}.mp3"
        if dest.exists() and not old.exists():
            shutil.copy2(dest, old)                      # 처음 곡은 한 번만 보관한다
        shutil.copy2(CAND / c["file"], dest)
        print(f"{track} ← {cid}")
    meta()


def meta() -> None:
    out = {}
    for p in sorted(BGM.glob("*.mp3")):
        m = measure(p)
        gain = min(1.0, 10 ** ((TARGET_RMS - m["rms"]) / 20))
        out[p.stem] = {"gain": round(gain, 3), "rms": m["rms"], "hf": m["hf"], "flat": m["flat"]}
        print(f"{p.stem:9s} rms {m['rms']:6.1f}  gain {gain:.3f}")
    write_js(ROOT / "js" / "data" / "bgm_meta.js", "FD_BGM_META", out)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    cmd, rest = (sys.argv[1] if len(sys.argv) > 1 else "build"), sys.argv[2:]
    {"build": lambda: build(), "pick": lambda: pick(rest), "meta": lambda: meta()}[cmd]()
