// 맵 렌더러 — 캔버스 하나. 지형은 전투 시작 때 한 번 구워 두고(static), 매 프레임
// 물결·범위·유닛·커서만 다시 그린다.
(function (FD) {
  const T = FD.R.TILE;
  const TEAM = { player: '#3b82f6', enemy: '#ef4444', ally: '#22c55e' };
  const OVER = {
    move: ['rgba(70,140,255,0.34)', 'rgba(150,200,255,0.75)'],
    attack: ['rgba(255,70,70,0.30)', 'rgba(255,150,150,0.8)'],
    heal: ['rgba(60,220,120,0.30)', 'rgba(160,255,190,0.8)'],
    area: ['rgba(255,170,40,0.45)', 'rgba(255,220,120,0.95)'],
    danger: ['rgba(170,60,220,0.20)', 'rgba(200,120,255,0.55)'],
    focus: ['rgba(255,255,255,0.18)', 'rgba(255,255,255,0.9)'],
  };

  const R = FD.Render = {
    canvas: null, ctx: null, scale: 2, B: null, stat: null,
    over: {}, path: null, cursor: { x: 0, y: 0, show: false }, floats: [], focus: null,
    running: false, shake: 0,
  };

  function hash(x, y) { let h = x * 374761393 + y * 668265263; h = (h ^ (h >> 13)) * 1274126177; return (h ^ (h >> 16)) >>> 0; }

  R.init = (canvas) => {
    R.canvas = canvas;
    R.ctx = canvas.getContext('2d');
  };

  R.setBattle = (B) => {
    R.B = B;
    R.canvas.width = B.w * T * R.scale;
    R.canvas.height = B.h * T * R.scale;
    R.over = {}; R.path = null; R.floats = []; R.focus = null;
    R.buildStatic();
    if (!R.running) { R.running = true; requestAnimationFrame(R.frame); }
  };

  const tileAt = (x, y) => (FD.inBounds(R.B, x, y) ? R.B.tiles[y][x] : null);

  function tex(ctx, id, x, y, tint) {
    const im = FD.img(FD.A.textures[id]);
    const h = hash(x, y);
    if (im) {
      const s = im.naturalWidth / 2;
      ctx.drawImage(im, (h & 1) * s, ((h >> 1) & 1) * s, s, s, x * T, y * T, T, T);
    } else {
      ctx.fillStyle = { grass: '#4a8c3a', dirt: '#b8915c', water: '#2d7fc4', floor: '#77777d', wall: '#3b3b44', carpet: '#8c1b1b' }[id] || '#555';
      ctx.fillRect(x * T, y * T, T, T);
    }
    if (tint) { ctx.fillStyle = tint; ctx.fillRect(x * T, y * T, T, T); }
  }

  function obj(ctx, id, x, y, size, dy = 0) {
    const im = FD.img(FD.A.objects[id]);
    const h = hash(x, y);
    const jx = ((h >> 3) % 5) - 2;
    if (im) {
      ctx.drawImage(im, x * T + (T - size) / 2 + jx, y * T + T - size + dy, size, size);
    } else {
      ctx.fillStyle = { tree: '#1f5f2a', mountain: '#6b6b6b', house: '#a0522d', chest: '#8b5a2b', throne: '#d4a017' }[id];
      ctx.beginPath(); ctx.arc(x * T + T / 2, y * T + T / 2, size / 3, 0, Math.PI * 2); ctx.fill();
    }
  }

  function edgeShade(ctx, x, y, same, color, w) {
    ctx.fillStyle = color;
    if (!same(x, y - 1)) ctx.fillRect(x * T, y * T, T, w);
    if (!same(x, y + 1)) ctx.fillRect(x * T, y * T + T - w, T, w);
    if (!same(x - 1, y)) ctx.fillRect(x * T, y * T, w, T);
    if (!same(x + 1, y)) ctx.fillRect(x * T + T - w, y * T, w, T);
  }

  R.buildStatic = () => {
    const B = R.B;
    const c = document.createElement('canvas');
    c.width = B.w * T * R.scale; c.height = B.h * T * R.scale;
    const ctx = c.getContext('2d');
    ctx.scale(R.scale, R.scale);
    ctx.imageSmoothingQuality = 'high';
    const isWater = (x, y) => ['water', 'bridge'].includes(tileAt(x, y)) || tileAt(x, y) === null;
    const isWall = (x, y) => tileAt(x, y) === 'wall' || tileAt(x, y) === null;
    const isCarpet = (x, y) => ['carpet', 'throne'].includes(tileAt(x, y));
    const isRoad = (x, y) => ['road', 'bridge'].includes(tileAt(x, y)) || tileAt(x, y) === null;

    // 1) 바닥 재질
    for (let y = 0; y < B.h; y++) for (let x = 0; x < B.w; x++) {
      const t = B.tiles[y][x];
      const h = hash(x, y);
      const vary = `rgba(0,0,0,${(h % 7) * 0.012})`;
      if (['plain', 'forest', 'mountain', 'house'].includes(t)) tex(ctx, 'grass', x, y, vary);
      else if (t === 'road') { tex(ctx, 'grass', x, y); tex(ctx, 'dirt', x, y, 'rgba(60,30,0,0.08)'); edgeShade(ctx, x, y, isRoad, 'rgba(40,70,20,0.35)', 3); }
      else if (t === 'water' || t === 'bridge') tex(ctx, 'water', x, y, 'rgba(0,35,90,0.32)');
      else if (t === 'wall') tex(ctx, 'wall', x, y, 'rgba(0,0,0,0.15)');
      else if (t === 'carpet' || t === 'throne') { tex(ctx, 'carpet', x, y); edgeShade(ctx, x, y, isCarpet, '#d4a52c', 3); }
      else tex(ctx, 'floor', x, y, vary);
      if (t === 'water') edgeShade(ctx, x, y, isWater, 'rgba(230,240,255,0.35)', 3);
    }
    // 2) 입체감 · 오브젝트
    for (let y = 0; y < B.h; y++) for (let x = 0; x < B.w; x++) {
      const t = B.tiles[y][x];
      const X = x * T, Y = y * T;
      if (t === 'wall') {
        const g = ctx.createLinearGradient(0, Y, 0, Y + T);
        g.addColorStop(0, 'rgba(255,255,255,0.10)'); g.addColorStop(1, 'rgba(0,0,0,0.25)');
        ctx.fillStyle = g; ctx.fillRect(X, Y, T, T);
        if (!isWall(x, y + 1)) {           // 아래가 트여 있으면 벽면을 보여 준다
          ctx.fillStyle = 'rgba(20,20,28,0.55)'; ctx.fillRect(X, Y + T * 0.62, T, T * 0.38);
          ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1;
          for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.moveTo(X, Y + T * 0.62 + i * 9 + 6); ctx.lineTo(X + T, Y + T * 0.62 + i * 9 + 6); ctx.stroke(); }
          ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(X, Y + T, T, 5);
        }
      } else if (t === 'bridge') {
        // 위아래가 강이면 가로로 건너는 다리, 아니면 세로 다리
        const vertical = !(tileAt(x, y - 1) === 'water' || tileAt(x, y + 1) === 'water');
        ctx.fillStyle = '#8a5a2b';
        if (vertical) ctx.fillRect(X + 6, Y, T - 12, T); else ctx.fillRect(X, Y + 6, T, T - 12);
        ctx.strokeStyle = '#4a2c10'; ctx.lineWidth = 1.5;
        for (let i = 0; i <= 6; i++) {
          ctx.beginPath();
          if (vertical) { ctx.moveTo(X + 6, Y + i * 8); ctx.lineTo(X + T - 6, Y + i * 8); } else { ctx.moveTo(X + i * 8, Y + 6); ctx.lineTo(X + i * 8, Y + T - 6); }
          ctx.stroke();
        }
        ctx.fillStyle = '#5b3a1a';
        if (vertical) { ctx.fillRect(X + 4, Y, 3, T); ctx.fillRect(X + T - 7, Y, 3, T); } else { ctx.fillRect(X, Y + 4, T, 3); ctx.fillRect(X, Y + T - 7, T, 3); }
      } else if (t === 'forest') {
        obj(ctx, 'tree', x, y, 50, 2);
      } else if (t === 'mountain') {
        obj(ctx, 'mountain', x, y, 50, 2);
      } else if (t === 'house') {
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(X + T / 2, Y + T - 6, 20, 6, 0, 0, Math.PI * 2); ctx.fill();
        obj(ctx, 'house', x, y, 46, 0);
      } else if (t === 'pillar') {
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(X + T / 2 + 4, Y + T / 2 + 6, 17, 14, 0, 0, Math.PI * 2); ctx.fill();
        const g = ctx.createRadialGradient(X + T / 2 - 6, Y + T / 2 - 6, 2, X + T / 2, Y + T / 2, 18);
        g.addColorStop(0, '#d8d8de'); g.addColorStop(0.7, '#8c8c96'); g.addColorStop(1, '#4a4a54');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(X + T / 2, Y + T / 2, 17, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 2; ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(X + T / 2, Y + T / 2, 11, 0, Math.PI * 2); ctx.stroke();
      } else if (t === 'door') {
        ctx.fillStyle = '#5b3a1a'; ctx.fillRect(X + 4, Y + 4, T - 8, T - 8);
        ctx.strokeStyle = '#2e1a08'; ctx.lineWidth = 1.5;
        for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(X + 4 + i * 10, Y + 4); ctx.lineTo(X + 4 + i * 10, Y + T - 4); ctx.stroke(); }
        ctx.fillStyle = '#c9a227'; ctx.fillRect(X + T / 2 - 2, Y + T / 2 - 2, 4, 4);
      } else if (t === 'throne') {
        obj(ctx, 'throne', x, y, 46, -2);
      }
    }
    // 3) 옅은 격자
    ctx.strokeStyle = 'rgba(0,0,0,0.10)'; ctx.lineWidth = 1;
    for (let x = 0; x <= B.w; x++) { ctx.beginPath(); ctx.moveTo(x * T, 0); ctx.lineTo(x * T, B.h * T); ctx.stroke(); }
    for (let y = 0; y <= B.h; y++) { ctx.beginPath(); ctx.moveTo(0, y * T); ctx.lineTo(B.w * T, y * T); ctx.stroke(); }
    R.stat = c;
  };

  // ---- 매 프레임 ----------------------------------------------------------
  R.frame = (now) => {
    if (!R.B) { R.running = false; return; }
    const ctx = R.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    let sx = 0, sy = 0;
    if (R.shake > 0) { sx = (Math.random() - 0.5) * R.shake; sy = (Math.random() - 0.5) * R.shake; R.shake *= 0.85; if (R.shake < 0.3) R.shake = 0; }
    ctx.clearRect(0, 0, R.canvas.width, R.canvas.height);
    ctx.drawImage(R.stat, sx * R.scale, sy * R.scale);
    ctx.setTransform(R.scale, 0, 0, R.scale, sx * R.scale, sy * R.scale);
    drawWater(ctx, now);
    drawChests(ctx);
    for (const kind of ['danger', 'move', 'heal', 'attack', 'area', 'focus']) if (R.over[kind]) drawOver(ctx, kind, R.over[kind], now);
    if (R.path) drawPath(ctx, R.path);
    drawUnits(ctx, now);
    if (R.cursor.show) drawCursor(ctx, now);
    drawFloats(ctx, now);
    requestAnimationFrame(R.frame);
  };

  function drawWater(ctx, now) {
    const B = R.B;
    ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 1.2;
    for (let y = 0; y < B.h; y++) for (let x = 0; x < B.w; x++) {
      if (B.tiles[y][x] !== 'water') continue;
      const h = hash(x, y);
      for (let i = 0; i < 2; i++) {
        const ph = (now / 1400 + (h % 100) / 100 + i * 0.5) % 1;
        const wx = x * T + 6 + ((h >> (4 + i)) % 26) + Math.sin(ph * Math.PI * 2) * 3;
        const wy = y * T + 10 + i * 20 + ((h >> 8) % 8);
        ctx.globalAlpha = 0.25 + 0.35 * Math.sin(ph * Math.PI);
        ctx.beginPath(); ctx.moveTo(wx, wy); ctx.quadraticCurveTo(wx + 5, wy - 3, wx + 10, wy); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawChests(ctx) {
    const B = R.B;
    for (const k in B.chests) {
      const [x, y] = k.split(',').map(Number);
      ctx.save();
      if (B.opened[k]) { ctx.globalAlpha = 0.45; ctx.filter = 'grayscale(0.8)'; }
      obj(ctx, 'chest', x, y, 36, -6);
      ctx.restore();
    }
  }

  function drawOver(ctx, kind, tiles, now) {
    const [fill, line] = OVER[kind];
    const pulse = kind === 'focus' ? 0.5 + 0.5 * Math.sin(now / 150) : 1;
    ctx.globalAlpha = pulse;
    for (const p of tiles) {
      ctx.fillStyle = fill; ctx.fillRect(p.x * T + 1, p.y * T + 1, T - 2, T - 2);
      ctx.strokeStyle = line; ctx.lineWidth = 1; ctx.strokeRect(p.x * T + 2.5, p.y * T + 2.5, T - 5, T - 5);
    }
    ctx.globalAlpha = 1;
  }

  function drawPath(ctx, path) {
    if (path.length < 2) return;
    const pts = path.map((p) => [p.x * T + T / 2, p.y * T + T / 2]);
    for (const [w, c] of [[9, 'rgba(0,0,0,0.45)'], [5, '#fff6d0']]) {
      ctx.strokeStyle = c; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(...pts[0]); for (const p of pts.slice(1)) ctx.lineTo(...p); ctx.stroke();
    }
    const [ex, ey] = pts[pts.length - 1], [px, py] = pts[pts.length - 2];
    const a = Math.atan2(ey - py, ex - px);
    ctx.fillStyle = '#fff6d0'; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(ex + Math.cos(a) * 9, ey + Math.sin(a) * 9);
    ctx.lineTo(ex + Math.cos(a + 2.4) * 10, ey + Math.sin(a + 2.4) * 10);
    ctx.lineTo(ex + Math.cos(a - 2.4) * 10, ey + Math.sin(a - 2.4) * 10);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }

  function drawUnits(ctx, now) {
    const units = R.B.units.filter((u) => u.hp > 0 || u.dying).sort((a, b) => (a.ry ?? a.y) - (b.ry ?? b.y));
    for (const u of units) {
      const x = (u.rx ?? u.x) * T, y = (u.ry ?? u.y) * T;
      const ready = u.team === R.B.phase && !u.done;
      ctx.save();
      if (u.dying) ctx.globalAlpha = Math.max(0, u.dying);
      // 발밑 팀 고리
      ctx.fillStyle = u.boss ? '#f5c542' : TEAM[u.team];
      ctx.globalAlpha *= 0.55;
      ctx.beginPath(); ctx.ellipse(x + T / 2, y + T - 7, 18, 6.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha /= 0.55;
      ctx.strokeStyle = u.boss ? '#fff1a8' : 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.2; ctx.stroke();
      const bob = ready ? Math.sin(now / 260 + u.uid) * 1.3 : 0;
      const im = FD.img(FD.A.chibi[u.art]);
      if (u.done && u.team !== 'enemy') ctx.filter = 'grayscale(1) brightness(0.75)';
      if (u.done && u.team === 'enemy') ctx.filter = 'brightness(0.7)';
      if (u.flash && now < u.flash) ctx.filter = 'brightness(3) saturate(0)';
      const S = 56;
      // 팀 색 외곽선 - 발밑 고리는 캐릭터에 가려서 이것만으로는 적·아군이 안 갈린다
      if (!u.done && !(u.flash && now < u.flash)) { ctx.shadowColor = u.boss ? '#ffd23f' : TEAM[u.team]; ctx.shadowBlur = 7; }
      if (im) {
        ctx.drawImage(im, x + T / 2 - S / 2, y + T - S - 4 + bob, S, S);
        if (ctx.shadowBlur) ctx.drawImage(im, x + T / 2 - S / 2, y + T - S - 4 + bob, S, S);
      }
      else {
        ctx.fillStyle = TEAM[u.team]; ctx.beginPath(); ctx.arc(x + T / 2, y + T / 2 - 4 + bob, 16, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(u.name[0], x + T / 2, y + T / 2 + 2 + bob);
      }
      ctx.filter = 'none';
      ctx.shadowBlur = 0;
      // HP 막대
      const w = 34, hpw = Math.max(0, Math.round(w * u.hp / u.mhp));
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(x + (T - w) / 2 - 1, y + T - 5, w + 2, 5);
      ctx.fillStyle = u.hp / u.mhp > 0.5 ? '#4ade80' : u.hp / u.mhp > 0.25 ? '#facc15' : '#f87171';
      ctx.fillRect(x + (T - w) / 2, y + T - 4, hpw, 3);
      if (u.boss) {
        ctx.fillStyle = '#f5c542'; ctx.strokeStyle = '#5a3d00'; ctx.lineWidth = 1;
        ctx.beginPath(); const cx = x + 8, cy = y + 4;
        ctx.moveTo(cx, cy + 8); ctx.lineTo(cx, cy); ctx.lineTo(cx + 4, cy + 4); ctx.lineTo(cx + 7, cy - 1); ctx.lineTo(cx + 10, cy + 4); ctx.lineTo(cx + 14, cy); ctx.lineTo(cx + 14, cy + 8); ctx.closePath();
        ctx.fill(); ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawCursor(ctx, now) {
    const { x, y } = R.cursor;
    const p = 2 + Math.sin(now / 180) * 2;
    const X = x * T, Y = y * T, L = 12;
    ctx.strokeStyle = '#ffd966'; ctx.lineWidth = 3; ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 3;
    const c = [[X - p, Y - p, 1, 1], [X + T + p, Y - p, -1, 1], [X - p, Y + T + p, 1, -1], [X + T + p, Y + T + p, -1, -1]];
    for (const [cx, cy, dx, dy] of c) {
      ctx.beginPath(); ctx.moveTo(cx, cy + L * dy); ctx.lineTo(cx, cy); ctx.lineTo(cx + L * dx, cy); ctx.stroke();
    }
    ctx.shadowBlur = 0;
  }

  function drawFloats(ctx, now) {
    R.floats = R.floats.filter((f) => now - f.t0 < f.dur);
    for (const f of R.floats) {
      const k = (now - f.t0) / f.dur;
      ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      ctx.font = `bold ${f.size || 18}px "Malgun Gothic", sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      const X = f.x * T + T / 2, Y = f.y * T + 6 - k * 22;
      ctx.strokeText(f.text, X, Y); ctx.fillStyle = f.color || '#fff'; ctx.fillText(f.text, X, Y);
    }
    ctx.globalAlpha = 1;
  }

  R.float = (x, y, text, color, size, dur = 1100) => R.floats.push({ x, y, text, color, size, dur, t0: performance.now() });

  // 한 칸씩 걸어간다 (u.rx/ry 를 보간)
  R.animateMove = (u, path, msPerTile = 90) => new Promise((resolve) => {
    if (!path || path.length < 2 || FD.fastMode) { u.rx = u.ry = undefined; resolve(); return; }
    let i = 0; let t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / msPerTile);
      const a = path[i], b = path[i + 1];
      u.rx = a.x + (b.x - a.x) * k; u.ry = a.y + (b.y - a.y) * k;
      if (k >= 1) {
        i++; t0 = now;
        if (i % 2 === 0) FD.sfx('step');
        if (i >= path.length - 1) { u.rx = u.ry = undefined; resolve(); return; }
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });

  R.fadeOut = (u) => new Promise((resolve) => {
    if (FD.fastMode) { resolve(); return; }
    u.dying = 1;
    const t0 = performance.now();
    const step = (now) => {
      u.dying = 1 - (now - t0) / 600;
      if (u.dying <= 0) { u.dying = 0; resolve(); return; }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });

  // 캔버스 픽셀 → 타일 좌표
  R.tileFromEvent = (ev) => {
    const r = R.canvas.getBoundingClientRect();
    const x = Math.floor(((ev.clientX - r.left) / r.width) * R.B.w);
    const y = Math.floor(((ev.clientY - r.top) / r.height) * R.B.h);
    return FD.inBounds(R.B, x, y) ? { x, y } : null;
  };
  R.tileToScreen = (x, y) => {
    const r = R.canvas.getBoundingClientRect();
    return { left: r.left + ((x + 1) / R.B.w) * r.width, top: r.top + (y / R.B.h) * r.height, tile: r.width / R.B.w };
  };
})(window.FD);
