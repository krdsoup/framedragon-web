// 시작 — 타이틀과 챕터 흐름.
// 챕터 한 판: 장 제목 → 도입 대화 → 전투 → (승리) 결말 대화 → 야영지 → 다음 장
//                                        (패배) 재도전 · 타이틀
(function (FD) {
  const $ = FD.$;
  const UI = FD.UI;

  async function chapterCard(ch) {
    const layer = $('#scene-layer');
    const card = FD.el('div', 'chapter-card', `<small>CHAPTER ${ch.id}</small><h2>${ch.title}</h2><p>${ch.place}</p>`);
    $('.scene-bg', layer).style.backgroundImage = FD.A.bg[ch.sceneBg] ? `url("${FD.A.bg[ch.sceneBg]}")` : 'none';
    layer.classList.remove('overlay');
    layer.classList.add('card-mode');
    layer.appendChild(card);
    layer.classList.remove('hidden');
    await UI.fade(false);
    await Promise.race([FD.sleep(2200), FD.waitInput(layer)]);
    card.remove();
    layer.classList.remove('card-mode');
    layer.classList.add('hidden');
  }

  async function playChapter(n) {
    const ch = window.FD_CHAPTERS[n - 1];
    const story = (window.FD_STORY || {})[n] || {};
    await UI.fade(true);
    UI.show('none');
    FD.bgm.play('story');
    await chapterCard(ch);
    if (!FD.fastMode) await UI.scene(story.intro, { bg: ch.sceneBg });
    const snapshot = JSON.stringify(FD.party);
    await UI.fade(true);
    const pending = FD.Battle.run(ch);
    await UI.fade(false);
    const result = await pending;
    if (result === 'victory') {
      FD.bgm.play('victory', { loop: false });
      const got = FD.Battle.commit();
      if (!FD.fastMode) {
        await UI.modal(`<div class="result win"><div class="res-title">승리!</div>
          <p>제${ch.id}장 「${ch.title}」 클리어</p>
          <p>전리품 <b>${got.gold}G</b> + 보상 <b>${got.reward}G</b></p></div>`);
      }
      FD.bgm.play('story');
      if (!FD.fastMode) await UI.scene(story.outro, { bg: ch.sceneBg });
      FD.party.chapter = n + 1;
      FD.save();
      return 'next';
    }
    FD.party = JSON.parse(snapshot);                 // 전투 중 얻고 쓴 것을 되돌린다
    FD.bgm.play('gameover', { loop: false });
    if (FD.fastMode) return 'defeat';
    const v = await UI.modal(`<div class="result lose"><div class="res-title">패배…</div><p>${ch.defeat.text}</p></div>`,
      [{ label: '재도전', value: 'retry' }, { label: '타이틀로', value: 'title' }]);
    return v;
  }

  async function campaign() {
    while (FD.party.chapter <= window.FD_CHAPTERS.length) {
      const n = FD.party.chapter;
      if (n > 1 && !FD.test.skipCamp) {
        await UI.fade(true);
        const p = FD.Camp.run();
        await UI.fade(false);
        await p;
      }
      let r;
      do { r = await playChapter(n); } while (r === 'retry');
      if (r === 'title' || r === 'defeat') return title();
    }
    await ending();
    title();
  }

  async function ending() {
    await UI.fade(true);
    FD.bgm.play('title');
    await chapterCard({ id: 'END', title: '— 다음 이야기로 —', place: '프레임드래곤 시험판을 플레이해 주셔서 고맙다', sceneBg: 'title' });
    FD.party.chapter = 1;
    try { localStorage.removeItem('fd_save_v1'); } catch (e) { /* 무시 */ }
  }

  function title() {
    UI.show('title-screen');
    const bg = FD.A.bg.title;
    $('.title-bg').style.backgroundImage = bg ? `url("${bg}")` : 'none';
    $('[data-act="continue"]').disabled = !FD.hasSave();
    FD.bgm.play('title');
    UI.fade(false);
  }

  let busy = false;
  $('#title-screen').addEventListener('click', async (ev) => {
    const b = ev.target.closest('button');
    if (!b || busy) return;
    FD.sfx('select');
    const act = b.dataset.act;
    if (act === 'settings') { await UI.settings(); return; }
    if (act === 'new') FD.newGame();
    else if (act === 'continue') { if (!FD.load()) return; }
    busy = true;
    try { await campaign(); } finally { busy = false; }
  });

  FD.Render.init($('#map'));
  FD.start = { campaign, playChapter, title };
  title();
})(window.FD);
