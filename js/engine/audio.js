// 소리 — BGM 은 ACE-Step 으로 만든 mp3, 효과음은 WebAudio 로 그 자리에서 합성한다.
// 브라우저는 사용자 입력 전 자동 재생을 막는다. 막히면 첫 클릭 때 다시 튼다.
(function (FD) {
  let current = null;       // { id, el }
  let pending = null;
  let ctx = null;

  function ac() {
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; }
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function fade(el, to, ms) {
    return new Promise((res) => {
      const from = el.volume;
      const t0 = performance.now();
      const step = (t) => {
        const k = Math.min(1, (t - t0) / ms);
        el.volume = FD.clamp(from + (to - from) * k, 0, 1);
        if (k < 1) requestAnimationFrame(step); else res();
      };
      requestAnimationFrame(step);
    });
  }

  FD.bgm = {
    play(id, { loop = true } = {}) {
      if (current && current.id === id) return;
      const src = FD.A.bgm[id];
      const old = current;
      current = null;
      if (old) fade(old.el, 0, 600).then(() => old.el.pause());
      if (!src) return;
      const el = new Audio(src);
      el.loop = loop;
      el.volume = 0;
      current = { id, el };
      const start = () => el.play().then(() => fade(el, FD.settings.bgm, 800)).catch(() => { pending = start; });
      start();
    },
    stop() {
      if (current) { const o = current; current = null; fade(o.el, 0, 500).then(() => o.el.pause()); }
    },
    setVolume(v) {
      FD.settings.bgm = v;
      if (current) current.el.volume = v;
    },
    get id() { return current && current.id; },
  };
  window.addEventListener('pointerdown', () => {
    ac();
    if (pending) { const p = pending; pending = null; p(); }
  });

  // ---- 효과음 합성 -------------------------------------------------------
  function tone(freq, dur, { type = 'square', vol = 0.12, slide = 0, delay = 0 } = {}) {
    const c = ac(); if (!c) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, { vol = 0.25, freq = 1200, q = 0.8, delay = 0 } = {}) {
    const c = ac(); if (!c) return;
    const t = c.currentTime + delay;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(c.destination);
    src.start(t);
  }

  const SFX = {
    cursor: () => tone(880, 0.04, { vol: 0.05 }),
    select: () => { tone(660, 0.06, { vol: 0.08 }); tone(990, 0.08, { vol: 0.08, delay: 0.05 }); },
    cancel: () => tone(440, 0.1, { vol: 0.07, slide: -200 }),
    step: () => tone(200, 0.03, { vol: 0.03, type: 'triangle' }),
    slash: () => noise(0.18, { vol: 0.3, freq: 2500, q: 0.6 }),
    hit: () => { noise(0.12, { vol: 0.45, freq: 500 }); tone(120, 0.15, { type: 'sine', vol: 0.3, slide: -60 }); },
    crit: () => { noise(0.25, { vol: 0.6, freq: 400 }); tone(90, 0.3, { type: 'sawtooth', vol: 0.2, slide: -50 }); },
    miss: () => noise(0.2, { vol: 0.15, freq: 4000, q: 2 }),
    arrow: () => tone(1400, 0.15, { type: 'triangle', vol: 0.08, slide: -900 }),
    fire: () => { noise(0.5, { vol: 0.35, freq: 700, q: 0.4 }); tone(300, 0.4, { type: 'sawtooth', vol: 0.06, slide: -200 }); },
    thunder: () => { noise(0.6, { vol: 0.6, freq: 300, q: 0.3 }); tone(60, 0.5, { type: 'sawtooth', vol: 0.15 }); },
    dark: () => { tone(220, 0.5, { type: 'sine', vol: 0.15, slide: -150 }); tone(233, 0.5, { type: 'sine', vol: 0.12, slide: -160 }); },
    holy: () => [0, 0.06, 0.12, 0.18].forEach((d, i) => tone(1046 + i * 262, 0.3, { type: 'sine', vol: 0.07, delay: d })),
    heal: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.25, { type: 'sine', vol: 0.08, delay: i * 0.07 })),
    levelup: () => [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(f, 0.16, { type: 'square', vol: 0.06, delay: i * 0.09 })),
    death: () => tone(300, 0.6, { type: 'sawtooth', vol: 0.1, slide: -250 }),
    item: () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.12, { type: 'triangle', vol: 0.08, delay: i * 0.06 })),
    phase: () => { tone(392, 0.15, { vol: 0.07 }); tone(523, 0.25, { vol: 0.07, delay: 0.12 }); },
  };
  FD.sfx = (name) => { if (FD.settings.sfx && SFX[name]) try { SFX[name](); } catch (e) { /* 무시 */ } };
})(window.FD);
