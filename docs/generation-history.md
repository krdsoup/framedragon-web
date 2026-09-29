# 생성 이력 — 로컬 모델 프롬프트 · 파라미터 · 소요시간

이 문서는 `tools/gen_history.py` 가 만든다. 손으로 고치지 않는다. 원본 스냅샷: `tools/out/comfy_history_2026-09-29.json` (ComfyUI, 2026-09-29T23:28:15+09:00) · `tools/out/gateway_requests_2026-09-29.json` (게이트웨이, 2026-09-29T23:28:15+09:00).

날짜는 모두 2026-09-29, 시각은 한국시간(KST)이다. 이 PC: RTX 5080 16,303 MiB.

## 요약

| 모델 | 용도 | 경로 | 호출 | 채택 | 서버 실행 합 | 클라이언트 소요 합 | 라이선스 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| qwen3:14b (Q4_K_M) | 챕터 대사 초안 | 게이트웨이 `/v1/chat/completions` | 6 | 3 (1차 3건은 빈 응답) | 47.8초 (게이트웨이 지연) | 같음 | Apache 2.0 |
| Z-Image-Turbo bf16 | 초상·전신·SD·배경·타일 | rag API `/v1/images/generations` → ComfyUI | 69 | 62 | 345.0초 | 344.4초 | Apache 2.0 |
| ACE-Step 1.5 turbo | BGM | rag API `/v1/audio/music` → ComfyUI | 26 | 8 | 895.7초 | 913.3초 | Apache 2.0 |

- **모델 교체가 들어간 작업 4건** — 직전 작업과 모델이 달라 적재부터 했다. 해당 작업의 실행시간에 교체 시간이 들어 있다 (13:19:04 leon 46.3초, 13:25:43 title 37.0초, 13:28:05 skeleton 42.5초, 22:30:37 battle-A-7065 90.4초)
- 서버 실행 = ComfyUI 의 execution_start → execution_success. 클라이언트 소요 = 요청부터 파일 다운로드까지 (생성 스크립트가 잰 값)
- 확산 모델을 부를 때마다 qwen3:14b 가 VRAM 에서 밀려난다 (`vram_evicted: true`). 그래서 대사를 먼저 다 뽑고 그림·음악으로 넘어갔다

## 공통 파라미터

요청마다 바뀌지 않는 값이다. 요청 본문에 없는 값은 서버(rag API·게이트웨이)가 채운다.

| 모델 | 클라이언트가 보낸 것 | 서버가 고정한 것 |
| --- | --- | --- |
| qwen3:14b | `model: gbrain-analyst` · `temperature: 0.8` · `max_tokens: 6000` · `response_format: json_schema` (장마다 다름) | 별칭 → qwen3:14b · `num_ctx 16384` · think 끔 (스키마 호출의 서버 기본값, `llm/doc/guide/api-reference.md` §3.3) |
| Z-Image | `model: z-image` · `prompt` · `size` · `seed` | `z_image_turbo_bf16.safetensors` · 텍스트 인코더 `qwen_3_4b.safetensors` · steps 8 · cfg 1.0 · `res_multistep` · `simple` · shift 3.0 · 네거티브 `ConditioningZeroOut` |
| ACE-Step | `prompt`(→tags) · `duration` · `bpm` · `keyscale` · `seed` · `lyrics`(후보 B만) | `ace_step_1.5_turbo_aio.safetensors` · steps 8 · cfg 1.0 · `euler` · `simple` · shift 3.0 · 인코더 cfg_scale 2.0 · temperature 0.85 · top_p 0.9 · 박자 4/4 · 언어 en(가사에서 판별) · mp3 V0 |

**cfg 1 이라 두 확산 모델 모두 네거티브 프롬프트가 먹지 않는다.** 그래서 "신스 빼 줘" 가 아니라 쓰고 싶은 악기만 적었다.

## 타임라인

| 시각 | 단계 | 건수 | 걸린 시간(벽시계) |
| --- | --- | --- | --- |
| 13:16:55 ~ 13:16:57 | 대사 1차 (빈 배열 — 폐기) | 3 | 6.7초 (지연 합) |
| 13:18:16 ~ 13:18:42 | 대사 2차 (채택) | 3 | 41.1초 (지연 합) |
| 13:19:04 ~ 13:19:50 | 그림 첫 요청 (다운로드 실패 — 폐기) | 1 | 46초 |
| 13:19:57 ~ 13:20:29 | 그림 시험 (레온·세라·잔디·나무) | 8 | 32초 |
| 13:20:43 ~ 13:24:57 | 그림 일괄 | 56 | 254초 |
| 13:25:43 ~ 13:27:33 | BGM 첫 8곡 | 8 | 110초 |
| 13:28:05 ~ 13:29:01 | 그림 재생성 (해골병 3 · 산적 초상) | 4 | 56초 |
| 22:30:37 ~ 22:44:09 | 맵 BGM 후보 18곡 | 18 | 813초 |

## 1. qwen3:14b — 챕터 대사 (6건)

| 기록 시각 | 장 | 결과 | 프롬프트 토큰 | 완성 토큰 | 게이트웨이 지연 | 상태 |
| --- | --- | --- | --- | --- | --- | --- |
| 13:16:55 | 1 | **폐기** — 전 장면 빈 배열 `[]` | 1275 | 60 | 4.7초 | 200 |
| 13:16:56 | 2 | **폐기** — 전 장면 빈 배열 `[]` | 1099 | 44 | 1.0초 | 200 |
| 13:16:57 | 3 | **폐기** — 전 장면 빈 배열 `[]` | 1382 | 36 | 1.0초 | 200 |
| 13:18:16 | 1 | 채택 — intro 10줄 · kain_arrive 5줄 · reinforce 4줄 · boss_defeat 4줄 · outro 14줄 | 1275 | 1136 | 14.9초 | 200 |
| 13:18:28 | 2 | 채택 — intro 10줄 · mia_join 5줄 · reinforce 4줄 · outro 10줄 | 1099 | 864 | 11.4초 | 200 |
| 13:18:42 | 3 | 채택 — intro 14줄 · boss_meet 6줄 · boss_defeat 4줄 · outro 12줄 | 1382 | 1140 | 14.8초 | 200 |

- **1차와 2차의 프롬프트는 같다.** 다른 것은 스키마 하나 — 1차에는 배열에 `minItems`/`maxItems` 가 없어 문법이 빈 배열을 허용했고, 모델이 실제로 그 길을 골랐다. 두 번 모두 프롬프트 토큰이 1275·1099·1382 로 같다
- 2차의 대사 13장면은 한국어가 어색해 **전부 사람이 교정했다** (`tools/story_fixes.json`). 초안 원문은 `tools/out/story_ch*.json`
- 1차 응답의 원문은 남아 있지 않다 — 같은 파일이 2차로 덮였다. 토큰 수와 지연은 게이트웨이 기록이다

<details><summary>system 프롬프트 (세 장 공통)</summary>


```text
너는 1990년대 판타지 SRPG 의 시나리오 작가다. 한국어로만 쓴다.

규칙:
- 각 줄은 한 사람의 대사 한 마디다. 60자를 넘기지 않는다.
- speaker 는 주어진 id 중 하나다. 장면 묘사는 speaker 를 "narration" 으로 쓴다.
- 인물의 말투 설정을 지킨다. 새로운 이름 있는 인물을 만들지 않는다.
- 이모지·영어·괄호 속 지문을 쓰지 않는다. 지문은 narration 으로만.
- 줄거리 개요에 없는 사건을 크게 지어내지 않는다.
```


</details>

<details><summary>제1장 — user 프롬프트 · 요청 파라미터 · JSON 스키마</summary>

