// 전투 연출 — 공격하면 화면이 옆모습 전투 장면으로 바뀐다 (원작의 가장 큰 볼거리).
// 적은 왼쪽, 아군은 오른쪽. 스프라이트는 전부 왼쪽을 보도록 생성했으므로 왼쪽 편만 뒤집는다.
// 계산은 이미 끝나 있다(rules.js). 여기서는 그 결과를 보여 주기만 한다.
(function (FD) {
  const F = FD.Fight = {};
  const $ = FD.$;
  let skip = false;
  const wait = (ms) => (skip ? Promise.resolve() : FD.sleep(ms));
  const anim = (el, frames, opts) => {
    if (skip) return Promise.resolve();
    return el.animate(frames, { fill: 'forwards', easing: 'ease-out', ...opts }).finished.catch(() => {});
  };

  // ---- 파티클 (fx 캔버스) ------------------------------------------------
  const fx = { parts: [], running: false, ctx: null, flashes: [] };
  function fxLoop() {
    const c = fx.ctx;
    c.clearRect(0, 0, 1280, 720);
    const now = performance.now();
    fx.parts = fx.parts.filter((p) => now - p.t0 < p.life);
    for (const p of fx.parts) {
      const k = (now - p.t0) / p.life;
      p.x += p.vx; p.y += p.vy; p.vy += p.g || 0; p.vx *= p.drag || 1; p.vy *= p.drag || 1;
      c.globalAlpha = Math.max(0, 1 - k) * (p.alpha || 1);
      c.globalCompositeOperation = p.add ? 'lighter' : 'source-over';
      if (p.kind === 'ring') {
        c.strokeStyle = p.color; c.lineWidth = p.w * (1 - k) + 1;
        c.beginPath(); c.arc(p.x, p.y, p.r + p.grow * k, 0, Math.PI * 2); c.stroke();
      } else if (p.kind === 'bolt') {
        c.strokeStyle = p.color; c.lineWidth = 6 * (1 - k) + 2; c.shadowColor = '#fff'; c.shadowBlur = 20;
        c.beginPath(); c.moveTo(p.pts[0][0], p.pts[0][1]); for (const q of p.pts) c.lineTo(q[0], q[1]); c.stroke(); c.shadowBlur = 0;
      } else if (p.kind === 'pillar') {
        const g = c.createLinearGradient(p.x - 60, 0, p.x + 60, 0);
        g.addColorStop(0, 'rgba(255,240,180,0)'); g.addColorStop(0.5, p.color); g.addColorStop(1, 'rgba(255,240,180,0)');
        c.fillStyle = g; c.fillRect(p.x - 60, 0, 120, p.y);
      } else if (p.kind === 'slash') {
        c.strokeStyle = p.color; c.lineWidth = 10 * (1 - k) + 2; c.lineCap = 'round';
        c.beginPath(); c.arc(p.x, p.y, p.r, p.a0, p.a0 + 2.2 * Math.min(1, k * 3)); c.stroke();
      } else {
        c.fillStyle = p.color;
        c.beginPath(); c.arc(p.x, p.y, p.size * (p.shrink ? 1 - k : 1), 0, Math.PI * 2); c.fill();
      }
    }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    if (fx.parts.length || fx.keep) requestAnimationFrame(fxLoop); else fx.running = false;
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
    const t0 = performance.now(), ms = 260;
    await new Promise((res) => {
      const step = (now) => {
        const k = Math.min(1, (now - t0) / ms);
        const x = from[0] + (to[0] - from[0]) * k, y = from[1] + (to[1] - from[1]) * k - Math.sin(k * Math.PI) * 30;
        emit({ x, y, size: 3, color: '#f5deb3', life: 90 });
        if (k < 1) requestAnimationFrame(step); else res();
      };
      requestAnimationFrame(step);
    });
  }

  const POS = { left: [400, 470], right: [880, 470] };

  async function effect(kind, at, from) {
    const [x, y] = at;
    if (kind === 'fire') {
      FD.sfx('fire');
      await projectile(from, at, '#ff7a1a', 380, 18);
      burst(x, y, '#ff9a2a', 40, 12); burst(x, y, '#ffe066', 20, 6);
      emit({ kind: 'ring', x, y, r: 10, grow: 140, w: 10, color: '#ffb347', life: 500, add: true });
    } else if (kind === 'thunder') {
      FD.sfx('thunder');
      const pts = [[x + (Math.random() - 0.5) * 60, 0]];
      for (let i = 1; i <= 8; i++) pts.push([x + (Math.random() - 0.5) * 70, (y * i) / 8]);
      emit({ kind: 'bolt', pts, color: '#e8f4ff', life: 420 });
      burst(x, y, '#bde0ff', 30, 10);
      flashStage('#dff0ff');
    } else if (kind === 'dark') {
      FD.sfx('dark');
      await projectile(from, at, '#9b4dff', 420, 20);
      for (let i = 0; i < 3; i++) emit({ kind: 'ring', x, y, r: 60 - i * 15, grow: -50, w: 8, color: '#b36bff', life: 500 + i * 100, add: true });
      burst(x, y, '#7a2cff', 30, 7);
    } else if (kind === 'holy') {
      FD.sfx('holy');
      emit({ kind: 'pillar', x, y: 720, color: 'rgba(255,245,200,0.95)', life: 700 });
      burst(x, y, '#fff6c0', 30, 8);
    } else if (kind === 'heal') {
      FD.sfx('heal');
      for (let i = 0; i < 36; i++) emit({ x: x + (Math.random() - 0.5) * 160, y: y + 120 - Math.random() * 60, vy: -2 - Math.random() * 3, size: 3 + Math.random() * 4, color: i % 2 ? '#7dffb0' : '#e0ffe8', life: 900, add: true, shrink: true });
      emit({ kind: 'ring', x, y: y + 60, r: 30, grow: 90, w: 6, color: '#7dffb0', life: 700, add: true });
    } else if (kind === 'slash') {
      FD.sfx('slash');
      await projectile(from, at, '#e8f6ff', 300, 12);
      emit({ kind: 'slash', x, y, r: 90, a0: -2.4, color: '#ffffff', life: 400, add: true });
    }
  }

  function flashStage(color = '#fff') {
    if (skip) return;
    const st = $('.fight-stage');
    st.animate([{ boxShadow: `inset 0 0 0 2000px ${color}` }, { boxShadow: 'inset 0 0 0 2000px transparent' }], { duration: 260 });
  }

  function bgFor(B, u) {
    const t = B.tiles[u.y][u.x];
    if (t === 'forest') return 'battle_forest';
    if (['floor', 'carpet', 'throne', 'door', 'chest', 'pillar', 'wall'].includes(t)) return 'battle_castle';
    return 'battle_field';
  }

  function setupSide(side, u, hp, mhp) {
    const f = $(`.fighter.${side}`);
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

  function setHp(side, hp, mhp, instant) {
    const box = $(`.fbox.${side}`);
    const i = $('.fhp i', box);
    i.style.transition = instant || skip ? 'none' : 'width 0.45s ease-out';
    i.style.width = `${Math.max(0, (100 * hp) / mhp)}%`;
    i.className = hp / mhp > 0.5 ? '' : hp / mhp > 0.25 ? 'mid' : 'low';
    $('.fhpnum', box).textContent = `${hp} / ${mhp}`;
  }

  function popNumber(side, text, cls) {
    if (skip) return;
    const st = $('.fight-stage');
    const n = FD.el('div', 'fnum ' + (cls || ''), text);
    n.style.left = side === 'left' ? '31%' : '69%';
    st.appendChild(n);
    n.animate([{ transform: 'translate(-50%, 0) scale(0.6)', opacity: 0 }, { transform: 'translate(-50%, -30px) scale(1.25)', opacity: 1, offset: 0.25 },
      { transform: 'translate(-50%, -60px) scale(1)', opacity: 1, offset: 0.7 }, { transform: 'translate(-50%, -80px) scale(1)', opacity: 0 }],
    { duration: 1000, easing: 'ease-out' }).finished.then(() => n.remove());
  }

  function msg(text) { $('.fmsg').innerHTML = text; }

  async function open(B, left, right, anchor) {
    skip = !FD.settings.anim;
    const layer = $('#fight-layer');
    layer.getAnimations().forEach((a) => a.cancel());
    $('.fbox.right').style.visibility = '';
    $('.fight-bg').style.backgroundImage = FD.A.bg[bgFor(B, anchor)] ? `url("${FD.A.bg[bgFor(B, anchor)]}")` : 'none';
    fx.ctx = fx.ctx || $('#fx').getContext('2d');
    $('.fexp').classList.add('hidden');
    $('.flevel').classList.add('hidden');
    $('.fbox.left').style.visibility = left ? '' : 'hidden';
    $('.fighter.left').style.visibility = left ? '' : 'hidden';
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
  }

  async function strikeAnim(B, attSide, defSide, attacker, s, kind) {
    const A = $(`.fighter.${attSide}`), D = $(`.fighter.${defSide}`);
    const dir = attSide === 'left' ? 1 : -1;
    const from = [POS[attSide][0], POS[attSide][1] - 30], to = [POS[defSide][0], POS[defSide][1] - 30];
    if (kind === 'melee') {
      await anim(A, [{ transform: 'translateX(0)' }, { transform: `translateX(${dir * 26}%)` }], { duration: 200, easing: 'ease-in' });
      FD.sfx('slash');
      emit({ kind: 'slash', x: to[0], y: to[1], r: 80, a0: dir > 0 ? -2.6 : 0.4, color: s.crit ? '#fff3a0' : '#ffffff', life: 300, add: true });
    } else if (kind === 'bow') {
      await anim(A, [{ transform: 'translateX(0)' }, { transform: `translateX(${-dir * 3}%)` }], { duration: 120 });
      FD.sfx('arrow');
      await arrow(from, to);
    } else {
      emit({ kind: 'ring', x: from[0], y: from[1], r: 20, grow: 60, w: 6, color: '#c9a0ff', life: 400, add: true });
      await wait(150);
      FD.sfx('dark');
      await projectile(from, to, attacker.team === 'enemy' ? '#9b4dff' : '#5ab0ff', 340, 14);
    }
    if (s.hit) {
      FD.sfx(s.crit ? 'crit' : 'hit');
      burst(to[0], to[1], s.crit ? '#ffe066' : '#ffffff', s.crit ? 36 : 18, s.crit ? 13 : 8);
      if (s.crit) { flashStage('#fff'); popNumber(defSide, 'CRITICAL!', 'crit-label'); }
      popNumber(defSide, s.dmg, s.crit ? 'crit' : '');
      anim(D, [{ transform: 'translateX(0)', filter: 'brightness(4)' }, { transform: `translateX(${dir * 3}%)`, filter: 'brightness(1)' },
        { transform: `translateX(${-dir * 2}%)` }, { transform: 'translateX(0)' }], { duration: 320 });
    } else {
      FD.sfx('miss');
      popNumber(defSide, 'MISS', 'miss');
      anim(D, [{ transform: 'translateX(0)' }, { transform: `translateX(${dir * 12}%)`, opacity: 0.6 }, { transform: 'translateX(0)', opacity: 1 }], { duration: 380 });
    }
    if (kind === 'melee') anim(A, [{ transform: `translateX(${dir * 26}%)` }, { transform: 'translateX(0)' }], { duration: 260, delay: 120 });
    await wait(420);
  }

  function kindOf(u) {
    const t = FD.weaponOf(u).type;
    if (t === 'bow') return 'bow';
    if (FD.isMagicWeapon(u)) return 'magic';
    return 'melee';
  }

  async function dieAnim(side) {
    FD.sfx('death');
    const f = $(`.fighter.${side}`);
    await anim(f, [{ opacity: 1, filter: 'none' }, { opacity: 0, filter: 'grayscale(1) brightness(0.3)', transform: 'translateY(6%)' }], { duration: 650 });
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

  // ---- 공격 ------------------------------------------------------------
  F.playAttack = async (B, res, snap, expInfo) => {
    const { a, d } = res;
    const aSide = a.team === 'enemy' ? 'left' : 'right';
    const dSide = aSide === 'left' ? 'right' : 'left';
    await open(B, true, true, d);
    setupSide(aSide, a, snap.a.hp, snap.a.mhp);
    setupSide(dSide, d, snap.d.hp, snap.d.mhp);
    const hp = { a: snap.a.hp, d: snap.d.hp };
    const side = { a: aSide, d: dSide };
    const unit = { a, d };
    for (const s of res.strikes) {
      const other = s.who === 'a' ? 'd' : 'a';
      msg(`${FD.esc(unit[s.who].name)}의 ${s.who === 'd' ? '반격' : '공격'}!`);
      await strikeAnim(B, side[s.who], side[other], unit[s.who], s, kindOf(unit[s.who]));
      hp[other] = s.hpAfter;
      setHp(side[other], hp[other], snap[other].mhp);
      if (s.hit) msg(`${FD.esc(unit[other].name)}에게 <b>${s.dmg}</b>의 피해${s.crit ? ' — 필살!' : ''}`);
      else msg(`${FD.esc(unit[other].name)}이(가) 공격을 피했다`);
      await wait(260);
      if (hp[other] <= 0) {
        msg(`${FD.esc(unit[other].name)}이(가) 쓰러졌다!`);
        await dieAnim(side[other]);
        break;
      }
    }
    await showExp(expInfo);
    await close();
  };

  // ---- 마법 ------------------------------------------------------------
  F.playSpell = async (B, res, snaps, expInfo) => {
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
    const C = $(`.fighter.${cSide}`);
    await anim(C, [{ filter: 'brightness(1)' }, { filter: 'brightness(1.8) drop-shadow(0 0 18px #9cf)' }, { filter: 'brightness(1)' }], { duration: 500 });
    const targetPos = showTarget ? POS[tSide] : POS[cSide];
    await effect(spell.fx, [targetPos[0], targetPos[1] - 40], [POS[cSide][0], POS[cSide][1] - 40]);
    await wait(250);
    if (first) {
      const e = effects[0];
      const side = showTarget ? tSide : cSide;
      if (heal) { popNumber(side, `+${e.heal}`, 'heal'); setHp(side, snaps[first.uid].hp + e.heal, snaps[first.uid].mhp); }
      else {
        popNumber(side, e.dmg);
        anim($(`.fighter.${side}`), [{ filter: 'brightness(4)' }, { filter: 'brightness(1)' }], { duration: 300 });
        setHp(side, Math.max(0, snaps[first.uid].hp - e.dmg), snaps[first.uid].mhp);
      }
      const extra = effects.length - 1;
      msg(heal ? `${FD.esc(first.name)}의 HP가 ${e.heal} 회복${extra ? ` (외 ${extra}명)` : ''}`
        : `${FD.esc(first.name)}에게 <b>${e.dmg}</b>의 피해${extra ? ` (외 ${extra}명)` : ''}`);
      await wait(600);
      if (!heal && snaps[first.uid].hp - e.dmg <= 0) { await dieAnim(showTarget ? tSide : cSide); }
    }
    await showExp(expInfo);
    await close();
  };
})(window.FD);
