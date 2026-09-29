// 부대 상태 — 챕터 사이에 남는 것(동료·가방·소지금·진행도)과 저장.
// 저장은 localStorage 한 칸이다. 막혀 있으면(사생활 보호 창 등) 저장만 안 되고 게임은 돈다.
(function (FD) {
  const SAVE_KEY = 'fd_save_v1';

  FD.party = null;

  FD.newGame = () => {
    FD.party = {
      roster: ['leon', 'sera', 'volk'].map(FD.makeHero),
      bag: { herb: 3, potion: 1 },
      gold: 300,
      chapter: 1,
    };
  };

  FD.hero = (key) => FD.party.roster.find((u) => u.key === key) || null;

  FD.addHero = (key) => {
    let u = FD.hero(key);
    if (!u) { u = FD.makeHero(key); FD.party.roster.push(u); }
    return u;
  };

  FD.bagAdd = (id, n = 1) => { FD.party.bag[id] = (FD.party.bag[id] || 0) + n; };
  FD.bagTake = (id) => {
    if (!FD.party.bag[id]) return false;
    if (--FD.party.bag[id] <= 0) delete FD.party.bag[id];
    return true;
  };
  FD.bagList = (kind) => Object.entries(FD.party.bag)
    .filter(([id]) => !kind || FD.item(id).kind === kind)
    .map(([id, n]) => ({ id, n, item: FD.item(id) }));

  FD.hasSave = () => {
    try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
  };
  FD.save = () => {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, at: Date.now(), party: FD.party }));
      return true;
    } catch (e) { return false; }
  };
  FD.load = () => {
    try {
      const d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (!d || !d.party) return false;
      FD.party = d.party;
      FD.bumpUid(Math.max(0, ...FD.party.roster.map((u) => u.uid)));
      return true;
    } catch (e) { return false; }
  };
})(window.FD);
