"""챕터 대사를 로컬 qwen3:14b 로 만든다 → js/data/story.js

게이트웨이(127.0.0.1:8082)를 부른다. Ollama(11434)를 직접 부르지 않는다 - 예산 가드와
요청 로그가 게이트웨이에 있다 (rag_project/CLAUDE.md).

response_format=json_schema 로 **형식은 강제**된다. 화자 id 도 enum 으로 묶어서
없는 인물이 튀어나오지 않는다. 다만 **내용은 보장되지 않는다** - 결과를 사람이 읽고
어색한 줄은 tools/story_fixes.json 으로 덮는다(재생성해도 고친 것이 살아남는다).

실행:  <venv>/python tools/gen_story.py [--chapter N]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time

import httpx

from common import DESIGN, GATEWAY_URL, ROOT, gateway_key, write_js

OUT_DIR = ROOT / "tools" / "out"

# 장면 = 게임 엔진이 부르는 이벤트 키. 엔진(js/data/chapters.js)의 이벤트 이름과 같아야 한다.
SCENES: dict[int, dict[str, str]] = {
    1: {
        "intro": "전투 전. 새벽, 마을 곳곳에 불길. 레온·세라·볼크가 산적을 발견하고 싸우기로 한다. 가르도가 위협하는 대사 포함. 8~12줄.",
        "kain_arrive": "3턴째. 백마를 탄 기사 카인이 전장에 뛰어든다. 레온과 짧게 대화. 3~5줄.",
        "reinforce": "4턴째. 북쪽 숲에서 산적 증원군 등장. 가르도가 비웃고 볼크가 대응. 2~4줄.",
        "boss_defeat": "가르도가 쓰러지며 '제국이 문장을 가진 자를 찾는다'고 흘린다. 2~4줄.",
        "outro": "전투 뒤. 촌장 하롤드가 레온의 손등 문장이 옛 왕가의 증표임을 알려 주고, 카인이 무릎 꿇고 충성을 맹세한다. 일행은 마을을 떠나기로 한다. 10~14줄.",
    },
    2: {
        "intro": "전투 전. 검은 숲. 일행이 제국병에게 쫓기는 소녀(미아)를 발견하고 돕기로 한다. 미아가 도움을 외친다. 7~10줄.",
        "mia_join": "레온이 미아에게 다가간다. 미아가 정식으로 함께 싸우겠다고 한다. 3~5줄.",
        "reinforce": "3턴째. 동쪽에서 제국 궁병 증원. 카인이 경고하고 미아가 숲길을 안내한다. 2~4줄.",
        "outro": "전투 뒤. 미아가 자기소개를 하고 잿빛 성채로 가는 숲길을 안다며 동행한다. 세라와 미아의 가벼운 대화 포함. 8~12줄.",
    },
    3: {
        "intro": "전투 전. 숲 끝 폐허 앞에서 마법사 루시안이 기다린다. 황금 왕관은 문장을 가진 자만 꺼낼 수 있다고 말하고 합류. 볼크와 티격태격. 10~14줄.",
        "boss_meet": "일행이 옥좌에 다가가자 흑기사 제온이 일어선다. 카인과 옛 동료였음이 드러난다. 4~6줄.",
        "boss_defeat": "제온이 무릎 꿇으며 '황제께서 이미 왕관의 절반을 손에 넣었다'고 말하고 어둠 속으로 퇴각한다. 3~5줄.",
        "outro": "전투 뒤. 옥좌 뒤 비밀 통로에서 금빛 문이 열린다. 레온의 문장이 빛난다. 동료들이 각자 한마디씩 하고 다음 여정을 예고한다. 8~12줄.",
    },
}

SYSTEM = """너는 1990년대 판타지 SRPG 의 시나리오 작가다. 한국어로만 쓴다.

