"""효과음 — Kenney.nl 의 CC0 팩에서 필요한 것만 꺼낸다 → assets/sfx/ + js/data/sfx.js

이동·타격은 샘플, UI·마법은 WebAudio 합성(js/engine/audio.js)으로 둔다. 샘플은 타격감이
확실히 낫고, 합성은 파일이 필요 없다 - 둘을 섞는다.

**License.txt 에 CC0 가 적혀 있을 때만 쓴다.** 페이지 표기(2026-09-29 "Creative Commons CC0")만
믿지 않고 받은 zip 안의 원문을 확인하고, 원문을 assets/sfx/LICENSE-kenney-*.txt 로 함께 둔다.

실행:  <venv>/python tools/fetch_sfx.py --list     # 팩 안의 파일 목록
       <venv>/python tools/fetch_sfx.py            # PICK 대로 꺼내고 sfx.js 를 쓴다
"""

from __future__ import annotations

import argparse
import io
import sys
import zipfile
from pathlib import Path

import httpx

from common import ROOT, write_js

PACKS = {
    "impact": "https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip",
    "rpg": "https://kenney.nl/media/pages/assets/rpg-audio/8e99002d76-1677590336/kenney_rpg-audio.zip",
}
CACHE = ROOT / "tools" / ".cache"
OUT = ROOT / "assets" / "sfx"

# 엔진의 샘플 이름 → [(팩, zip 안 파일 이름), ...]. 여러 개면 무작위로 골라 반복감을 줄인다.
# 이 이름들을 audio.js 의 조합 효과음(step·hit·guard …)이 섞어 쓴다.
def _n(pk: str, stem: str, idx) -> list[tuple[str, str]]:
    return [(pk, f"{stem}{i}.ogg") for i in idx]


PICK: dict[str, list[tuple[str, str]]] = {
    # 발소리 - 밟는 지형별 (impact 팩에 지형별 녹음이 있다)
    "step_grass": _n("impact", "footstep_grass_00", range(4)),      # 평지·숲·산·민가
    "step_stone": _n("impact", "footstep_concrete_00", range(4)),   # 성 바닥·문·옥좌
    "step_carpet": _n("impact", "footstep_carpet_00", range(3)),    # 융단 · 짐승 발소리
    "step_wood": _n("impact", "footstep_wood_00", range(3)),        # 다리
    "step_dirt": _n("rpg", "footstep0", range(4)),                  # 흙길
    "armor": _n("impact", "impactPlate_light_00", range(3)),        # 중갑이 걸을 때 덧붙는 금속음
    "hoof": _n("impact", "impactWood_light_00", range(3)),          # 말발굽 대용 (팩에 말발굽이 없다)
    # 타격
    "blade": [("rpg", "knifeSlice.ogg"), ("rpg", "knifeSlice2.ogg")],
    "chop": [("rpg", "chop.ogg")],
    "punch": _n("impact", "impactPunch_medium_00", range(3)),
    "punch_heavy": _n("impact", "impactPunch_heavy_00", range(4)),
    "soft": _n("impact", "impactSoft_medium_00", range(3)),
    "wood_hit": _n("impact", "impactWood_medium_00", range(2)),
    "guard": [("impact", "impactPlate_heavy_000.ogg"), ("impact", "impactPlate_heavy_001.ogg"),
              ("impact", "impactMetal_heavy_000.ogg")],
    "fall": _n("impact", "impactSoft_heavy_00", range(2)),
    # 동작
    "draw": [("rpg", "drawKnife1.ogg"), ("rpg", "drawKnife2.ogg")],
    "cloth": [("rpg", "cloth1.ogg"), ("rpg", "cloth2.ogg")],
    # 야영지·보물
    "coins": [("rpg", "handleCoins.ogg"), ("rpg", "handleCoins2.ogg")],
    "creak": [("rpg", "creak1.ogg")],
}


def pack(name: str) -> zipfile.ZipFile:
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / f"{name}.zip"
    if not path.exists():
        r = httpx.get(PACKS[name], follow_redirects=True, timeout=120)
        r.raise_for_status()
        path.write_bytes(r.content)
    z = zipfile.ZipFile(io.BytesIO(path.read_bytes()))
    lic = next((n for n in z.namelist() if n.lower().endswith("license.txt")), None)
    text = z.read(lic).decode("utf-8", "replace") if lic else ""
    if "CC0" not in text and "Creative Commons Zero" not in text:
        raise SystemExit(f"{name}: License.txt 에 CC0 가 없다 - 쓰지 않는다\n{text[:300]}")
    return z


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--list", action="store_true")
    args = ap.parse_args()
    zips = {n: pack(n) for n in PACKS}
    if args.list:
        for n, z in zips.items():
            files = [f for f in z.namelist() if f.lower().endswith(".ogg")]
            print(f"== {n}: {len(files)} ogg")
            print("  " + "  ".join(Path(f).stem for f in files))
        return
    OUT.mkdir(parents=True, exist_ok=True)
    for n, z in zips.items():
        lic = next(f for f in z.namelist() if f.lower().endswith("license.txt"))
        (OUT / f"LICENSE-kenney-{n}.txt").write_bytes(z.read(lic))
    manifest: dict[str, list[str]] = {}
    for sfx, sources in PICK.items():
        for pk, fname in sources:
            z = zips[pk]
            member = next(f for f in z.namelist() if Path(f).name == fname)
            dest = OUT / fname
            dest.write_bytes(z.read(member))
            manifest.setdefault(sfx, []).append(f"assets/sfx/{fname}")
    write_js(ROOT / "js" / "data" / "sfx.js", "FD_SFX", manifest)
    total = sum(p.stat().st_size for p in OUT.glob("*.ogg"))
    print(f"{sum(len(v) for v in manifest.values())} files, {total // 1024} KB → assets/sfx/")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