**user 프롬프트**
```text
# 작품: 프레임드래곤: 잿빛 성채의 맹약
배경: 용의 문장을 이어받은 왕가가 멸망한 지 17년. 제국의 흑기사단이 대륙을 삼키는 가운데, 변방 마을의 청년 레온은 산적의 습격을 계기로 자신의 손등에 새겨진 용의 문장과 마주한다. 그는 동료들과 함께, 옛 왕국의 보물 '황금 왕관'이 잠든 잿빛 성채로 향한다.

# 제1장 「불타는 새벽」 — 장소: 변방 마을 로엔
줄거리 개요: 새벽, 산적 두목 가르도의 무리가 로엔 마을을 습격한다. 레온·세라·볼크가 맞서 싸운다. 3턴째 왕국의 마지막 기사 카인이 말을 타고 나타나 합류한다. 4턴째 북쪽 숲에서 산적 증원군이 나타난다. 가르도를 쓰러뜨리면 승리. 전투 뒤 촌장 하롤드가 레온의 문장이 옛 왕가의 증표임을 알려 주고, 카인이 레온에게 충성을 맹세한다. 가르도는 죽기 전 '제국이 문장을 가진 자를 찾는다'고 흘린다.
승리 조건: 가르도 격파 / 패배 조건: 레온 사망

# 등장인물 (speaker id: 이름 — 설정)
- leon: 레온 (검사) — 17세 주인공. 변방 마을 로엔의 대장간 견습생. 정의감이 강하고 솔직하다. 손등에 용의 문장이 있으나 그 의미를 모른다. 존댓말을 쓰지 않는 소년 말투.
- sera: 세라 (성직자) — 17세. 레온의 소꿉친구이자 마을 교회의 수련 사제. 상냥하지만 레온의 무모함에는 잔소리를 한다. 부드러운 존댓말과 반말을 섞는다.
- volk: 볼크 (전사) — 40대. 로엔 마을의 대장장이이자 레온의 스승. 과거 왕국 근위대 출신이라는 사실을 숨기고 있다. 호탕하고 굵은 아저씨 말투.
- kain: 카인 (기사) — 25세. 멸망한 왕국 기사단의 마지막 기사. 과묵하고 예의 바르다. 레온의 문장을 보고 충성을 맹세한다. 격식 있는 존댓말.
- elder: 촌장 하롤드 (촌장) — 로엔 마을의 늙은 촌장. 레온의 출생 비밀을 조금 알고 있다.
- gardo: 가르도 (산적 두목) — 산적 두목. 제국에게 돈을 받고 마을을 습격했다. 거칠고 탐욕스럽다. 거친 반말.
- bandit / soldier: 이름 없는 산적 / 제국병 (단역 외침에만)

# 써야 할 장면 (키: 지시)
- intro: 전투 전. 새벽, 마을 곳곳에 불길. 레온·세라·볼크가 산적을 발견하고 싸우기로 한다. 가르도가 위협하는 대사 포함. 8~12줄.
- kain_arrive: 3턴째. 백마를 탄 기사 카인이 전장에 뛰어든다. 레온과 짧게 대화. 3~5줄.
- reinforce: 4턴째. 북쪽 숲에서 산적 증원군 등장. 가르도가 비웃고 볼크가 대응. 2~4줄.
- boss_defeat: 가르도가 쓰러지며 '제국이 문장을 가진 자를 찾는다'고 흘린다. 2~4줄.
- outro: 전투 뒤. 촌장 하롤드가 레온의 손등 문장이 옛 왕가의 증표임을 알려 주고, 카인이 무릎 꿇고 충성을 맹세한다. 일행은 마을을 떠나기로 한다. 10~14줄.
```
**요청 파라미터** (messages 제외)
```json
{
 "model": "gbrain-analyst",
 "temperature": 0.8,
 "max_tokens": 6000,
 "response_format": {
  "type": "json_schema",
  "json_schema": {
   "name": "chapter1",
   "schema": "(아래)"
  }
 }
}
```
**스키마 — 2차(채택)**
```json
{
 "type": "object",
 "properties": {
  "intro": {
   "type": "array",
   "items": {
    "type": "object",
    "properties": {
     "speaker": {
      "type": "string",
      "enum": [
       "leon",
       "sera",
       "volk",
       "kain",
       "elder",
       "gardo",
       "narration",
       "bandit",
       "soldier"
      ]
     },
     "text": {
      "type": "string"
     }
    },
    "required": [
     "speaker",
     "text"
    ]
   },
   "minItems": 8,
   "maxItems": 12
  },
  "kain_arrive": {
   "type": "array",
   "items": {
    "type": "object",
    "properties": {
     "speaker": {
      "type": "string",
      "enum": [
       "leon",
       "sera",
       "volk",
       "kain",
       "elder",
       "gardo",
       "narration",
       "bandit",
       "soldier"
      ]
     },
     "text": {
      "type": "string"
     }
    },
    "required": [
     "speaker",
     "text"
    ]
   },
   "minItems": 3,
   "maxItems": 5
  },
  "reinforce": {
   "type": "array",
   "items": {
    "type": "object",
    "properties": {
     "speaker": {
      "type": "string",
      "enum": [
       "leon",
       "sera",
       "volk",
       "kain",
       "elder",
       "gardo",
       "narration",
       "bandit",
       "soldier"
      ]
     },
     "text": {
      "type": "string"
     }
    },
    "required": [
     "speaker",
     "text"
    ]
   },
   "minItems": 2,
   "maxItems": 4
  },
  "boss_defeat": {
   "type": "array",
   "items": {
    "type": "object",
    "properties": {
     "speaker": {
      "type": "string",
      "enum": [
       "leon",
       "sera",
       "volk",
       "kain",
       "elder",
       "gardo",
       "narration",
       "bandit",
       "soldier"
      ]
     },
     "text": {
      "type": "string"
     }
    },
    "required": [
     "speaker",
     "text"
    ]
   },
   "minItems": 2,
   "maxItems": 4
  },
  "outro": {
   "type": "array",
   "items": {
    "type": "object",
    "properties": {
     "speaker": {
      "type": "string",
      "enum": [
       "leon",
       "sera",
       "volk",
       "kain",
       "elder",
       "gardo",
       "narration",
       "bandit",
       "soldier"
      ]
     },
     "text": {
      "type": "string"
     }
    },
    "required": [
     "speaker",
     "text"
    ]
   },
   "minItems": 10,
   "maxItems": 14
  }
 },
 "required": [
  "intro",
  "kain_arrive",
  "reinforce",
  "boss_defeat",
  "outro"
 ]
}
```
**스키마 — 1차(폐기)**: 위와 같고 `minItems`·`maxItems` 만 없다

</details>

<details><summary>제2장 — user 프롬프트 · 요청 파라미터 · JSON 스키마</summary>

**user 프롬프트**
```text
# 작품: 프레임드래곤: 잿빛 성채의 맹약
배경: 용의 문장을 이어받은 왕가가 멸망한 지 17년. 제국의 흑기사단이 대륙을 삼키는 가운데, 변방 마을의 청년 레온은 산적의 습격을 계기로 자신의 손등에 새겨진 용의 문장과 마주한다. 그는 동료들과 함께, 옛 왕국의 보물 '황금 왕관'이 잠든 잿빛 성채로 향한다.

# 제2장 「검은 숲의 사냥꾼」 — 장소: 검은 숲
줄거리 개요: 제국의 추격을 피해 검은 숲으로 들어간 일행은 제국병에게 쫓기는 사냥꾼 소녀 미아를 발견한다. 미아는 NPC 우군이며, 레온이 미아에게 인접하면 정식으로 합류한다. 3턴째 동쪽에서 제국 궁병 증원이 나타난다. 적을 전멸시키면 승리. 전투 뒤 미아가 잿빛 성채로 가는 숲길을 안다며 동행을 자청한다.
승리 조건: 적 전멸 / 패배 조건: 레온 또는 미아 사망

# 등장인물 (speaker id: 이름 — 설정)
- leon: 레온 (검사) — 17세 주인공. 변방 마을 로엔의 대장간 견습생. 정의감이 강하고 솔직하다. 손등에 용의 문장이 있으나 그 의미를 모른다. 존댓말을 쓰지 않는 소년 말투.
- sera: 세라 (성직자) — 17세. 레온의 소꿉친구이자 마을 교회의 수련 사제. 상냥하지만 레온의 무모함에는 잔소리를 한다. 부드러운 존댓말과 반말을 섞는다.
- volk: 볼크 (전사) — 40대. 로엔 마을의 대장장이이자 레온의 스승. 과거 왕국 근위대 출신이라는 사실을 숨기고 있다. 호탕하고 굵은 아저씨 말투.
- kain: 카인 (기사) — 25세. 멸망한 왕국 기사단의 마지막 기사. 과묵하고 예의 바르다. 레온의 문장을 보고 충성을 맹세한다. 격식 있는 존댓말.
- mia: 미아 (궁수) — 16세. 검은 숲의 사냥꾼 소녀. 활발하고 겁이 없으며 말이 빠르다. 제국 병사에게 쫓기다 일행에 합류한다. 발랄한 반말.
- bandit / soldier: 이름 없는 산적 / 제국병 (단역 외침에만)

# 써야 할 장면 (키: 지시)
- intro: 전투 전. 검은 숲. 일행이 제국병에게 쫓기는 소녀(미아)를 발견하고 돕기로 한다. 미아가 도움을 외친다. 7~10줄.
- mia_join: 레온이 미아에게 다가간다. 미아가 정식으로 함께 싸우겠다고 한다. 3~5줄.
- reinforce: 3턴째. 동쪽에서 제국 궁병 증원. 카인이 경고하고 미아가 숲길을 안내한다. 2~4줄.
- outro: 전투 뒤. 미아가 자기소개를 하고 잿빛 성채로 가는 숲길을 안다며 동행한다. 세라와 미아의 가벼운 대화 포함. 8~12줄.
```
**요청 파라미터** (messages 제외)
```json
{
 "model": "gbrain-analyst",
 "temperature": 0.8,
 "max_tokens": 6000,
 "response_format": {
  "type": "json_schema",
  "json_schema": {
   "name": "chapter2",
   "schema": "(아래)"
  }
 }
}
```
**스키마 — 2차(채택)**
```json
{
 "type": "object",
 "properties": {
  "intro": {
   "type": "array",
   "items": {
    "type": "object",
    "properties": {
     "speaker": {
      "type": "string",
      "enum": [
       "leon",
       "sera",
       "volk",
       "kain",
       "mia",
       "narration",
       "bandit",
       "soldier"
      ]
     },
     "text": {
      "type": "string"
     }
    },
    "required": [
     "speaker",
     "text"
    ]
   },
   "minItems": 7,
   "maxItems": 10
  },
  "mia_join": {
   "type": "array",
   "items": {
    "type": "object",
    "properties": {
     "speaker": {
      "type": "string",
      "enum": [
       "leon",
       "sera",
       "volk",
       "kain",
       "mia",
       "narration",
       "bandit",
       "soldier"
      ]
     },
     "text": {
      "type": "string"
     }
    },
    "required": [
     "speaker",
     "text"
    ]
   },
   "minItems": 3,
   "maxItems": 5
  },
  "reinforce": {
   "type": "array",
   "items": {
    "type": "object",
    "properties": {
     "speaker": {
      "type": "string",
      "enum": [
       "leon",
       "sera",
       "volk",
       "kain",
       "mia",
       "narration",
       "bandit",
       "soldier"
      ]
     },
     "text": {
      "type": "string"
     }
    },
    "required": [
     "speaker",
     "text"
    ]
   },
   "minItems": 2,
   "maxItems": 4
  },
  "outro": {
   "type": "array",
   "items": {
    "type": "object",
    "properties": {
     "speaker": {
      "type": "string",
      "enum": [
       "leon",
       "sera",
       "volk",
       "kain",
       "mia",
       "narration",
       "bandit",
       "soldier"
      ]
     },
     "text": {
      "type": "string"
     }
    },
    "required": [
     "speaker",
     "text"
    ]
   },
   "minItems": 8,
   "maxItems": 12
  }
 },
 "required": [
  "intro",
  "mia_join",
  "reinforce",
  "outro"
 ]
}
```
**스키마 — 1차(폐기)**: 위와 같고 `minItems`·`maxItems` 만 없다

</details>

<details><summary>제3장 — user 프롬프트 · 요청 파라미터 · JSON 스키마</summary>

