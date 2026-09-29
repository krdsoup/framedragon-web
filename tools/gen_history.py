"""생성 이력 정리 — 로컬 모델에 보낸 프롬프트 · 파라미터 · 소요시간 → docs/generation-history.md

기록은 네 곳에 흩어져 있다.
  ComfyUI GET /history          이미지·음악 작업마다 프롬프트 원문·서버 파라미터·실행 시각.
                                **메모리뿐이라 컨테이너를 재시작하면 사라진다** → 먼저 스냅샷을 뜬다
  llm/var/requests.db           게이트웨이의 qwen 호출 기록 (mode=ro 로 연다 - 쓰지 않는다)
  tools/out/*                   클라이언트 쪽 소요(다운로드 포함)·라이선스·음질 지표
  gen_story.py 의 함수           대사 프롬프트 원문 (요청 본문을 코드가 만든다)

스냅샷(tools/out/*_2026-09-29.json)이 있으면 그것을 쓴다. 그래서 나중에 ComfyUI 가 재시작돼도
같은 문서가 다시 나온다. 새로 뜨려면 --refresh.

실행:  <rag_project 의 venv>/python tools/gen_history.py [--refresh]
"""

from __future__ import annotations

import argparse
import copy
import datetime as dt
import json
import os
import sqlite3
import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).parent))
import gen_music  # noqa: E402
import gen_story  # noqa: E402
from common import DESIGN, ROOT  # noqa: E402

OUT = ROOT / "tools" / "out"
DOC = ROOT / "docs" / "generation-history.md"
COMFY_URL = os.environ.get("FD_COMFY_URL", "http://127.0.0.1:8188")
LLM_ROOT = Path(os.environ.get("FD_LLM_ROOT") or ROOT.parent / "llm")
KST = dt.timezone(dt.timedelta(hours=9))
DAY = "2026-09-29"
# 이 작업이 ComfyUI 를 처음 부른 시각보다 조금 앞. 그 전(07:25~)은 오전의 음악 엔드포인트 종단 검증이다
WINDOW = (dt.datetime(2026, 9, 29, 13, 10, tzinfo=KST), dt.datetime(2026, 9, 30, 0, 0, tzinfo=KST))
# 게이트웨이에서 이 작업의 qwen 호출 - 대사 1차(빈 배열) 3건 + 2차 3건
GW_WINDOW = ("2026-09-29T04:16:00", "2026-09-29T04:19:30")
SNAP_COMFY = OUT / f"comfy_history_{DAY}.json"
SNAP_GW = OUT / f"gateway_requests_{DAY}.json"

# LLM 이 아닌 로컬 도구 - 목록 끝에 한 줄로만 적는다 (이 세션에서 실제로 보낸 질의)
SEARX_QUERIES = [
    "용의기사2 SRPG 고전게임",
    '"용의 기사 2" 게임 시뮬레이션 RPG',
    "용의기사2 전직 시스템 클래스 경험치 레벨업 마법 공략",
    "Flame Dragon 2 Legend of Golden Castle gameplay classes promotion battle animation",
    "kenney.nl impact sounds rpg audio CC0 footstep sword",
]


# ---- 스냅샷 -----------------------------------------------------------------
def _ts(entry: dict, kind: str) -> int | None:
    for name, data in entry.get("status", {}).get("messages", []):
        if name == kind:
            return data.get("timestamp")
    return None


