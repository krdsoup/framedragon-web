// 규칙 — 유닛·이동·전투 계산. 화면에 아무것도 그리지 않는 순수 계산이다.
// 연출(fight.js)과 AI(ai.js)가 같은 함수를 부르므로 예측창의 숫자와 실제 결과가 같다.
(function (FD) {
  const R = FD.R;
  let uidSeq = 1;
  const STATS = ['mhp', 'mmp', 'atk', 'def', 'agi', 'mag'];
  const G2S = { hp: 'mhp', mp: 'mmp', atk: 'atk', def: 'def', agi: 'agi', mag: 'mag' };

  FD.item = (id) => R.items[id] || null;
  FD.cls = (u) => R.classes[u.cls];

  function statsAt(clsId, level) {
    const c = R.classes[clsId];
    const s = {};
    for (const g in G2S) {
      const [lo, hi] = c.growth[g];
      s[G2S[g]] = c.base[g] + Math.round(((lo + hi) / 2) * (level - 1));
    }
    return s;
  }

  FD.makeHero = (heroId) => {
    const h = R.heroes[heroId];
    const u = {
      uid: uidSeq++, key: heroId, art: heroId, name: h.name, cls: h.cls, level: h.level, exp: 0,
      weapon: h.weapon, team: 'player', leader: !!h.leader, ...statsAt(h.cls, h.level),
    };
    u.hp = u.mhp; u.mp = u.mmp;
    return u;
  };

  FD.makeEnemy = (spec) => {
    const e = R.enemies[spec.id];
    const u = {
      uid: uidSeq++, key: spec.key || null, art: spec.id, name: e.name, cls: e.cls, level: spec.level,
      exp: 0, weapon: e.weapon, team: spec.team || 'enemy', boss: !!e.boss, gold: e.gold,
      ai: spec.ai || 'aggressive', ...statsAt(e.cls, spec.level),
    };
    if (u.boss) { u.mhp = Math.round(u.mhp * 1.2); }
    u.hp = u.mhp; u.mp = u.mmp;
    return u;
  };

  // 저장된 동료를 전투용으로 복제 (전투 중 변화는 끝날 때 되돌려 쓴다)
  FD.cloneUnit = (u) => JSON.parse(JSON.stringify(u));
  FD.nextUid = () => uidSeq++;
  FD.bumpUid = (n) => { uidSeq = Math.max(uidSeq, n + 1); };

  // ---- 파생 수치 ---------------------------------------------------------
  FD.weaponOf = (u) => FD.item(u.weapon) || { atk: 0, hit: 0, type: FD.cls(u).weapon };
  FD.atkOf = (u) => u.atk + (FD.weaponOf(u).atk || 0);
  FD.magOf = (u) => u.mag + (FD.weaponOf(u).mag || 0);
  FD.agiOf = (u) => u.agi + (FD.weaponOf(u).agi || 0);
  FD.movOf = (u) => FD.cls(u).mov;
  FD.moveTypeOf = (u) => FD.cls(u).move;
  FD.isMagicWeapon = (u) => !!(R.weaponTypes[FD.weaponOf(u).type] || {}).magic;
  FD.rangeOf = (u) => {
    const wt = R.weaponTypes[FD.weaponOf(u).type] || { range: [1, 1] };
    const bonus = FD.cls(u).rangeBonus || 0;
    return [wt.range[0], wt.range[1] + bonus];
  };
  FD.spellsOf = (u) => (FD.cls(u).spells || [])
    .filter(([, lv]) => FD.cls(u).tier === 2 || u.level >= lv)
    .map(([id]) => id);
  FD.hostile = (a, b) => (a.team === 'enemy') !== (b.team === 'enemy');

  // ---- 맵 ---------------------------------------------------------------
  FD.inBounds = (B, x, y) => x >= 0 && y >= 0 && x < B.w && y < B.h;
  FD.terrainAt = (B, x, y) => R.terrain[B.tiles[y][x]];
  FD.unitAt = (B, x, y) => B.units.find((u) => u.hp > 0 && u.x === x && u.y === y) || null;
  FD.living = (B, team) => B.units.filter((u) => u.hp > 0 && (!team || u.team === team));

  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  // 다익스트라. 적은 통과 못 하고 아군은 통과만 된다(멈출 수는 없다).
  FD.reachable = (B, u, opts = {}) => {
    const mov = opts.mov != null ? opts.mov : FD.movOf(u);
    const mt = FD.moveTypeOf(u);
    const out = new Map();
    const start = { x: u.x, y: u.y, cost: 0, prev: null };
    out.set(FD.key(u.x, u.y), start);
    const open = [start];
    while (open.length) {
      open.sort((a, b) => a.cost - b.cost);
      const cur = open.shift();
      for (const [dx, dy] of DIRS) {
        const nx = cur.x + dx, ny = cur.y + dy;
        if (!FD.inBounds(B, nx, ny)) continue;
        const c = FD.terrainAt(B, nx, ny).cost[mt];
        if (c == null) continue;
        const nc = cur.cost + c;
        if (nc > mov) continue;
        const occ = FD.unitAt(B, nx, ny);
        if (occ && occ !== u && FD.hostile(occ, u) && !opts.ignoreUnits) continue;
        const k = FD.key(nx, ny);
        const prev = out.get(k);
        if (prev && prev.cost <= nc) continue;
        const node = { x: nx, y: ny, cost: nc, prev: cur };
        out.set(k, node);
        open.push(node);
      }
    }
    // 다른 유닛이 서 있는 칸은 지나갈 수만 있다
    for (const [k, n] of out) {
      const occ = FD.unitAt(B, n.x, n.y);
      if (occ && occ !== u) n.blocked = true;
    }
    return out;
  };

  FD.pathTo = (reach, x, y) => {
    let n = reach.get(FD.key(x, y));
    const path = [];
    while (n) { path.unshift({ x: n.x, y: n.y }); n = n.prev; }
    return path;
  };

  FD.tilesInRange = (B, x, y, [lo, hi]) => {
    const out = [];
    for (let dy = -hi; dy <= hi; dy++) {
      for (let dx = -hi; dx <= hi; dx++) {
        const d = Math.abs(dx) + Math.abs(dy);
        if (d < lo || d > hi) continue;
        const nx = x + dx, ny = y + dy;
        if (FD.inBounds(B, nx, ny)) out.push({ x: nx, y: ny });
      }
    }
    return out;
  };

  FD.areaTiles = (B, x, y, area) => FD.tilesInRange(B, x, y, [0, area]);

  FD.attackTargets = (B, u, fx = u.x, fy = u.y) =>
    FD.tilesInRange(B, fx, fy, FD.rangeOf(u))
      .map((p) => FD.unitAt(B, p.x, p.y))
      .filter((t) => t && FD.hostile(t, u));

  // ---- 전투 계산 ---------------------------------------------------------
  function strikeNumbers(B, a, d) {
    const w = FD.weaponOf(a);
    const terr = FD.terrainAt(B, d.x, d.y);
    let dmg;
    if (FD.isMagicWeapon(a)) dmg = (w.atk + FD.magOf(a) - d.def * 0.5) * (1 - terr.def / 200);
    else dmg = (FD.atkOf(a) - d.def * 0.9) * (1 - terr.def / 100);
    dmg = Math.max(1, Math.round(dmg));
    const hit = FD.clamp(Math.round(78 + (FD.agiOf(a) - FD.agiOf(d)) * 2 + (w.hit || 0) - terr.eva), 15, 99);
    const crit = FD.clamp(Math.floor((FD.agiOf(a) - FD.agiOf(d)) / 2) + 4, 1, 30);
    return { dmg, hit, crit, double: FD.agiOf(a) >= FD.agiOf(d) + 5 };
  }

  FD.canCounter = (d, a) => {
    const [lo, hi] = FD.rangeOf(d);
    const dist = FD.dist(a, d);
    return d.hp > 0 && dist >= lo && dist <= hi;
  };

  FD.forecast = (B, a, d) => {
    const A = strikeNumbers(B, a, d);
    const counter = FD.canCounter(d, a);
    const D = counter ? strikeNumbers(B, d, a) : null;
    return { a: A, d: D };
  };

  // 공격 한 번을 끝까지 굴린다: 공격 → 반격 → 추가 공격 → 추가 반격. 누가 죽으면 멈춘다.
  FD.resolveAttack = (B, a, d) => {
    const f = FD.forecast(B, a, d);
    const order = [['a', f.a]];
    if (f.d) order.push(['d', f.d]);
    if (f.a.double) order.push(['a', f.a]);
    if (f.d && f.d.double) order.push(['d', f.d]);
    const hp = { a: a.hp, d: d.hp };
    const strikes = [];
    const landed = { a: 0, d: 0 };
    for (const [who, n] of order) {
      if (hp.a <= 0 || hp.d <= 0) break;
      const tgt = who === 'a' ? 'd' : 'a';
      const hit = FD.chance(n.hit);
      const crit = hit && FD.chance(n.crit);
      const dmg = hit ? (crit ? Math.round(n.dmg * 1.5) : n.dmg) : 0;
      hp[tgt] = Math.max(0, hp[tgt] - dmg);
      if (hit) landed[who]++;
      strikes.push({ who, hit, crit, dmg, hpAfter: hp[tgt] });
    }
    return { kind: 'attack', a, d, strikes, hpA: hp.a, hpD: hp.d, landed, forecast: f };
  };

  // 마법 — 명중은 확정. 범위 안의 해당 편 전원에게 적용된다.
  FD.spellEffect = (B, caster, spell, t) => {
    const terr = FD.terrainAt(B, t.x, t.y);
    if (spell.kind === 'heal') {
      const amt = Math.round(spell.power + FD.magOf(caster) * 0.8);
      return { heal: Math.min(amt, t.mhp - t.hp) };
    }
    let dmg;
    if (spell.physical) dmg = (spell.power + FD.atkOf(caster) * 0.7 - t.def * 0.9) * (1 - terr.def / 100);
    else dmg = spell.power + FD.magOf(caster) - t.def * 0.5;
    if (spell.undead && FD.cls(t).undead) dmg *= spell.undead;
    return { dmg: Math.max(1, Math.round(dmg)) };
  };

  FD.spellTargetsAt = (B, caster, spell, x, y) =>
    FD.areaTiles(B, x, y, spell.area)
      .map((p) => FD.unitAt(B, p.x, p.y))
      .filter((t) => t && (spell.target === 'ally' ? !FD.hostile(t, caster) : FD.hostile(t, caster)))
      .filter((t) => spell.kind !== 'heal' || t.hp < t.mhp || spell.area > 0);

  FD.resolveSpell = (B, caster, spellId, x, y) => {
    const spell = R.spells[spellId];
    const targets = FD.spellTargetsAt(B, caster, spell, x, y);
    const effects = targets.map((t) => ({ t, ...FD.spellEffect(B, caster, spell, t) }));
    return { kind: 'spell', caster, spellId, spell, x, y, effects };
  };

  // ---- 경험치 (타격 경험치) ------------------------------------------------
  // 원작처럼 맞히기만 해도 EXP 가 들어온다. 레벨 차가 클수록 많다.
  FD.expForCombat = (me, foe, landed, killed) => {
    const diff = foe.level - me.level;
    let exp = landed > 0 ? FD.clamp(12 + diff * 4, 4, 50) : 1;
    if (killed) exp += FD.clamp(30 + diff * 6, 10, 90) + (foe.boss ? 40 : 0);
    return exp;
  };
  FD.expForHeal = (amount) => FD.clamp(10 + Math.floor(amount / 4), 8, 40);

  // exp 를 더하고 레벨업 결과 목록을 돌려준다 (여러 번 오를 수 있다)
  FD.gainExp = (u, amount) => {
    const ups = [];
    if (u.team !== 'player' || u.level >= R.MAX_LEVEL) return { amount: 0, ups };
    u.exp += amount;
    while (u.exp >= R.EXP_PER_LEVEL && u.level < R.MAX_LEVEL) {
      u.exp -= R.EXP_PER_LEVEL;
      ups.push(FD.levelUp(u));
    }
    return { amount, ups };
  };

  FD.levelUp = (u) => {
    const c = FD.cls(u);
    const gains = {};
    for (const g in G2S) {
      const [lo, hi] = c.growth[g];
      const v = FD.randInt(lo, hi);
      if (v > 0) { gains[G2S[g]] = v; u[G2S[g]] += v; }
    }
    const before = FD.spellsOf(u);
    u.level++;
    u.hp = Math.min(u.mhp, u.hp + (gains.mhp || 0));
    u.mp = Math.min(u.mmp, u.mp + (gains.mmp || 0));
    const learned = FD.spellsOf(u).filter((s) => !before.includes(s));
    return { level: u.level, gains, learned };
  };

  FD.canPromote = (u) => !!FD.cls(u).promoteTo && u.level >= R.PROMOTE_LEVEL;
  FD.promote = (u) => {
    const to = FD.cls(u).promoteTo;
    const bonus = R.classes[to].bonus;
    for (const g in G2S) u[G2S[g]] += bonus[g] || 0;
    u.cls = to;
    u.promoted = true;
    u.hp = u.mhp; u.mp = u.mmp;
    return to;
  };

  FD.statLine = (u) => STATS.map((s) => `${s}:${u[s]}`).join(' ');
})(window.FD);