**user 프롬프트**
```text
# 작품: 프레임드래곤: 잿빛 성채의 맹약
배경: 용의 문장을 이어받은 왕가가 멸망한 지 17년. 제국의 흑기사단이 대륙을 삼키는 가운데, 변방 마을의 청년 레온은 산적의 습격을 계기로 자신의 손등에 새겨진 용의 문장과 마주한다. 그는 동료들과 함께, 옛 왕국의 보물 '황금 왕관'이 잠든 잿빛 성채로 향한다.

# 제3장 「잿빛 성채」 — 장소: 잿빛 성채
줄거리 개요: 숲 끝의 폐허 앞에서 마법사 루시안이 일행을 기다리고 있다. 그는 성채에 잠든 황금 왕관은 용의 문장을 가진 자만 꺼낼 수 있다고 말하고 합류한다. 성채 안은 흑마도사가 되살린 해골병과 제국군이 지키고, 옥좌에는 흑기사 제온이 기다린다. 제온은 카인의 옛 기사단 동료였다. 제온을 쓰러뜨리면 승리. 제온은 '황제께서 이미 왕관의 절반을 손에 넣었다'는 말을 남기고 퇴각한다. 옥좌 뒤 비밀 통로에서 금빛 문이 열리며 다음 이야기로 이어진다.
승리 조건: 흑기사 제온 격파 / 패배 조건: 레온 사망

# 등장인물 (speaker id: 이름 — 설정)
- leon: 레온 (검사) — 17세 주인공. 변방 마을 로엔의 대장간 견습생. 정의감이 강하고 솔직하다. 손등에 용의 문장이 있으나 그 의미를 모른다. 존댓말을 쓰지 않는 소년 말투.
- sera: 세라 (성직자) — 17세. 레온의 소꿉친구이자 마을 교회의 수련 사제. 상냥하지만 레온의 무모함에는 잔소리를 한다. 부드러운 존댓말과 반말을 섞는다.
- volk: 볼크 (전사) — 40대. 로엔 마을의 대장장이이자 레온의 스승. 과거 왕국 근위대 출신이라는 사실을 숨기고 있다. 호탕하고 굵은 아저씨 말투.
- kain: 카인 (기사) — 25세. 멸망한 왕국 기사단의 마지막 기사. 과묵하고 예의 바르다. 레온의 문장을 보고 충성을 맹세한다. 격식 있는 존댓말.
- mia: 미아 (궁수) — 16세. 검은 숲의 사냥꾼 소녀. 활발하고 겁이 없으며 말이 빠르다. 제국 병사에게 쫓기다 일행에 합류한다. 발랄한 반말.
- lucian: 루시안 (마법사) — 22세. 제국 아카데미에서 쫓겨난 천재 마법사. 냉소적이고 말투가 비꼬지만 속정이 있다. 잿빛 성채의 옛 문헌을 연구해 왔다. 약간 거만한 존댓말.
- zeon: 흑기사 제온 (흑기사) — 제국 흑기사단의 부단장. 냉혹하지만 기사의 명예를 중시한다. 카인과 옛 인연이 있다. 위압적인 하대.
- bandit / soldier: 이름 없는 산적 / 제국병 (단역 외침에만)

# 써야 할 장면 (키: 지시)
- intro: 전투 전. 숲 끝 폐허 앞에서 마법사 루시안이 기다린다. 황금 왕관은 문장을 가진 자만 꺼낼 수 있다고 말하고 합류. 볼크와 티격태격. 10~14줄.
- boss_meet: 일행이 옥좌에 다가가자 흑기사 제온이 일어선다. 카인과 옛 동료였음이 드러난다. 4~6줄.
- boss_defeat: 제온이 무릎 꿇으며 '황제께서 이미 왕관의 절반을 손에 넣었다'고 말하고 어둠 속으로 퇴각한다. 3~5줄.
- outro: 전투 뒤. 옥좌 뒤 비밀 통로에서 금빛 문이 열린다. 레온의 문장이 빛난다. 동료들이 각자 한마디씩 하고 다음 여정을 예고한다. 8~12줄.
```
**요청 파라미터** (messages 제외)
```json
{
 "model": "gbrain-analyst",
 "temperature": 0.8,
 "max_tokens": 6000,
 "response_format": {
  "type": "json_schema",
  "json_schema": {
   "name": "chapter3",
   "schema": "(아래)"
  }
 }
}
```
**스키마 — 2차(채택)**
```json
{
 "type": "object",
 "properties": {
  "intro": {
   "type": "array",
   "items": {
    "type": "object",
    "properties": {
     "speaker": {
      "type": "string",
      "enum": [
       "leon",
       "sera",
       "volk",
       "kain",
       "mia",
       "lucian",
       "zeon",
       "narration",
       "bandit",
       "soldier"
      ]
     },
     "text": {
      "type": "string"
     }
    },
    "required": [
     "speaker",
     "text"
    ]
   },
   "minItems": 10,
   "maxItems": 14
  },
  "boss_meet": {
   "type": "array",
   "items": {
    "type": "object",
    "properties": {
     "speaker": {
      "type": "string",
      "enum": [
       "leon",
       "sera",
       "volk",
       "kain",
       "mia",
       "lucian",
       "zeon",
       "narration",
       "bandit",
       "soldier"
      ]
     },
     "text": {
      "type": "string"
     }
    },
    "required": [
     "speaker",
     "text"
    ]
   },
   "minItems": 4,
   "maxItems": 6
  },
  "boss_defeat": {
   "type": "array",
   "items": {
    "type": "object",
    "properties": {
     "speaker": {
      "type": "string",
      "enum": [
       "leon",
       "sera",
       "volk",
       "kain",
       "mia",
       "lucian",
       "zeon",
       "narration",
       "bandit",
       "soldier"
      ]
     },
     "text": {
      "type": "string"
     }
    },
    "required": [
     "speaker",
     "text"
    ]
   },
   "minItems": 3,
   "maxItems": 5
  },
  "outro": {
   "type": "array",
   "items": {
    "type": "object",
    "properties": {
     "speaker": {
      "type": "string",
      "enum": [
       "leon",
       "sera",
       "volk",
       "kain",
       "mia",
       "lucian",
       "zeon",
       "narration",
       "bandit",
       "soldier"
      ]
     },
     "text": {
      "type": "string"
     }
    },
    "required": [
     "speaker",
     "text"
    ]
   },
   "minItems": 8,
   "maxItems": 12
  }
 },
 "required": [
  "intro",
  "boss_meet",
  "boss_defeat",
  "outro"
 ]
}
```
**스키마 — 1차(폐기)**: 위와 같고 `minItems`·`maxItems` 만 없다

</details>


## 2. Z-Image-Turbo — 그림 (69건)

프롬프트는 `tools/design.json`(인물 외형) + `tools/asset_spec.py`(틀)가 만든다. 틀의 공통 앞부분(STYLE):

```text
1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors
```

흰 배경 문구(전신·SD·오브젝트 끝에 붙는다 — 배경 제거용):
```text
isolated on a plain flat solid pure white background, no shadow, no ground, no text, no border
```

시드는 `crc32("<종류>/<ID>")` 로 고정했다 (산적 초상 재생성만 +11).

