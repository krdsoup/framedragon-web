// 공용 유틸. 모든 엔진 파일이 window.FD 네임스페이스 하나를 공유한다.
// ES 모듈을 쓰지 않는 이유: index.html 을 file:// 로 더블클릭해도 돌아가게 하려고.
window.FD = window.FD || {};

(function (FD) {
  FD.R = window.FD_RULES;
  FD.A = window.FD_ASSETS || { portraits: {}, sprites: {}, chibi: {}, bg: {}, textures: {}, objects: {}, bgm: {} };

  FD.$ = (sel, root) => (root || document).querySelector(sel);
  FD.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  FD.clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  FD.randInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
  FD.chance = (pct) => Math.random() * 100 < pct;
  FD.dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  FD.key = (x, y) => x + ',' + y;
  FD.sleep = (ms) => new Promise((r) => setTimeout(r, FD.fastMode ? Math.min(ms, 1) : ms));
  FD.el = (tag, cls, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  };
  FD.esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // 이미지 캐시 - 없는 그림은 null 로 두고 엔진이 대체 도형을 그린다
  const imgCache = {};
  FD.img = (src) => {
    if (!src) return null;
    if (!imgCache[src]) {
      const im = new Image();
      im.src = src;
      imgCache[src] = im;
    }
    const im = imgCache[src];
    return im.complete && im.naturalWidth ? im : null;
  };
  FD.preload = (srcs) => Promise.all(srcs.filter(Boolean).map((src) => new Promise((res) => {
    const im = new Image();
    im.onload = im.onerror = () => res();
    im.src = src;
    imgCache[src] = im;
  })));

  // 설정 - 브라우저 저장소가 막혀 있어도 기본값으로 돈다
  FD.settings = { anim: true, bgm: 0.5, sfx: true, textSpeed: 28 };
  try {
    const s = JSON.parse(localStorage.getItem('fd_settings') || 'null');
    if (s) Object.assign(FD.settings, s);
  } catch (e) { /* 저장소 없음 */ }
  FD.saveSettings = () => {
    try { localStorage.setItem('fd_settings', JSON.stringify(FD.settings)); } catch (e) { /* 무시 */ }
  };

  // 한 번 누르면 풀리는 입력 대기 (대화 넘기기 등)
  FD.waitInput = (el) => new Promise((resolve) => {
    const done = (ev) => {
      if (ev.type === 'keydown' && !['Enter', ' ', 'z', 'Z', 'x', 'X', 'Escape'].includes(ev.key)) return;
      ev.preventDefault && ev.preventDefault();
      window.removeEventListener('keydown', done, true);
      (el || window).removeEventListener('pointerdown', done, true);
      resolve(ev);
    };
    setTimeout(() => {
      window.addEventListener('keydown', done, true);
      (el || window).addEventListener('pointerdown', done, true);
    }, 30);
  });
})(window.FD);
