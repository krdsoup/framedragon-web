// 야영지 — 챕터 사이. 부대 · 장비 · 상점 · 교회(전직·부활) · 저장 · 출격.
// 원작은 마을의 교회에서 전직했다. 여기서는 야영지의 순례 사제가 대신한다.
(function (FD) {
  const Camp = FD.Camp = {};
  const $ = FD.$;
  let resolveGo = null;
  let tab = 'party';
  let equipFor = null;

  const shopTier = () => (FD.party.chapter <= 2 ? 1 : 2);
  const reviveCost = (u) => u.level * 40;

  function render() {
    $('#camp-gold').textContent = FD.party.gold;
    $('#camp-title').textContent = `야영지 — 다음: 제${FD.party.chapter}장 ${(window.FD_CHAPTERS[FD.party.chapter - 1] || {}).title || ''}`;
    FD.$$('.camp-menu button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    const c = $('#camp-content');
    const roster = FD.party.roster;
    if (tab === 'party') {
      c.innerHTML = `<div class="roster">${roster.map((u) => `<div class="rcard ${u.dead ? 'dead' : ''}">${FD.UI.unitCard(u)}${u.dead ? '<div class="dead-tag">전투 불능 — 교회에서 부활</div>' : ''}</div>`).join('')}</div>`;
    } else if (tab === 'equip') {
      const u = equipFor && FD.hero(equipFor) ? FD.hero(equipFor) : roster[0];
      const wtype = FD.cls(u).weapon;
      const options = FD.bagList('weapon').filter(({ item }) => item.type === wtype);
      c.innerHTML = `
        <div class="equip">
          <div class="equip-list">${roster.map((h) => `<button data-hero="${h.key}" class="${h === u ? 'on' : ''}">${FD.esc(h.name)} <small>${FD.cls(h).name}</small></button>`).join('')}</div>
          <div class="equip-detail">
            ${FD.UI.unitCard(u)}
            <h4>가방의 ${{ sword: '검', axe: '도끼', lance: '창', bow: '활', staff: '지팡이', tome: '마도서' }[wtype]}</h4>
            ${options.length ? options.map(({ id, n, item }) => `<div class="row"><span>${item.name} ×${n}</span><span>공격 +${item.atk}${item.mag ? ` · 마력 +${item.mag}` : ''}${item.agi ? ` · 민첩 +${item.agi}` : ''}</span><button data-equip="${id}">장비</button></div>`).join('')
              : '<p class="muted">장비할 수 있는 무기가 가방에 없다. 상점에서 사거나 보물상자에서 얻는다.</p>'}
          </div>
        </div>`;
    } else if (tab === 'shop') {
      const list = FD.R.shop[shopTier()];
      const sell = Object.entries(FD.party.bag).filter(([id]) => FD.item(id).price > 0);
      c.innerHTML = `
        <div class="shop">
          <div><h4>사기</h4>${list.map((id) => {
            const it = FD.item(id);
            return `<div class="row"><span>${it.name}</span><span class="muted">${it.kind === 'weapon' ? `공격 +${it.atk}${it.mag ? ` 마력 +${it.mag}` : ''} (${{ sword: '검', axe: '도끼', lance: '창', bow: '활', staff: '지팡이', tome: '마도서' }[it.type]})` : it.desc}</span><span class="price">${it.price}G</span><button data-buy="${id}" ${FD.party.gold < it.price ? 'disabled' : ''}>구입</button></div>`;
          }).join('')}</div>
          <div><h4>팔기 <small class="muted">(반값)</small></h4>${sell.length ? sell.map(([id, n]) => {
            const it = FD.item(id);
            return `<div class="row"><span>${it.name} ×${n}</span><span class="price">${Math.floor(it.price / 2)}G</span><button data-sell="${id}">판매</button></div>`;
          }).join('') : '<p class="muted">팔 물건이 없다.</p>'}</div>
        </div>`;
    } else if (tab === 'church') {
      c.innerHTML = `
        <div class="church">
          <p class="muted">레벨 ${FD.R.PROMOTE_LEVEL} 이상이면 전직할 수 있다. 전직하면 능력치가 크게 오르고 새 기술을 얻는다.</p>
          ${roster.map((u) => {
            const to = FD.cls(u).promoteTo;
            let btn;
            if (u.dead) btn = `<button data-revive="${u.key}" ${FD.party.gold < reviveCost(u) ? 'disabled' : ''}>부활 (${reviveCost(u)}G)</button>`;
            else if (!to) btn = '<span class="muted">최상위 직업</span>';
            else if (FD.canPromote(u)) btn = `<button data-promote="${u.key}" class="gold-btn">${FD.R.classes[to].name}(으)로 전직</button>`;
            else btn = `<span class="muted">Lv ${FD.R.PROMOTE_LEVEL} 필요 (현재 ${u.level})</span>`;
            return `<div class="row"><span><b>${FD.esc(u.name)}</b> ${FD.cls(u).name} Lv ${u.level}</span>${btn}</div>`;
          }).join('')}
        </div>`;
    } else if (tab === 'save') {
      const ok = FD.save();
      c.innerHTML = `<p>${ok ? '저장했다. 타이틀의 “이어하기”로 여기서 다시 시작한다.' : '<span class="bad">이 브라우저에서는 저장할 수 없다 (저장소 차단).</span>'}</p>`;
    }
  }

  function onClick(ev) {
    const b = ev.target.closest('button');
    if (!b || b.disabled) return;
    const d = b.dataset;
    if (d.tab) {
      FD.sfx('select');
      if (d.tab === 'go') { const r = resolveGo; resolveGo = null; r && r(); return; }
      tab = d.tab; render(); return;
    }
    if (d.hero) { equipFor = d.hero; FD.sfx('cursor'); render(); return; }
    if (d.equip) {
      const u = equipFor && FD.hero(equipFor) ? FD.hero(equipFor) : FD.party.roster[0];
      if (FD.bagTake(d.equip)) { if (u.weapon) FD.bagAdd(u.weapon); u.weapon = d.equip; FD.sfx('item'); }
      render(); return;
    }
    if (d.buy) {
      const it = FD.item(d.buy);
      if (FD.party.gold >= it.price) { FD.party.gold -= it.price; FD.bagAdd(d.buy); FD.sfx('coins'); }
      render(); return;
    }
    if (d.sell) {
      const it = FD.item(d.sell);
      if (FD.bagTake(d.sell)) { FD.party.gold += Math.floor(it.price / 2); FD.sfx('select'); }
      render(); return;
    }
    if (d.promote) {
      const u = FD.hero(d.promote);
      const from = FD.cls(u).name;
      FD.promote(u);
      FD.sfx('levelup');
      FD.UI.modal(`<div class="lvup"><div class="lvup-title">전직!</div><div class="lvup-name">${FD.esc(u.name)}: ${from} → ${FD.cls(u).name}</div>
        <p>${FD.spellsOf(u).length ? '기술: ' + FD.spellsOf(u).map((s) => FD.R.spells[s].name).join(' · ') : ''}</p></div>`);
      render(); return;
    }
    if (d.revive) {
      const u = FD.hero(d.revive);
      const cost = reviveCost(u);
      if (FD.party.gold >= cost) { FD.party.gold -= cost; u.dead = false; u.hp = u.mhp; FD.sfx('heal'); }
      render();
    }
  }

  Camp.run = () => new Promise((resolve) => {
    resolveGo = resolve;
    tab = 'party';
    const bg = FD.A.bg.camp;
    FD.$('.camp-bg').style.backgroundImage = bg ? `url("${bg}")` : 'none';
    FD.UI.show('camp-screen');
    FD.bgm.play('camp');
    FD.save();
    render();
  });

  document.addEventListener('DOMContentLoaded', () => {
    FD.$('#camp-screen').addEventListener('click', onClick);
  });
})(window.FD);
