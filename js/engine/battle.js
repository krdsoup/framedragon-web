// 전투 진행 — 아군 턴의 입력 상태 기계, 적·우군 턴, 챕터 이벤트, 승패.
//
// 아군 턴 상태: idle → selected(이동 범위) → menu(행동) → target(공격·마법·도구 대상) → idle
// 취소(우클릭·X)는 한 단계씩 되돌린다. 이동 뒤 취소하면 원래 자리로 돌아간다.
(function (FD) {
  const Battle = FD.Battle = {};
  const UI = () => FD.UI;
  const Rn = () => FD.Render;
  let B = null;
  let S = null;              // 입력 상태
  let phaseDone = null;      // 아군 턴을 끝내는 resolve

  FD.test = FD.test || { auto: false };   // 자동 진행 (헤드리스 검증용)

  // ---- 준비 --------------------------------------------------------------
  function buildBattle(ch) {
    const legend = FD.R.legend;
    const tiles = ch.map.map((row) => [...row].map((c) => legend[c] || 'plain'));
    B = {
      chapter: ch, w: tiles[0].length, h: tiles.length, tiles, units: [], turn: 1, phase: 'player',
      hidden: { ...ch.hidden }, chests: { ...ch.chests }, opened: {}, fired: new Set(), result: null, gold: 0,
      bossBgm: false,
    };
    for (const k of ch.joinAtStart || []) FD.addHero(k);
    for (const [key, [x, y]] of Object.entries(ch.heroes)) {
      const h = FD.hero(key);
      if (!h || h.dead) continue;
      const u = FD.cloneUnit(h);
      u.hp = u.mhp; u.mp = u.mmp; u.x = x; u.y = y; u.done = false; u.team = 'player';
      B.units.push(u);
    }
    for (const spec of ch.units) {
      let u;
      if (spec.hero) {
        u = FD.makeHero(spec.hero);
        u.team = spec.team || 'ally'; u.ai = spec.ai; u.key = spec.key || spec.hero;
      } else u = FD.makeEnemy(spec);
      u.x = spec.x; u.y = spec.y;
      B.units.push(u);
    }
    return B;
  }

  function freeTileNear(x, y) {
    for (let r = 0; r < 6; r++) {
      for (const p of FD.tilesInRange(B, x, y, [r, r])) {
        const t = FD.terrainAt(B, p.x, p.y);
        if (t.cost.foot != null && !FD.unitAt(B, p.x, p.y)) return p;
      }
    }
    return { x, y };
  }

  const heroArt = () => {
    const srcs = [];
    for (const u of B.units) srcs.push(FD.A.chibi[u.art], FD.A.portraits[u.art], FD.A.sprites[u.art] && FD.A.sprites[u.art].src);
    for (const e of B.chapter.events) for (const a of e.actions) {
      if (a.join) srcs.push(FD.A.chibi[a.join], FD.A.sprites[a.join] && FD.A.sprites[a.join].src);
      for (const sp of a.spawn || []) srcs.push(FD.A.chibi[sp.id], FD.A.sprites[sp.id] && FD.A.sprites[sp.id].src);
    }
    return srcs;
  };

  // ---- 진행 --------------------------------------------------------------
  Battle.run = async (ch) => {
    buildBattle(ch);
    Battle.B = B;
    await FD.preload([...Object.values(FD.A.textures), ...Object.values(FD.A.objects), ...heroArt(),
      FD.A.bg.battle_field, FD.A.bg.battle_forest, FD.A.bg.battle_castle]);
    FD.UI.show('battle-screen');
    FD.$('#log').innerHTML = '';
    Rn().setBattle(B);
    Rn().cursor = { x: B.units[0].x, y: B.units[0].y, show: true };
    FD.bgm.play(ch.bgm || 'battle');
    bindInput();
    try {
      while (!B.result) {
        await phase('player');
        if (B.result) break;
        await phase('enemy');
        if (B.result) break;
        if (FD.living(B, 'ally').length) await phase('ally');
        if (B.result) break;
        B.turn++;
        if (B.turn > 60) B.result = 'defeat';    // 무한 루프 방지 (자동 진행)
      }
    } finally {
      unbindInput();
      Rn().over = {}; Rn().path = null;
    }
    return B.result;
  };

  async function phase(team) {
    B.phase = team;
    for (const u of FD.living(B, team)) u.done = false;
    UI().topbar(B);
    if (team === 'player') await fireEvents((e) => e.on === 'turn' && e.turn === B.turn);
    if (B.result) return;
    // 민가·옥좌 회복
    for (const u of FD.living(B, team)) {
      const t = FD.terrainAt(B, u.x, u.y);
      if (t.heal && u.hp < u.mhp) {
        const amt = Math.min(u.mhp - u.hp, Math.ceil(u.mhp * t.heal));
        u.hp += amt;
        Rn().float(u.x, u.y, `+${amt}`, '#7dffb0');
      }
    }
    const label = { player: '아군의 턴', enemy: '적군의 턴', ally: '우군의 턴' }[team];
    FD.sfx('phase');
    if (!FD.fastMode) await UI().banner(`<small>TURN ${B.turn}</small> ${label}`, 'b-' + team);
    if (team === 'enemy' && B.chapter.bossBgm && B.bossBgm) FD.bgm.play(B.chapter.bossBgm);
    if (team === 'player') {
      if (FD.test.auto) await autoPhase('player');
      else await playerPhase();
    } else await autoPhase(team);
    refreshDanger();
  }

  // ---- 이벤트 -------------------------------------------------------------
  async function fireEvents(pred) {
    for (const [i, e] of B.chapter.events.entries()) {
      if (B.fired.has(i) || !pred(e)) continue;
      B.fired.add(i);
      await runActions(e.actions);
    }
  }

  async function checkPositionalEvents() {
    await fireEvents((e) => {
      if (e.on === 'adjacent') {
        const t = B.units.find((u) => u.key === e.key && u.hp > 0);
        return t && t.team !== 'player' && FD.living(B, 'player').some((p) => FD.dist(p, t) === 1);
      }
      if (e.on === 'enter') {
        const [x1, y1, x2, y2] = e.rect;
        return FD.living(B, 'player').some((p) => p.x >= x1 && p.x <= x2 && p.y >= y1 && p.y <= y2);
      }
      return false;
    });
  }

  async function runActions(actions) {
    const story = (window.FD_STORY || {})[B.chapter.id] || {};
    for (const a of actions) {
      if (a.scene && !FD.fastMode) await UI().scene(story[a.scene], { overlay: true });
      if (a.msg) { UI().log(`<i>${a.msg}</i>`); if (!FD.fastMode) await UI().banner(a.msg, 'b-event'); }
      if (a.bgm) { FD.bgm.play(a.bgm); B.bossBgm = true; }
      if (a.join) {
        const h = FD.addHero(a.join);
        const u = FD.cloneUnit(h);
        const p = freeTileNear(a.at[0], a.at[1]);
        Object.assign(u, { x: p.x, y: p.y, hp: u.mhp, mp: u.mmp, done: false, team: 'player' });
        B.units.push(u);
        Rn().float(p.x, p.y, '합류!', '#9fd0ff', 16);
        UI().log(`<b>${FD.esc(u.name)}</b>이(가) 합류했다`);
      }
      if (a.recruit) {
        const u = B.units.find((v) => v.key === a.recruit && v.hp > 0);
        if (u) {
          u.team = 'player'; delete u.ai; u.done = B.phase === 'player' ? false : true;
          FD.addHero(u.key);
          Rn().float(u.x, u.y, '동료가 되었다!', '#9fd0ff', 15);
          UI().log(`<b>${FD.esc(u.name)}</b>이(가) 동료가 되었다`);
        }
      }
      if (a.spawn) {
        for (const spec of a.spawn) {
          const p = freeTileNear(spec.x, spec.y);
          const u = FD.makeEnemy({ ...spec, x: p.x, y: p.y });
          u.x = p.x; u.y = p.y; u.done = false;
          B.units.push(u);
          Rn().float(p.x, p.y, '!', '#ff8080', 22);
        }
        UI().log('<i>적의 증원군이 나타났다!</i>');
        FD.sfx('phase');
      }
      if (a.ai) {
        const u = B.units.find((v) => v.key === a.ai.key);
        if (u) u.ai = a.ai.ai;
      }
    }
  }

  // ---- 승패 ---------------------------------------------------------------
  function checkEnd() {
    if (B.result) return;
    const ch = B.chapter;
    for (const k of ch.defeat.keys) {
      const u = B.units.find((v) => v.key === k);
      if (u && u.hp <= 0) { B.result = 'defeat'; return; }
    }
    if (ch.victory.type === 'boss') {
      const b = B.units.find((v) => v.key === ch.victory.key);
      if (b && b.hp <= 0) B.result = 'victory';
    } else if (!FD.living(B, 'enemy').length) B.result = 'victory';
  }

  async function onDeaths(units) {
    for (const u of units) {
      if (u.hp > 0 || u.deadHandled) continue;
      u.deadHandled = true;
      await Rn().fadeOut(u);
      u.dying = 0;
      if (u.team === 'enemy') {
        B.gold += u.gold || 0;
        UI().log(`${FD.esc(u.name)} 격파 <span class="gold">+${u.gold || 0}G</span>`);
      } else UI().log(`<span class="bad">${FD.esc(u.name)}이(가) 쓰러졌다…</span>`);
      if (u.key) await fireEvents((e) => e.on === 'death' && e.key === u.key);
    }
    checkEnd();
  }

  // ---- 행동 실행 (아군·적 공용) --------------------------------------------
  function expFor(pu, foe, landed, killed) {
    const exp0 = pu.exp;
    const g = FD.gainExp(pu, FD.expForCombat(pu, foe, landed, killed));
    return { unit: pu, exp0, amount: g.amount, ups: g.ups };
  }

  async function showLevelUpsOnMap(info) {
    if (!info) return;
    if (info.amount) Rn().float(info.unit.x, info.unit.y, `EXP +${info.amount}`, '#ffe38a', 13);
    for (const up of info.ups) {
      FD.sfx('levelup');
      UI().log(`<b>${FD.esc(info.unit.name)}</b> 레벨 ${up.level}!`);
      if (!FD.fastMode) await UI().modal(UI().levelUpHtml(info.unit, up));
    }
  }

  async function doAttack(a, d) {
    const snap = { a: { hp: a.hp, mhp: a.mhp }, d: { hp: d.hp, mhp: d.mhp } };
    const res = FD.resolveAttack(B, a, d);
    a.hp = res.hpA; d.hp = res.hpD;
    let info = null;
    const pu = a.team === 'player' ? a : d.team === 'player' ? d : null;
    if (pu && pu.hp > 0) {
      const who = pu === a ? 'a' : 'd';
      const foe = pu === a ? d : a;
      info = expFor(pu, foe, res.landed[who], foe.hp <= 0);
    }
    for (const s of res.strikes) {
      const tgt = s.who === 'a' ? d : a;
      UI().log(`${FD.esc((s.who === 'a' ? a : d).name)} → ${FD.esc(tgt.name)}: ${s.hit ? `<b>${s.dmg}</b>${s.crit ? ' 필살!' : ''}` : '빗나감'}`);
    }
    if (FD.settings.anim && !FD.fastMode) await FD.Fight.playAttack(B, res, snap, info);
    else {
      for (const s of res.strikes) {
        const tgt = s.who === 'a' ? d : a;
        FD.sfx(s.hit ? (s.crit ? 'crit' : 'hit') : 'miss');
        Rn().float(tgt.x, tgt.y, s.hit ? String(s.dmg) : 'MISS', s.crit ? '#ffe066' : s.hit ? '#fff' : '#9cc4ff', s.crit ? 22 : 18);
        if (s.hit) { tgt.flash = performance.now() + 120; Rn().shake = s.crit ? 6 : 3; }
        await FD.sleep(380);
      }
      await showLevelUpsOnMap(info);
    }
    await onDeaths([a, d]);
  }

  async function doSpell(caster, spellId, x, y) {
    const res = FD.resolveSpell(B, caster, spellId, x, y);
    const sp = res.spell;
    const snaps = { [caster.uid]: { hp: caster.hp, mhp: caster.mhp } };
    for (const e of res.effects) snaps[e.t.uid] = { hp: e.t.hp, mhp: e.t.mhp };
    caster.mp -= sp.mp;
    let heal = 0, expSum = 0;
    for (const e of res.effects) {
      if (e.heal != null) { e.t.hp += e.heal; heal += e.heal; } else {
        e.t.hp = Math.max(0, e.t.hp - e.dmg);
        if (caster.team === 'player') expSum += FD.expForCombat(caster, e.t, 1, e.t.hp <= 0);
      }
    }
    let info = null;
    if (caster.team === 'player') {
      const amount = sp.kind === 'heal' ? (heal > 0 ? FD.expForHeal(heal) : 1) : Math.min(99, expSum);
      const exp0 = caster.exp;
      const g = FD.gainExp(caster, amount);
      info = { unit: caster, exp0, amount: g.amount, ups: g.ups };
    }
    UI().log(`${FD.esc(caster.name)}의 ${sp.name}: ` + res.effects.map((e) => `${FD.esc(e.t.name)} ${e.heal != null ? '+' + e.heal : '-' + e.dmg}`).join(', '));
    if (FD.settings.anim && !FD.fastMode) await FD.Fight.playSpell(B, res, snaps, info);
    else {
      FD.sfx(sp.kind === 'heal' ? 'heal' : sp.fx === 'thunder' ? 'thunder' : 'fire');
      for (const e of res.effects) Rn().float(e.t.x, e.t.y, e.heal != null ? `+${e.heal}` : String(e.dmg), e.heal != null ? '#7dffb0' : '#ffb070', 18);
      await FD.sleep(500);
      await showLevelUpsOnMap(info);
    }
    await onDeaths(res.effects.map((e) => e.t));
  }

  async function moveUnit(u, x, y, reach) {
    if (u.x === x && u.y === y) return;
    const path = FD.pathTo(reach || FD.reachable(B, u), x, y);
    await Rn().animateMove(u, path);
    u.x = x; u.y = y;
  }

  // ---- 자동 턴 (적·우군, 그리고 자동 진행 모드의 아군) -------------------------
  async function autoPhase(team) {
    const order = FD.living(B, team).sort((a, b) => {
      const foes = B.units.filter((t) => t.hp > 0 && FD.hostile(t, a));
      const da = Math.min(99, ...foes.map((t) => FD.dist(t, a)));
      const db = Math.min(99, ...foes.map((t) => FD.dist(t, b)));
      return da - db;
    });
    for (const u of order) {
      if (B.result) return;
      if (u.hp <= 0 || u.done) continue;
      const saved = u.ai;
      if (team === 'player') u.ai = 'smart';
      const dec = FD.AI.decide(B, u);
      u.ai = saved;
      if (team === 'player' && !saved) delete u.ai;
      Rn().focus = null;
      Rn().over.focus = [{ x: u.x, y: u.y }];
      Rn().cursor = { x: u.x, y: u.y, show: true };
      UI().setUnitPanel(u);
      await FD.sleep(team === 'enemy' ? 220 : 160);
      Rn().over.focus = null;
      await moveUnit(u, dec.move.x, dec.move.y);
      if (dec.type === 'attack' && dec.target.hp > 0) await doAttack(u, dec.target);
      else if (dec.type === 'spell') await doSpell(u, dec.spellId, dec.x, dec.y);
      u.done = true;
      if (team === 'player') { await tryPickup(u); await checkPositionalEvents(); }
      await FD.sleep(60);
    }
  }

  async function tryPickup(u) {
    const k = FD.key(u.x, u.y);
    if (B.chests[k] && !B.opened[k]) await openChest(u);
    else if (B.hidden[k]) await search(u);
  }

  // ---- 아군 턴 (사람 입력) ---------------------------------------------------
  function playerPhase() {
    S = { mode: 'idle' };
    const first = FD.living(B, 'player').find((u) => !u.done);
    if (first) setCursor(first.x, first.y);
    return new Promise((res) => { phaseDone = res; });
  }

  function endPlayerPhase() {
    S = { mode: 'busy' };
    Rn().over = { danger: Rn().over.danger };
    Rn().path = null;
    UI().hideForecast();
    const r = phaseDone; phaseDone = null;
    r && r();
  }

  function setCursor(x, y) {
    x = FD.clamp(x, 0, B.w - 1); y = FD.clamp(y, 0, B.h - 1);
    const c = Rn().cursor;
    if (c.x !== x || c.y !== y) FD.sfx('cursor');
    Rn().cursor = { x, y, show: true };
    onHover(x, y);
  }

  function onHover(x, y) {
    const u = FD.unitAt(B, x, y);
    UI().setUnitPanel(u || (S && S.sel) || null);
    UI().setTerrainPanel(B, x, y);
    if (!S) return;
    if (S.mode === 'selected') {
      const n = S.reach.get(FD.key(x, y));
      Rn().path = n && !n.blocked ? FD.pathTo(S.reach, x, y) : null;
    }
    if (S.mode === 'target') {
      const t = FD.unitAt(B, x, y);
      if (t && S.targets.includes(t)) UI().showForecast(B, S.sel, t); else UI().hideForecast();
    }
    if (S.mode === 'spell') {
      const sp = FD.R.spells[S.spell];
      if (S.valid.has(FD.key(x, y))) {
        Rn().over.area = FD.areaTiles(B, x, y, sp.area);
        const t = FD.spellTargetsAt(B, S.sel, sp, x, y)[0];
        if (t) UI().showForecast(B, S.sel, t, sp); else UI().hideForecast();
      } else { Rn().over.area = null; UI().hideForecast(); }
    }
  }

  function showMoveRange(u) {
    const reach = FD.reachable(B, u);
    const move = [...reach.values()].filter((n) => !n.blocked);
    const atk = new Map();
    for (const n of move) for (const p of FD.tilesInRange(B, n.x, n.y, FD.rangeOf(u))) {
      const k = FD.key(p.x, p.y);
      if (!reach.has(k) || reach.get(k).blocked) atk.set(k, p);
    }
    return { reach, move, atk: [...atk.values()] };
  }

  function selectUnit(u) {
    const { reach, move, atk } = showMoveRange(u);
    S = { mode: 'selected', sel: u, reach, origin: { x: u.x, y: u.y } };
    Rn().over = { danger: Rn().over.danger, move, attack: atk };
    FD.sfx('select');
    UI().setUnitPanel(u);
  }

  function inspect(u) {
    if (S.inspect === u) { S.inspect = null; Rn().over = { danger: Rn().over.danger }; return; }
    const { move, atk } = showMoveRange(u);
    S.inspect = u;
    Rn().over = { danger: Rn().over.danger, move: u.ai === 'boss' ? [{ x: u.x, y: u.y }] : move, attack: atk };
  }

  async function confirmAt(x, y) {
    if (!S || S.mode === 'busy') return;
    const u = FD.unitAt(B, x, y);
    if (S.mode === 'idle') {
      if (u && u.team === 'player' && !u.done) selectUnit(u);
      else if (u) inspect(u);
      else {
        S.inspect = null; Rn().over = { danger: Rn().over.danger };
        const v = await UI().menu([{ label: '턴 종료', value: 'end' }, { label: '설정', value: 'set' }, { label: '닫기', value: null }], Rn().tileToScreen(x, y));
        if (v === 'end') await askEndTurn();
        else if (v === 'set') { await UI().settings(); UI().topbar(B); }
      }
      return;
    }
    if (S.mode === 'selected') {
      const n = S.reach.get(FD.key(x, y));
      if (u === S.sel || (n && !n.blocked)) {
        const unit = S.sel, reach = S.reach, origin = S.origin;
        S = { mode: 'busy' };
        Rn().over = { danger: Rn().over.danger }; Rn().path = null;
        await moveUnit(unit, x, y, reach);
        S = { mode: 'menu', sel: unit, origin, moved: origin.x !== x || origin.y !== y };
        await actionMenu();
      } else if (!u || u.team !== 'player') { cancel(); }
      else if (u.team === 'player' && !u.done) selectUnit(u);
      return;
    }
    if (S.mode === 'target') {
      if (u && S.targets.includes(u)) {
        const a = S.sel;
        await act(a, () => doAttack(a, u));
      }
      return;
    }
    if (S.mode === 'spell') {
      if (S.valid.has(FD.key(x, y))) {
        const a = S.sel, sid = S.spell;
        await act(a, () => doSpell(a, sid, x, y));
      }
      return;
    }
    if (S.mode === 'item') {
      if (u && S.valid.includes(u)) {
        const a = S.sel, id = S.item;
        await act(a, () => useItem(a, id, u));
      }
    }
  }

  async function act(u, fn) {
    S = { mode: 'busy' };
    Rn().over = { danger: Rn().over.danger }; Rn().path = null;
    UI().hideForecast();
    await fn();
    await finishUnit(u);
  }

  async function finishUnit(u) {
    u.done = true;
    S = { mode: 'busy' };
    Rn().over = { danger: Rn().over.danger };
    if (!B.result) await checkPositionalEvents();
    refreshDanger();
    UI().setUnitPanel(u);
    if (B.result) { endPlayerPhase(); return; }
    S = { mode: 'idle' };
    const next = FD.living(B, 'player').find((v) => !v.done);
    if (!next) { await FD.sleep(250); endPlayerPhase(); }
  }

  function cancel() {
    if (!S) return;
    if (FD.UI.menuOpen) { FD.UI.menuOpen(); return; }
    if (S.mode === 'selected') { S = { mode: 'idle' }; Rn().over = { danger: Rn().over.danger }; Rn().path = null; FD.sfx('cancel'); }
    else if (S.mode === 'target' || S.mode === 'spell' || S.mode === 'item') {
      Rn().over = { danger: Rn().over.danger }; UI().hideForecast();
      S = { mode: 'menu', sel: S.sel, origin: S.origin, moved: S.moved };
      FD.sfx('cancel');
      actionMenu();
    } else if (S.mode === 'idle' && S.inspect) { S.inspect = null; Rn().over = { danger: Rn().over.danger }; }
  }

  async function actionMenu() {
    const u = S.sel;
    const k = FD.key(u.x, u.y);
    const targets = FD.attackTargets(B, u);
    const spells = FD.spellsOf(u);
    const castable = spells.filter((sid) => {
      const sp = FD.R.spells[sid];
      return u.mp >= sp.mp && FD.tilesInRange(B, u.x, u.y, sp.range).some((p) => FD.spellTargetsAt(B, u, sp, p.x, p.y).length);
    });
    const usable = FD.bagList('use');
    const items = [
      { label: '공격', value: 'attack', disabled: !targets.length },
      ...(spells.length ? [{ label: '마법', value: 'magic', disabled: !castable.length, sub: `MP ${u.mp}` }] : []),
      { label: '도구', value: 'item', disabled: !usable.length },
      ...(B.chests[k] && !B.opened[k] ? [{ label: '열기', value: 'open' }] : []),
      { label: '조사', value: 'search' },
      { label: '휴식', value: 'rest', disabled: S.moved, sub: S.moved ? '이동 전만' : 'HP·MP 회복' },
      { label: '대기', value: 'wait' },
    ];
    const v = await UI().menu(items, Rn().tileToScreen(u.x, u.y), { title: FD.esc(u.name) });
    if (v === null) {
      // 이동 취소 - 제자리로
      const o = S.origin;
      u.x = o.x; u.y = o.y;
      S = { mode: 'idle' };
      selectUnit(u);
      return;
    }
    if (v === 'attack') {
      S = { ...S, mode: 'target', targets };
      Rn().over = { danger: Rn().over.danger, attack: FD.tilesInRange(B, u.x, u.y, FD.rangeOf(u)) };
      const t = targets[0];
      setCursor(t.x, t.y);
    } else if (v === 'magic') {
      const sid = await UI().menu(spells.map((s) => {
        const sp = FD.R.spells[s];
        return { label: sp.name, sub: `MP ${sp.mp} · ${sp.desc}`, value: s, disabled: !castable.includes(s) };
      }), Rn().tileToScreen(u.x, u.y), { title: '마법' });
      if (!sid) { actionMenu(); return; }
      const sp = FD.R.spells[sid];
      const valid = new Map();
      for (const p of FD.tilesInRange(B, u.x, u.y, sp.range)) if (FD.spellTargetsAt(B, u, sp, p.x, p.y).length) valid.set(FD.key(p.x, p.y), p);
      S = { ...S, mode: 'spell', spell: sid, valid };
      Rn().over = { danger: Rn().over.danger, [sp.kind === 'heal' ? 'heal' : 'attack']: FD.tilesInRange(B, u.x, u.y, sp.range) };
      const p0 = [...valid.values()][0];
      setCursor(p0.x, p0.y);
    } else if (v === 'item') {
      const id = await UI().menu(usable.map(({ id, n, item }) => ({ label: `${item.name} ×${n}`, sub: item.desc, value: id })),
        Rn().tileToScreen(u.x, u.y), { title: '도구' });
      if (!id) { actionMenu(); return; }
      const valid = [u, ...FD.tilesInRange(B, u.x, u.y, [1, 1]).map((p) => FD.unitAt(B, p.x, p.y))
        .filter((t) => t && !FD.hostile(t, u))];
      S = { ...S, mode: 'item', item: id, valid };
      Rn().over = { danger: Rn().over.danger, heal: valid.map((t) => ({ x: t.x, y: t.y })) };
      setCursor(u.x, u.y);
    } else if (v === 'open') {
      await act(u, () => openChest(u));
    } else if (v === 'search') {
      await act(u, () => search(u));
    } else if (v === 'rest') {
      await act(u, async () => {
        const h = Math.min(u.mhp - u.hp, Math.ceil(u.mhp * 0.2));
        const m = Math.min(u.mmp - u.mp, Math.ceil(u.mmp * 0.15));
        u.hp += h; u.mp += m;
        FD.sfx('heal');
        Rn().float(u.x, u.y, `+${h}`, '#7dffb0');
        UI().log(`${FD.esc(u.name)} 휴식 — HP +${h}${m ? `, MP +${m}` : ''}`);
        await FD.sleep(300);
      });
    } else if (v === 'wait') {
      await act(u, async () => {});
    }
  }

  async function openChest(u) {
    const k = FD.key(u.x, u.y);
    const id = B.chests[k];
    B.opened[k] = true;
    FD.bagAdd(id);
    FD.sfx('item');
    Rn().float(u.x, u.y, FD.item(id).name, '#ffe38a', 15, 1600);
    UI().log(`보물상자에서 <b>${FD.item(id).name}</b>을(를) 얻었다!`);
    if (!FD.fastMode && !FD.test.auto) await UI().modal(`<div class="got"><div class="got-title">보물상자</div><b>${FD.item(id).name}</b>을(를) 손에 넣었다!<p>${FD.item(id).desc || ''}</p></div>`);
  }

  async function search(u) {
    const k = FD.key(u.x, u.y);
    const id = B.hidden[k];
    if (!id) {
      Rn().float(u.x, u.y, '아무것도 없다', '#ccc', 13);
      UI().log(`${FD.esc(u.name)}이(가) 주변을 조사했다. 아무것도 없다.`);
      await FD.sleep(250);
      return;
    }
    delete B.hidden[k];
    FD.bagAdd(id);
    FD.sfx('item');
    Rn().float(u.x, u.y, FD.item(id).name + '!', '#ffe38a', 15, 1600);
    UI().log(`숨겨진 <b>${FD.item(id).name}</b>을(를) 찾았다!`);
    if (!FD.fastMode && !FD.test.auto) await UI().modal(`<div class="got"><div class="got-title">발견!</div><b>${FD.item(id).name}</b>을(를) 찾았다!<p>${FD.item(id).desc || ''}</p></div>`);
  }

  async function useItem(u, id, t) {
    const it = FD.item(id);
    if (!FD.bagTake(id)) return;
    const bits = [];
    if (it.heal) { const h = Math.min(t.mhp - t.hp, it.heal); t.hp += h; bits.push(`HP +${h}`); }
    if (it.mp) { const m = Math.min(t.mmp - t.mp, it.mp); t.mp += m; bits.push(`MP +${m}`); }
    if (it.stat) for (const [s, v] of Object.entries(it.stat)) { t[s] += v; bits.push(`${{ atk: '공격', def: '방어', agi: '민첩' }[s]} +${v}`); }
    FD.sfx('heal');
    Rn().float(t.x, t.y, bits.join(' '), '#7dffb0', 14, 1400);
    UI().log(`${FD.esc(u.name)}: ${it.name} → ${FD.esc(t.name)} (${bits.join(', ')})`);
    await FD.sleep(350);
  }

  async function askEndTurn() {
    const left = FD.living(B, 'player').filter((u) => !u.done).length;
    if (left) {
      const ok = await UI().modal(`<p>아직 행동하지 않은 유닛이 <b>${left}</b>명 있다.<br>턴을 끝낼까?</p>`,
        [{ label: '턴 종료', value: true }, { label: '취소', value: false }]);
      if (!ok) return;
    }
    endPlayerPhase();
  }

  function refreshDanger() {
    if (Rn().over.danger) Rn().over.danger = [...FD.AI.threatTiles(B, 'enemy').values()];
  }
  Battle.toggleDanger = () => {
    if (Rn().over.danger) Rn().over.danger = null;
    else Rn().over.danger = [...FD.AI.threatTiles(B, 'enemy').values()];
    FD.$('#btn-danger').classList.toggle('on', !!Rn().over.danger);
  };

  // ---- 입력 바인딩 ---------------------------------------------------------
  let bound = null;
  function bindInput() {
    const cv = Rn().canvas;
    const onMove = (ev) => {
      const t = Rn().tileFromEvent(ev);
      if (!t || (Rn().cursor.x === t.x && Rn().cursor.y === t.y)) return;
      Rn().cursor = { x: t.x, y: t.y, show: true };
      onHover(t.x, t.y);
    };
    const onDown = (ev) => {
      if (B.phase !== 'player' || FD.UI.menuOpen) return;
      const t = Rn().tileFromEvent(ev);
      if (!t) return;
      if (ev.button === 2) { cancel(); return; }
      if (ev.button === 0) { Rn().cursor = { x: t.x, y: t.y, show: true }; confirmAt(t.x, t.y); }
    };
    const onCtx = (ev) => ev.preventDefault();
    const onKey = (ev) => {
      if (!FD.$('#modal').classList.contains('hidden') || !FD.$('#scene-layer').classList.contains('hidden')) return;
      if (FD.UI.menuOpen) return;
      if (B.phase !== 'player' || !S || S.mode === 'busy') return;
      const c = Rn().cursor;
      const k = ev.key;
      if (k === 'ArrowLeft' || k === 'a') setCursor(c.x - 1, c.y);
      else if (k === 'ArrowRight' || k === 'd') setCursor(c.x + 1, c.y);
      else if (k === 'ArrowUp' || k === 'w') setCursor(c.x, c.y - 1);
      else if (k === 'ArrowDown' || k === 's') setCursor(c.x, c.y + 1);
      else if (['Enter', ' ', 'z', 'Z'].includes(k)) confirmAt(c.x, c.y);
      else if (['Escape', 'x', 'X'].includes(k)) cancel();
      else if (k === 'n' || k === 'N') {
        if (S.mode !== 'idle') return;
        const ready = FD.living(B, 'player').filter((u) => !u.done);
        if (!ready.length) return;
        const i = (ready.findIndex((u) => u.x === c.x && u.y === c.y) + 1) % ready.length;
        setCursor(ready[i].x, ready[i].y);
      } else if (k === 'r' || k === 'R') Battle.toggleDanger();
      else if (k === 'e' || k === 'E') { if (S.mode === 'idle') askEndTurn(); }
      else return;
      ev.preventDefault();
    };
    const onEndBtn = () => { if (B.phase === 'player' && S && S.mode === 'idle') askEndTurn(); };
    const onDangerBtn = () => Battle.toggleDanger();
    const onAnimBtn = () => { FD.settings.anim = !FD.settings.anim; FD.saveSettings(); UI().topbar(B); };
    cv.addEventListener('mousemove', onMove);
    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('contextmenu', onCtx);
    window.addEventListener('keydown', onKey);
    FD.$('#btn-endturn').addEventListener('click', onEndBtn);
    FD.$('#btn-danger').addEventListener('click', onDangerBtn);
    FD.$('#btn-anim').addEventListener('click', onAnimBtn);
    bound = () => {
      cv.removeEventListener('mousemove', onMove);
      cv.removeEventListener('pointerdown', onDown);
      cv.removeEventListener('contextmenu', onCtx);
      window.removeEventListener('keydown', onKey);
      FD.$('#btn-endturn').removeEventListener('click', onEndBtn);
      FD.$('#btn-danger').removeEventListener('click', onDangerBtn);
      FD.$('#btn-anim').removeEventListener('click', onAnimBtn);
    };
  }
  function unbindInput() { if (bound) bound(); bound = null; }

  // 검증 스크립트용 (tools 밖의 헤드리스 시험이 연출을 직접 부른다)
  Battle._t = { doAttack, doSpell };

  // 전투가 끝나면 동료 상태를 부대에 되돌려 쓴다
  Battle.commit = () => {
    for (const u of B.units) {
      if (u.team !== 'player' || !FD.R.heroes[u.key]) continue;
      const i = FD.party.roster.findIndex((h) => h.key === u.key);
      const saved = FD.cloneUnit(u);
      delete saved.x; delete saved.y; delete saved.done; delete saved.rx; delete saved.ry;
      delete saved.dying; delete saved.deadHandled; delete saved.flash; delete saved.ai;
      saved.dead = u.hp <= 0;
      saved.hp = saved.mhp; saved.mp = saved.mmp;
      if (i >= 0) FD.party.roster[i] = saved; else FD.party.roster.push(saved);
    }
    FD.party.gold += B.gold + (B.chapter.reward || 0);
    return { gold: B.gold, reward: B.chapter.reward || 0 };
  };
})(window.FD);
