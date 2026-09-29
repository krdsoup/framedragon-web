// 소리 — BGM 은 ACE-Step 으로 만든 mp3, 효과음은 CC0 샘플(Kenney) + WebAudio 합성.
// 브라우저는 사용자 입력 전 자동 재생을 막는다. 막히면 첫 클릭 때 다시 튼다.
//
// BGM: 곡마다 <audio> 두 개를 번갈아 쓴다. 끝나기 XF 초 전에 다른 쪽을 처음부터 틀어
//      교차시키므로 루프 이음새가 덜 들린다. 곡을 바꿨다 돌아오면(아군 턴 ↔ 적 턴) 멈춘
//      자리부터 이어 튼다 - 같은 도입부를 턴마다 다시 듣지 않게.
// 효과음: FD.sfx(이름, 옵션). 샘플이 있으면 샘플, 없으면(file:// 이라 fetch 가 막히는 등)
//      예전 합성음으로 떨어진다. 모든 소리는 마스터 리미터를 지나 겹쳐도 깨지지 않는다.
(function (FD) {
  let ctx = null;
  let master = null;         // 효과음 마스터 (리미터 → 음량)
  let pending = null;

  function ac() {
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -12; comp.knee.value = 6; comp.ratio.value = 10;
        comp.attack.value = 0.003; comp.release.value = 0.2;
        master = ctx.createGain();
        master.gain.value = FD.settings.sfxVol;
        comp.connect(master).connect(ctx.destination);
        master.input = comp;
      } catch (e) { ctx = null; }
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  const out = () => master.input;

  // ---- BGM ---------------------------------------------------------------
  const XF = 2.5;                                  // 루프 교차 시간(초)
  const META = window.FD_BGM_META || {};           // { id: { gain } } - 곡 사이 음량 보정
  const decks = {};
  let cur = null;
  const level = (id) => FD.settings.bgm * ((META[id] && META[id].gain) || 1);

  // 음량을 서서히 바꾼다. 더 새로운 ramp 가 오면 이전 것은 그 자리에서 멈추고 false 를 준다
  function ramp(el, to, ms) {
    const tok = (el._tok = (el._tok || 0) + 1);
    return new Promise((res) => {
      const from = el.volume, t0 = performance.now();
      const step = (t) => {
        if (el._tok !== tok) { res(false); return; }
        const k = ms ? Math.min(1, (t - t0) / ms) : 1;
        el.volume = FD.clamp(from + (to - from) * k, 0, 1);
        if (k < 1) requestAnimationFrame(step); else res(true);
      };
      requestAnimationFrame(step);
    });
  }

  function deck(id, loop) {
    if (decks[id]) return decks[id];
    const src = FD.A.bgm[id];
    if (!src) return null;
    const d = { id, loop, i: 0, xf: false, els: [0, 1].map(() => { const a = new Audio(src); a.preload = 'auto'; a.volume = 0; return a; }) };
    d.els.forEach((el, k) => {
      el.addEventListener('timeupdate', () => tick(d, k));
      el.addEventListener('ended', () => { if (d.loop && k === d.i && cur === d.id) { el.currentTime = 0; el.play().catch(() => {}); } });
    });
    decks[id] = d;
    return d;
  }

  function tick(d, k) {
    if (!d.loop || d.xf || k !== d.i || cur !== d.id) return;
    const el = d.els[k];
    if (!el.duration || el.currentTime < el.duration - XF) return;
    d.xf = true;
    const nx = d.els[1 - k];
    nx.currentTime = 0; nx.volume = 0;
    nx.play().catch(() => {});
    d.i = 1 - k;
    ramp(nx, level(d.id), XF * 1000);
    ramp(el, 0, XF * 1000).then((done) => { if (done) { el.pause(); el.currentTime = 0; } d.xf = false; });
  }

  FD.bgm = {
    // resume: 전에 멈춘 자리부터. 턴 전환처럼 같은 곡으로 자주 돌아올 때 쓴다
    play(id, { loop = true, resume = false } = {}) {
      if (cur === id) return;
      const old = cur && decks[cur];
      cur = null;
      if (old) old.els.forEach((el) => ramp(el, 0, 700).then((done) => { if (done) el.pause(); }));
      const d = deck(id, loop);
      if (!d) return;
      d.loop = loop;
      cur = id;
      const el = d.els[d.i];
      if (!resume || !loop) el.currentTime = 0;
      const start = () => el.play().then(() => ramp(el, level(id), 900)).catch(() => { pending = start; });
      start();
    },
    stop() {
      const d = cur && decks[cur];
      cur = null;
      if (d) d.els.forEach((el) => ramp(el, 0, 500).then((done) => { if (done) el.pause(); }));
    },
    setVolume(v) {
      FD.settings.bgm = v;
      const d = cur && decks[cur];
      if (d) d.els[d.i].volume = level(cur);
    },
    get id() { return cur; },
    _decks: decks,               // 검증 스크립트용
  };

  // ---- 효과음 샘플 -------------------------------------------------------
  const SAMPLES = window.FD_SFX || {};
  const buffers = {};
  const last = {};
  const stats = { loaded: 0, failed: 0, started: false };
  async function loadSamples() {
    if (stats.started || !ac()) return;
    stats.started = true;
    await Promise.all(Object.entries(SAMPLES).map(async ([name, urls]) => {
      const list = [];
      for (const u of urls) {
        try {
          const r = await fetch(u);
          if (!r.ok) throw new Error(r.status);
          list.push(await ctx.decodeAudioData(await r.arrayBuffer()));
          stats.loaded++;
        } catch (e) { stats.failed++; }        // file:// 이면 여기로 온다 - 합성음이 대신한다
      }
      if (list.length) buffers[name] = list;
    }));
  }
  const has = (name) => !!buffers[name];

  // 샘플 하나 재생. 같은 것이 연달아 나오지 않게 고르고 피치를 조금 흔든다
  function samp(name, { vol = 1, rate = 1, jitter = 0.06, delay = 0 } = {}) {
    const list = buffers[name];
    if (!list || !ac()) return false;
    let i = Math.floor(Math.random() * list.length);
    if (list.length > 1 && i === last[name]) i = (i + 1) % list.length;
    last[name] = i;
    const src = ctx.createBufferSource();
    src.buffer = list[i];
    src.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * jitter);
    const g = ctx.createGain(); g.gain.value = vol;
    src.connect(g).connect(out());
    src.start(ctx.currentTime + delay);
    return true;
  }

  window.addEventListener('pointerdown', () => {
    ac();
    loadSamples();
    if (pending) { const p = pending; pending = null; p(); }
  });

  // ---- 합성 -------------------------------------------------------------
  function tone(freq, dur, { type = 'square', vol = 0.12, slide = 0, delay = 0 } = {}) {
    const c = ac(); if (!c) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out());
    o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, { vol = 0.25, freq = 1200, q = 0.8, delay = 0, sweepTo = 0 } = {}) {
    const c = ac(); if (!c) return;
    const t = c.currentTime + delay;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(out());
    src.start(t);
  }
  // 휘두르는 바람 소리 - 대역을 위로 쓸어 올린다
  const whoosh = (dur = 0.2, pitch = 1, vol = 0.22) => noise(dur, { vol, freq: 400 * pitch, sweepTo: 2600 * pitch, q: 1.2 });
  const thud = (vol = 0.4) => tone(75, 0.22, { type: 'sine', vol, slide: -35 });
  const boom = () => { tone(55, 0.5, { type: 'sine', vol: 0.4, slide: -22 }); noise(0.35, { vol: 0.25, freq: 180, q: 0.5 }); };
  // 활시위 - Karplus-Strong 로 한 번 튕긴다
  function pluck(freq = 190, dur = 0.45, vol = 0.22) {
    const c = ac(); if (!c) return;
    const n = Math.floor(c.sampleRate * dur), p = Math.floor(c.sampleRate / freq);
    const buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < p; i++) d[i] = Math.random() * 2 - 1;
    for (let i = p; i < n; i++) d[i] = 0.497 * (d[i - p] + d[i - p + 1]);
    const src = c.createBufferSource(); src.buffer = buf;
    const g = c.createGain(); g.gain.value = vol;
    src.connect(g).connect(out());
    src.start();
  }

  const SYNTH = {
    cursor: () => tone(880, 0.04, { vol: 0.05 }),
    select: () => { tone(660, 0.06, { vol: 0.08 }); tone(990, 0.08, { vol: 0.08, delay: 0.05 }); },
    cancel: () => tone(440, 0.1, { vol: 0.07, slide: -200 }),
    step: () => tone(200, 0.03, { vol: 0.03, type: 'triangle' }),
    swing: (o) => whoosh(o.heavy ? 0.3 : 0.18, o.heavy ? 0.75 : 1),
    slash: () => noise(0.18, { vol: 0.3, freq: 2500, q: 0.6 }),
    hit: (o) => { noise(0.12, { vol: 0.45, freq: 500 }); tone(120, 0.15, { type: 'sine', vol: 0.3, slide: -60 }); if (o.crit) boom(); },
    crit: () => { noise(0.25, { vol: 0.6, freq: 400 }); tone(90, 0.3, { type: 'sawtooth', vol: 0.2, slide: -50 }); },
    guard: () => { tone(1800, 0.3, { type: 'triangle', vol: 0.08 }); tone(2700, 0.2, { type: 'triangle', vol: 0.05 }); },
    miss: () => whoosh(0.22, 1.4, 0.18),
    arrow: () => { pluck(); whoosh(0.18, 1.6, 0.12); },
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

  // ---- 샘플을 섞은 효과음. 필요한 샘플이 없으면 false → 합성으로 떨어진다 ----------
  const STEP_BY_TERRAIN = {
    plain: 'step_grass', forest: 'step_grass', mountain: 'step_grass', house: 'step_grass',
    road: 'step_dirt', bridge: 'step_wood', carpet: 'step_carpet', throne: 'step_carpet',
    floor: 'step_stone', door: 'step_stone', chest: 'step_stone', pillar: 'step_stone',
  };
  const MIXED = {
    // 이동 한 칸. o.move: foot·armor·horse·beast, o.terrain: 밟은 칸의 지형
    step(o) {
      const m = o.move || 'foot';
      if (m === 'horse') return samp('hoof', { vol: 0.5, rate: 1.25, jitter: 0.1 });
      const name = m === 'beast' ? 'step_carpet' : (STEP_BY_TERRAIN[o.terrain] || 'step_grass');
      if (!has(name)) return false;
      samp(name, { vol: m === 'beast' ? 0.3 : 0.55, rate: m === 'beast' ? 1.3 : m === 'armor' ? 0.85 : 1 });
      if (m === 'armor') samp('armor', { vol: 0.2 });
      return true;
    },
    // 적중. o.weapon: sword·axe·lance·fang·staff·bow·tome, o.crit
    hit(o) {
      const w = o.weapon || 'sword';
      if (!has('punch')) return false;
      if (w === 'axe') { samp('chop', { vol: 0.75 }); samp('punch_heavy', { vol: 0.7 }); thud(0.35); }
      else if (w === 'sword' || w === 'lance') { samp('blade', { vol: 0.6 }); samp('punch', { vol: 0.55 }); }
      else if (w === 'bow') { samp('wood_hit', { vol: 0.65 }); samp('punch', { vol: 0.35 }); }
      else if (w === 'fang') { samp('soft', { vol: 0.8 }); noise(0.05, { vol: 0.25, freq: 3000, q: 2 }); }
      else if (w === 'staff') samp('wood_hit', { vol: 0.7, rate: 1.2 });
      else return false;                                   // 마도서는 합성 타격음
      if (o.crit) { samp('punch_heavy', { vol: 0.9, rate: 0.85 }); boom(); }
      return true;
    },
    crit(o) { return MIXED.hit({ ...o, crit: true }); },
    guard() { if (!samp('guard', { vol: 0.65 })) return false; tone(2200, 0.25, { type: 'triangle', vol: 0.03 }); return true; },
    miss() { if (!samp('cloth', { vol: 0.55 })) return false; whoosh(0.22, 1.3, 0.15); return true; },
    death() { SYNTH.death(); samp('fall', { vol: 0.8, delay: 0.25 }); return true; },
    draw() { return samp('draw', { vol: 0.45 }); },
    coins() { return samp('coins', { vol: 0.6 }) || (SYNTH.item(), true); },
    chest() { samp('creak', { vol: 0.6 }); SYNTH.item(); return true; },
  };

  FD.sfx = (name, opts) => {
    if (!FD.settings.sfx) return;
    const o = opts || {};
    try {
      if (MIXED[name] && MIXED[name](o)) return;
      if (SYNTH[name]) SYNTH[name](o);
    } catch (e) { /* 소리 때문에 게임을 멈추지 않는다 */ }
  };
  FD.sfx.setVolume = (v) => { FD.settings.sfxVol = v; if (master) master.gain.value = v; };
  FD.sfx.stats = stats;
  FD.sfx.load = loadSamples;
})(window.FD);
