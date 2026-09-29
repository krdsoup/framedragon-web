"""assets/raw → 게임용 에셋 + js/data/assets.js (매니페스트)

**Pillow·numpy 가 필요하다.** rag_project 의 .venv 에는 없고 거기 넣지 않는다 - 서비스
의존성이 아니다. 별도 venv 에서 돌린다:

    python -m venv .imgvenv && .imgvenv/Scripts/pip install pillow numpy
    .imgvenv/Scripts/python tools/process_images.py

배경 제거는 **테두리에서 시작하는 flood fill** 이다. 그래서 캐릭터 안쪽의 흰색
(세라의 로브)은 윤곽선에서 멈춰 지워지지 않는다. 대신 팔과 몸 사이처럼 테두리와 닿지
않는 흰 틈은 남는다 - 애니풍 윤곽선이 굵어서 실제로는 거의 없다.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, str(Path(__file__).parent))
from asset_spec import specs  # noqa: E402
from common import ROOT, write_js  # noqa: E402

RAW = ROOT / "assets" / "raw"
A = ROOT / "assets"
SENTINEL = (255, 0, 254)


# 활과 시위 사이, 창과 몸 사이처럼 **테두리와 닿지 않는 흰 틈**이 생기는 그림.
# 전부에 켜면 세라의 흰 로브가 뚫릴 수 있어 눈으로 확인한 것만 켠다.
HOLES = {"e_archer", "mia", "soldier"}
HOLE_MIN_PX = 400          # 이보다 작은 흰 영역은 눈동자·갑옷 광택으로 보고 남긴다


def _is_sentinel(arr: np.ndarray) -> np.ndarray:
    return np.all(arr == np.array(SENTINEL, dtype=np.uint8), axis=-1)


def cutout(im: Image.Image, thresh: int = 48, holes: bool = False) -> Image.Image:
    rgb = im.convert("RGB")
    w, h = rgb.size
    work = rgb.copy()
    px = work.load()
    seeds = [(x, y) for x in range(0, w, 12) for y in (0, h - 1)] + \
            [(x, y) for y in range(0, h, 12) for x in (0, w - 1)]
    for x, y in seeds:
        r, g, b = px[x, y]
        if (r, g, b) == SENTINEL or min(r, g, b) < 200:     # 테두리에 캐릭터가 닿은 곳
            continue
        ImageDraw.floodfill(work, (x, y), SENTINEL, thresh=thresh)
    if holes:
        for y in range(0, h, 6):
            for x in range(0, w, 6):
                r, g, b = px[x, y]
                if (r, g, b) == SENTINEL or min(r, g, b) < 246:
                    continue
                before = _is_sentinel(np.asarray(work)).sum()
                snapshot = work.copy()
                ImageDraw.floodfill(work, (x, y), SENTINEL, thresh=24)
                if _is_sentinel(np.asarray(work)).sum() - before < HOLE_MIN_PX:
                    work = snapshot                          # 작은 흰 점 - 되돌린다
                    px = work.load()
    arr = np.asarray(work)
    bg = _is_sentinel(arr)
    alpha = Image.fromarray(np.where(bg, 0, 255).astype(np.uint8))
    # 흰 배경과 섞인 가장자리 1px 을 깎고 살짝 흐려 계단을 없앤다
    alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.7))
    out = rgb.convert("RGBA")
    out.putalpha(alpha)
    return out


def crop_alpha(im: Image.Image) -> Image.Image:
    bbox = im.getchannel("A").point(lambda v: 255 if v > 24 else 0).getbbox()
    return im.crop(bbox) if bbox else im


def fit(im: Image.Image, box_w: int, box_h: int, bottom: bool = True) -> Image.Image:
    im = im.copy()
    im.thumbnail((box_w, box_h), Image.LANCZOS)
    canvas = Image.new("RGBA", (box_w, box_h), (0, 0, 0, 0))
    x = (box_w - im.width) // 2
    y = box_h - im.height if bottom else (box_h - im.height) // 2
    canvas.paste(im, (x, y), im)
    return canvas


def main() -> None:
    manifest: dict[str, dict] = {k: {} for k in
                                 ("portraits", "sprites", "chibi", "bg", "textures", "objects")}
    flip = {}
    flip_path = ROOT / "tools" / "flip.json"
    if flip_path.exists():
        flip = json.loads(flip_path.read_text(encoding="utf-8"))

    for s in specs():
        src = RAW / s["kind"] / f"{s['id']}.png"
        if not src.exists():
            print("missing", src.relative_to(ROOT))
            continue
        im = Image.open(src)
        kind, sid = s["kind"], s["id"]
        if kind == "portrait":
            dest = A / "portraits" / f"{sid}.jpg"
            dest.parent.mkdir(parents=True, exist_ok=True)
            im.convert("RGB").resize((256, 256), Image.LANCZOS).save(dest, quality=88)
            manifest["portraits"][sid] = f"assets/portraits/{sid}.jpg"
        elif kind == "sprite":
            cut = crop_alpha(cutout(im, holes=sid in HOLES))
            cut.thumbnail((460, 360), Image.LANCZOS)
            dest = A / "sprites" / f"{sid}.png"
            dest.parent.mkdir(parents=True, exist_ok=True)
            cut.save(dest, optimize=True)
            manifest["sprites"][sid] = {"src": f"assets/sprites/{sid}.png", "w": cut.width,
                                        "h": cut.height, "facing": flip.get(sid, "left")}
        elif kind == "chibi":
            out = fit(crop_alpha(cutout(im, holes=sid in HOLES)), 112, 112)
            dest = A / "chibi" / f"{sid}.png"
            dest.parent.mkdir(parents=True, exist_ok=True)
            out.save(dest, optimize=True)
            manifest["chibi"][sid] = f"assets/chibi/{sid}.png"
        elif kind == "bg":
            dest = A / "bg" / f"{sid}.jpg"
            dest.parent.mkdir(parents=True, exist_ok=True)
            im.convert("RGB").resize((1280, 731), Image.LANCZOS).save(dest, quality=85)
            manifest["bg"][sid] = f"assets/bg/{sid}.jpg"
        elif kind == "texture":
            im = im.convert("RGB")
            if sid == "carpet":                    # 테두리 무늬를 피해 가운데만 쓴다
                w, h = im.size
                im = im.crop((w // 4, h // 4, w * 3 // 4, h * 3 // 4))
            dest = A / "tiles" / f"{sid}.png"
            dest.parent.mkdir(parents=True, exist_ok=True)
            # 192² 로 두고 엔진이 타일마다 다른 96² 조각을 떼어 쓴다 - 반복 무늬가 덜 보인다
            im.resize((192, 192), Image.LANCZOS).save(dest, optimize=True)
            manifest["textures"][sid] = f"assets/tiles/{sid}.png"
        elif kind == "object":
            if sid == "pillar":                    # 탑이 나왔다 - 엔진이 절차적으로 그린다
                continue
            out = fit(crop_alpha(cutout(im)), 96, 96)
            dest = A / "tiles" / f"obj_{sid}.png"
            out.save(dest, optimize=True)
            manifest["objects"][sid] = f"assets/tiles/obj_{sid}.png"
        print("ok", kind, sid)

    bgm = {p.stem: f"assets/bgm/{p.name}" for p in sorted((A / "bgm").glob("*.mp3"))}
    manifest["bgm"] = bgm
    write_js(ROOT / "js" / "data" / "assets.js", "FD_ASSETS", manifest)
    print("manifest:", {k: len(v) for k, v in manifest.items()})


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