def snapshot(refresh: bool) -> tuple[dict, dict]:
    if SNAP_COMFY.exists() and not refresh:
        comfy = json.loads(SNAP_COMFY.read_text(encoding="utf-8"))
    else:
        hist = httpx.get(f"{COMFY_URL}/history", timeout=30).json()
        lo, hi = (int(t.timestamp() * 1000) for t in WINDOW)
        jobs = {pid: e for pid, e in hist.items() if lo <= (_ts(e, "execution_start") or 0) < hi}
        comfy = {"source": f"{COMFY_URL}/history", "taken_at": dt.datetime.now(KST).isoformat(timespec="seconds"),
                 "window_kst": [WINDOW[0].isoformat(), WINDOW[1].isoformat()],
                 "excluded_same_day": sum(1 for e in hist.values()
                                          if dt.datetime.fromtimestamp((_ts(e, "execution_start") or 0) / 1000, KST).date().isoformat() == DAY
                                          and pid_not_in(e, jobs)),
                 "jobs": jobs}
        SNAP_COMFY.write_text(json.dumps(comfy, ensure_ascii=False, indent=1), encoding="utf-8")
    if SNAP_GW.exists() and not refresh:
        gw = json.loads(SNAP_GW.read_text(encoding="utf-8"))
    else:
        db = sqlite3.connect(f"file:{(LLM_ROOT / 'var' / 'requests.db').as_posix()}?mode=ro", uri=True)
        db.row_factory = sqlite3.Row
        cols = "ts, key_name, endpoint, model_alias, model_actual, status, latency_ms, prompt_tokens, completion_tokens, schema_retries, error"
        mine = [dict(r) for r in db.execute(
            f"select {cols} from requests where ts >= ? and ts < ? and endpoint = '/v1/chat/completions' order by ts", GW_WINDOW)]
        # 같은 날의 다른 호출 - 이 작업이 아니다. 문서에 근거와 함께 적으려고 남긴다
        others = [dict(r) for r in db.execute(
            f"select {cols} from requests where ts >= '2026-09-28T15:00' and ts < '2026-09-29T15:00' "
            "and endpoint = '/v1/chat/completions' and not (ts >= ? and ts < ?) order by ts", GW_WINDOW)]
        gw = {"source": "llm/var/requests.db (read-only)", "taken_at": dt.datetime.now(KST).isoformat(timespec="seconds"),
              "mine": mine, "others_same_day": others}
        SNAP_GW.write_text(json.dumps(gw, ensure_ascii=False, indent=1), encoding="utf-8")
    return comfy, gw


def pid_not_in(entry: dict, jobs: dict) -> bool:
    return not any(entry is e for e in jobs.values())


# ---- 작업 해석 -----------------------------------------------------------------
def _node(graph: dict, cls: str) -> dict:
    return next((n["inputs"] for n in graph.values() if n["class_type"] == cls), {})


def parse_jobs(comfy: dict) -> tuple[list[dict], list[dict]]:
    images, audio = [], []
    for pid, e in comfy["jobs"].items():
        g = e["prompt"][2]
        t0, t1 = _ts(e, "execution_start"), _ts(e, "execution_success")
        base = {"pid": pid, "start": t0, "exec_s": round((t1 - t0) / 1000, 1) if t0 and t1 else None,
                "ok": t1 is not None}
        ks = _node(g, "KSampler")
        sampler = {k: ks.get(k) for k in ("seed", "steps", "cfg", "sampler_name", "scheduler")}
        if _node(g, "EmptySD3LatentImage"):
            lat = _node(g, "EmptySD3LatentImage")
            images.append({**base, **sampler, "w": lat["width"], "h": lat["height"],
                           "prompt": _node(g, "CLIPTextEncode").get("text", ""),
                           "shift": _node(g, "ModelSamplingAuraFlow").get("shift"),
                           "unet": _node(g, "UNETLoader").get("unet_name"), "clip": _node(g, "CLIPLoader").get("clip_name")})
        else:
            enc = _node(g, "TextEncodeAceStepAudio1.5")
            save = _node(g, "SaveAudioAdvanced")
            audio.append({**base, **sampler, "tags": enc.get("tags", ""), "lyrics": enc.get("lyrics", ""),
                          "bpm": enc.get("bpm"), "duration": enc.get("duration"), "keyscale": enc.get("keyscale"),
                          "language": enc.get("language"), "timesignature": enc.get("timesignature"),
                          "cfg_scale": enc.get("cfg_scale"), "temperature": enc.get("temperature"), "top_p": enc.get("top_p"),
                          "shift": _node(g, "ModelSamplingAuraFlow").get("shift"),
                          "ckpt": _node(g, "CheckpointLoaderSimple").get("ckpt_name"),
                          "format": f"{save.get('format')} {save.get('format.quality', '')}".strip()})
    images.sort(key=lambda j: j["start"])
    audio.sort(key=lambda j: j["start"])
    return images, audio


