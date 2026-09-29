// 전투 연출 — 공격하면 화면이 옆모습 전투 장면으로 바뀐다 (원작의 가장 큰 볼거리).
// 적은 왼쪽, 아군은 오른쪽. 스프라이트는 전부 왼쪽을 보도록 생성했으므로 왼쪽 편만 뒤집는다.
// 계산은 이미 끝나 있다(rules.js). 여기서는 그 결과를 보여 주기만 한다.
//
// 그림이 한 장뿐이라 포즈를 바꿀 수 없다. 움직임은 변형(이동·회전·찌그러짐) · 잔상 ·
// 카메라(확대·흔들림) · 파티클로 만든다. 무기마다 준비 → 타격 동작이 다르다 (MOVES).
// 타격감의 핵심은 히트스톱이다: 맞는 순간 화면을 70ms(필살 140ms) 멈춘다.
(function (FD) {
  const F = FD.Fight = {};
  const $ = FD.$;
  let skip = false;
  // 움직임을 줄여 달라는 설정이면 흔들림·확대·전체 번쩍임을 끈다. 숫자와 HP 변화는 남긴다
  const RM = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const wait = (ms) => (skip ? Promise.resolve() : FD.sleep(ms));
  const anim = (el, frames, opts) => {
    if (skip) return Promise.resolve();
    return el.animate(frames, { fill: 'forwards', easing: 'ease-out', ...opts }).finished.catch(() => {});
  };
  // 변형 한 줄. x·y 는 fighter 폭·높이 기준 %, r 은 도, 발밑이 회전 축이다(CSS transform-origin)
  const T = (x = 0, y = 0, r = 0, sx = 1, sy = 1) => ({ transform: `translate(${x}%, ${y}%) rotate(${r}deg) scale(${sx}, ${sy})` });
  const BASE = T();
  // 전투 캐릭터 요소. **잔상은 빼고 찾는다** - 잔상은 원본을 복제해 원본 앞에 끼워 넣으므로
  // '.fighter.right' 로 찾으면 잔상이 먼저 잡힌다. 2026-09-29: 반격이 빗나가 회피 잔상이 남은
  // 채로 연속 공격이 시작되면 잔상을 공격자로 잡았고, 그 잔상이 사라지며 예외 → 전투 화면이
  // 닫히지 않아 게임이 멈췄다 (1장 레온 대 산적에서 재현).
  const fighter = (side) => $(`.fight-cam > .fighter.${side}:not(.ghost)`);

  // ---- 파티클 (fx 캔버스) ------------------------------------------------
  const fx = { parts: [], running: false, ctx: null, freezeUntil: 0 };
  function fxLoop() {
    const c = fx.ctx;
    c.clearRect(0, 0, 1280, 720);
    const now = performance.now();
    const frozen = now < fx.freezeUntil;               // 히트스톱 동안 파티클도 멈춘다
    if (frozen) for (const p of fx.parts) p.t0 += 16;
    fx.parts = fx.parts.filter((p) => now - p.t0 < p.life);
    for (const p of fx.parts) {
      const k = Math.max(0, (now - p.t0) / p.life);
      if (!frozen) { p.x += p.vx; p.y += p.vy; p.vy += p.g || 0; p.vx *= p.drag || 1; p.vy *= p.drag || 1; }
      c.globalAlpha = Math.max(0, 1 - k) * (p.alpha || 1);
      c.globalCompositeOperation = p.add ? 'lighter' : 'source-over';
      c.strokeStyle = c.fillStyle = p.color;
      c.lineCap = 'round';
      if (p.kind === 'ring') {
        c.lineWidth = p.w * (1 - k) + 1;
        c.beginPath(); c.arc(p.x, p.y, Math.max(1, p.r + p.grow * k), 0, Math.PI * 2); c.stroke();
      } else if (p.kind === 'shock') {                  // 지면 충격파 - 납작한 타원
        const r = p.r + p.grow * k;
        c.lineWidth = p.w * (1 - k) + 1;
        c.beginPath(); c.ellipse(p.x, p.y, r, r * 0.22, 0, 0, Math.PI * 2); c.stroke();
      } else if (p.kind === 'bolt') {
        c.lineWidth = 6 * (1 - k) + 2; c.shadowColor = '#fff'; c.shadowBlur = 20;
        c.beginPath(); c.moveTo(p.pts[0][0], p.pts[0][1]); for (const q of p.pts) c.lineTo(q[0], q[1]); c.stroke(); c.shadowBlur = 0;
      } else if (p.kind === 'pillar') {
        const g = c.createLinearGradient(p.x - 60, 0, p.x + 60, 0);
        g.addColorStop(0, 'rgba(255,240,180,0)'); g.addColorStop(0.5, p.color); g.addColorStop(1, 'rgba(255,240,180,0)');
        c.fillStyle = g; c.fillRect(p.x - 60, 0, 120, p.y);
      } else if (p.kind === 'slash') {                  // 베기 호. dirA 로 도는 방향
        c.lineWidth = (p.w || 10) * (1 - k) + 2;
        const sweep = 2.2 * Math.min(1, k * 3) * (p.dirA || 1);
        c.beginPath(); c.arc(p.x, p.y, p.r, p.a0, p.a0 + sweep, sweep < 0); c.stroke();
      } else if (p.kind === 'claw') {                   // 발톱 자국 3줄
        const len = p.len * Math.min(1, k * 4);
        c.lineWidth = 7 * (1 - k) + 2;
        for (let i = -1; i <= 1; i++) {
          c.beginPath();
          c.moveTo(p.x + i * 22 - len * 0.5, p.y - len * 0.5 + i * 6);
          c.lineTo(p.x + i * 22 + len * 0.5, p.y + len * 0.5 + i * 6);
          c.stroke();
        }
      } else if (p.kind === 'spark' || p.kind === 'thrust') {   // 속도 방향으로 늘어진 선
        const sp = Math.hypot(p.vx, p.vy) || 1;
        const len = (p.len || 18) * (1 - k * 0.6);
        c.lineWidth = p.w || 2.5;
        c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - (p.vx / sp) * len, p.y - (p.vy / sp) * len); c.stroke();
      } else if (p.kind === 'dust') {                   // 흙먼지 - 커지며 옅어진다
        c.beginPath(); c.arc(p.x, p.y, p.size * (1 + k * 1.8), 0, Math.PI * 2); c.fill();
      } else if (p.kind === 'rune') {                   // 발밑 마법진
        const rot = (p.rot || 0) + k * 3;
        c.save(); c.translate(p.x, p.y); c.scale(1, 0.32); c.rotate(rot);
        c.lineWidth = 3;
        c.beginPath(); c.arc(0, 0, p.r, 0, Math.PI * 2); c.stroke();
        c.beginPath(); c.arc(0, 0, p.r * 0.72, 0, Math.PI * 2); c.stroke();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          c.beginPath(); c.moveTo(Math.cos(a) * p.r * 0.72, Math.sin(a) * p.r * 0.72); c.lineTo(Math.cos(a + 0.4) * p.r, Math.sin(a + 0.4) * p.r); c.stroke();
        }
        c.restore();
      } else {
        c.beginPath(); c.arc(p.x, p.y, Math.max(0.1, p.size * (p.shrink ? 1 - k : 1)), 0, Math.PI * 2); c.fill();
      }
    }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    if (fx.parts.length) requestAnimationFrame(fxLoop); else fx.running = false;
  }
  function emit(p) {
    fx.parts.push({ t0: performance.now(), life: 600, vx: 0, vy: 0, size: 4, color: '#fff', ...p });
    if (!fx.running) { fx.running = true; requestAnimationFrame(fxLoop); }
  }
  function burst(x, y, color, n = 24, speed = 9, opts = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random());
      emit({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, size: 3 + Math.random() * 5, color, life: 400 + Math.random() * 400, drag: 0.92, shrink: true, add: true, ...opts });
    }
  }
  // 한쪽으로 튀는 불꽃 선. dir: +1 오른쪽, -1 왼쪽
  function sparks(x, y, dir, color = '#fff6d0', n = 14, speed = 16) {
    for (let i = 0; i < n; i++) {
      const a = (Math.random() - 0.5) * 1.6 + (dir > 0 ? 0 : Math.PI);
      const s = speed * (0.5 + Math.random());
      emit({ kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 2, g: 0.5, drag: 0.9, len: 14 + Math.random() * 16, color, life: 260 + Math.random() * 220, add: true });
    }
  }
  function dust(x, y, n = 10) {
    for (let i = 0; i < n; i++) {
      emit({ kind: 'dust', x: x + (Math.random() - 0.5) * 120, y: y + (Math.random() - 0.5) * 16, vx: (Math.random() - 0.5) * 5, vy: -Math.random() * 2,
        size: 10 + Math.random() * 14, color: 'rgba(170,150,120,0.55)', life: 700 + Math.random() * 300, drag: 0.95 });
    }
  }
  async function projectile(from, to, color, ms = 360, size = 16) {
    if (skip) return;
    const t0 = performance.now();
    await new Promise((res) => {
      const step = (now) => {
        const k = Math.min(1, (now - t0) / ms);
        const x = from[0] + (to[0] - from[0]) * k, y = from[1] + (to[1] - from[1]) * k - Math.sin(k * Math.PI) * 40;
        emit({ x, y, size, color, life: 180, shrink: true, add: true });
        emit({ x: x + (Math.random() - 0.5) * 10, y: y + (Math.random() - 0.5) * 10, size: size / 2, color: '#fff', life: 120, add: true });
        if (k < 1) requestAnimationFrame(step); else res();
      };
      requestAnimationFrame(step);
    });
  }
  async function arrow(from, to) {
    if (skip) return;
    const t0 = performance.now(), ms = 220;
    await new Promise((res) => {
      const step = (now) => {
        const k = Math.min(1, (now - t0) / ms);
        const x = from[0] + (to[0] - from[0]) * k, y = from[1] + (to[1] - from[1]) * k - Math.sin(k * Math.PI) * 30;
        const vx = (to[0] - from[0]) / 12;
        emit({ kind: 'spark', x, y, vx, vy: 0, len: 34, w: 3, color: '#f5deb3', life: 70 });
        emit({ kind: 'spark', x: x - vx, y, vx, vy: 0, len: 22, w: 1.5, color: 'rgba(255,255,255,0.5)', life: 140 });
        if (k < 1) requestAnimationFrame(step); else res();
      };
      requestAnimationFrame(step);
    });
  }

  const POS = { left: [400, 470], right: [880, 470] };
  const GROUND = 640;

  async function effect(kind, at, from) {
    const [x, y] = at;
    if (kind === 'fire') {
      FD.sfx('fire');
      await projectile(from, at, '#ff7a1a', 380, 18);
      burst(x, y, '#ff9a2a', 44, 13); burst(x, y, '#ffe066', 22, 6);
      emit({ kind: 'ring', x, y, r: 10, grow: 160, w: 12, color: '#ffb347', life: 520, add: true });
      dust(x, GROUND, 8);
      camPunch(x, y, 1.05); camShake(10);
    } else if (kind === 'thunder') {
      FD.sfx('thunder');
      for (let b = 0; b < 3; b++) {
        const pts = [[x + (Math.random() - 0.5) * 80, 0]];
        for (let i = 1; i <= 8; i++) pts.push([x + (Math.random() - 0.5) * 70, (y * i) / 8]);
        emit({ kind: 'bolt', pts, color: b ? '#bcdcff' : '#f2f8ff', life: 380 + b * 80 });
      }
      burst(x, y, '#bde0ff', 34, 11);
      emit({ kind: 'shock', x, y: GROUND, r: 20, grow: 220, w: 10, color: '#bde0ff', life: 500, add: true });
      flashStage('#dff0ff'); camShake(14);
    } else if (kind === 'dark') {
      FD.sfx('dark');
      await projectile(from, at, '#9b4dff', 420, 20);
      for (let i = 0; i < 3; i++) emit({ kind: 'ring', x, y, r: 70 - i * 15, grow: -55, w: 8, color: '#b36bff', life: 500 + i * 100, add: true });
      burst(x, y, '#7a2cff', 30, 7);
      camShake(6);
    } else if (kind === 'holy') {
      FD.sfx('holy');
      emit({ kind: 'pillar', x, y: 720, color: 'rgba(255,245,200,0.95)', life: 700 });
      burst(x, y, '#fff6c0', 30, 8);
      emit({ kind: 'shock', x, y: GROUND, r: 30, grow: 140, w: 8, color: '#fff6c0', life: 600, add: true });
    } else if (kind === 'heal') {
      FD.sfx('heal');
      for (let i = 0; i < 36; i++) emit({ x: x + (Math.random() - 0.5) * 160, y: y + 120 - Math.random() * 60, vy: -2 - Math.random() * 3, size: 3 + Math.random() * 4, color: i % 2 ? '#7dffb0' : '#e0ffe8', life: 900, add: true, shrink: true });
      emit({ kind: 'ring', x, y: y + 60, r: 30, grow: 90, w: 6, color: '#7dffb0', life: 700, add: true });
    } else if (kind === 'slash') {
      FD.sfx('swing');
      await projectile(from, at, '#e8f6ff', 300, 12);
      emit({ kind: 'slash', x, y, r: 90, a0: -2.4, color: '#ffffff', life: 400, add: true });
      sparks(x, y, from[0] < x ? 1 : -1);
    }
  }

  // ---- 카메라 · 번쩍임 -----------------------------------------------------
  let lastFlash = 0;
  function flashStage(color = '#fff') {
    if (skip || RM) return;
    const now = performance.now();
    if (now - lastFlash < 300) return;                  // 광과민성 - 번쩍임 사이 간격
    lastFlash = now;
    $('.fight-stage').animate([{ boxShadow: `inset 0 0 0 2000px ${color}` }, { boxShadow: 'inset 0 0 0 2000px transparent' }], { duration: 240 });
  }
  function camPunch(x, y, scale = 1.06, ms = 300) {
    if (skip || RM) return;
    const cam = $('.fight-cam');
    cam.style.transformOrigin = `${(x / 1280) * 100}% ${(y / 720) * 100}%`;
    cam.animate([{ scale: '1' }, { scale: String(scale), offset: 0.25 }, { scale: '1' }], { duration: ms, easing: 'ease-out' });
  }
  function camShake(px, ms = 280) {
    if (skip || RM || px <= 0) return;
    const f = [];
    for (let i = 0; i < 8; i++) { const k = 1 - i / 8; f.push({ translate: `${(Math.random() - 0.5) * 2 * px * k}px ${(Math.random() - 0.5) * 2 * px * k}px` }); }
    f.push({ translate: '0px 0px' });
    $('.fight-cam').animate(f, { duration: ms });
  }
  async function hitstop(ms) {
    if (skip) return;
    fx.freezeUntil = performance.now() + ms;
    await FD.sleep(ms);
  }
  // 잔상: fighter 를 복제해 같은 동작을 조금씩 늦게 따라가게 한다
  function ghosts(el, frames, opts, n = 3) {
    if (skip || RM || !el || !el.parentNode) return;
    for (let i = 1; i <= n; i++) {
      const g = el.cloneNode(true);
      g.classList.add('ghost');
      g.style.opacity = String(0.42 / i);
      el.parentNode.insertBefore(g, el);
      const a = g.animate(frames, { fill: 'forwards', easing: 'ease-in', ...opts, delay: (opts.delay || 0) + i * 34 });
      a.finished.catch(() => {}).then(() => g.animate([{ opacity: 0.42 / i }, { opacity: 0 }], { duration: 140, fill: 'forwards' }).finished
        .catch(() => {}).then(() => g.remove()));
    }
  }

  // ---- 무기별 동작 ----------------------------------------------------------
  // windup: 준비 동작 / strike: 목표에 닿을 때까지 / hit: 적중 이펙트 / recover: 제자리로
  const MOVES = {
    sword: {
      windup: async (c) => { FD.sfx('draw'); await anim(c.A, [BASE, T(-c.dir * 5, 1, -c.dir * 3, 1.02, 0.95)], { duration: 150 }); },
      strike: async (c) => {
        const fr = [T(-c.dir * 5, 1, -c.dir * 3, 1.02, 0.95), T(c.dir * 26, 0, c.dir * 5)];
        FD.sfx('swing'); ghosts(c.A, fr, { duration: 170 }); await anim(c.A, fr, { duration: 170, easing: 'ease-in' });
      },
      hit: (c) => {
        const alt = c.idx % 2 ? -1 : 1;
        emit({ kind: 'slash', x: c.to[0], y: c.to[1], r: 85, a0: c.dir * alt > 0 ? -2.6 : 0.5, dirA: alt, color: c.s.crit ? '#fff3a0' : '#ffffff', life: 300, add: true });
        if (c.s.crit) emit({ kind: 'slash', x: c.to[0], y: c.to[1], r: 85, a0: c.dir * alt > 0 ? 0.5 : -2.6, dirA: -alt, color: '#ffe066', life: 340, add: true });
      },
      recover: (c) => anim(c.A, [T(c.dir * 26, 0, c.dir * 5), BASE], { duration: 260, delay: 60 }),
    },
    axe: {
      windup: async (c) => { await anim(c.A, [BASE, T(-c.dir * 4, 0, -c.dir * 14)], { duration: 220, easing: 'ease-in-out' }); },
      strike: async (c) => {
        const fr = [T(-c.dir * 4, 0, -c.dir * 14), T(c.dir * 24, 2, c.dir * 10, 1.03, 0.97)];
        FD.sfx('swing', { heavy: true }); ghosts(c.A, fr, { duration: 190 }, 2); await anim(c.A, fr, { duration: 190, easing: 'ease-in' });
      },
      hit: (c) => {
        emit({ kind: 'slash', x: c.to[0], y: c.to[1] + 20, r: 95, a0: -1.9, dirA: c.dir, w: 16, color: '#ffe2b0', life: 280, add: true });
        dust(c.to[0], GROUND, 12);
        emit({ kind: 'shock', x: c.to[0], y: GROUND, r: 20, grow: 180, w: 10, color: '#e8d2a8', life: 460 });
      },
      recover: (c) => anim(c.A, [T(c.dir * 24, 2, c.dir * 10, 1.03, 0.97), BASE], { duration: 320, delay: 80 }),
      shake: 1.6,
    },
    lance: {
      windup: async (c) => { await anim(c.A, [BASE, T(-c.dir * 8, 0, -c.dir * 2)], { duration: 140 }); },
      strike: async (c) => {
        const fr = [T(-c.dir * 8, 0, -c.dir * 2), T(c.dir * 30, 0, 0, 1.04, 0.98)];
        FD.sfx('swing');
        for (let i = 0; i < 10; i++) emit({ kind: 'thrust', x: c.from[0] + c.dir * (60 + Math.random() * 260), y: c.from[1] - 60 + Math.random() * 140, vx: c.dir * 40, vy: 0, len: 90, w: 2, color: 'rgba(255,255,255,0.65)', life: 180 });
        ghosts(c.A, fr, { duration: 120 }); await anim(c.A, fr, { duration: 120, easing: 'ease-in' });
      },
      hit: (c) => {
        emit({ kind: 'ring', x: c.to[0], y: c.to[1], r: 6, grow: 70, w: 8, color: '#ffffff', life: 260, add: true });
        sparks(c.to[0], c.to[1], c.dir, '#ffffff', 18, 22);
      },
      recover: (c) => anim(c.A, [T(c.dir * 30, 0, 0, 1.04, 0.98), BASE], { duration: 240, delay: 60 }),
    },
    fang: {
      windup: async (c) => { await anim(c.A, [BASE, T(-c.dir * 3, 4, 0, 1.06, 0.9)], { duration: 160 }); },
      strike: async (c) => {
        const fr = [T(-c.dir * 3, 4, 0, 1.06, 0.9), { ...T(c.dir * 14, -16, c.dir * 12), offset: 0.5 }, T(c.dir * 26, 0, c.dir * 4)];
        FD.sfx('swing'); ghosts(c.A, fr, { duration: 260 }, 2); await anim(c.A, fr, { duration: 260, easing: 'ease-in-out' });
      },
      hit: (c) => emit({ kind: 'claw', x: c.to[0], y: c.to[1], len: 150, color: '#ffffff', life: 360, add: true }),
      recover: (c) => anim(c.A, [T(c.dir * 26, 0, c.dir * 4), BASE], { duration: 300, delay: 60 }),
    },
    staff: {
      windup: async (c) => { await anim(c.A, [BASE, T(-c.dir * 3, -2, -c.dir * 8)], { duration: 140 }); },
      strike: async (c) => {
        const fr = [T(-c.dir * 3, -2, -c.dir * 8), T(c.dir * 22, 0, c.dir * 8)];
        FD.sfx('swing'); await anim(c.A, fr, { duration: 180, easing: 'ease-in' });
      },
      hit: (c) => burst(c.to[0], c.to[1], '#ffe066', 14, 7),
      recover: (c) => anim(c.A, [T(c.dir * 22, 0, c.dir * 8), BASE], { duration: 240, delay: 40 }),
    },
    bow: {
      windup: async (c) => { await anim(c.A, [BASE, T(-c.dir * 2, 0, 0, 0.94, 1.02)], { duration: 240, easing: 'ease-in' }); },
      strike: async (c) => {
        FD.sfx('arrow');
        anim(c.A, [T(-c.dir * 2, 0, 0, 0.94, 1.02), T(-c.dir * 5), BASE], { duration: 260 });
        await arrow(c.from, c.to);
      },
      hit: (c) => sparks(c.to[0], c.to[1], c.dir, '#f5deb3', 10, 12),
      recover: () => Promise.resolve(),
    },
    tome: {
      windup: async (c) => {
        emit({ kind: 'rune', x: c.from[0], y: GROUND - 10, r: 90, color: c.att.team === 'enemy' ? '#b36bff' : '#7cc4ff', life: 700, add: true });
        await anim(c.A, [{ filter: 'brightness(1)' }, { filter: 'brightness(1.7) drop-shadow(0 0 16px #9cf)' }], { duration: 300 });
      },
      strike: async (c) => {
        FD.sfx('dark');
        anim(c.A, [{ filter: 'brightness(1.7) drop-shadow(0 0 16px #9cf)' }, { filter: 'none' }], { duration: 300 });
        await projectile(c.from, c.to, c.att.team === 'enemy' ? '#9b4dff' : '#5ab0ff', 320, 14);
      },
      hit: (c) => { burst(c.to[0], c.to[1], c.att.team === 'enemy' ? '#c89bff' : '#9fd4ff', 26, 10); emit({ kind: 'ring', x: c.to[0], y: c.to[1], r: 10, grow: 90, w: 8, color: '#cfe6ff', life: 380, add: true }); },
      recover: () => Promise.resolve(),
    },
  };
  const weaponKind = (u) => (FD.isMagicWeapon(u) ? 'tome' : (MOVES[FD.weaponOf(u).type] ? FD.weaponOf(u).type : 'sword'));
  // 중갑·기마·보스는 약한 타격을 막아 낸다 - 연출만 다르고 계산은 같다
  const guards = (d, dmg) => dmg <= d.mhp * 0.12 && (['armor', 'horse'].includes(FD.moveTypeOf(d)) || d.boss);

  // ---- 무대 ----------------------------------------------------------------
  function bgFor(B, u) {
    const t = B.tiles[u.y][u.x];
    if (t === 'forest') return 'battle_forest';
    if (['floor', 'carpet', 'throne', 'door', 'chest', 'pillar', 'wall'].includes(t)) return 'battle_castle';
    return 'battle_field';
  }

  function setupSide(side, u, hp, mhp) {
    const f = fighter(side);
    const img = $('img', f);
    f.getAnimations().forEach((a) => a.cancel());   // 지난 전투의 fill:forwards 가 남지 않게
    const sp = FD.A.sprites[u.art];
    img.src = sp ? sp.src : (FD.A.portraits[u.art] || '');
    const faceLeft = !sp || sp.facing === 'left';
    const mustFaceRight = side === 'left';
    f.style.transform = 'none';
    f.style.opacity = '1';
    f.style.filter = 'none';
    img.style.transform = mustFaceRight === faceLeft ? 'scaleX(-1)' : 'none';
    f.classList.toggle('big', !!(sp && sp.w > sp.h * 1.05));
    const box = $(`.fbox.${side}`);
    box.classList.toggle('enemy', u.team === 'enemy');
    $('.fname', box).textContent = `${u.name}  Lv ${u.level}`;
    setHp(side, hp, mhp, true);
    return f;
  }

  // HP 막대: 초록 막대는 바로, 흰 잔상 막대는 조금 늦게 줄어든다 (얼마나 깎였는지 보이게)
  function setHp(side, hp, mhp, instant) {
    const box = $(`.fbox.${side}`);
    const i = $('.fhp i', box), b = $('.fhp b', box);
    const w = `${Math.max(0, (100 * hp) / mhp)}%`;
    const grow = parseFloat(i.style.width || '0') < (100 * hp) / mhp;
    i.style.transition = instant || skip ? 'none' : 'width 0.18s ease-out';
    b.style.transition = instant || skip || grow ? 'none' : 'width 0.45s ease-in 0.35s';
    i.style.width = w; b.style.width = w;
    i.className = hp / mhp > 0.5 ? '' : hp / mhp > 0.25 ? 'mid' : 'low';
    $('.fhpnum', box).textContent = `${hp} / ${mhp}`;
  }

  function popNumber(side, text, cls) {
    if (skip) return;
    const st = $('.fight-stage');
    const n = FD.el('div', 'fnum ' + (cls || ''), text);
    n.style.left = side === 'left' ? '31%' : '69%';
    st.appendChild(n);
    n.animate([{ transform: 'translate(-50%, 0) scale(0.5)', opacity: 0 }, { transform: 'translate(-50%, -36px) scale(1.35)', opacity: 1, offset: 0.2 },
      { transform: 'translate(-50%, -24px) scale(1)', opacity: 1, offset: 0.35 }, { transform: 'translate(-50%, -60px) scale(1)', opacity: 1, offset: 0.75 },
      { transform: 'translate(-50%, -80px) scale(1)', opacity: 0 }],
    { duration: 1050, easing: 'ease-out' }).finished.then(() => n.remove());
  }

  // 필살 컷인 - 초상화가 속도선과 함께 화면을 가로지른다
  async function cutIn(u, side) {
    if (skip) return;
    const ci = $('.cutin');
    const src = FD.A.portraits[u.art];
    $('img', ci).src = src || '';
    $('img', ci).style.display = src ? '' : 'none';
    $('.ci-name', ci).textContent = u.name;
    ci.classList.toggle('from-left', side === 'left');
    ci.classList.remove('hidden');
    FD.sfx('select');
    const dx = side === 'left' ? -1 : 1;
    await ci.animate([{ transform: `translateX(${dx * 110}%)`, opacity: 0 }, { transform: 'translateX(0)', opacity: 1, offset: 0.25 },
      { transform: `translateX(${-dx * 4}%)`, opacity: 1, offset: 0.8 }, { transform: `translateX(${-dx * 110}%)`, opacity: 0 }],
    { duration: RM ? 700 : 560, easing: 'ease-in-out' }).finished.catch(() => {});
    ci.classList.add('hidden');
  }

  function msg(text) { $('.fmsg').innerHTML = text; }

  async function open(B, left, right, anchor) {
    skip = !FD.settings.anim;
    const layer = $('#fight-layer');
    layer.getAnimations().forEach((a) => a.cancel());
    $('.fight-cam').getAnimations().forEach((a) => a.cancel());
    FD.$$('.fighter.ghost').forEach((g) => g.remove());
    $('.cutin').classList.add('hidden');
    $('.fbox.right').style.visibility = '';
    $('.fight-bg').style.backgroundImage = FD.A.bg[bgFor(B, anchor)] ? `url("${FD.A.bg[bgFor(B, anchor)]}")` : 'none';
    fx.ctx = fx.ctx || $('#fx').getContext('2d');
    $('.fexp').classList.add('hidden');
    $('.flevel').classList.add('hidden');
    $('.fbox.left').style.visibility = left ? '' : 'hidden';
    fighter('left').style.visibility = left ? '' : 'hidden';
    msg('');
    layer.classList.remove('hidden');
    const onSkip = () => { skip = true; };
    layer.addEventListener('pointerdown', onSkip);
    F._offSkip = () => layer.removeEventListener('pointerdown', onSkip);
    if (!skip) await anim(layer, [{ opacity: 0, transform: 'scale(1.06)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 260 });
  }

  async function close() {
    const layer = $('#fight-layer');
    await wait(350);
    if (!skip) await anim(layer, [{ opacity: 1 }, { opacity: 0 }], { duration: 220 });
    layer.classList.add('hidden');
    layer.style.opacity = '';
    F._offSkip && F._offSkip();
    fx.parts = [];
    FD.$$('.fighter.ghost').forEach((g) => g.remove());
  }

  // 한 번의 공격: 준비 → (필살 컷인) → 타격 → 적중/가드/회피 → 복귀
  // onImpact: 닿는 순간 부른다 - HP 막대가 숫자와 같은 순간에 줄어들게
  async function strikeAnim(attSide, defSide, att, def, s, idx, onImpact) {
    const A = fighter(attSide), D = fighter(defSide);
    const dir = attSide === 'left' ? 1 : -1;
    const c = { A, D, dir, att, def, s, idx, from: [POS[attSide][0], POS[attSide][1] - 30], to: [POS[defSide][0], POS[defSide][1] - 30] };
    const kind = weaponKind(att);
    const M = MOVES[kind];
    if (s.crit && s.hit) await cutIn(att, attSide);
    await M.windup(c);
    await M.strike(c);
    if (s.hit) {
      const guard = guards(def, s.dmg);
      const ratio = Math.min(1, s.dmg / def.mhp);
      M.hit(c);
      if (guard) {
        FD.sfx('guard');
        emit({ kind: 'ring', x: c.to[0] - dir * 30, y: c.to[1], r: 30, grow: 50, w: 10, color: '#9fd4ff', life: 320, add: true });
        sparks(c.to[0] - dir * 30, c.to[1], -dir, '#cfe9ff', 16, 14);
      } else {
        FD.sfx('hit', { weapon: kind, crit: s.crit });
        burst(c.to[0], c.to[1], s.crit ? '#ffe066' : '#ffffff', s.crit ? 34 : 16, s.crit ? 13 : 8);
        sparks(c.to[0], c.to[1], dir, s.crit ? '#ffe066' : '#fff6d0', s.crit ? 22 : 12);
      }
      if (s.crit) { flashStage('#fff'); popNumber(defSide, 'CRITICAL!', 'crit-label'); camPunch(c.to[0], c.to[1], 1.09, 360); }
      else if (!guard) camPunch(c.to[0], c.to[1], 1.035, 240);
      popNumber(defSide, s.dmg, s.crit ? 'crit' : guard ? 'guard' : '');
      onImpact && onImpact();
      await hitstop(s.crit ? 140 : 70);
      camShake((guard ? 3 : 6 + ratio * 26 + (s.crit ? 10 : 0)) * (M.shake || 1));
      const kb = guard ? 2 : FD.clamp(ratio * 40, 3, 11) * (s.crit ? 1.4 : 1);
      anim(D, [{ ...T(0), filter: guard ? 'brightness(1.8) saturate(0.4)' : 'brightness(3.5)' },
        { ...T(dir * kb, 0, dir * (guard ? 1 : 4)), filter: guard ? 'none' : 'sepia(1) saturate(5) hue-rotate(-30deg) brightness(0.9)', offset: 0.3 },
        { ...T(-dir * kb * 0.15), filter: 'none', offset: 0.7 }, { ...BASE, filter: 'none' }], { duration: 420 });
    } else {
      FD.sfx('miss');
      popNumber(defSide, 'MISS', 'miss');
      const fr = [BASE, { ...T(dir * 14, -3, -dir * 4), opacity: 0.75, offset: 0.4 }, { ...BASE, opacity: 1 }];
      ghosts(D, fr, { duration: 420, easing: 'ease-out' }, 2);
      anim(D, fr, { duration: 420 });
    }
    M.recover(c);
    await wait(380);
  }

  async function dieAnim(side) {
    FD.sfx('death');
    const f = fighter(side);
    const dir = side === 'left' ? -1 : 1;
    const [x] = POS[side];
    await anim(f, [{ filter: 'brightness(1)' }, { filter: 'brightness(4)' }], { duration: 90 });
    for (let i = 0; i < 26; i++) {
      emit({ x: x + (Math.random() - 0.5) * 180, y: GROUND - Math.random() * 300, vx: (Math.random() - 0.5) * 1.5, vy: -1.5 - Math.random() * 2.5,
        size: 2 + Math.random() * 3, color: i % 3 ? '#ffb46b' : '#9a9a9a', life: 900 + Math.random() * 500, add: i % 3 !== 0, shrink: true });
    }
    await anim(f, [{ ...BASE, opacity: 1, filter: 'brightness(4)' }, { ...T(0, 2, dir * 6, 1.02, 0.96), opacity: 1, filter: 'grayscale(0.6)', offset: 0.3 },
      { ...T(0, 8, dir * 12, 1.05, 0.8), opacity: 0, filter: 'grayscale(1) brightness(0.3)' }], { duration: 760, easing: 'ease-in' });
  }

  // 경험치 막대 → 레벨업 상자
  async function showExp(info) {
    if (!info || !info.amount) return;
    const box = $('.fexp');
    const i = $('.fexpbar i', box);
    box.classList.remove('hidden');
    $('b', box).textContent = `+${info.amount}`;
    i.style.transition = 'none';
    i.style.width = `${info.exp0}%`;
    await wait(80);
    const total = info.exp0 + info.amount;
    i.style.transition = skip ? 'none' : 'width 0.6s linear';
    i.style.width = `${Math.min(100, total)}%`;
    await wait(650);
    if (info.ups.length) {
      FD.sfx('levelup');
      i.style.transition = 'none';
      i.style.width = `${info.unit.exp}%`;
      const lv = $('.flevel');
      lv.innerHTML = info.ups.map((up) => FD.UI.levelUpHtml(info.unit, up)).join('');
      lv.classList.remove('hidden');
      skip = false;                                    // 레벨업은 건너뛰어도 보여 준다
      await Promise.race([FD.waitInput($('#fight-layer')), FD.sleep(2600)]);
    }
  }

  // 연출은 계산이 끝난 뒤의 표시일 뿐이다(HP·경험치는 battle.js 가 이미 반영했다). 그러니 연출
  // 도중 무슨 예외가 나도 게임을 멈추지 않는다: 기록하고, **전투 화면은 반드시 닫는다.**
  async function guarded(run) {
    try {
      await run();
    } catch (e) {
      console.error('[fight] 연출 오류 - 건너뛴다:', e);
    } finally {
      try { await close(); } catch (e) { console.error('[fight] close 오류:', e); }
      $('#fight-layer').classList.add('hidden');
    }
  }

  // ---- 공격 ------------------------------------------------------------
  F.playAttack = (B, res, snap, expInfo) => guarded(() => runAttack(B, res, snap, expInfo));
  F.playSpell = (B, res, snaps, expInfo) => guarded(() => runSpell(B, res, snaps, expInfo));

  async function runAttack(B, res, snap, expInfo) {
    const { a, d } = res;
    const aSide = a.team === 'enemy' ? 'left' : 'right';
    const dSide = aSide === 'left' ? 'right' : 'left';
    await open(B, true, true, d);
    setupSide(aSide, a, snap.a.hp, snap.a.mhp);
    setupSide(dSide, d, snap.d.hp, snap.d.mhp);
    const hp = { a: snap.a.hp, d: snap.d.hp };
    const side = { a: aSide, d: dSide };
    const unit = { a, d };
    let countered = false;
    for (const [idx, s] of res.strikes.entries()) {
      const other = s.who === 'a' ? 'd' : 'a';
      if (s.who === 'd' && !countered) {
        countered = true;
        popNumber(side.d, 'COUNTER!', 'counter-label');
        await wait(260);
      }
      msg(`${FD.esc(unit[s.who].name)}의 ${s.who === 'd' ? '반격' : '공격'}!`);
      hp[other] = s.hpAfter;
      await strikeAnim(side[s.who], side[other], unit[s.who], unit[other], s, idx,
        () => setHp(side[other], hp[other], snap[other].mhp));
      if (s.hit) msg(`${FD.esc(unit[other].name)}에게 <b>${s.dmg}</b>의 피해${s.crit ? ' — 필살!' : ''}`);
      else msg(`${FD.esc(unit[other].name)}이(가) 공격을 피했다`);
      await wait(240);
      if (hp[other] <= 0) {
        msg(`${FD.esc(unit[other].name)}이(가) 쓰러졌다!`);
        await dieAnim(side[other]);
        break;
      }
    }
    await showExp(expInfo);
  }

  // ---- 마법 ------------------------------------------------------------
  async function runSpell(B, res, snaps, expInfo) {
    const { caster, spell, effects } = res;
    const first = effects[0] && effects[0].t;
    const heal = spell.kind === 'heal';
    const cSide = caster.team === 'enemy' ? 'left' : 'right';
    const tSide = cSide === 'left' ? 'right' : 'left';
    const showTarget = first && first !== caster;
    await open(B, showTarget || cSide === 'left', true, first || caster);
    if (cSide === 'left' && !showTarget) $('.fbox.right').style.visibility = 'hidden';
    setupSide(cSide, caster, snaps[caster.uid].hp, snaps[caster.uid].mhp);
    if (showTarget) setupSide(tSide, first, snaps[first.uid].hp, snaps[first.uid].mhp);
    msg(`${FD.esc(caster.name)}의 <b>${spell.name}</b>!`);
    const C = fighter(cSide);
    emit({ kind: 'rune', x: POS[cSide][0], y: GROUND - 10, r: 100, color: heal ? '#8dffc0' : caster.team === 'enemy' ? '#b36bff' : '#7cc4ff', life: 900, add: true });
    await anim(C, [{ ...BASE, filter: 'brightness(1)' }, { ...T(0, -2, 0, 1.02, 1.02), filter: 'brightness(1.8) drop-shadow(0 0 18px #9cf)' }, { ...BASE, filter: 'brightness(1)' }], { duration: 560 });
    const targetPos = showTarget ? POS[tSide] : POS[cSide];
    await effect(spell.fx, [targetPos[0], targetPos[1] - 40], [POS[cSide][0], POS[cSide][1] - 40]);
    await wait(200);
    if (first) {
      const e = effects[0];
      const side = showTarget ? tSide : cSide;
      if (heal) { popNumber(side, `+${e.heal}`, 'heal'); setHp(side, snaps[first.uid].hp + e.heal, snaps[first.uid].mhp); }
      else {
        popNumber(side, e.dmg);
        await hitstop(70);
        const dir = side === 'left' ? -1 : 1;
        anim(fighter(side), [{ ...BASE, filter: 'brightness(4)' }, { ...T(dir * 6, 0, dir * 3), filter: 'none', offset: 0.35 }, { ...BASE, filter: 'none' }], { duration: 380 });
        setHp(side, Math.max(0, snaps[first.uid].hp - e.dmg), snaps[first.uid].mhp);
      }
      const extra = effects.length - 1;
      msg(heal ? `${FD.esc(first.name)}의 HP가 ${e.heal} 회복${extra ? ` (외 ${extra}명)` : ''}`
        : `${FD.esc(first.name)}에게 <b>${e.dmg}</b>의 피해${extra ? ` (외 ${extra}명)` : ''}`);
      await wait(600);
      if (!heal && snaps[first.uid].hp - e.dmg <= 0) { await dieAnim(showTarget ? tSide : cSide); }
    }
    await showExp(expInfo);
  }
})(window.FD);