| 서버 시작 | 종류 | ID | 크기 | 시드 | 서버 실행 | 클라이언트 | 상태 | 가변부 (틀을 뺀 부분) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 13:19:04 | portrait | leon | 768×768 | 1311885482 | 46.3초 ⟳ | - | 폐기 — 다운로드 실패(로그 없음) | young man, 17 years old, short spiky crimson red hair, determined amber eyes, blue tunic under a light silver breastplate, red cape, leather gloves, holding a longsword |
| 13:19:57 | portrait | leon | 768×768 | 1311885482 | 0.0초 | 1.1초 | 채택 | young man, 17 years old, short spiky crimson red hair, determined amber eyes, blue tunic under a light silver breastplate, red cape, leather gloves, holding a longsword |
| 13:19:58 | sprite | leon | 768×1024 | 536082438 | 6.8초 | 7.1초 | 채택 | young man, 17 years old, short spiky crimson red hair, determined amber eyes, blue tunic under a light silver breastplate, red cape, leather gloves, holding a longsword |
| 13:20:05 | chibi | leon | 768×768 | 1988464357 | 3.4초 | 4.1초 | 채택 | young man, 17 years old, short spiky crimson red hair, determined amber eyes, blue tunic under a light silver breastplate, red cape, leather gloves, holding a longsword |
| 13:20:09 | portrait | sera | 768×768 | 697892590 | 3.4초 | 4.1초 | 채택 | young woman, long wavy blonde hair, gentle blue eyes, white and gold priestess robe with a blue sash, small silver circlet, holding a wooden staff topped with a blue crystal |
| 13:20:13 | sprite | sera | 768×1024 | 2019216962 | 4.6초 | 5.1초 | 채택 | young woman, long wavy blonde hair, gentle blue eyes, white and gold priestess robe with a blue sash, small silver circlet, holding a wooden staff topped with a blue crystal |
| 13:20:18 | chibi | sera | 768×768 | 288143521 | 3.5초 | 4.1초 | 채택 | young woman, long wavy blonde hair, gentle blue eyes, white and gold priestess robe with a blue sash, small silver circlet, holding a wooden staff topped with a blue crystal |
| 13:20:22 | texture | grass | 512×512 | 1804693988 | 2.1초 | 3.1초 | 채택 | short lush green grass field with tiny flowers |
| 13:20:25 | object | tree | 768×768 | 1408860672 | 3.8초 | 4.1초 | 교체됨 — 재생성 | a cluster of round dark green leafy trees |
| 13:20:43 | portrait | volk | 768×768 | 658857419 | 3.5초 | 4.1초 | 채택 | big muscular middle-aged man, thick brown beard, scar across his nose, iron helmet with small horns, heavy dark iron plate armor, fur mantle, wielding a huge double-bladed battle axe |
| 13:20:47 | sprite | volk | 768×1024 | 1988586855 | 4.3초 | 5.1초 | 채택 | big muscular middle-aged man, thick brown beard, scar across his nose, iron helmet with small horns, heavy dark iron plate armor, fur mantle, wielding a huge double-bladed battle axe |
| 13:20:52 | chibi | volk | 768×768 | 535894916 | 3.3초 | 4.1초 | 채택 | big muscular middle-aged man, thick brown beard, scar across his nose, iron helmet with small horns, heavy dark iron plate armor, fur mantle, wielding a huge double-bladed battle axe |
| 13:20:56 | portrait | kain | 768×768 | 45481801 | 3.4초 | 4.1초 | 채택 | handsome knight, 25 years old, short black hair, calm grey eyes, dark blue full plate armor with gold trim, white tabard with a faded dragon crest, holding a long lance, riding a white warhorse |
| 13:21:00 | sprite | kain | 1024×1024 | 1400360933 | 5.5초 | 6.1초 | 채택 | handsome knight, 25 years old, short black hair, calm grey eyes, dark blue full plate armor with gold trim, white tabard with a faded dragon crest, holding a long lance, riding a white warhorse |
| 13:21:06 | chibi | kain | 768×768 | 973191430 | 3.3초 | 4.1초 | 채택 | handsome knight, 25 years old, short black hair, calm grey eyes, dark blue full plate armor with gold trim, white tabard with a faded dragon crest, holding a long lance, riding a white warhorse |
| 13:21:11 | portrait | mia | 768×768 | 361319683 | 3.2초 | 4.1초 | 채택 | energetic girl, 16 years old, short bob green hair, bright green eyes, green leather hunter outfit, brown hooded cloak, quiver on her back, holding a wooden longbow |
| 13:21:15 | sprite | mia | 768×1024 | 163175218 | 4.2초 | 5.1초 | 채택 | energetic girl, 16 years old, short bob green hair, bright green eyes, green leather hunter outfit, brown hooded cloak, quiver on her back, holding a wooden longbow |
| 13:21:20 | chibi | mia | 768×768 | 2030945953 | 3.3초 | 4.1초 | 채택 | energetic girl, 16 years old, short bob green hair, bright green eyes, green leather hunter outfit, brown hooded cloak, quiver on her back, holding a wooden longbow |
| 13:21:24 | portrait | lucian | 768×768 | 2031872553 | 3.4초 | 4.1초 | 채택 | slender young man, 22 years old, long straight silver hair, sharp violet eyes, deep purple mage robe with gold embroidery, holding an open glowing spellbook, a small floating orb of fire |
| 13:21:28 | sprite | lucian | 768×1024 | 1567652002 | 4.1초 | 5.1초 | 채택 | slender young man, 22 years old, long straight silver hair, sharp violet eyes, deep purple mage robe with gold embroidery, holding an open glowing spellbook, a small floating orb of fire |
| 13:21:33 | chibi | lucian | 768×768 | 289760754 | 3.4초 | 4.1초 | 채택 | slender young man, 22 years old, long straight silver hair, sharp violet eyes, deep purple mage robe with gold embroidery, holding an open glowing spellbook, a small floating orb of fire |
| 13:21:37 | portrait | elder | 768×768 | 1165860722 | 3.4초 | 4.1초 | 채택 | old man, white long beard, bald head, kind wrinkled face, simple brown villager robe, holding a wooden cane |
| 13:21:41 | portrait | gardo | 768×768 | 794924693 | 3.4초 | 4.1초 | 채택 | brutal bandit leader, bald head with tattoos, black eyepatch, scarred face, crude leather and fur armor, spiked shoulder pad, holding a large rusty cleaver axe |
| 13:21:45 | sprite | gardo | 768×1024 | 1884339046 | 4.2초 | 5.1초 | 채택 | brutal bandit leader, bald head with tattoos, black eyepatch, scarred face, crude leather and fur armor, spiked shoulder pad, holding a large rusty cleaver axe |
| 13:21:50 | chibi | gardo | 768×768 | 1228570322 | 3.5초 | 4.1초 | 채택 | brutal bandit leader, bald head with tattoos, black eyepatch, scarred face, crude leather and fur armor, spiked shoulder pad, holding a large rusty cleaver axe |
| 13:21:54 | portrait | zeon | 768×768 | 994296041 | 3.5초 | 4.1초 | 채택 | imposing dark knight, full black spiked plate armor with red glowing accents, black horned helmet with red eyes glowing through the visor, tattered dark red cape, holding a massive black greatsword |
| 13:21:58 | sprite | zeon | 768×1024 | 1786900549 | 4.6초 | 5.1초 | 채택 | imposing dark knight, full black spiked plate armor with red glowing accents, black horned helmet with red eyes glowing through the visor, tattered dark red cape, holding a massive black greatsword |
| 13:22:04 | chibi | zeon | 768×768 | 66553510 | 3.3초 | 4.1초 | 채택 | imposing dark knight, full black spiked plate armor with red glowing accents, black horned helmet with red eyes glowing through the visor, tattered dark red cape, holding a massive black greatsword |
| 13:22:08 | portrait | bandit | 768×768 | 427328231 | 3.5초 | 4.1초 | 교체됨 — 재생성 | scruffy bandit, messy hair, bandana, torn leather vest, holding a hand axe |
| 13:22:12 | sprite | bandit | 768×1024 | 1024659564 | 4.2초 | 5.1초 | 채택 | scruffy bandit, messy hair, bandana, torn leather vest, holding a hand axe |
| 13:22:17 | chibi | bandit | 768×768 | 1898319164 | 3.4초 | 4.1초 | 채택 | scruffy bandit, messy hair, bandana, torn leather vest, holding a hand axe |
| 13:22:21 | portrait | wolf | 768×768 | 1632126483 | 3.5초 | 4.1초 | 채택 | fierce grey wild wolf, bared fangs, bristling fur |
| 13:22:25 | sprite | wolf | 1024×1024 | 814380735 | 5.8초 | 6.1초 | 채택 | fierce grey wild wolf, bared fangs, bristling fur |
| 13:22:31 | chibi | wolf | 768×768 | 1509687388 | 3.5초 | 4.1초 | 채택 | fierce grey wild wolf, bared fangs, bristling fur |
| 13:22:35 | portrait | soldier | 768×768 | 12875454 | 3.8초 | 4.1초 | 채택 | imperial soldier, black steel helmet with face guard, black and red uniform with chainmail, holding a spear and a small round shield |
| 13:22:39 | sprite | soldier | 768×1024 | 2055882628 | 4.4초 | 5.1초 | 채택 | imperial soldier, black steel helmet with face guard, black and red uniform with chainmail, holding a spear and a small round shield |
| 13:22:44 | chibi | soldier | 768×768 | 288170861 | 3.2초 | 4.1초 | 채택 | imperial soldier, black steel helmet with face guard, black and red uniform with chainmail, holding a spear and a small round shield |
| 13:22:49 | portrait | e_archer | 768×768 | 1665121987 | 3.3초 | 4.1초 | 채택 | imperial archer, black leather hood, red scarf over mouth, black and red light armor, holding a crossbow |
| 13:22:53 | sprite | e_archer | 768×1024 | 625551680 | 4.2초 | 5.1초 | 채택 | imperial archer, black leather hood, red scarf over mouth, black and red light armor, holding a crossbow |
| 13:22:58 | chibi | e_archer | 768×768 | 2096420088 | 3.4초 | 4.1초 | 채택 | imperial archer, black leather hood, red scarf over mouth, black and red light armor, holding a crossbow |
| 13:23:02 | portrait | dark_mage | 768×768 | 2075442591 | 3.5초 | 4.1초 | 채택 | sinister dark sorcerer, black hooded robe with purple runes, pale face, glowing purple eyes, holding a twisted staff with a purple flame |
| 13:23:06 | sprite | dark_mage | 768×1024 | 264444306 | 4.5초 | 5.1초 | 채택 | sinister dark sorcerer, black hooded robe with purple runes, pale face, glowing purple eyes, holding a twisted staff with a purple flame |
| 13:23:11 | chibi | dark_mage | 768×768 | 1252040657 | 3.5초 | 4.1초 | 채택 | sinister dark sorcerer, black hooded robe with purple runes, pale face, glowing purple eyes, holding a twisted staff with a purple flame |
| 13:23:15 | portrait | skeleton | 768×768 | 524279254 | 3.4초 | 4.1초 | 교체됨 — 재생성 | undead skeleton warrior, rusty helmet, broken rusty armor pieces, holding a chipped sword and a cracked wooden shield, glowing blue eye sockets  ← 이전 버전 |
| 13:23:19 | sprite | skeleton | 768×1024 | 1497975381 | 4.3초 | 5.1초 | 교체됨 — 재생성 | undead skeleton warrior, rusty helmet, broken rusty armor pieces, holding a chipped sword and a cracked wooden shield, glowing blue eye sockets, dynamic battle-ready stance, three-quarter side view facing left, whole figure visible from head to toe, centered  ← 이전 버전 |
| 13:23:24 | chibi | skeleton | 768×768 | 16037869 | 3.7초 | 4.1초 | 교체됨 — 재생성 | undead skeleton warrior, rusty helmet, broken rusty armor pieces, holding a chipped sword and a cracked wooden shield, glowing blue eye sockets, big head and small body, full body standing, front view, centered, small in the frame  ← 이전 버전 |
| 13:23:28 | bg | title | 1344×768 | 571683409 | 6.1초 | 7.1초 | 채택 | epic fantasy landscape, a huge crimson dragon flying over a grey ruined castle on a cliff at sunset, dramatic golden clouds, title screen key art |
| 13:23:35 | bg | camp | 1344×768 | 938842281 | 5.9초 | 6.1초 | 채택 | a fantasy travellers camp at night in a forest clearing, two tents, a warm campfire, starry sky, peaceful mood |
| 13:23:42 | bg | scene_ch1 | 1344×768 | 1894304027 | 6.0초 | 7.1초 | 채택 | a medieval fantasy village burning at dawn, thatched houses on fire, smoke, orange sky, wide shot |
| 13:23:49 | bg | scene_ch2 | 1344×768 | 1776392353 | 6.1초 | 7.1초 | 채택 | a dark deep ancient forest, huge twisted trees, shafts of pale light, mist, wide shot |
| 13:23:56 | bg | scene_ch3 | 1344×768 | 518432823 | 5.9초 | 6.3초 | 채택 | the gate of a massive grey ruined stone fortress at dusk, crumbling towers, ominous purple sky, wide shot |
| 13:24:02 | bg | battle_field | 1344×768 | 2037292601 | 6.1초 | 7.1초 | 채택 | side view of a grassy meadow battlefield, green grass ground in the lower third, distant hills and blue sky with clouds, flat horizon |
| 13:24:09 | bg | battle_forest | 1344×768 | 315267489 | 6.0초 | 6.3초 | 채택 | side view of a forest battlefield, mossy ground in the lower third, dense trees in the background, dappled light, flat horizon |
| 13:24:15 | bg | battle_castle | 1344×768 | 2139436605 | 6.1초 | 7.1초 | 채택 | side view inside a dark ruined castle throne hall, grey stone floor in the lower third, stone pillars and torches in the background |
| 13:24:22 | texture | dirt | 512×512 | 134698827 | 1.9초 | 2.1초 | 채택 | packed light brown dirt road with small pebbles |
| 13:24:24 | texture | water | 512×512 | 951057101 | 1.7초 | 2.0초 | 채택 | clear blue lake water with gentle ripples |
| 13:24:27 | texture | floor | 512×512 | 2111387705 | 1.8초 | 2.1초 | 채택 | old grey stone brick castle floor tiles |
| 13:24:29 | texture | wall | 512×512 | 60119307 | 1.8초 | 2.1초 | 채택 | dark grey rough castle stone wall top, large blocks |
| 13:24:31 | texture | carpet | 512×512 | 1120252163 | 1.8초 | 2.1초 | 채택 — 가운데만 잘라 씀 | royal red carpet with golden embroidered border pattern |
| 13:24:33 | object | tree | 768×768 | 1408860672 | 3.2초 | 4.1초 | 채택 | one single round dark green leafy oak tree with a short brown trunk |
| 13:24:37 | object | mountain | 768×768 | 1003956097 | 3.3초 | 4.1초 | 채택 | a rocky grey mountain peak with a little snow |
| 13:24:41 | object | house | 768×768 | 1758748862 | 3.3초 | 4.1초 | 채택 | a small medieval cottage with a red tiled roof and wooden walls |
| 13:24:45 | object | chest | 768×768 | 1950739092 | 3.4초 | 4.1초 | 채택 | a closed wooden treasure chest with gold trim |
| 13:24:49 | object | pillar | 768×768 | 2130377084 | 3.4초 | 4.1초 | 미사용 — 절차적으로 그림 | a round grey stone castle pillar seen from above |
| 13:24:53 | object | throne | 768×768 | 1858114855 | 3.3초 | 4.1초 | 채택 | an ornate golden royal throne with red cushion |
| 13:28:05 | portrait | skeleton | 768×768 | 524279254 | 42.5초 ⟳ | 43.2초 | 채택 | undead skeleton warrior made only of bare white bones, a grinning bare skull head with glowing blue eye sockets, visible ribcage and bony arms and legs, no skin, no flesh, no face, a rusty dented helmet, holding a chipped sword and a cracked wooden shield |
| 13:28:48 | sprite | skeleton | 768×1024 | 1497975381 | 4.7초 | 5.1초 | 채택 | undead skeleton warrior made only of bare white bones, a grinning bare skull head with glowing blue eye sockets, visible ribcage and bony arms and legs, no skin, no flesh, no face, a rusty dented helmet, holding a chipped sword and a cracked wooden shield |
| 13:28:54 | chibi | skeleton | 768×768 | 16037869 | 3.4초 | 4.1초 | 채택 | undead skeleton warrior made only of bare white bones, a grinning bare skull head with glowing blue eye sockets, visible ribcage and bony arms and legs, no skin, no flesh, no face, a rusty dented helmet, holding a chipped sword and a cracked wooden shield |
| 13:28:58 | portrait | bandit | 768×768 | 427328242 | 3.5초 | 4.3초 | 채택 | scruffy bandit, messy hair, bandana, torn leather vest, holding a hand axe |