규칙:
- 각 줄은 한 사람의 대사 한 마디다. 60자를 넘기지 않는다.
- speaker 는 주어진 id 중 하나다. 장면 묘사는 speaker 를 "narration" 으로 쓴다.
- 인물의 말투 설정을 지킨다. 새로운 이름 있는 인물을 만들지 않는다.
- 이모지·영어·괄호 속 지문을 쓰지 않는다. 지문은 narration 으로만.
- 줄거리 개요에 없는 사건을 크게 지어내지 않는다."""


def _schema(chapter: dict, scenes: dict[str, str]) -> dict:
    speakers = chapter["speakers"] + ["narration", "bandit", "soldier"]
    line = {
        "type": "object",
        "properties": {
            "speaker": {"type": "string", "enum": speakers},
            "text": {"type": "string"},
        },
        "required": ["speaker", "text"],
    }
    # minItems 가 없으면 문법이 빈 배열을 허용하고, 모델은 실제로 [] 를 낸다
    # (2026-09-29 첫 시도: 세 챕터 모두 전 장면 0줄, 완성 토큰 36~60).
    props = {}
    for k, desc in scenes.items():
        lo, hi = _line_range(desc)
        props[k] = {"type": "array", "items": line, "minItems": lo, "maxItems": hi}
    return {"type": "object", "properties": props, "required": list(scenes)}


def _line_range(desc: str) -> tuple[int, int]:
    m = re.search(r"(\d+)~(\d+)줄", desc)
    return (int(m.group(1)), int(m.group(2))) if m else (3, 10)


def _prompt(chapter: dict, scenes: dict[str, str]) -> str:
    cast = {c["id"]: c for c in DESIGN["characters"]}
    lines = [f"# 작품: {DESIGN['title']}", f"배경: {DESIGN['premise']}", "",
             f"# 제{chapter['id']}장 「{chapter['title']}」 — 장소: {chapter['place']}",
             f"줄거리 개요: {chapter['outline']}",
             f"승리 조건: {chapter['victory']} / 패배 조건: {chapter['defeat']}", "",
             "# 등장인물 (speaker id: 이름 — 설정)"]
    for sid in chapter["speakers"]:
        c = cast[sid]
        lines.append(f"- {sid}: {c['name']} ({c['cls']}) — {c.get('persona', '')}")
    lines.append("- bandit / soldier: 이름 없는 산적 / 제국병 (단역 외침에만)")
    lines += ["", "# 써야 할 장면 (키: 지시)"]
    lines += [f"- {k}: {v}" for k, v in scenes.items()]
    return "\n".join(lines)


def generate(chapter_id: int, client: httpx.Client) -> dict:
    chapter = next(c for c in DESIGN["chapters"] if c["id"] == chapter_id)
    scenes = SCENES[chapter_id]
    body = {
        "model": "gbrain-analyst",
        "messages": [{"role": "system", "content": SYSTEM},
                     {"role": "user", "content": _prompt(chapter, scenes)}],
        "temperature": 0.8,
        "max_tokens": 6000,
        "response_format": {"type": "json_schema",
                            "json_schema": {"name": f"chapter{chapter_id}", "schema": _schema(chapter, scenes)}},
    }
    t0 = time.time()
    r = client.post(f"{GATEWAY_URL}/v1/chat/completions", json=body)
    r.raise_for_status()
    data = r.json()
    dt = time.time() - t0
    meta = data.get("meta", {})
    if meta.get("truncated"):
        # 넘치면 오류가 아니라 오답이 온다 - 절반만 남은 프롬프트로 쓴 대사다.
        raise SystemExit(f"ch{chapter_id}: meta.truncated - 프롬프트가 잘렸다. 결과를 쓰지 않는다")
    content = data["choices"][0]["message"]["content"]
    story = json.loads(content)
    usage = data.get("usage", {})
    print(f"ch{chapter_id}: {dt:.1f}s  tokens={usage}  lines="
          f"{ {k: len(v) for k, v in story.items()} }", flush=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / f"story_ch{chapter_id}.json").write_text(
        json.dumps({"elapsed_s": round(dt, 1), "usage": usage, "meta": meta, "story": story},
                   ensure_ascii=False, indent=1), encoding="utf-8")
    return story


def build() -> None:
    """out/story_ch*.json + story_fixes.json → js/data/story.js"""
    fixes_path = ROOT / "tools" / "story_fixes.json"
    fixes = json.loads(fixes_path.read_text(encoding="utf-8")) if fixes_path.exists() else {}
    story = {}
    for cid in SCENES:
        raw = OUT_DIR / f"story_ch{cid}.json"
        if not raw.exists():
            continue
        scenes = json.loads(raw.read_text(encoding="utf-8"))["story"]
        for key, lines in fixes.get(str(cid), {}).items():
            scenes[key] = lines                      # 장면 단위로 통째 교체
        story[cid] = scenes
    write_js(ROOT / "js" / "data" / "story.js", "FD_STORY", story)
    print("wrote js/data/story.js", {k: list(v) for k, v in story.items()})


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--chapter", type=int, action="append")
    ap.add_argument("--build-only", action="store_true")
    args = ap.parse_args()
    if not args.build_only:
        headers = {"Authorization": f"Bearer {gateway_key()}"}
        with httpx.Client(headers=headers, timeout=600) as client:
            for cid in args.chapter or list(SCENES):
                generate(cid, client)
    build()


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