def _jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def match_images(jobs: list[dict]) -> None:
    """images_log 행과 짝짓는다. 같은 (시드, 크기)가 여러 번이면 **최신끼리** 짝짓는다 -
    첫 실행의 레온 초상(다운로드 실패로 로그 없음)과 해골병 재생성 전/후를 이렇게 가른다."""
    rows = _jsonl(OUT / "images_log.jsonl")
    free = list(jobs)
    for idx, row in reversed(list(enumerate(rows))):
        w, h = map(int, row["size"].split("x"))
        cand = [j for j in free if j["seed"] == row["seed"] and (j["w"], j["h"]) == (w, h)]
        if not cand:
            continue
        j = cand[-1]
        free.remove(j)
        j.update(kind=row["kind"], id=row["id"], client_s=row["elapsed_s"], license=row.get("license"),
                 evicted=row.get("vram_evicted"), log_idx=idx)
    latest = {}
    for j in jobs:
        if "kind" in j:
            latest[(j["kind"], j["id"])] = j
    for j in jobs:
        if "kind" not in j:
            # 같은 (시드, 크기)의 짝에서 종류·ID 를 빌린다 - 같은 요청을 다시 보낸 것이다
            twin = next((t for t in jobs if "log_idx" in t and t["seed"] == j["seed"] and (t["w"], t["h"]) == (j["w"], j["h"])), None)
            j.update(kind=twin["kind"] if twin else "?", id=twin["id"] if twin else "?",
                     status="폐기 — 다운로드 실패(로그 없음)")
        elif latest[(j["kind"], j["id"])] is not j:
            j["status"] = "교체됨 — 재생성"
        elif (j["kind"], j["id"]) == ("object", "pillar"):
            j["status"] = "미사용 — 절차적으로 그림"
        elif (j["kind"], j["id"]) == ("texture", "carpet"):
            j["status"] = "채택 — 가운데만 잘라 씀"
        else:
            j["status"] = "채택"


def match_audio(jobs: list[dict]) -> None:
    tracks = {t["prompt"]: t["id"] for t in gen_music.TRACKS}
    cands = json.loads((OUT / "bgm_candidates.json").read_text(encoding="utf-8"))
    by_seed_prompt = {(c["seed"], c["prompt"]): cid for cid, c in cands.items()}
    log = {r["id"]: r for r in _jsonl(OUT / "music_log.jsonl")}
    picked = {"battle-B-7266", "boss-A-7265"}          # 2026-09-29 사용자가 듣고 고른 곡
    replaced = {"battle", "boss"}
    for j in jobs:
        if j["tags"] in tracks:
            j["id"] = tracks[j["tags"]]
            j["status"] = "교체됨 — 후보로 바꿈" if j["id"] in replaced else "채택"
            j["metrics"] = None
        else:
            cid = by_seed_prompt.get((j["seed"], j["tags"]))
            j["id"] = cid or "?"
            j["status"] = "채택" if cid in picked else "미채택 후보"
            c = cands.get(cid, {})
            j["metrics"] = {k: c.get(k) for k in ("hf", "flat", "rms", "rep")} if c else None
        r = log.get(j["id"], {})
        j["client_s"] = r.get("elapsed_s")
        j["license"] = r.get("license")


