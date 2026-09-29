"""생성할 이미지 목록 — gen_images.py(생성)와 process_images.py(후처리)가 같이 읽는다.

kind 가 후처리 방식을 정한다.
  portrait  정사각 흉상 → 256² jpg
  sprite    전신, 흰 배경 → 배경 제거 · 잘라내기 · 높이 360 png (전투 연출)
  chibi     SD 전신, 흰 배경 → 배경 제거 · 96² 안에 맞춤 png (맵 유닛, 48px 타일의 2배)
  bg        배경 → 1280 폭 jpg
  texture   탑다운 재질 → 96² png (타일)
  object    탑다운 오브젝트, 흰 배경 → 배경 제거 · 96² png (타일 위에 얹는다)

**배경을 흰색으로 부탁하는 이유:** 확산 모델은 '순수한 단색' 을 정확히 못 지키는데,
그중 흰색이 가장 균일하게 나온다. 배경 제거는 테두리에서 시작하는 flood fill 이라
캐릭터 안쪽의 흰색(세라의 로브)은 윤곽선에서 멈춘다.
"""

from __future__ import annotations

import zlib

from common import DESIGN

STYLE = ("1990s Taiwanese fantasy strategy RPG game art, anime style illustration, "
         "clean bold lineart, cel shading, vibrant saturated colors")
WHITE = ("isolated on a plain flat solid pure white background, no shadow, no ground, "
         "no text, no border")

# 모델이 "왼쪽을 보라" 를 잘 안 지킨다. 그래서 방향은 부탁만 하고, 실제 방향은 사람이
# 결과를 보고 tools/flip.json 에 적는다 (엔진이 그걸 보고 뒤집는다).


def _seed(key: str) -> int:
    # 같은 id 는 같은 시드 - 재생성해도 같은 그림이 나온다.
    return zlib.crc32(key.encode()) & 0x7FFFFFFF


def specs() -> list[dict]:
    out: list[dict] = []
    for c in DESIGN["characters"]:
        cid, look = c["id"], c["look"]
        beast = cid == "wolf"
        mounted = cid == "kain"
        out.append({
            "kind": "portrait", "id": cid, "size": "768x768",
            "prompt": (f"{STYLE}. Character portrait, bust shot from chest up of a {look}. "
                       "Looking at the viewer, expressive face, dark blue vignette gradient background, "
                       "high detail, fantasy RPG dialogue portrait, no text"
                       if not beast else
                       f"{STYLE}. Portrait of the head of a {look}, snarling, "
                       "dark blue vignette gradient background, no text"),
        })
        if c["role"] == "npc":
            continue                                    # 촌장은 전투에 나오지 않는다
        out.append({
            "kind": "sprite", "id": cid,
            "size": "1024x1024" if (mounted or beast) else "768x1024",
            "prompt": (f"{STYLE}. Full body character art of a {look}, "
                       "dynamic battle-ready stance, three-quarter side view facing left, "
                       f"whole figure visible from head to toe, centered. {WHITE}"
                       if not beast else
                       f"{STYLE}. Full body side view of a {look}, growling in an attack stance, "
                       f"facing left, whole body visible, centered. {WHITE}"),
        })
        out.append({
            "kind": "chibi", "id": cid, "size": "768x768",
            "prompt": (f"{STYLE}. Chibi super-deformed cute game sprite of a {look}, "
                       "big head and small body, full body standing, front view, "
                       f"centered, small in the frame. {WHITE}"
                       if not beast else
                       f"{STYLE}. Chibi cute small game sprite of a {look}, full body, "
                       f"front three-quarter view, centered, small in the frame. {WHITE}"),
        })

    bg = f"{STYLE}, painted background art, no characters, no people, no text"
    for bid, desc in {
        "title": "epic fantasy landscape, a huge crimson dragon flying over a grey ruined castle "
                 "on a cliff at sunset, dramatic golden clouds, title screen key art",
        "camp": "a fantasy travellers camp at night in a forest clearing, two tents, a warm campfire, "
                "starry sky, peaceful mood",
        "scene_ch1": "a medieval fantasy village burning at dawn, thatched houses on fire, smoke, "
                     "orange sky, wide shot",
        "scene_ch2": "a dark deep ancient forest, huge twisted trees, shafts of pale light, mist, wide shot",
        "scene_ch3": "the gate of a massive grey ruined stone fortress at dusk, crumbling towers, "
                     "ominous purple sky, wide shot",
        "battle_field": "side view of a grassy meadow battlefield, green grass ground in the lower third, "
                        "distant hills and blue sky with clouds, flat horizon",
        "battle_forest": "side view of a forest battlefield, mossy ground in the lower third, "
                         "dense trees in the background, dappled light, flat horizon",
        "battle_castle": "side view inside a dark ruined castle throne hall, grey stone floor in the lower "
                         "third, stone pillars and torches in the background",
    }.items():
        out.append({"kind": "bg", "id": bid, "size": "1344x768", "prompt": f"{bg}. {desc}"})

    tex = ("seamless tileable top-down texture for a 2D strategy game map, orthographic view "
           "directly from above, evenly lit, no objects, no shadow, no text")
    for tid, desc in {
        "grass": "short lush green grass field with tiny flowers",
        "dirt": "packed light brown dirt road with small pebbles",
        "water": "clear blue lake water with gentle ripples",
        "floor": "old grey stone brick castle floor tiles",
        "wall": "dark grey rough castle stone wall top, large blocks",
        "carpet": "royal red carpet with golden embroidered border pattern",
    }.items():
        out.append({"kind": "texture", "id": tid, "size": "512x512", "prompt": f"{desc}, {tex}"})

    obj = (f"{STYLE}. Single 2D strategy game map object seen from a high top-down angle, "
           f"centered, fills most of the frame. {WHITE}")
    for oid, desc in {
        "tree": "one single round dark green leafy oak tree with a short brown trunk",
        "mountain": "a rocky grey mountain peak with a little snow",
        "house": "a small medieval cottage with a red tiled roof and wooden walls",
        "chest": "a closed wooden treasure chest with gold trim",
        "pillar": "a round grey stone castle pillar seen from above",
        "throne": "an ornate golden royal throne with red cushion",
    }.items():
        out.append({"kind": "object", "id": oid, "size": "768x768", "prompt": f"{desc}. {obj}"})

    for s in out:
        s["seed"] = _seed(f"{s['kind']}/{s['id']}")
    return out
