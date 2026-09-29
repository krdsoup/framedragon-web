// AI — 적과 NPC 우군의 판단.
//   aggressive  이번 턴에 칠 수 있으면 치고, 없으면 가장 가까운 상대에게 다가간다
//   hold        이번 턴에 칠 수 있는 상대가 생길 때까지 제자리 (원작의 '매복')
//   boss        자리를 지킨다. 사거리 안에 들어온 상대만 친다
//   cautious    NPC 용. 적의 공격 범위 밖에서 쏠 수 있으면 쏘고, 아니면 안전한 쪽으로 물러난다
//   smart       자동 진행의 아군 용. 칠 수 있으면 치되, 다음 적 턴에 받을 예상 피해를 계산한다
(function (FD) {
  const AI = FD.AI = {};

  function withPos(u, x, y, fn) {
    const ox = u.x, oy = u.y;
    u.x = x; u.y = y;
    try { return fn(); } finally { u.x = ox; u.y = oy; }
  }

  function scoreAttack(B, u, t) {
    const f = FD.forecast(B, u, t);
    const hits = f.a.double ? 2 : 1;
    const exp = (f.a.dmg * f.a.hit) / 100 * hits;
    let s = exp;
    if (f.a.dmg * hits >= t.hp) s += 40 * (f.a.hit / 100);
    if (t.leader) s += 8;
    if (t.team === 'ally') s += 3;                 // 지켜야 하는 NPC 를 노린다 - 긴장감
    s += (1 - t.hp / t.mhp) * 10;
    if (f.d) s -= ((f.d.dmg * f.d.hit) / 100) * (f.d.double ? 2 : 1) * 0.5;
    return s;
  }

  function spellOptions(B, u, fx, fy) {
    const out = [];
    for (const sid of FD.spellsOf(u)) {
      const sp = FD.R.spells[sid];
      if (u.mp < sp.mp) continue;
      for (const p of FD.tilesInRange(B, fx, fy, sp.range)) {
        const ts = withPos(u, fx, fy, () => FD.spellTargetsAt(B, u, sp, p.x, p.y));
        if (!ts.length) continue;
        let s = 0;
        for (const t of ts) {
          const e = FD.spellEffect(B, u, sp, t);
          if (sp.kind === 'heal') s += e.heal * 0.8;
          else { s += e.dmg + (e.dmg >= t.hp ? 40 : 0) + (t.leader ? 8 : 0) + (t.team === 'ally' ? 6 : 0); }
        }
        if (sp.kind === 'heal' && s < 8) continue;
        out.push({ type: 'spell', spellId: sid, x: p.x, y: p.y, score: s + 2 });
      }
    }
    return out;
  }

  // 상대 각각이 다음 턴에 칠 수 있는 칸 - 한 번 계산해 두고 칸마다 조회한다
  function coverage(B, u) {
    return B.units.filter((e) => e.hp > 0 && FD.hostile(e, u)).map((e) => {
      const tiles = e.ai === 'boss' ? [{ x: e.x, y: e.y }] : [...FD.reachable(B, e).values()].filter((n) => !n.blocked || (n.x === u.x && n.y === u.y));
      const set = new Set();
      for (const n of tiles) for (const p of FD.tilesInRange(B, n.x, n.y, FD.rangeOf(e))) set.add(FD.key(p.x, p.y));
      return { e, set };
    });
  }
  // (x,y) 에 서면 받을 예상 피해 합
  function dangerAt(B, u, cover, x, y, skip) {
    let sum = 0;
    for (const { e, set } of cover) {
      if (e === skip || e.hp <= 0 || !set.has(FD.key(x, y))) continue;
      const f = withPos(u, x, y, () => FD.forecast(B, e, u).a);
      sum += (f.dmg * f.hit) / 100 * (f.double ? 2 : 1);
    }
    return sum;
  }

  // 적 전체가 이번 턴에 칠 수 있는 칸 (플레이어 화면의 '위험 범위'도 이것)
  AI.threatTiles = (B, team) => {
    const set = new Map();
    for (const e of FD.living(B, team)) {
      const tiles = e.ai === 'boss' ? [{ x: e.x, y: e.y }]
        : [...FD.reachable(B, e).values()].filter((n) => !n.blocked);
      let maxR = FD.rangeOf(e);
      for (const sid of FD.spellsOf(e)) { const r = FD.R.spells[sid].range; if (r[1] > maxR[1]) maxR = [Math.min(maxR[0], r[0]), r[1]]; }
      for (const n of tiles) for (const p of FD.tilesInRange(B, n.x, n.y, [Math.max(1, maxR[0]), maxR[1]])) set.set(FD.key(p.x, p.y), p);
    }
    return set;
  };

  AI.decide = (B, u) => {
    const mode = u.ai || 'aggressive';
    const reach = mode === 'boss' ? new Map([[FD.key(u.x, u.y), { x: u.x, y: u.y, cost: 0 }]]) : FD.reachable(B, u);
    const spots = [...reach.values()].filter((n) => !n.blocked);
    const hostileTeam = u.team === 'enemy' ? null : 'enemy';
    const careful = mode === 'cautious' || mode === 'smart';
    const cover = careful ? coverage(B, u) : null;
    // smart 는 턴이 길어질수록 과감해진다 - 안 그러면 매복한 보스 앞에서 영원히 기다린다
    const bold = mode === 'smart' ? Math.max(0.25, 1 - Math.max(0, B.turn - 5) * 0.12) : 1;
    const riskW = (mode === 'cautious' ? 45 : 28) * (u.leader ? 2 : 1) * bold;
    const risk = (x, y, killed) => (careful ? Math.min(60, (dangerAt(B, u, cover, x, y, killed) / Math.max(1, u.hp)) * riskW) : 0);

    let best = null;
    const consider = (c) => { if (!best || c.score > best.score) best = c; };
    for (const n of spots) {
      const terr = FD.terrainAt(B, n.x, n.y);
      const place = terr.def * 0.15 + (n.x === u.x && n.y === u.y ? 0.5 : 0);
      const targets = withPos(u, n.x, n.y, () => FD.attackTargets(B, u, n.x, n.y));
      for (const t of targets) {
        const s = withPos(u, n.x, n.y, () => scoreAttack(B, u, t));
        // 확실히 잡을 수 있는 상대는 위험 계산에서 뺀다
        const f = careful ? withPos(u, n.x, n.y, () => FD.forecast(B, u, t).a) : null;
        const sure = f && f.dmg * (f.double ? 2 : 1) >= t.hp && f.hit >= 80;
        // 반격에 죽을 수 있으면 치지 않는다
        const fc = careful ? withPos(u, n.x, n.y, () => FD.forecast(B, u, t)) : null;
        const lethal = fc && fc.d && !sure && fc.d.dmg * (fc.d.double ? 2 : 1) >= u.hp ? (u.leader ? 200 : 60) : 0;
        consider({ type: 'attack', move: n, target: t, score: s + place - risk(n.x, n.y, sure ? t : null) - lethal });
      }
      for (const o of spellOptions(B, u, n.x, n.y)) consider({ ...o, move: n, score: o.score + place - risk(n.x, n.y) });
    }
    if (best && (!careful || best.score > 0)) return best;
    if (mode === 'hold' || mode === 'boss') return { type: 'wait', move: { x: u.x, y: u.y } };

    if (careful) {
      // cautious: 위험이 적고 플레이어 쪽에 가까운 칸 / smart: 위험을 감수할 만큼만 적에게 다가간다
      const friends = FD.living(B, 'player').filter((p) => p !== u);
      const foes = B.units.filter((t) => t.hp > 0 && FD.hostile(t, u));
      let pick = null, ps = -1e9;
      for (const n of spots) {
        let s = -risk(n.x, n.y) + FD.terrainAt(B, n.x, n.y).def * 0.2;
        if (mode === 'cautious') s -= (friends.length ? Math.min(...friends.map((p) => FD.dist(p, n))) : 0) * 1.5;
        else {
          // 실제 걸어서 가는 거리로 가장 가까운 적까지
          const d = Math.min(99, ...foes.map((t) => FD.dist(t, n)));
          s -= d * 1.2;
          if (u.leader) s -= Math.max(0, 3 - d) * 4;        // 주인공은 앞장서지 않는다
          // 구출 대상(우군 NPC)에게 붙으면 합류한다 - 사람은 대사로 아는 것
          if (FD.living(B, 'ally').some((v) => FD.dist(v, n) === 1)) s += 8;
        }
        if (s > ps) { ps = s; pick = n; }
      }
      return { type: 'wait', move: pick || { x: u.x, y: u.y } };
    }

    // aggressive: 가장 가까운 상대 쪽으로 최대한 다가간다
    const full = FD.reachable(B, u, { mov: 999 });
    const foes = B.units.filter((t) => t.hp > 0 && FD.hostile(t, u) && (!hostileTeam || t.team === hostileTeam || t.team === 'ally'));
    let goal = null, gc = Infinity;
    for (const t of foes) {
      for (const p of FD.tilesInRange(B, t.x, t.y, FD.rangeOf(u))) {
        const n = full.get(FD.key(p.x, p.y));
        if (n && !n.blocked && n.cost < gc) { gc = n.cost; goal = n; }
      }
    }
    if (!goal) return { type: 'wait', move: { x: u.x, y: u.y } };
    const path = FD.pathTo(full, goal.x, goal.y);
    let dest = { x: u.x, y: u.y };
    for (const p of path) {
      const n = reach.get(FD.key(p.x, p.y));
      if (!n) break;
      if (!n.blocked) dest = n;
    }
    return { type: 'wait', move: dest };
  };
})(window.FD);