def mark_swaps(images: list[dict], audio: list[dict]) -> None:
    """직전 작업과 모델이 다르면 이번 작업의 실행시간에 모델 교체가 들어 있다."""
    allj = sorted([("img", j) for j in images] + [("aud", j) for j in audio], key=lambda p: p[1]["start"])
    prev = None
    for kind, j in allj:
        j["swap"] = prev is not None and prev != kind
        prev = kind
    if allj:
        allj[0][1]["swap"] = True                      # 오전 검증 뒤 첫 작업 - 적재부터 시작했다


# ---- 문서 ---------------------------------------------------------------------
def kst(ms: int | None) -> str:
    return dt.datetime.fromtimestamp(ms / 1000, KST).strftime("%H:%M:%S") if ms else "-"


def gw_kst(ts: str) -> str:
    return dt.datetime.fromisoformat(ts).astimezone(KST).strftime("%H:%M:%S")


def fence(text: str, lang: str = "text") -> str:
    return f"\n```{lang}\n{text}\n```\n"


def details(summary: str, body: str) -> str:
    # </summary> 뒤 빈 줄이 없으면 GitHub 가 블록 안의 마크다운을 렌더링하지 않는다
    return f"<details><summary>{summary}</summary>\n\n{body}\n\n</details>\n"


def variable_part(j: dict) -> str:
    """프롬프트에서 틀을 뺀 부분 - 표에 짧게 보이려고."""
    p = j["prompt"]
    if j["kind"] in ("portrait", "sprite", "chibi"):
        for c in DESIGN["characters"]:
            if c["look"] in p:
                return c["look"]
        i = p.find(" of a ")
        if i >= 0:
            rest = p[i + 6:]
            for stop in (". ", ", dynamic", ", big head", ", snarling", ", growling", ", full body"):
                k = rest.find(stop)
                if k > 0:
                    return rest[:k] + "  ← 이전 버전"
        return p[:80]
    if j["kind"] == "bg":
        return p.split(". ", 1)[-1]
    if j["kind"] == "texture":
        return p.split(", seamless", 1)[0]
    if j["kind"] == "object":
        return p.split(". ", 1)[0]
    return p[:80] + "…"


def md_cell(s) -> str:
    return str(s).replace("|", "\\|").replace("\n", " ")


