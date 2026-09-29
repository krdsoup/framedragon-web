// DOM UI — 정보창·행동 메뉴·예측창·대화 장면·모달·배너·로그.
// 한글 글꼴 렌더링은 캔버스보다 DOM 이 낫다. 맵만 캔버스다.
(function (FD) {
  const UI = FD.UI = {};
  const $ = FD.$;

  UI.show = (id) => {
    FD.$$('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
  };

  UI.fade = async (to) => {
    const f = $('#fade');
    f.style.opacity = to ? '1' : '0';
    await FD.sleep(420);
  };

  // ---- 정보창 -----------------------------------------------------------
  const bar = (cur, max, cls) =>
    `<div class="bar ${cls}"><i style="width:${max ? Math.round((100 * cur) / max) : 0}%"></i><span>${cur} / ${max}</span></div>`;

  UI.unitCard = (u, { compact = false } = {}) => {
    const c = FD.cls(u);
    const w = FD.weaponOf(u);
    const [lo, hi] = FD.rangeOf(u);
    const team = { player: '아군', enemy: '적군', ally: '우군' }[u.team];
    const portrait = FD.A.portraits[u.art];
    return `
      <div class="ucard team-${u.team}">
        <div class="uc-head">
          <div class="uc-portrait">${portrait ? `<img src="${portrait}" alt="">` : ''}</div>
          <div class="uc-id">
            <div class="uc-name">${FD.esc(u.name)}${u.boss ? ' <em class="boss">BOSS</em>' : ''}</div>
            <div class="uc-cls">${team} · ${c.name} · Lv ${u.level}</div>
            ${u.team === 'player' ? `<div class="exp"><i style="width:${u.exp}%"></i></div>` : ''}
          </div>
        </div>
        ${bar(u.hp, u.mhp, 'hp')}
        ${u.mmp ? bar(u.mp, u.mmp, 'mp') : ''}
        ${compact ? '' : `
        <table class="uc-stats">
          <tr><th>공격</th><td>${FD.isMagicWeapon(u) ? FD.magOf(u) + (w.atk || 0) : FD.atkOf(u)}</td><th>방어</th><td>${u.def}</td></tr>
          <tr><th>민첩</th><td>${FD.agiOf(u)}</td><th>마력</th><td>${FD.magOf(u)}</td></tr>
          <tr><th>이동</th><td>${FD.movOf(u)}</td><th>사거리</th><td>${lo === hi ? lo : lo + '~' + hi}</td></tr>
        </table>
        <div class="uc-weapon">⚔ ${w.name || '맨손'} <small>(+${w.atk || 0})</small></div>
        ${FD.spellsOf(u).length ? `<div class="uc-spells">✦ ${FD.spellsOf(u).map((s) => FD.R.spells[s].name).join(' · ')}</div>` : ''}`}
      </div>`;
  };

  UI.setUnitPanel = (u) => {
    $('#unit-panel').innerHTML = u ? UI.unitCard(u) : '<div class="muted">유닛 위에 커서를 올리면 정보가 나온다.</div>';
  };

  UI.setTerrainPanel = (B, x, y) => {
    if (x == null) { $('#terrain-panel').innerHTML = ''; return; }
    const t = FD.terrainAt(B, x, y);
    const cost = t.cost.foot == null ? '통과 불가' : `이동 비용 ${t.cost.foot}`;
    let extra = '';
    const k = FD.key(x, y);
    if (B.chests[k]) extra = B.opened[k] ? ' · 빈 상자' : ' · <b>보물상자</b>';
    $('#terrain-panel').innerHTML =
      `<div class="terr"><b>${t.name}</b> <span>(${x},${y})</span></div>
       <div class="terr-sub">방어 +${t.def}% · 회피 +${t.eva}${t.heal ? ` · 턴마다 HP ${Math.round(t.heal * 100)}% 회복` : ''} · ${cost}${extra}</div>`;
  };

  UI.log = (html) => {
    const log = $('#log');
    const line = FD.el('div', 'log-line', html);
    log.prepend(line);
    while (log.children.length > 40) log.lastChild.remove();
  };

  UI.topbar = (B) => {
    $('#tb-chapter').textContent = `제${B.chapter.id}장 ${B.chapter.title}`;
    $('#tb-turn').textContent = `턴 ${B.turn}`;
    const ph = { player: '아군의 턴', enemy: '적군의 턴', ally: '우군의 턴' }[B.phase];
    $('#tb-phase').textContent = ph;
    $('#tb-phase').className = 'phase-' + B.phase;
    $('#tb-objective').innerHTML = `<b>승리</b> ${B.chapter.victory.text} &nbsp; <b>패배</b> ${B.chapter.defeat.text}`;
    $('#btn-anim').textContent = FD.settings.anim ? '연출 ON' : '연출 OFF';
  };

  UI.banner = async (text, cls) => {
    const b = $('#banner');
    b.className = cls || '';
    b.innerHTML = `<span>${text}</span>`;
    b.classList.remove('hidden');
    b.classList.add('show');
    await FD.sleep(1100);
    b.classList.remove('show');
    await FD.sleep(250);
    b.classList.add('hidden');
  };

  // ---- 팝업 메뉴 --------------------------------------------------------
  // items: [{label, sub, disabled, value}] → 고른 value 또는 null(취소)
  UI.menu = (items, anchor, { title } = {}) => new Promise((resolve) => {
    const m = $('#action-menu');
    m.innerHTML = (title ? `<div class="menu-title">${title}</div>` : '') + items.map((it, i) =>
      `<button data-i="${i}" ${it.disabled ? 'disabled' : ''}><span>${it.label}</span>${it.sub ? `<small>${it.sub}</small>` : ''}</button>`).join('');
    m.classList.remove('hidden');
    const wrap = $('#map-wrap').getBoundingClientRect();
    let left = anchor.left - wrap.left + 8, top = anchor.top - wrap.top;
    m.style.left = '0px'; m.style.top = '0px';
    const mr = m.getBoundingClientRect();
    if (left + mr.width > wrap.width - 4) left = anchor.left - wrap.left - anchor.tile - mr.width - 8;
    left = FD.clamp(left, 4, wrap.width - mr.width - 4);
    top = FD.clamp(top, 4, wrap.height - mr.height - 4);
    m.style.left = left + 'px'; m.style.top = top + 'px';
    const btns = FD.$$('button', m);
    let sel = btns.findIndex((b) => !b.disabled);
    const focus = () => btns.forEach((b, i) => b.classList.toggle('sel', i === sel));
    focus();
    const close = (v) => {
      m.classList.add('hidden');
      window.removeEventListener('keydown', onKey, true);
      m.removeEventListener('click', onClick);
      m.removeEventListener('mouseover', onHover);
      UI.menuOpen = null;
      resolve(v);
    };
    const onClick = (ev) => {
      const b = ev.target.closest('button');
      if (!b || b.disabled) return;
      FD.sfx('select');
      close(items[+b.dataset.i].value);
    };
    const onHover = (ev) => {
      const b = ev.target.closest('button');
      if (b && !b.disabled) { sel = +b.dataset.i; focus(); }
    };
    const onKey = (ev) => {
      if (['ArrowDown', 'ArrowUp', 's', 'w'].includes(ev.key)) {
        const d = ev.key === 'ArrowDown' || ev.key === 's' ? 1 : -1;
        for (let k = 0; k < btns.length; k++) {
          sel = (sel + d + btns.length) % btns.length;
          if (!btns[sel].disabled) break;
        }
        FD.sfx('cursor'); focus();
      } else if (['Enter', ' ', 'z', 'Z'].includes(ev.key)) {
        if (sel >= 0 && !btns[sel].disabled) { FD.sfx('select'); close(items[sel].value); }
      } else if (['Escape', 'x', 'X'].includes(ev.key)) {
        FD.sfx('cancel'); close(null);
      } else return;
      ev.preventDefault(); ev.stopPropagation();
    };
    m.addEventListener('click', onClick);
    m.addEventListener('mouseover', onHover);
    window.addEventListener('keydown', onKey, true);
    UI.menuOpen = () => { FD.sfx('cancel'); close(null); };
  });

  UI.hideForecast = () => $('#forecast').classList.add('hidden');
  UI.showForecast = (B, a, d, spell) => {
    const f = $('#forecast');
    let html;
    if (spell) {
      const eff = FD.spellEffect(B, a, spell, d);
      html = `<div class="fc-row"><b>${FD.esc(a.name)}</b> ▶ <b>${FD.esc(d.name)}</b></div>
        <div class="fc-grid"><span>${spell.name}</span><span>${eff.heal != null ? '회복 ' + eff.heal : '피해 ' + eff.dmg}</span><span>MP ${spell.mp}</span></div>
        <div class="fc-note">마법은 반드시 명중한다${spell.area ? ' · 범위 공격' : ''}</div>`;
    } else {
      const fc = FD.forecast(B, a, d);
      const col = (n, who) => n ? `<div class="fc-col"><div class="fc-name">${FD.esc(who.name)}</div>
          <div>피해 <b>${n.dmg}</b>${n.double ? ' ×2' : ''}</div><div>명중 <b>${n.hit}%</b></div><div>필살 <b>${n.crit}%</b></div>
          <div class="fc-hp">HP ${who.hp}/${who.mhp}</div></div>`
        : `<div class="fc-col off"><div class="fc-name">${FD.esc(who.name)}</div><div>반격 불가</div><div class="fc-hp">HP ${who.hp}/${who.mhp}</div></div>`;
      html = `<div class="fc-cols">${col(fc.a, a)}<div class="fc-vs">VS</div>${col(fc.d, d)}</div>`;
    }
    f.innerHTML = html;
    f.classList.remove('hidden');
  };

  // ---- 대화 장면 ---------------------------------------------------------
  const cast = () => {
    const out = {};
    for (const [id, h] of Object.entries(FD.R.heroes)) out[id] = h.name;
    for (const [id, e] of Object.entries(FD.R.enemies)) out[id] = e.name;
    out.elder = '촌장 하롤드'; out.narration = ''; out.soldier = '제국병';
    return out;
  };

  UI.scene = async (lines, { bg, overlay = false } = {}) => {
    if (!lines || !lines.length) return;
    const layer = $('#scene-layer');
    const names = cast();
    layer.classList.toggle('overlay', overlay);
    const bgEl = $('.scene-bg', layer);
    bgEl.style.backgroundImage = bg && FD.A.bg[bg] ? `url("${FD.A.bg[bg]}")` : 'none';
    layer.classList.remove('hidden');
    const dlg = $('#dialog');
    const img = $('.dlg-portrait img', dlg);
    let skipped = false;
    const skipBtn = $('#scene-skip');
    const onSkip = (ev) => { ev.stopPropagation(); skipped = true; };
    skipBtn.addEventListener('pointerdown', onSkip, true);
    try {
      for (const line of lines) {
        if (skipped) break;
        const sp = line.speaker;
        const portrait = FD.A.portraits[sp];
        dlg.classList.toggle('narration', sp === 'narration');
        img.style.display = portrait ? '' : 'none';
        if (portrait) img.src = portrait;
        $('.dlg-name', dlg).textContent = names[sp] || '';
        const txt = $('.dlg-text', dlg);
        txt.textContent = '';
        // 글자를 한 자씩 - 입력이 오면 즉시 전부
        let full = false;
        const typing = (async () => {
          for (let i = 1; i <= line.text.length; i++) {
            if (full || skipped) break;
            txt.textContent = line.text.slice(0, i);
            await FD.sleep(FD.settings.textSpeed);
          }
          txt.textContent = line.text;
          full = true;
        })();
        const ev = await Promise.race([FD.waitInput(layer), typing.then(() => 'typed')]);
        if (ev !== 'typed') { full = true; await typing; if (!skipped) await FD.waitInput(layer); }
        else if (!skipped) await FD.waitInput(layer);
        FD.sfx('cursor');
      }
    } finally {
      skipBtn.removeEventListener('pointerdown', onSkip, true);
      layer.classList.add('hidden');
    }
  };

  // ---- 모달 -------------------------------------------------------------
  UI.modal = (html, buttons = [{ label: '확인', value: true }]) => new Promise((resolve) => {
    const m = $('#modal');
    const box = $('.modal-box', m);
    box.innerHTML = html + `<div class="modal-btns">${buttons.map((b, i) => `<button data-i="${i}" class="${b.cls || ''}">${b.label}</button>`).join('')}</div>`;
    m.classList.remove('hidden');
    const onKey = (ev) => {
      if (['Enter', 'z', 'Z', ' '].includes(ev.key)) { done(buttons[0].value); ev.preventDefault(); ev.stopPropagation(); }
      else if (['Escape', 'x', 'X'].includes(ev.key) && buttons.length > 1) { done(buttons[buttons.length - 1].value); ev.preventDefault(); ev.stopPropagation(); }
    };
    const done = (v) => {
      m.classList.add('hidden');
      window.removeEventListener('keydown', onKey, true);
      resolve(v);
    };
    FD.$$('.modal-btns button', box).forEach((b) => b.addEventListener('click', () => { FD.sfx('select'); done(buttons[+b.dataset.i].value); }));
    window.addEventListener('keydown', onKey, true);
  });

  UI.levelUpHtml = (u, up) => {
    const names = { mhp: 'HP', mmp: 'MP', atk: '공격', def: '방어', agi: '민첩', mag: '마력' };
    const gains = Object.entries(up.gains).map(([k, v]) => `<span>${names[k]} <b>+${v}</b></span>`).join('');
    const learned = up.learned.map((s) => `<div class="learn">새 마법: ${FD.R.spells[s].name}</div>`).join('');
    return `<div class="lvup"><div class="lvup-title">LEVEL UP!</div><div class="lvup-name">${FD.esc(u.name)} Lv ${up.level}</div><div class="lvup-gains">${gains}</div>${learned}</div>`;
  };

  UI.settings = async () => {
    const s = FD.settings;
    const html = `<h3>설정</h3>
      <label class="set-row"><span>전투 연출</span><input type="checkbox" id="set-anim" ${s.anim ? 'checked' : ''}></label>
      <label class="set-row"><span>효과음</span><input type="checkbox" id="set-sfx" ${s.sfx ? 'checked' : ''}></label>
      <label class="set-row"><span>효과음 음량</span><input type="range" id="set-sfxvol" min="0" max="1" step="0.05" value="${s.sfxVol}"></label>
      <label class="set-row"><span>BGM 음량</span><input type="range" id="set-bgm" min="0" max="1" step="0.05" value="${s.bgm}"></label>
      <label class="set-row"><span>글자 속도</span><input type="range" id="set-text" min="0" max="60" step="4" value="${60 - s.textSpeed}"></label>`;
    const p = UI.modal(html, [{ label: '닫기', value: true }]);
    $('#set-bgm').addEventListener('input', (e) => FD.bgm.setVolume(+e.target.value));
    // 손을 뗄 때 한 번 들려 준다 - 음량을 귀로 맞추게
    $('#set-sfxvol').addEventListener('change', (e) => { FD.sfx.setVolume(+e.target.value); FD.sfx('hit', { weapon: 'sword' }); });
    await p;
    s.anim = $('#set-anim').checked;
    s.sfx = $('#set-sfx').checked;
    FD.sfx.setVolume(+$('#set-sfxvol').value);
    s.bgm = +$('#set-bgm').value;
    s.textSpeed = 60 - +$('#set-text').value;
    FD.saveSettings();
  };
})(window.FD);
