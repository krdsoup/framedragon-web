"""BGM 음질 지표 — ComfyUI 컨테이너의 PyAV 로 디코딩해 잰다.

호스트에는 ffmpeg 가 없고, PyAV 휠의 DLL 은 이 PC 의 스마트 앱 제어에 막힐 수 있다.
컨테이너(comfyui-eval)에는 PyAV·numpy 가 있어 **파일을 표준입력으로 흘려 넣고** 메모리에서만
디코딩한다 - 컨테이너 안에 아무것도 쓰지 않는다.

지표 (2026-09-29 기존 8곡으로 잡은 기준):
  hf     8kHz 이상 에너지 비율(%). **"깨지는 전자음" 판정은 이것만 쓴다.** 처음 battle 4.45%,
         어쿠스틱 프롬프트로 다시 만든 후보 대부분 0.1~0.7%
  flat   2~12kHz 스펙트럼 평탄도. 참고용이다 - 처음에는 이것으로 잡음을 가리려 했는데,
         스네어·심벌 같은 타악기도 높게 나와(어쿠스틱 교향악 후보도 0.19~0.35) 잡음과 구별하지
         못했다. 타악기 없는 조용한 곡은 0.04~0.07
  rms    평균 음량(dBFS). 곡 사이 음량 보정에 쓴다
  rep    4초 블록 스펙트럼의 평균 코사인 유사도. 상대 비교용 - 절대 기준이 없다
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

CONTAINER = "comfyui-eval"
NOISY_HF = 1.5

_SCRIPT = r"""
import sys, io, json, av, numpy as np
c = av.open(io.BytesIO(sys.stdin.buffer.read()))
s = c.streams.audio[0]; sr = s.rate
x = np.concatenate([fr.to_ndarray().mean(0) if fr.to_ndarray().ndim > 1 and fr.format.is_planar
                    else fr.to_ndarray().reshape(-1) for fr in c.decode(s)]).astype(np.float64)
n = 1 << 15; f = np.fft.rfftfreq(n, 1 / sr); hf = []; flat = []
for i in range(0, len(x) - n, n):
    P = np.abs(np.fft.rfft(x[i:i + n] * np.hanning(n))) ** 2 + 1e-12
    hf.append(P[f > 8000].sum() / P.sum())
    band = P[(f > 2000) & (f < 12000)]
    flat.append(np.exp(np.log(band).mean()) / band.mean())
b = int(sr * 4)
B = [np.log1p(np.abs(np.fft.rfft(x[i:i + b]))[:4000]) for i in range(0, len(x) - b, b)]
M = np.array([v / np.linalg.norm(v) for v in B]); S = M @ M.T
print(json.dumps({
    "seconds": round(len(x) / sr, 1),
    "peak": round(20 * np.log10(np.abs(x).max() + 1e-12), 1),
    "rms": round(20 * np.log10(np.sqrt((x ** 2).mean()) + 1e-12), 1),
    "flat": round(float(np.mean(flat)), 3),
    "hf": round(float(np.mean(hf)) * 100, 2),
    "rep": round(float(S[np.triu_indices(len(B), 1)].mean()), 3),
}))
"""


def measure(path: Path) -> dict:
    r = subprocess.run(["docker", "exec", "-i", CONTAINER, "python", "-c", _SCRIPT],
                       input=path.read_bytes(), capture_output=True, timeout=300)
    if r.returncode != 0:
        raise RuntimeError(f"측정 실패 {path.name}: {r.stderr.decode(errors='replace')[-400:]}")
    m = json.loads(r.stdout.decode().strip().splitlines()[-1])
    m["noisy"] = m["hf"] > NOISY_HF
    return m