def build(comfy: dict, gw: dict, images: list[dict], audio: list[dict]) -> str:
    L: list[str] = []
    A = L.append
    story = {n: json.loads((OUT / f"story_ch{n}.json").read_text(encoding="utf-8")) for n in (1, 2, 3)}
    qrows = gw["mine"]

    # ---- 요약
    img_ok = [j for j in images if j["status"].startswith("채택")]
    aud_ok = [j for j in audio if j["status"] == "채택"]
    s = lambda xs, k: round(sum((x.get(k) or 0) for x in xs), 1)  # noqa: E731
    A("# 생성 이력 — 로컬 모델 프롬프트 · 파라미터 · 소요시간\n")
    A(f"이 문서는 `tools/gen_history.py` 가 만든다. 손으로 고치지 않는다. 원본 스냅샷: "
      f"`tools/out/{SNAP_COMFY.name}` (ComfyUI, {comfy['taken_at']}) · `tools/out/{SNAP_GW.name}` (게이트웨이, {gw['taken_at']}).\n")
    A("날짜는 모두 2026-09-29, 시각은 한국시간(KST)이다. 이 PC: RTX 5080 16,303 MiB.\n")
    A("## 요약\n")
    A("| 모델 | 용도 | 경로 | 호출 | 채택 | 서버 실행 합 | 클라이언트 소요 합 | 라이선스 |")
    A("| --- | --- | --- | --- | --- | --- | --- | --- |")
    A(f"| qwen3:14b (Q4_K_M) | 챕터 대사 초안 | 게이트웨이 `/v1/chat/completions` | {len(qrows)} | 3 (1차 3건은 빈 응답) | "
      f"{round(sum(r['latency_ms'] for r in qrows) / 1000, 1)}초 (게이트웨이 지연) | 같음 | Apache 2.0 |")
    A(f"| Z-Image-Turbo bf16 | 초상·전신·SD·배경·타일 | rag API `/v1/images/generations` → ComfyUI | {len(images)} | {len(img_ok)} | "
      f"{s(images, 'exec_s')}초 | {s(images, 'client_s')}초 | Apache 2.0 |")
    A(f"| ACE-Step 1.5 turbo | BGM | rag API `/v1/audio/music` → ComfyUI | {len(audio)} | {len(aud_ok)} | "
      f"{s(audio, 'exec_s')}초 | {s(audio, 'client_s')}초 | Apache 2.0 |")
    swaps = sorted((j for j in images + audio if j.get("swap")), key=lambda j: j["start"])
    A(f"\n- **모델 교체가 들어간 작업 {len(swaps)}건** — 직전 작업과 모델이 달라 적재부터 했다. 해당 작업의 실행시간에 교체 시간이 들어 있다 "
      f"({', '.join(f'{kst(j['start'])} {j.get('id', '?')} {j['exec_s']}초' for j in swaps)})")
    A("- 서버 실행 = ComfyUI 의 execution_start → execution_success. 클라이언트 소요 = 요청부터 파일 다운로드까지 (생성 스크립트가 잰 값)")
    A("- 확산 모델을 부를 때마다 qwen3:14b 가 VRAM 에서 밀려난다 (`vram_evicted: true`). 그래서 대사를 먼저 다 뽑고 그림·음악으로 넘어갔다\n")

    # ---- 공통 파라미터
    img0, aud0 = images[0], audio[0]
    A("## 공통 파라미터\n")
    A("요청마다 바뀌지 않는 값이다. 요청 본문에 없는 값은 서버(rag API·게이트웨이)가 채운다.\n")
    A("| 모델 | 클라이언트가 보낸 것 | 서버가 고정한 것 |")
    A("| --- | --- | --- |")
    A(f"| qwen3:14b | `model: gbrain-analyst` · `temperature: 0.8` · `max_tokens: 6000` · `response_format: json_schema` (장마다 다름) | "
      f"별칭 → qwen3:14b · `num_ctx {story[1]['meta'].get('num_ctx')}` · think 끔 (스키마 호출의 서버 기본값, `llm/doc/guide/api-reference.md` §3.3) |")
    A(f"| Z-Image | `model: z-image` · `prompt` · `size` · `seed` | `{img0['unet']}` · 텍스트 인코더 `{img0['clip']}` · steps {img0['steps']} · "
      f"cfg {img0['cfg']} · `{img0['sampler_name']}` · `{img0['scheduler']}` · shift {img0['shift']} · 네거티브 `ConditioningZeroOut` |")
    A(f"| ACE-Step | `prompt`(→tags) · `duration` · `bpm` · `keyscale` · `seed` · `lyrics`(후보 B만) | `{aud0['ckpt']}` · steps {aud0['steps']} · "
      f"cfg {aud0['cfg']} · `{aud0['sampler_name']}` · `{aud0['scheduler']}` · shift {aud0['shift']} · 인코더 cfg_scale {aud0['cfg_scale']} · "
      f"temperature {aud0['temperature']} · top_p {aud0['top_p']} · 박자 {aud0['timesignature']}/4 · 언어 {aud0['language']}(가사에서 판별) · {aud0['format']} |")
    A("\n**cfg 1 이라 두 확산 모델 모두 네거티브 프롬프트가 먹지 않는다.** 그래서 \"신스 빼 줘\" 가 아니라 쓰고 싶은 악기만 적었다.\n")

    # ---- 타임라인
    A("## 타임라인\n")
    A("| 시각 | 단계 | 건수 | 걸린 시간(벽시계) |")
    A("| --- | --- | --- | --- |")

    rows_t: list[tuple[float, str]] = []           # (시작 ms, 표 한 줄) - 마지막에 시간순으로 찍는다

    def span(xs, label):
        if not xs:
            return
        a, b = xs[0]["start"], xs[-1]["start"] + int((xs[-1]["exec_s"] or 0) * 1000)
        rows_t.append((a, f"| {kst(a)} ~ {kst(b)} | {label} | {len(xs)} | {round((b - a) / 1000)}초 |"))

    def qspan(rs, label):
        t0 = dt.datetime.fromisoformat(rs[0]["ts"]).timestamp() * 1000
        rows_t.append((t0, f"| {gw_kst(rs[0]['ts'])} ~ {gw_kst(rs[-1]['ts'])} | {label} | {len(rs)} | "
                           f"{round(sum(r['latency_ms'] for r in rs) / 1000, 1)}초 (지연 합) |"))

    qspan(qrows[:3], "대사 1차 (빈 배열 — 폐기)")
    qspan(qrows[3:], "대사 2차 (채택)")
    # 그림은 로그 순번으로 나눈다: 첫 요청(로그 없음) · 시험 8 · 일괄 56 · 재생성 4
    span([j for j in images if "log_idx" not in j], "그림 첫 요청 (다운로드 실패 — 폐기)")
    span([j for j in images if 0 <= j.get("log_idx", -1) < 8], "그림 시험 (레온·세라·잔디·나무)")
    span([j for j in images if 8 <= j.get("log_idx", -1) < 64], "그림 일괄")
    span([j for j in images if j.get("log_idx", -1) >= 64], "그림 재생성 (해골병 3 · 산적 초상)")
    span([j for j in audio if j["metrics"] is None], "BGM 첫 8곡")
    span([j for j in audio if j["metrics"] is not None], "맵 BGM 후보 18곡")
    for _, row in sorted(rows_t):
        A(row)
    A("")

    # ---- qwen
    A("## 1. qwen3:14b — 챕터 대사 (6건)\n")
    A("| 기록 시각 | 장 | 결과 | 프롬프트 토큰 | 완성 토큰 | 게이트웨이 지연 | 상태 |")
    A("| --- | --- | --- | --- | --- | --- | --- |")
    for i, r in enumerate(qrows):
        ch = i % 3 + 1
        if i < 3:
            res = "**폐기** — 전 장면 빈 배열 `[]`"
        else:
            lines = story[ch]["story"]
            res = "채택 — " + " · ".join(f"{k} {len(v)}줄" for k, v in lines.items())
        A(f"| {gw_kst(r['ts'])} | {ch} | {res} | {r['prompt_tokens']} | {r['completion_tokens']} | {r['latency_ms'] / 1000:.1f}초 | {r['status']} |")
    A("\n- **1차와 2차의 프롬프트는 같다.** 다른 것은 스키마 하나 — 1차에는 배열에 `minItems`/`maxItems` 가 없어 문법이 빈 배열을 허용했고, "
      "모델이 실제로 그 길을 골랐다. 두 번 모두 프롬프트 토큰이 1275·1099·1382 로 같다")
    A("- 2차의 대사 13장면은 한국어가 어색해 **전부 사람이 교정했다** (`tools/story_fixes.json`). 초안 원문은 `tools/out/story_ch*.json`")
    A("- 1차 응답의 원문은 남아 있지 않다 — 같은 파일이 2차로 덮였다. 토큰 수와 지연은 게이트웨이 기록이다\n")
    A(details("system 프롬프트 (세 장 공통)", fence(gen_story.SYSTEM)))
    for ch in (1, 2, 3):
        chapter = next(c for c in DESIGN["chapters"] if c["id"] == ch)
        scenes = gen_story.SCENES[ch]
        schema2 = gen_story._schema(chapter, scenes)
        schema1 = copy.deepcopy(schema2)
        for v in schema1["properties"].values():
            v.pop("minItems", None)
            v.pop("maxItems", None)
        body = {"model": "gbrain-analyst", "temperature": 0.8, "max_tokens": 6000,
                "response_format": {"type": "json_schema", "json_schema": {"name": f"chapter{ch}", "schema": "(아래)"}}}
        A(details(f"제{ch}장 — user 프롬프트 · 요청 파라미터 · JSON 스키마",
                  "**user 프롬프트**" + fence(gen_story._prompt(chapter, scenes))
                  + "**요청 파라미터** (messages 제외)" + fence(json.dumps(body, ensure_ascii=False, indent=1), "json")
                  + "**스키마 — 2차(채택)**" + fence(json.dumps(schema2, ensure_ascii=False, indent=1), "json")
                  + "**스키마 — 1차(폐기)**: 위와 같고 `minItems`·`maxItems` 만 없다"))

    # ---- 이미지
    A("\n## 2. Z-Image-Turbo — 그림 (%d건)\n" % len(images))
    A("프롬프트는 `tools/design.json`(인물 외형) + `tools/asset_spec.py`(틀)가 만든다. 틀의 공통 앞부분(STYLE):")
    import asset_spec  # noqa: E402 - 틀 문구를 문서에 그대로 싣는다
    A(fence(asset_spec.STYLE))
    A("흰 배경 문구(전신·SD·오브젝트 끝에 붙는다 — 배경 제거용):" + fence(asset_spec.WHITE))
    A("시드는 `crc32(\"<종류>/<ID>\")` 로 고정했다 (산적 초상 재생성만 +11).\n")
    A("| 서버 시작 | 종류 | ID | 크기 | 시드 | 서버 실행 | 클라이언트 | 상태 | 가변부 (틀을 뺀 부분) |")
    A("| --- | --- | --- | --- | --- | --- | --- | --- | --- |")
    for j in images:
        A(f"| {kst(j['start'])} | {j['kind']} | {j['id']} | {j['w']}×{j['h']} | {j['seed']} | {j['exec_s']}초{' ⟳' if j.get('swap') else ''} | "
          f"{j.get('client_s', '-')}{'초' if j.get('client_s') is not None else ''} | {j['status']} | {md_cell(variable_part(j))} |")
    A("\n⟳ = 모델 교체가 실행시간에 들어 있다. 첫 요청(13:17)은 서버에서 만들어졌지만 응답의 상대 경로 URL 을 스크립트가 받지 못해 "
      "로그가 없다 — 곧바로 같은 시드로 다시 요청했고 ComfyUI 캐시로 1초에 끝났다.\n")
    for kind, label in (("portrait", "초상화"), ("sprite", "전신"), ("chibi", "SD"), ("bg", "배경"), ("texture", "타일 재질"),
                        ("object", "타일 오브젝트"), ("?", "로그 없는 작업")):
        js = [j for j in images if j["kind"] == kind]
        if not js:
            continue
        body = "".join(f"\n**{kst(j['start'])} · {j['id']} · {j['w']}×{j['h']} · seed {j['seed']} · {j['status']}**\n" + fence(j["prompt"]) for j in js)
        A(details(f"{label} {len(js)}건 — 프롬프트 원문", body))

    # ---- 음악
    A("\n## 3. ACE-Step 1.5 — BGM (%d건)\n" % len(audio))
    A("후보 18곡은 곡당 2변형 × 3시드다. 변형 A 는 가사 `[instrumental]`, 변형 B 는 섹션 태그만 넣은 가사. "
      "지표: 8kHz↑ = 날카로운 고역 비율(처음 battle 4.45%), 평탄도는 참고용(타악기도 높게 나온다), 반복도는 상대값.\n")
    A("| 서버 시작 | ID | 길이 | BPM | 조성 | 시드 | 가사 | 서버 실행 | 클라이언트 | 상태 | 8kHz↑ | 평탄도 | 반복도 |")
    A("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |")
    for j in audio:
        m = j["metrics"] or {}
        lyr = "[instrumental]" if j["lyrics"].strip() == "[instrumental]" else "섹션 태그"
        A(f"| {kst(j['start'])} | {j['id']} | {j['duration']:.0f}초 | {j['bpm']} | {j['keyscale']} | {j['seed']} | {lyr} | "
          f"{j['exec_s']}초{' ⟳' if j.get('swap') else ''} | {j.get('client_s', '-')}초 | {j['status']} | "
          f"{str(m['hf']) + '%' if m else '-'} | {m.get('flat', '-') if m else '-'} | {m.get('rep', '-') if m else '-'} |")
    A("")
    body = "".join(f"\n**{j['id']}** ({j['status']})\n" + fence(j["tags"]) for j in audio)
    A(details("BGM 프롬프트(tags) 원문 26건", body))
    A(details("변형 B 의 가사(섹션 태그)", fence(gen_music.SECTIONS)))

    # ---- 제외
    A("\n## 이 목록에 넣지 않은 것\n")
    A("같은 날 같은 서비스에 다른 호출이 있었다. **이 작업의 것이 아니다.**\n")
    A("| 기록 시각 | 별칭 | 토큰(프롬프트/완성) | 지연 | 이 작업이 아닌 근거 |")
    A("| --- | --- | --- | --- | --- |")
    for r in gw["others_same_day"]:
        why = ("다른 앱의 시황 분석 별칭" if r["model_alias"] == "market-commentary"
               else "이 작업은 qwen 을 대사 생성에만 불렀다. 검색(`rag_search`)은 SearXNG 만 부르고 LLM 을 부르지 않는다 (`rag/mcp_server.py`)")
        A(f"| {gw_kst(r['ts'])} | {r['model_alias']} | {r['prompt_tokens']}/{r['completion_tokens']} | {r['latency_ms'] / 1000:.1f}초 | {why} |")
    A(f"\n- ComfyUI 의 같은 날 다른 작업 {comfy.get('excluded_same_day', '?')}건(07:25~): 오전의 음악 엔드포인트 종단 검증 (Phase 16)")
    A("- LLM 이 아닌 로컬 도구: SearXNG 웹 검색 " + f"{len(SEARX_QUERIES)}회 (" + " · ".join(f"`{q}`" for q in SEARX_QUERIES) + ")"
      ", BGM 음질 측정(ComfyUI 컨테이너의 PyAV)")

    A("\n## 한계\n")
    A("- 클라이언트 소요에는 다운로드가 들어 있다. 순수 생성시간은 서버 실행 쪽을 본다")
    A("- 모델 교체 시간은 따로 재지 않았다. 교체 직후 작업(⟳)의 실행시간에 들어 있다")
    A("- qwen 1차 응답 원문은 남아 있지 않다. 대사 프롬프트 원문은 요청을 만든 코드(`gen_story.py`)로 재구성했다 — "
      "요청에 쓴 `design.json` 의 대사 관련 항목은 그 뒤 바뀌지 않았다 (바뀐 것은 해골병 외형뿐이고 대사 프롬프트에 들어가지 않는다)")
    return "\n".join(L) + "\n"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true", help="스냅샷을 다시 뜬다")
    args = ap.parse_args()
    comfy, gw = snapshot(args.refresh)
    images, audio = parse_jobs(comfy)
    match_images(images)
    match_audio(audio)
    mark_swaps(images, audio)
    DOC.parent.mkdir(parents=True, exist_ok=True)
    DOC.write_text(build(comfy, gw, images, audio), encoding="utf-8")
    st = {}
    for j in images + audio:
        st[j["status"].split(" — ")[0]] = st.get(j["status"].split(" — ")[0], 0) + 1
    print(f"qwen {len(gw['mine'])} · images {len(images)} · audio {len(audio)} · status {st}")
    print(f"wrote {DOC.relative_to(ROOT)}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
