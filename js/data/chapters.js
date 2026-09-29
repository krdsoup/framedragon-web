// 챕터 — 맵·배치·이벤트. 손으로 쓴다.
//
// 맵 문자: . 평지  , 길  T 숲  M 산  ~ 강  = 다리  H 민가
//          # 성벽  _ 바닥  r 융단  P 기둥  D 문  C 상자  K 옥좌
// 좌표는 [x, y], 왼쪽 위가 [0, 0]. 모든 맵은 20×14.
//
// 이벤트 on: turn(아군 턴 시작) · death(유닛 사망) · adjacent(아군이 대상에 인접) · enter(아군이 영역 진입)
// 이벤트 actions: scene(js/data/story.js 장면) · join(동료 합류) · recruit(NPC 를 아군으로)
//                 spawn(적 등장) · ai(유닛 AI 변경) · msg(한 줄 알림)
// 장면 키는 tools/gen_story.py 의 SCENES 와 같아야 한다.

window.FD_CHAPTERS = [
  {
    id: 1, title: '불타는 새벽', place: '변방 마을 로엔',
    sceneBg: 'scene_ch1', bgm: 'battle', reward: 500,
    victory: { type: 'boss', key: 'gardo', text: '가르도 격파' },
    defeat: { keys: ['leon'], text: '레온 사망' },
    map: [
      'MMMTTTTTT,,TTTTTT~~T',
      'MMTT.....,,....TT~~T',
      'MT.......,,......~~.',
      'T...H....,,..H...~~.',
      '...HH....,,..HH..~~.',
      ',,,,,,,,,,,,,,,,,==,',
      '..H......,....H..~~.',
      '.HH......,...HH..~~T',
      '.........,.......~~T',
      '.T...H...,....T..~~T',
      'TT.......,...TT.~~TT',
      'TTT......,..TTT.~~TM',
      'MTTT.....,..TTTT~~MM',
      'MMTTT....,...TTT~~MM',
    ],
    heroes: { leon: [9, 11], sera: [8, 12], volk: [10, 12] },
    units: [
      { id: 'gardo', key: 'gardo', x: 9, y: 2, level: 4, ai: 'hold' },
      { id: 'bandit', x: 10, y: 3, level: 3, ai: 'hold' },
      { id: 'bandit', x: 6, y: 7, level: 2, ai: 'aggressive' },
      { id: 'bandit', x: 12, y: 8, level: 2, ai: 'aggressive' },
      { id: 'bandit', x: 4, y: 5, level: 3, ai: 'hold' },
      { id: 'bandit', x: 14, y: 5, level: 3, ai: 'hold' },
      { id: 'wolf', x: 2, y: 9, level: 2, ai: 'aggressive' },
      { id: 'wolf', x: 15, y: 9, level: 2, ai: 'hold' },
    ],
    hidden: { '13,3': 'potion', '4,3': 'herb', '1,1': 'seed_power' },
    chests: {},
    events: [
      { on: 'turn', turn: 3, actions: [{ scene: 'kain_arrive' }, { join: 'kain', at: [0, 5] }] },
      { on: 'turn', turn: 4, actions: [
        { scene: 'reinforce' },
        { spawn: [
          { id: 'bandit', x: 9, y: 0, level: 3, ai: 'aggressive' },
          { id: 'bandit', x: 10, y: 0, level: 3, ai: 'aggressive' },
          { id: 'bandit', x: 12, y: 1, level: 4, ai: 'aggressive' },
        ] },
      ] },
      { on: 'death', key: 'gardo', actions: [{ scene: 'boss_defeat' }] },
    ],
  },
  {
    id: 2, title: '검은 숲의 사냥꾼', place: '검은 숲',
    sceneBg: 'scene_ch2', bgm: 'battle', reward: 600,
    victory: { type: 'rout', text: '적 전멸' },
    defeat: { keys: ['leon', 'mia'], text: '레온 또는 미아 사망' },
    map: [
      'TTTTTTTTTTTTTTTTTTTT',
      'TT..TTT...TTTTT..TTT',
      'T....TT....TTT.....T',
      'T..~~.T..T.....TT..T',
      '..~~...TT...T.......',
      '.~~..T.......TT.....',
      '.=,,,,,,,,,,,,,,,,,,',
      '~~...TT.....TT..T...',
      '~..TTTT...T...TTT...',
      '...TTT...TTT.....T..',
      'T.....T.....TT....TT',
      'TT..T....T......TTTT',
      'TTT....TTTT..T...TTT',
      'TTTTTTTTTTTTTTTTTTTT',
    ],
    heroes: { leon: [4, 6], volk: [4, 7], sera: [2, 7], kain: [3, 5] },
    units: [
      // 미아를 쫓는 추격대는 둘뿐이다. 나머지는 숲에 매복해 있다가 사정권에 들어오면 움직인다
      { hero: 'mia', key: 'mia', team: 'ally', x: 9, y: 6, ai: 'cautious' },
      { id: 'soldier', x: 15, y: 6, level: 5, ai: 'aggressive' },
      { id: 'wolf', x: 10, y: 10, level: 4, ai: 'aggressive' },
      { id: 'soldier', x: 14, y: 8, level: 5, ai: 'hold' },
      { id: 'soldier', x: 14, y: 3, level: 5, ai: 'hold' },
      { id: 'soldier', x: 17, y: 7, level: 6, ai: 'hold' },
      { id: 'e_archer', x: 15, y: 3, level: 5, ai: 'hold' },
      { id: 'wolf', x: 12, y: 1, level: 5, ai: 'hold' },
      { id: 'wolf', x: 13, y: 11, level: 5, ai: 'hold' },
    ],
    hidden: { '9,3': 'long_bow', '4,12': 'ether', '16,7': 'seed_swift' },
    chests: {},
    events: [
      { on: 'adjacent', key: 'mia', actions: [{ scene: 'mia_join' }, { recruit: 'mia' }] },
      { on: 'turn', turn: 3, actions: [
        { scene: 'reinforce' },
        { spawn: [
          { id: 'e_archer', x: 19, y: 4, level: 6, ai: 'aggressive' },
          { id: 'e_archer', x: 19, y: 9, level: 6, ai: 'aggressive' },
          { id: 'soldier', x: 19, y: 6, level: 6, ai: 'aggressive' },
        ] },
      ] },
    ],
  },
  {
    id: 3, title: '잿빛 성채', place: '잿빛 성채',
    sceneBg: 'scene_ch3', bgm: 'battle', bossBgm: 'boss', reward: 1000,
    joinAtStart: ['lucian'],
    victory: { type: 'boss', key: 'zeon', text: '흑기사 제온 격파' },
    defeat: { keys: ['leon'], text: '레온 사망' },
    map: [
      '####################',
      '#C_#____rrKrr____#C#',
      '#__#_P__rrrrr__P_#_#',
      '#__D_____rrr_____D_#',
      '#__#_P___rrr___P_#_#',
      '####_____rrr_____###',
      '#____P___rrr___P___#',
      '#________rrr_______#',
      '#____P___rrr___P___#',
      '######___rrr___#####',
      '~~~~~#___rrr___#~~~~',
      '~~~~~~~~=====~~~~~~~',
      'TT....,,,,,,,,....TT',
      'TTT...,,,,,,,,...TTT',
    ],
    heroes: { leon: [9, 12], sera: [10, 13], volk: [8, 12], kain: [11, 12], mia: [7, 13], lucian: [12, 13] },
    units: [
      { id: 'zeon', key: 'zeon', x: 10, y: 1, level: 10, ai: 'boss' },
      { id: 'skeleton', x: 8, y: 9, level: 7, ai: 'aggressive' },
      { id: 'skeleton', x: 12, y: 9, level: 7, ai: 'aggressive' },
      { id: 'skeleton', x: 6, y: 7, level: 7, ai: 'aggressive' },
      { id: 'skeleton', x: 14, y: 7, level: 7, ai: 'aggressive' },
      { id: 'soldier', x: 9, y: 5, level: 8, ai: 'hold' },
      { id: 'soldier', x: 11, y: 5, level: 8, ai: 'hold' },
      { id: 'e_archer', x: 3, y: 6, level: 7, ai: 'hold' },
      { id: 'e_archer', x: 17, y: 6, level: 7, ai: 'hold' },
      { id: 'dark_mage', x: 7, y: 3, level: 8, ai: 'hold' },
      { id: 'dark_mage', x: 13, y: 3, level: 8, ai: 'hold' },
      { id: 'skeleton', x: 1, y: 3, level: 8, ai: 'hold' },
      { id: 'skeleton', x: 18, y: 3, level: 8, ai: 'hold' },
    ],
    hidden: { '10,7': 'seed_guard', '1,7': 'potion' },
    chests: { '1,1': 'dragon_fang', '18,1': 'elixir' },
    events: [
      { on: 'turn', turn: 4, actions: [
        { msg: '흑마도사의 주문에 바닥에서 해골병이 일어선다!' },
        { spawn: [
          { id: 'skeleton', x: 4, y: 7, level: 7, ai: 'aggressive' },
          { id: 'skeleton', x: 16, y: 7, level: 7, ai: 'aggressive' },
        ] },
      ] },
      { on: 'enter', rect: [4, 1, 16, 5], actions: [{ scene: 'boss_meet' }, { ai: { key: 'zeon', ai: 'aggressive' } }, { bgm: 'boss' }] },
      { on: 'death', key: 'zeon', actions: [{ scene: 'boss_defeat' }] },
    ],
  },
];