⟳ = 모델 교체가 실행시간에 들어 있다. 첫 요청(13:17)은 서버에서 만들어졌지만 응답의 상대 경로 URL 을 스크립트가 받지 못해 로그가 없다 — 곧바로 같은 시드로 다시 요청했고 ComfyUI 캐시로 1초에 끝났다.

<details><summary>초상화 18건 — 프롬프트 원문</summary>


**13:19:04 · leon · 768×768 · seed 1311885482 · 폐기 — 다운로드 실패(로그 없음)**

```text
1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors. Character portrait, bust shot from chest up of a young man, 17 years old, short spiky crimson red hair, determined amber eyes, blue tunic under a light silver breastplate, red cape, leather gloves, holding a longsword. Looking at the viewer, expressive face, dark blue vignette gradient background, high detail, fantasy RPG dialogue portrait, no text
```

**13:19:57 · leon · 768×768 · seed 1311885482 · 채택**

```text
1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors. Character portrait, bust shot from chest up of a young man, 17 years old, short spiky crimson red hair, determined amber eyes, blue tunic under a light silver breastplate, red cape, leather gloves, holding a longsword. Looking at the viewer, expressive face, dark blue vignette gradient background, high detail, fantasy RPG dialogue portrait, no text
```

**13:20:09 · sera · 768×768 · seed 697892590 · 채택**

```text
1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors. Character portrait, bust shot from chest up of a young woman, long wavy blonde hair, gentle blue eyes, white and gold priestess robe with a blue sash, small silver circlet, holding a wooden staff topped with a blue crystal. Looking at the viewer, expressive face, dark blue vignette gradient background, high detail, fantasy RPG dialogue portrait, no text
```

**13:20:43 · volk · 768×768 · seed 658857419 · 채택**

```text
1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors. Character portrait, bust shot from chest up of a big muscular middle-aged man, thick brown beard, scar across his nose, iron helmet with small horns, heavy dark iron plate armor, fur mantle, wielding a huge double-bladed battle axe. Looking at the viewer, expressive face, dark blue vignette gradient background, high detail, fantasy RPG dialogue portrait, no text
```

**13:20:56 · kain · 768×768 · seed 45481801 · 채택**

```text
1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors. Character portrait, bust shot from chest up of a handsome knight, 25 years old, short black hair, calm grey eyes, dark blue full plate armor with gold trim, white tabard with a faded dragon crest, holding a long lance, riding a white warhorse. Looking at the viewer, expressive face, dark blue vignette gradient background, high detail, fantasy RPG dialogue portrait, no text
```

**13:21:11 · mia · 768×768 · seed 361319683 · 채택**

```text
1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors. Character portrait, bust shot from chest up of a energetic girl, 16 years old, short bob green hair, bright green eyes, green leather hunter outfit, brown hooded cloak, quiver on her back, holding a wooden longbow. Looking at the viewer, expressive face, dark blue vignette gradient background, high detail, fantasy RPG dialogue portrait, no text
```

**13:21:24 · lucian · 768×768 · seed 2031872553 · 채택**

```text
1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors. Character portrait, bust shot from chest up of a slender young man, 22 years old, long straight silver hair, sharp violet eyes, deep purple mage robe with gold embroidery, holding an open glowing spellbook, a small floating orb of fire. Looking at the viewer, expressive face, dark blue vignette gradient background, high detail, fantasy RPG dialogue portrait, no text
```

**13:21:37 · elder · 768×768 · seed 1165860722 · 채택**

```text
1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors. Character portrait, bust shot from chest up of a old man, white long beard, bald head, kind wrinkled face, simple brown villager robe, holding a wooden cane. Looking at the viewer, expressive face, dark blue vignette gradient background, high detail, fantasy RPG dialogue portrait, no text
```

**13:21:41 · gardo · 768×768 · seed 794924693 · 채택**

```text
1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors. Character portrait, bust shot from chest up of a brutal bandit leader, bald head with tattoos, black eyepatch, scarred face, crude leather and fur armor, spiked shoulder pad, holding a large rusty cleaver axe. Looking at the viewer, expressive face, dark blue vignette gradient background, high detail, fantasy RPG dialogue portrait, no text
```

**13:21:54 · zeon · 768×768 · seed 994296041 · 채택**

```text
1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors. Character portrait, bust shot from chest up of a imposing dark knight, full black spiked plate armor with red glowing accents, black horned helmet with red eyes glowing through the visor, tattered dark red cape, holding a massive black greatsword. Looking at the viewer, expressive face, dark blue vignette gradient background, high detail, fantasy RPG dialogue portrait, no text
```

**13:22:08 · bandit · 768×768 · seed 427328231 · 교체됨 — 재생성**

```text
1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors. Character portrait, bust shot from chest up of a scruffy bandit, messy hair, bandana, torn leather vest, holding a hand axe. Looking at the viewer, expressive face, dark blue vignette gradient background, high detail, fantasy RPG dialogue portrait, no text
```

**13:22:21 · wolf · 768×768 · seed 1632126483 · 채택**

```text
1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors. Portrait of the head of a fierce grey wild wolf, bared fangs, bristling fur, snarling, dark blue vignette gradient background, no text
```

**13:22:35 · soldier · 768×768 · seed 12875454 · 채택**

```text
1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors. Character portrait, bust shot from chest up of a imperial soldier, black steel helmet with face guard, black and red uniform with chainmail, holding a spear and a small round shield. Looking at the viewer, expressive face, dark blue vignette gradient background, high detail, fantasy RPG dialogue portrait, no text
```

**13:22:49 · e_archer · 768×768 · seed 1665121987 · 채택**

```text
1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors. Character portrait, bust shot from chest up of a imperial archer, black leather hood, red scarf over mouth, black and red light armor, holding a crossbow. Looking at the viewer, expressive face, dark blue vignette gradient background, high detail, fantasy RPG dialogue portrait, no text
```

**13:23:02 · dark_mage · 768×768 · seed 2075442591 · 채택**

```text
1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors. Character portrait, bust shot from chest up of a sinister dark sorcerer, black hooded robe with purple runes, pale face, glowing purple eyes, holding a twisted staff with a purple flame. Looking at the viewer, expressive face, dark blue vignette gradient background, high detail, fantasy RPG dialogue portrait, no text
```

**13:23:15 · skeleton · 768×768 · seed 524279254 · 교체됨 — 재생성**

```text
1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors. Character portrait, bust shot from chest up of a undead skeleton warrior, rusty helmet, broken rusty armor pieces, holding a chipped sword and a cracked wooden shield, glowing blue eye sockets. Looking at the viewer, expressive face, dark blue vignette gradient background, high detail, fantasy RPG dialogue portrait, no text
```

**13:28:05 · skeleton · 768×768 · seed 524279254 · 채택**

```text
1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors. Character portrait, bust shot from chest up of a undead skeleton warrior made only of bare white bones, a grinning bare skull head with glowing blue eye sockets, visible ribcage and bony arms and legs, no skin, no flesh, no face, a rusty dented helmet, holding a chipped sword and a cracked wooden shield. Looking at the viewer, expressive face, dark blue vignette gradient background, high detail, fantasy RPG dialogue portrait, no text
```

**13:28:58 · bandit · 768×768 · seed 427328242 · 채택**

```text
1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors. Character portrait, bust shot from chest up of a scruffy bandit, messy hair, bandana, torn leather vest, holding a hand axe. Looking at the viewer, expressive face, dark blue vignette gradient background, high detail, fantasy RPG dialogue portrait, no text
```


</details>

<details><summary>전신 15건 — 프롬프트 원문</summary>


**13:19:58 · leon · 768×1024 · seed 536082438 · 채택**

```text
1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors. Full body character art of a young man, 17 years old, short spiky crimson red hair, determined amber eyes, blue tunic under a light silver breastplate, red cape, leather gloves, holding a longsword, dynamic battle-ready stance, three-quarter side view facing left, whole figure visible from head to toe, centered. isolated on a plain flat solid pure white background, no shadow, no ground, no text, no border
```

**13:20:13 · sera · 768×1024 · seed 2019216962 · 채택**

```text
1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors. Full body character art of a young woman, long wavy blonde hair, gentle blue eyes, white and gold priestess robe with a blue sash, small silver circlet, holding a wooden staff topped with a blue crystal, dynamic battle-ready stance, three-quarter side view facing left, whole figure visible from head to toe, centered. isolated on a plain flat solid pure white background, no shadow, no ground, no text, no border
```

**13:20:47 · volk · 768×1024 · seed 1988586855 · 채택**

```text
1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors. Full body character art of a big muscular middle-aged man, thick brown beard, scar across his nose, iron helmet with small horns, heavy dark iron plate armor, fur mantle, wielding a huge double-bladed battle axe, dynamic battle-ready stance, three-quarter side view facing left, whole figure visible from head to toe, centered. isolated on a plain flat solid pure white background, no shadow, no ground, no text, no border
```

**13:21:00 · kain · 1024×1024 · seed 1400360933 · 채택**

```text
1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors. Full body character art of a handsome knight, 25 years old, short black hair, calm grey eyes, dark blue full plate armor with gold trim, white tabard with a faded dragon crest, holding a long lance, riding a white warhorse, dynamic battle-ready stance, three-quarter side view facing left, whole figure visible from head to toe, centered. isolated on a plain flat solid pure white background, no shadow, no ground, no text, no border
```

**13:21:15 · mia · 768×1024 · seed 163175218 · 채택**

```text
1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors. Full body character art of a energetic girl, 16 years old, short bob green hair, bright green eyes, green leather hunter outfit, brown hooded cloak, quiver on her back, holding a wooden longbow, dynamic battle-ready stance, three-quarter side view facing left, whole figure visible from head to toe, centered. isolated on a plain flat solid pure white background, no shadow, no ground, no text, no border
```

**13:21:28 · lucian · 768×1024 · seed 1567652002 · 채택**

```text
1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors. Full body character art of a slender young man, 22 years old, long straight silver hair, sharp violet eyes, deep purple mage robe with gold embroidery, holding an open glowing spellbook, a small floating orb of fire, dynamic battle-ready stance, three-quarter side view facing left, whole figure visible from head to toe, centered. isolated on a plain flat solid pure white background, no shadow, no ground, no text, no border
```

