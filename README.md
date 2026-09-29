# FrameDragon — 잿빛 성채의 맹약

**용의기사2**(炎龍騎士團II, 1995, 대만 한당)를 목표 컨셉으로 한 웹 SRPG 시험판이다.
그림·음악·대사 초안을 전부 이 PC 의 로컬 모델로 만들었다. 3장짜리다.

등장인물·지명·줄거리는 오리지널이다. 원작에서 가져온 것은 **시스템과 분위기**다.

## 실행

```powershell
cd c:\Dev\project\rag_project\framedragon-web
..\.venv\Scripts\python.exe serve.py        # → http://127.0.0.1:8090/ 이 브라우저로 열린다
```

- 표준 라이브러리만 쓰므로 아무 파이썬이나 된다. `--no-browser`, 포트 지정(`serve.py 8095`)도 된다.
- **127.0.0.1 에만 묶는다.** LAN 에 여는 문은 rag_project 의 8080 하나라는 원칙을 지킨다.
  태블릿에서 하려면 `--lan` 을 붙인다.
- `index.html` 을 더블클릭해도 돈다(file://). 게임은 실행 중에 LLM·ComfyUI 를 부르지 않는다 —
  생성은 전부 만들 때 끝났다.

## 조작

| 입력 | 동작 |
| --- | --- |
| 클릭 / Z·Enter | 선택 · 이동 · 확정 |
| 우클릭 / X·Esc | 한 단계 취소 (이동 뒤 취소하면 제자리로) |
| 방향키 / WASD | 커서 |
| N | 아직 행동하지 않은 다음 유닛 |
| R | 적 공격 범위(위험 범위) 켜기/끄기 |
| E | 턴 종료 |
| 전투 연출 중 클릭 | 연출 빨리 감기 |

빈 칸을 클릭하면 턴 종료·설정 메뉴가 나온다. 상단의 `연출 ON/OFF` 로 전투 장면을 끄면
맵 위에서 숫자만 뜬다.

## 원작에서 가져온 것

| 원작 요소 | 여기서 |
| --- | --- |
| 공격하면 전환되는 옆모습 전투 장면 | `js/engine/fight.js` — 전신 스프라이트·지형별 배경·돌진·화살·마법 이펙트 |
| **타격 경험치** — 맞히기만 해도 EXP | `FD.expForCombat`. 100 EXP = 1 레벨, 레벨 차가 클수록 많다 |
| 궁수·마법사는 근접 반격을 받지 않는다 | 활 사거리 2~3. 붙으면 못 쏜다 |
| 교회 전직 | 야영지 교회. 원작 Lv 20 → 시험판이라 **Lv 8** |
| 휴식 · 숨겨진 아이템 조사 · 보물상자 | 행동 메뉴의 `휴식`(이동 전만) · `조사` · `열기` |
| 구출해야 하는 우군 NPC · 턴 트리거 증원 | 2장 미아(인접하면 합류) · 각 장의 증원 이벤트 |
| 쓰러진 동료 부활 | 야영지 교회 (Lv × 40G) |

## 챕터

| 장 | 승리 | 패배 | 이벤트 |
| --- | --- | --- | --- |
| 1 불타는 새벽 | 가르도 격파 | 레온 사망 | 3턴 카인 합류 · 4턴 북쪽 증원 |
| 2 검은 숲의 사냥꾼 | 적 전멸 | 레온 또는 미아 사망 | 미아에게 인접하면 합류 · 3턴 동쪽 증원 |
| 3 잿빛 성채 | 흑기사 제온 격파 | 레온 사망 | 루시안 합류 · 4턴 해골병 부활 · 옥좌 접근 시 보스 조우 |

## 구조

```
index.html  css/style.css  serve.py
js/data/    rules_data.js(지형·직업·마법·아이템)  chapters.js(맵·배치·이벤트)
            story.js · assets.js  ← 생성 파일 (tools/ 가 쓴다)
js/engine/  rules(계산) render(맵) ui fight(전투 연출) ai battle(진행) camp(야영지) main
assets/     portraits · sprites · chibi · bg · tiles · bgm   (raw/ 는 원본, gitignore)
tools/      생성 파이프라인
```

엔진은 ES 모듈 대신 전역 `window.FD` 하나를 공유한다. file:// 에서도 돌게 하려고.

## 에셋을 다시 만들기

rag_project 의 서비스(게이트웨이 8082 · rag API 8080 · ComfyUI 8188)가 떠 있어야 한다.
키는 `rag_project/.env` 에서 읽는다 — 이 폴더에 복사하지 않는다.

```powershell
$py = "..\.venv\Scripts\python.exe"
& $py tools\gen_story.py          # 1) qwen3:14b → tools/out/story_ch*.json → js/data/story.js
& $py tools\gen_images.py         # 2) ComfyUI Z-Image → assets/raw/  (있는 파일은 건너뜀)
& $py tools\gen_music.py          # 3) ACE-Step → assets/bgm/
# 4) 후처리는 Pillow·numpy 가 필요하다. rag_project 의 .venv 에는 넣지 않는다
python -m venv .imgvenv; .imgvenv\Scripts\pip install pillow numpy
.imgvenv\Scripts\python tools\process_images.py   # 배경 제거·축소 → assets/* + js/data/assets.js
```

**순서가 중요하다.** 확산 모델과 qwen3:14b 는 16GB VRAM 에 같이 못 올라간다. 번갈아
부르면 매번 모델 교체(40~55초)가 붙으므로 대사를 먼저 다 뽑고 그림으로 넘어간다.

- 인물·장면은 `tools/design.json` 한 곳에 있다. 대사와 그림 프롬프트가 둘 다 여기서 나온다.
- qwen 초안 중 고친 장면은 `tools/story_fixes.json` 에 있다. 재생성해도 고친 것이 살아남는다.
- 특정 그림만 다시: 파일을 지우고 `gen_images.py --id skeleton`, 또는 `--seed-offset 7` 로 다른 그림.

## 라이선스

- 그림: **Z-Image-Turbo (Apache 2.0)** — 전 장 `meta.license: apache-2.0` 확인 (`tools/out/images_log.jsonl`)
- 음악: **ACE-Step 1.5 (Apache 2.0)** — `tools/out/music_log.jsonl`
- 비상업 전용인 `qwen-image` 는 쓰지 않았다.

## 알려진 한계

- 3장까지다. 3장 결말이 "다음 이야기로" 로 끝난다.
- 한 번 뽑은 그림을 쓰므로 인물의 초상화·전신·SD 가 세부(장식·색)에서 조금씩 다르다.
- BGM 이 루프 지점에서 끊기지 않게 부탁만 했다 — 이음새가 매끄러운지는 곡마다 다르다.
- 모바일 레이아웃은 동작만 하고 다듬지 않았다.