**13:21:45 · gardo · 768×1024 · seed 1884339046 · 채택**

```text
1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors. Full body character art of a brutal bandit leader, bald head with tattoos, black eyepatch, scarred face, crude leather and fur armor, spiked shoulder pad, holding a large rusty cleaver axe, dynamic battle-ready stance, three-quarter side view facing left, whole figure visible from head to toe, centered. isolated on a plain flat solid pure white background, no shadow, no ground, no text, no border
```

**13:21:58 · zeon · 768×1024 · seed 1786900549 · 채택**

```text
1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors. Full body character art of a imposing dark knight, full black spiked plate armor with red glowing accents, black horned helmet with red eyes glowing through the visor, tattered dark red cape, holding a massive black greatsword, dynamic battle-ready stance, three-quarter side view facing left, whole figure visible from head to toe, centered. isolated on a plain flat solid pure white background, no shadow, no ground, no text, no border
```

**13:22:12 · bandit · 768×1024 · seed 1024659564 · 채택**

```text
1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors. Full body character art of a scruffy bandit, messy hair, bandana, torn leather vest, holding a hand axe, dynamic battle-ready stance, three-quarter side view facing left, whole figure visible from head to toe, centered. isolated on a plain flat solid pure white background, no shadow, no ground, no text, no border
```

**13:22:25 · wolf · 1024×1024 · seed 814380735 · 채택**

```text
1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors. Full body side view of a fierce grey wild wolf, bared fangs, bristling fur, growling in an attack stance, facing left, whole body visible, centered. isolated on a plain flat solid pure white background, no shadow, no ground, no text, no border
```

**13:22:39 · soldier · 768×1024 · seed 2055882628 · 채택**

```text
1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors. Full body character art of a imperial soldier, black steel helmet with face guard, black and red uniform with chainmail, holding a spear and a small round shield, dynamic battle-ready stance, three-quarter side view facing left, whole figure visible from head to toe, centered. isolated on a plain flat solid pure white background, no shadow, no ground, no text, no border
```

**13:22:53 · e_archer · 768×1024 · seed 625551680 · 채택**

```text
1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors. Full body character art of a imperial archer, black leather hood, red scarf over mouth, black and red light armor, holding a crossbow, dynamic battle-ready stance, three-quarter side view facing left, whole figure visible from head to toe, centered. isolated on a plain flat solid pure white background, no shadow, no ground, no text, no border
```

**13:23:06 · dark_mage · 768×1024 · seed 264444306 · 채택**

```text
1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors. Full body character art of a sinister dark sorcerer, black hooded robe with purple runes, pale face, glowing purple eyes, holding a twisted staff with a purple flame, dynamic battle-ready stance, three-quarter side view facing left, whole figure visible from head to toe, centered. isolated on a plain flat solid pure white background, no shadow, no ground, no text, no border
```

**13:23:19 · skeleton · 768×1024 · seed 1497975381 · 교체됨 — 재생성**

```text
1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors. Full body character art of a undead skeleton warrior, rusty helmet, broken rusty armor pieces, holding a chipped sword and a cracked wooden shield, glowing blue eye sockets, dynamic battle-ready stance, three-quarter side view facing left, whole figure visible from head to toe, centered. isolated on a plain flat solid pure white background, no shadow, no ground, no text, no border
```

**13:28:48 · skeleton · 768×1024 · seed 1497975381 · 채택**

```text
1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors. Full body character art of a undead skeleton warrior made only of bare white bones, a grinning bare skull head with glowing blue eye sockets, visible ribcage and bony arms and legs, no skin, no flesh, no face, a rusty dented helmet, holding a chipped sword and a cracked wooden shield, dynamic battle-ready stance, three-quarter side view facing left, whole figure visible from head to toe, centered. isolated on a plain flat solid pure white background, no shadow, no ground, no text, no border
```


</details>

<details><summary>SD 15건 — 프롬프트 원문</summary>


**13:20:05 · leon · 768×768 · seed 1988464357 · 채택**

```text
1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors. Chibi super-deformed cute game sprite of a young man, 17 years old, short spiky crimson red hair, determined amber eyes, blue tunic under a light silver breastplate, red cape, leather gloves, holding a longsword, big head and small body, full body standing, front view, centered, small in the frame. isolated on a plain flat solid pure white background, no shadow, no ground, no text, no border
```

**13:20:18 · sera · 768×768 · seed 288143521 · 채택**

```text
1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors. Chibi super-deformed cute game sprite of a young woman, long wavy blonde hair, gentle blue eyes, white and gold priestess robe with a blue sash, small silver circlet, holding a wooden staff topped with a blue crystal, big head and small body, full body standing, front view, centered, small in the frame. isolated on a plain flat solid pure white background, no shadow, no ground, no text, no border
```

**13:20:52 · volk · 768×768 · seed 535894916 · 채택**

```text
1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors. Chibi super-deformed cute game sprite of a big muscular middle-aged man, thick brown beard, scar across his nose, iron helmet with small horns, heavy dark iron plate armor, fur mantle, wielding a huge double-bladed battle axe, big head and small body, full body standing, front view, centered, small in the frame. isolated on a plain flat solid pure white background, no shadow, no ground, no text, no border
```

**13:21:06 · kain · 768×768 · seed 973191430 · 채택**

```text
1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors. Chibi super-deformed cute game sprite of a handsome knight, 25 years old, short black hair, calm grey eyes, dark blue full plate armor with gold trim, white tabard with a faded dragon crest, holding a long lance, riding a white warhorse, big head and small body, full body standing, front view, centered, small in the frame. isolated on a plain flat solid pure white background, no shadow, no ground, no text, no border
```

**13:21:20 · mia · 768×768 · seed 2030945953 · 채택**

```text
1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors. Chibi super-deformed cute game sprite of a energetic girl, 16 years old, short bob green hair, bright green eyes, green leather hunter outfit, brown hooded cloak, quiver on her back, holding a wooden longbow, big head and small body, full body standing, front view, centered, small in the frame. isolated on a plain flat solid pure white background, no shadow, no ground, no text, no border
```

**13:21:33 · lucian · 768×768 · seed 289760754 · 채택**

```text
1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors. Chibi super-deformed cute game sprite of a slender young man, 22 years old, long straight silver hair, sharp violet eyes, deep purple mage robe with gold embroidery, holding an open glowing spellbook, a small floating orb of fire, big head and small body, full body standing, front view, centered, small in the frame. isolated on a plain flat solid pure white background, no shadow, no ground, no text, no border
```

**13:21:50 · gardo · 768×768 · seed 1228570322 · 채택**

```text
1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors. Chibi super-deformed cute game sprite of a brutal bandit leader, bald head with tattoos, black eyepatch, scarred face, crude leather and fur armor, spiked shoulder pad, holding a large rusty cleaver axe, big head and small body, full body standing, front view, centered, small in the frame. isolated on a plain flat solid pure white background, no shadow, no ground, no text, no border
```

**13:22:04 · zeon · 768×768 · seed 66553510 · 채택**

```text
1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors. Chibi super-deformed cute game sprite of a imposing dark knight, full black spiked plate armor with red glowing accents, black horned helmet with red eyes glowing through the visor, tattered dark red cape, holding a massive black greatsword, big head and small body, full body standing, front view, centered, small in the frame. isolated on a plain flat solid pure white background, no shadow, no ground, no text, no border
```

**13:22:17 · bandit · 768×768 · seed 1898319164 · 채택**

```text
1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors. Chibi super-deformed cute game sprite of a scruffy bandit, messy hair, bandana, torn leather vest, holding a hand axe, big head and small body, full body standing, front view, centered, small in the frame. isolated on a plain flat solid pure white background, no shadow, no ground, no text, no border
```

**13:22:31 · wolf · 768×768 · seed 1509687388 · 채택**

```text
1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors. Chibi cute small game sprite of a fierce grey wild wolf, bared fangs, bristling fur, full body, front three-quarter view, centered, small in the frame. isolated on a plain flat solid pure white background, no shadow, no ground, no text, no border
```

**13:22:44 · soldier · 768×768 · seed 288170861 · 채택**

```text
1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors. Chibi super-deformed cute game sprite of a imperial soldier, black steel helmet with face guard, black and red uniform with chainmail, holding a spear and a small round shield, big head and small body, full body standing, front view, centered, small in the frame. isolated on a plain flat solid pure white background, no shadow, no ground, no text, no border
```

**13:22:58 · e_archer · 768×768 · seed 2096420088 · 채택**

```text
1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors. Chibi super-deformed cute game sprite of a imperial archer, black leather hood, red scarf over mouth, black and red light armor, holding a crossbow, big head and small body, full body standing, front view, centered, small in the frame. isolated on a plain flat solid pure white background, no shadow, no ground, no text, no border
```

**13:23:11 · dark_mage · 768×768 · seed 1252040657 · 채택**

```text
1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors. Chibi super-deformed cute game sprite of a sinister dark sorcerer, black hooded robe with purple runes, pale face, glowing purple eyes, holding a twisted staff with a purple flame, big head and small body, full body standing, front view, centered, small in the frame. isolated on a plain flat solid pure white background, no shadow, no ground, no text, no border
```

**13:23:24 · skeleton · 768×768 · seed 16037869 · 교체됨 — 재생성**

```text
1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors. Chibi super-deformed cute game sprite of a undead skeleton warrior, rusty helmet, broken rusty armor pieces, holding a chipped sword and a cracked wooden shield, glowing blue eye sockets, big head and small body, full body standing, front view, centered, small in the frame. isolated on a plain flat solid pure white background, no shadow, no ground, no text, no border
```

**13:28:54 · skeleton · 768×768 · seed 16037869 · 채택**

```text
1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors. Chibi super-deformed cute game sprite of a undead skeleton warrior made only of bare white bones, a grinning bare skull head with glowing blue eye sockets, visible ribcage and bony arms and legs, no skin, no flesh, no face, a rusty dented helmet, holding a chipped sword and a cracked wooden shield, big head and small body, full body standing, front view, centered, small in the frame. isolated on a plain flat solid pure white background, no shadow, no ground, no text, no border
```


</details>

<details><summary>배경 8건 — 프롬프트 원문</summary>


**13:23:28 · title · 1344×768 · seed 571683409 · 채택**

```text
1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors, painted background art, no characters, no people, no text. epic fantasy landscape, a huge crimson dragon flying over a grey ruined castle on a cliff at sunset, dramatic golden clouds, title screen key art
```

**13:23:35 · camp · 1344×768 · seed 938842281 · 채택**

```text
1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors, painted background art, no characters, no people, no text. a fantasy travellers camp at night in a forest clearing, two tents, a warm campfire, starry sky, peaceful mood
```

**13:23:42 · scene_ch1 · 1344×768 · seed 1894304027 · 채택**

```text
1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors, painted background art, no characters, no people, no text. a medieval fantasy village burning at dawn, thatched houses on fire, smoke, orange sky, wide shot
```

**13:23:49 · scene_ch2 · 1344×768 · seed 1776392353 · 채택**

```text
1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors, painted background art, no characters, no people, no text. a dark deep ancient forest, huge twisted trees, shafts of pale light, mist, wide shot
```

**13:23:56 · scene_ch3 · 1344×768 · seed 518432823 · 채택**

```text
1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors, painted background art, no characters, no people, no text. the gate of a massive grey ruined stone fortress at dusk, crumbling towers, ominous purple sky, wide shot
```

**13:24:02 · battle_field · 1344×768 · seed 2037292601 · 채택**

```text
1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors, painted background art, no characters, no people, no text. side view of a grassy meadow battlefield, green grass ground in the lower third, distant hills and blue sky with clouds, flat horizon
```

**13:24:09 · battle_forest · 1344×768 · seed 315267489 · 채택**

```text
1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors, painted background art, no characters, no people, no text. side view of a forest battlefield, mossy ground in the lower third, dense trees in the background, dappled light, flat horizon
```

**13:24:15 · battle_castle · 1344×768 · seed 2139436605 · 채택**

```text
1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors, painted background art, no characters, no people, no text. side view inside a dark ruined castle throne hall, grey stone floor in the lower third, stone pillars and torches in the background
```


</details>

<details><summary>타일 재질 6건 — 프롬프트 원문</summary>


**13:20:22 · grass · 512×512 · seed 1804693988 · 채택**

```text
short lush green grass field with tiny flowers, seamless tileable top-down texture for a 2D strategy game map, orthographic view directly from above, evenly lit, no objects, no shadow, no text
```

**13:24:22 · dirt · 512×512 · seed 134698827 · 채택**

```text
packed light brown dirt road with small pebbles, seamless tileable top-down texture for a 2D strategy game map, orthographic view directly from above, evenly lit, no objects, no shadow, no text
```

**13:24:24 · water · 512×512 · seed 951057101 · 채택**

```text
clear blue lake water with gentle ripples, seamless tileable top-down texture for a 2D strategy game map, orthographic view directly from above, evenly lit, no objects, no shadow, no text
```

**13:24:27 · floor · 512×512 · seed 2111387705 · 채택**

```text
old grey stone brick castle floor tiles, seamless tileable top-down texture for a 2D strategy game map, orthographic view directly from above, evenly lit, no objects, no shadow, no text
```

**13:24:29 · wall · 512×512 · seed 60119307 · 채택**

```text
dark grey rough castle stone wall top, large blocks, seamless tileable top-down texture for a 2D strategy game map, orthographic view directly from above, evenly lit, no objects, no shadow, no text
```

**13:24:31 · carpet · 512×512 · seed 1120252163 · 채택 — 가운데만 잘라 씀**

```text
royal red carpet with golden embroidered border pattern, seamless tileable top-down texture for a 2D strategy game map, orthographic view directly from above, evenly lit, no objects, no shadow, no text
```


</details>

<details><summary>타일 오브젝트 7건 — 프롬프트 원문</summary>


**13:20:25 · tree · 768×768 · seed 1408860672 · 교체됨 — 재생성**

```text
a cluster of round dark green leafy trees. 1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors. Single 2D strategy game map object seen from a high top-down angle, centered, fills most of the frame. isolated on a plain flat solid pure white background, no shadow, no ground, no text, no border
```

**13:24:33 · tree · 768×768 · seed 1408860672 · 채택**

```text
one single round dark green leafy oak tree with a short brown trunk. 1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors. Single 2D strategy game map object seen from a high top-down angle, centered, fills most of the frame. isolated on a plain flat solid pure white background, no shadow, no ground, no text, no border
```

**13:24:37 · mountain · 768×768 · seed 1003956097 · 채택**

```text
a rocky grey mountain peak with a little snow. 1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors. Single 2D strategy game map object seen from a high top-down angle, centered, fills most of the frame. isolated on a plain flat solid pure white background, no shadow, no ground, no text, no border
```

**13:24:41 · house · 768×768 · seed 1758748862 · 채택**

```text
a small medieval cottage with a red tiled roof and wooden walls. 1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors. Single 2D strategy game map object seen from a high top-down angle, centered, fills most of the frame. isolated on a plain flat solid pure white background, no shadow, no ground, no text, no border
```

**13:24:45 · chest · 768×768 · seed 1950739092 · 채택**

```text
a closed wooden treasure chest with gold trim. 1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors. Single 2D strategy game map object seen from a high top-down angle, centered, fills most of the frame. isolated on a plain flat solid pure white background, no shadow, no ground, no text, no border
```

**13:24:49 · pillar · 768×768 · seed 2130377084 · 미사용 — 절차적으로 그림**

```text
a round grey stone castle pillar seen from above. 1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors. Single 2D strategy game map object seen from a high top-down angle, centered, fills most of the frame. isolated on a plain flat solid pure white background, no shadow, no ground, no text, no border
```

**13:24:53 · throne · 768×768 · seed 1858114855 · 채택**

```text
an ornate golden royal throne with red cushion. 1990s Taiwanese fantasy strategy RPG game art, anime style illustration, clean bold lineart, cel shading, vibrant saturated colors. Single 2D strategy game map object seen from a high top-down angle, centered, fills most of the frame. isolated on a plain flat solid pure white background, no shadow, no ground, no text, no border
```


</details>


## 3. ACE-Step 1.5 — BGM (26건)

후보 18곡은 곡당 2변형 × 3시드다. 변형 A 는 가사 `[instrumental]`, 변형 B 는 섹션 태그만 넣은 가사. 지표: 8kHz↑ = 날카로운 고역 비율(처음 battle 4.45%), 평탄도는 참고용(타악기도 높게 나온다), 반복도는 상대값.

| 서버 시작 | ID | 길이 | BPM | 조성 | 시드 | 가사 | 서버 실행 | 클라이언트 | 상태 | 8kHz↑ | 평탄도 | 반복도 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 13:25:43 | title | 75초 | 96 | D major | 2000 | [instrumental] | 37.0초 ⟳ | 37.4초 | 채택 | - | - | - |
| 13:26:20 | battle | 90초 | 140 | A minor | 2001 | [instrumental] | 13.9초 | 14.2초 | 교체됨 — 후보로 바꿈 | - | - | - |
| 13:26:35 | enemy | 60초 | 132 | E minor | 2000 | [instrumental] | 9.5초 | 10.1초 | 채택 | - | - | - |
| 13:26:45 | boss | 90초 | 150 | C minor | 1999 | [instrumental] | 15.8초 | 16.1초 | 교체됨 — 후보로 바꿈 | - | - | - |
| 13:27:01 | camp | 60초 | 80 | G major | 1999 | [instrumental] | 10.3초 | 11.1초 | 채택 | - | - | - |
| 13:27:12 | story | 60초 | 72 | F major | 2000 | [instrumental] | 11.3초 | 12.1초 | 채택 | - | - | - |
| 13:27:24 | victory | 20초 | 120 | C major | 2002 | [instrumental] | 3.6초 | 4.1초 | 채택 | - | - | - |
| 13:27:28 | gameover | 25초 | 60 | D minor | 2003 | [instrumental] | 4.6초 | 5.1초 | 채택 | - | - | - |
| 22:30:37 | battle-A-7065 | 150초 | 128 | D minor | 7065 | [instrumental] | 90.4초 ⟳ | 93.2초 | 미채택 후보 | 0.58% | 0.299 | 0.967 |
| 22:32:11 | battle-A-7165 | 150초 | 128 | D minor | 7165 | [instrumental] | 41.9초 | 42.4초 | 미채택 후보 | 0.6% | 0.194 | 0.876 |
| 22:32:54 | battle-A-7265 | 150초 | 128 | D minor | 7265 | [instrumental] | 48.0초 | 48.5초 | 미채택 후보 | 0.73% | 0.21 | 0.971 |
| 22:33:43 | battle-B-7066 | 150초 | 124 | E minor | 7066 | 섹션 태그 | 45.4초 | 46.2초 | 미채택 후보 | 0.1% | 0.219 | 0.962 |
| 22:34:29 | battle-B-7166 | 150초 | 124 | E minor | 7166 | 섹션 태그 | 46.5초 | 47.3초 | 미채택 후보 | 0.15% | 0.239 | 0.957 |
| 22:35:17 | battle-B-7266 | 150초 | 124 | E minor | 7266 | 섹션 태그 | 46.8초 | 47.3초 | 채택 | 0.52% | 0.188 | 0.922 |
| 22:36:05 | enemy-A-7065 | 150초 | 112 | C minor | 7065 | [instrumental] | 46.3초 | 47.2초 | 미채택 후보 | 2.16% | 0.35 | 0.914 |
| 22:36:53 | enemy-A-7165 | 150초 | 112 | C minor | 7165 | [instrumental] | 44.0초 | 44.4초 | 미채택 후보 | 0.42% | 0.311 | 0.969 |
| 22:37:38 | enemy-A-7265 | 150초 | 112 | C minor | 7265 | [instrumental] | 45.1초 | 46.2초 | 미채택 후보 | 1.07% | 0.294 | 0.969 |
| 22:38:25 | enemy-B-7066 | 150초 | 108 | A minor | 7066 | 섹션 태그 | 48.3초 | 49.3초 | 미채택 후보 | 0.11% | 0.211 | 0.964 |
| 22:39:15 | enemy-B-7166 | 150초 | 108 | A minor | 7166 | 섹션 태그 | 47.1초 | 47.5초 | 미채택 후보 | 3.08% | 0.27 | 0.934 |
| 22:40:03 | enemy-B-7266 | 150초 | 108 | A minor | 7266 | 섹션 태그 | 44.8초 | 45.2초 | 미채택 후보 | 0.05% | 0.275 | 0.678 |
| 22:40:49 | boss-A-7065 | 120초 | 150 | C minor | 7065 | [instrumental] | 41.1초 | 41.4초 | 미채택 후보 | 0.3% | 0.148 | 0.96 |
| 22:41:31 | boss-A-7165 | 120초 | 150 | C minor | 7165 | [instrumental] | 28.8초 | 29.2초 | 미채택 후보 | 0.72% | 0.167 | 0.931 |
| 22:42:01 | boss-A-7265 | 120초 | 150 | C minor | 7265 | [instrumental] | 28.7초 | 29.2초 | 채택 | 0.22% | 0.359 | 0.98 |
| 22:42:30 | boss-B-7066 | 120초 | 144 | C minor | 7066 | 섹션 태그 | 30.6초 | 31.2초 | 미채택 후보 | 6.27% | 0.323 | 0.918 |
| 22:43:02 | boss-B-7166 | 120초 | 144 | C minor | 7166 | 섹션 태그 | 34.5초 | 35.2초 | 미채택 후보 | 2.93% | 0.295 | 0.934 |
| 22:43:38 | boss-B-7266 | 120초 | 144 | C minor | 7266 | 섹션 태그 | 31.4초 | 32.2초 | 미채택 후보 | 2.5% | 0.263 | 0.903 |

<details><summary>BGM 프롬프트(tags) 원문 26건</summary>


**title** (채택)

```text
epic orchestral fantasy main theme, 1990s japanese rpg soundtrack, heroic french horns, sweeping strings, timpani, harp, noble and adventurous, instrumental
```

**battle** (교체됨 — 후보로 바꿈)

```text
1990s strategy rpg battle music, energetic retro synth orchestra, driving snare drums, bold brass melody, electric bass, tense but heroic, loopable, instrumental
```

**enemy** (채택)

```text
1990s rpg enemy turn music, ominous marching snare, low brass stabs, dark strings ostinato, threatening, loopable, instrumental
```

**boss** (교체됨 — 후보로 바꿈)

```text
intense dark fantasy boss battle music, pipe organ, choir, fast staccato strings, heavy drums, dramatic, loopable, instrumental
```

**camp** (채택)

```text
peaceful medieval campfire music, acoustic guitar, wooden flute, soft harp, warm and calm, 1990s rpg town theme, loopable, instrumental
```

**story** (채택)

```text
gentle emotional fantasy story theme, solo piano and strings, bittersweet, 1990s japanese rpg cutscene music, instrumental
```

**victory** (채택)

```text
short triumphant victory fanfare, bright brass and timpani, 1990s rpg battle won jingle, instrumental
```

**gameover** (채택)

```text
sad slow game over music, lonely piano, soft strings, melancholic, instrumental
```

**battle-A-7065** (미채택 후보)

```text
heroic western fantasy orchestral battle march, full symphony orchestra, driving string ostinato, bold french horn melody, trumpets, snare drum and timpani, cinematic European adventure film score, acoustic instruments, clean studio recording, instrumental
```

**battle-A-7165** (미채택 후보)

```text
heroic western fantasy orchestral battle march, full symphony orchestra, driving string ostinato, bold french horn melody, trumpets, snare drum and timpani, cinematic European adventure film score, acoustic instruments, clean studio recording, instrumental
```

**battle-A-7265** (미채택 후보)

```text
heroic western fantasy orchestral battle march, full symphony orchestra, driving string ostinato, bold french horn melody, trumpets, snare drum and timpani, cinematic European adventure film score, acoustic instruments, clean studio recording, instrumental
```

**battle-B-7066** (미채택 후보)

```text
medieval European folk orchestra battle theme, acoustic strings, oboe and flute melody, french horns, frame drums and tambourine, energetic and brave, celtic fantasy adventure, acoustic instruments, clean studio recording, instrumental
```

**battle-B-7166** (미채택 후보)

```text
medieval European folk orchestra battle theme, acoustic strings, oboe and flute melody, french horns, frame drums and tambourine, energetic and brave, celtic fantasy adventure, acoustic instruments, clean studio recording, instrumental
```

**battle-B-7266** (채택)

```text
medieval European folk orchestra battle theme, acoustic strings, oboe and flute melody, french horns, frame drums and tambourine, energetic and brave, celtic fantasy adventure, acoustic instruments, clean studio recording, instrumental
```

**enemy-A-7065** (미채택 후보)

```text
tense dark orchestral march of an approaching army, low strings ostinato, muted brass stabs, war drums, timpani rolls, ominous European symphonic film score, acoustic instruments, clean studio recording, instrumental
```

**enemy-A-7165** (미채택 후보)

```text
tense dark orchestral march of an approaching army, low strings ostinato, muted brass stabs, war drums, timpani rolls, ominous European symphonic film score, acoustic instruments, clean studio recording, instrumental
```

**enemy-A-7265** (미채택 후보)

```text
tense dark orchestral march of an approaching army, low strings ostinato, muted brass stabs, war drums, timpani rolls, ominous European symphonic film score, acoustic instruments, clean studio recording, instrumental
```

**enemy-B-7066** (미채택 후보)

```text
suspenseful dark chamber orchestra, cellos and double basses ostinato, bassoon, low clarinet, orchestral bass drum, creeping menace, European film score, acoustic instruments, clean studio recording, instrumental
```

**enemy-B-7166** (미채택 후보)

```text
suspenseful dark chamber orchestra, cellos and double basses ostinato, bassoon, low clarinet, orchestral bass drum, creeping menace, European film score, acoustic instruments, clean studio recording, instrumental
```

**enemy-B-7266** (미채택 후보)

```text
suspenseful dark chamber orchestra, cellos and double basses ostinato, bassoon, low clarinet, orchestral bass drum, creeping menace, European film score, acoustic instruments, clean studio recording, instrumental
```

**boss-A-7065** (미채택 후보)

```text
epic dark gothic orchestral boss battle, full symphony orchestra, cathedral pipe organ, fast staccato strings, heavy timpani and cymbals, powerful brass, European dark fantasy film score, acoustic instruments, clean studio recording, instrumental
```

**boss-A-7165** (미채택 후보)

```text
epic dark gothic orchestral boss battle, full symphony orchestra, cathedral pipe organ, fast staccato strings, heavy timpani and cymbals, powerful brass, European dark fantasy film score, acoustic instruments, clean studio recording, instrumental
```

**boss-A-7265** (채택)

```text
epic dark gothic orchestral boss battle, full symphony orchestra, cathedral pipe organ, fast staccato strings, heavy timpani and cymbals, powerful brass, European dark fantasy film score, acoustic instruments, clean studio recording, instrumental
```

**boss-B-7066** (미채택 후보)

```text
epic dark gothic orchestral boss battle with choir, choir singing ahh, pipe organ, fast strings, heavy timpani, brass, European dark fantasy film score, acoustic instruments, clean studio recording, instrumental
```

**boss-B-7166** (미채택 후보)

```text
epic dark gothic orchestral boss battle with choir, choir singing ahh, pipe organ, fast strings, heavy timpani, brass, European dark fantasy film score, acoustic instruments, clean studio recording, instrumental
```

**boss-B-7266** (미채택 후보)

```text
epic dark gothic orchestral boss battle with choir, choir singing ahh, pipe organ, fast strings, heavy timpani, brass, European dark fantasy film score, acoustic instruments, clean studio recording, instrumental
```


</details>

<details><summary>변형 B 의 가사(섹션 태그)</summary>


```text
[Intro]

[Verse]

[Chorus]

[Bridge]

[Chorus]

[Outro]
```


</details>


## 이 목록에 넣지 않은 것

같은 날 같은 서비스에 다른 호출이 있었다. **이 작업의 것이 아니다.**

| 기록 시각 | 별칭 | 토큰(프롬프트/완성) | 지연 | 이 작업이 아닌 근거 |
| --- | --- | --- | --- | --- |
| 08:00:46 | market-commentary | 1591/546 | 13.8초 | 다른 앱의 시황 분석 별칭 |
| 12:00:44 | market-commentary | 1236/592 | 10.4초 | 다른 앱의 시황 분석 별칭 |
| 13:00:10 | gbrain-analyst | 341/19 | 2.6초 | 이 작업은 qwen 을 대사 생성에만 불렀다. 검색(`rag_search`)은 SearXNG 만 부르고 LLM 을 부르지 않는다 (`rag/mcp_server.py`) |
| 13:00:19 | gbrain-analyst | 1414/606 | 7.4초 | 이 작업은 qwen 을 대사 생성에만 불렀다. 검색(`rag_search`)은 SearXNG 만 부르고 LLM 을 부르지 않는다 (`rag/mcp_server.py`) |
| 13:01:09 | gbrain-analyst | 311/19 | 0.6초 | 이 작업은 qwen 을 대사 생성에만 불렀다. 검색(`rag_search`)은 SearXNG 만 부르고 LLM 을 부르지 않는다 (`rag/mcp_server.py`) |
| 13:01:14 | gbrain-analyst | 184/353 | 4.1초 | 이 작업은 qwen 을 대사 생성에만 불렀다. 검색(`rag_search`)은 SearXNG 만 부르고 LLM 을 부르지 않는다 (`rag/mcp_server.py`) |
| 13:01:48 | gbrain-analyst | 357/19 | 0.5초 | 이 작업은 qwen 을 대사 생성에만 불렀다. 검색(`rag_search`)은 SearXNG 만 부르고 LLM 을 부르지 않는다 (`rag/mcp_server.py`) |
| 13:01:57 | gbrain-analyst | 1207/290 | 3.7초 | 이 작업은 qwen 을 대사 생성에만 불렀다. 검색(`rag_search`)은 SearXNG 만 부르고 LLM 을 부르지 않는다 (`rag/mcp_server.py`) |
| 15:09:14 | gbrain-analyst | 554/19 | 9.0초 | 이 작업은 qwen 을 대사 생성에만 불렀다. 검색(`rag_search`)은 SearXNG 만 부르고 LLM 을 부르지 않는다 (`rag/mcp_server.py`) |
| 15:09:21 | gbrain-analyst | 1209/444 | 5.4초 | 이 작업은 qwen 을 대사 생성에만 불렀다. 검색(`rag_search`)은 SearXNG 만 부르고 LLM 을 부르지 않는다 (`rag/mcp_server.py`) |
| 18:00:39 | market-commentary | 1329/462 | 8.1초 | 다른 앱의 시황 분석 별칭 |
| 23:00:41 | market-commentary | 1287/602 | 10.1초 | 다른 앱의 시황 분석 별칭 |

- ComfyUI 의 같은 날 다른 작업 11건(07:25~): 오전의 음악 엔드포인트 종단 검증 (Phase 16)
- LLM 이 아닌 로컬 도구: SearXNG 웹 검색 5회 (`용의기사2 SRPG 고전게임` · `"용의 기사 2" 게임 시뮬레이션 RPG` · `용의기사2 전직 시스템 클래스 경험치 레벨업 마법 공략` · `Flame Dragon 2 Legend of Golden Castle gameplay classes promotion battle animation` · `kenney.nl impact sounds rpg audio CC0 footstep sword`), BGM 음질 측정(ComfyUI 컨테이너의 PyAV)

## 한계

- 클라이언트 소요에는 다운로드가 들어 있다. 순수 생성시간은 서버 실행 쪽을 본다
- 모델 교체 시간은 따로 재지 않았다. 교체 직후 작업(⟳)의 실행시간에 들어 있다
- qwen 1차 응답 원문은 남아 있지 않다. 대사 프롬프트 원문은 요청을 만든 코드(`gen_story.py`)로 재구성했다 — 요청에 쓴 `design.json` 의 대사 관련 항목은 그 뒤 바뀌지 않았다 (바뀐 것은 해골병 외형뿐이고 대사 프롬프트에 들어가지 않는다)
