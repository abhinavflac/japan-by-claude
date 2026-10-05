/* ============================================================
   The plan of Akari-chō 3-chōme. One coordinate system for everything.
   Street runs along z (toward -z is "down the street", toward the station).
   x < 0 is the west side, x > 0 the east side. Units are metres.
   ============================================================ */

const ROAD_HW = 3.25;          // road half width
const FRONT_X = 6.0;           // building line on both sides
const CURB_H = 0.15;           // sidewalk height
const CROSS = { r0: -43.5, r1: -36.5, s0: -46.0, s1: -34.0 }; // cross street: road z range, sidewalk outer z
const ALLEY = { z0: -7.0, z1: -4.5, x1: 34 };                  // Akari Yokochō, east side
const VIADUCT = { z0: -112, z1: -104, deckBottom: 4.6, deckTop: 5.6 };
const HERO = new THREE.Vector3(5.0, CURB_H, 0.0);
const HERO_HEAD = new THREE.Vector3(5.0, 1.86, 0.0);
const HERO_CHEST = new THREE.Vector3(5.0, 1.42, 0.0);

// Ground height used by walkers: sidewalks are raised, roads are not.
function groundY(x, z) {
  const ax = Math.abs(x);
  const onCrossRoad = z < CROSS.r1 && z > CROSS.r0;
  if (onCrossRoad) return 0;
  if (ax < ROAD_HW) return 0;
  return CURB_H;
}

/* ---------- every string painted in the world (registered for font loading) ---------- */
const TX = {
  arch: jt('mincho', 'あかり町商店街'), archBack: jt('mincho', 'またお越しくださいませ'),
  hero: {
    v1: jt('retro', '純喫茶'), v2: jt('retro', 'ルナ'), fascia: jt('retro', '珈琲 ルナ'),
    glass: jt('retro', '純喫茶ルナ'), board: [jt('round', '本日のケーキ'), jt('round', 'チーズケーキ'), jt('round', 'ナポリタン'), jt('round', 'クリームソーダ'), jt('round', 'モーニング')],
    open: jt('gothic', '営業中'), photo: jt('mincho', '写真館'),
  },
  ramen: {
    name: jt('brush', '麺屋 灯'), vsign: jt('heavy', 'らーめん'), noren: jt('brush', '麺屋灯'), lantern: jt('brush', 'ラーメン'),
    menu: [jt('brush', '醤油らーめん'), jt('brush', '味玉らーめん'), jt('brush', 'つけ麺'), jt('brush', '餃子'), jt('brush', '大盛無料'), jt('brush', '替玉'), jt('brush', 'ビール'), jt('brush', 'チャーシュー')],
    glass: jt('gothic', 'ラーメン'), ticket: jt('gothic', '食券'),
  },
  izakaya: {
    name: jt('brush', 'とり吉'), vsign: jt('mincho', '居酒屋'), lanterns: [jt('brush', '焼鳥'), jt('brush', 'やきとり'), jt('brush', '酒'), jt('brush', 'とり吉')],
    board: [jt('brush', '本日のおすすめ'), jt('brush', 'ねぎま'), jt('brush', 'つくね'), jt('brush', '生ビール'), jt('brush', 'ハイボール'), jt('brush', '冷奴')],
  },
  conbini: { name: jt('round', 'ひかりマート'), posters: [jt('heavy', 'おでん始めました'), jt('heavy', '肉まん'), jt('heavy', 'からあげ'), jt('gothic', '揚げたて'), jt('gothic', '期間限定')] },
  laundry: { name: jt('gothic', 'コインランドリー'), h24: jt('gothic', '24時間営業'), price: jt('gothic', '洗濯乾燥') },
  florist: { name: jt('mincho', '花時'), sub: jt('gothic', 'フラワーショップ') },
  dental: { name: jt('round', 'さくら歯科'), sub: jt('gothic', '歯科・小児歯科・矯正') },
  estate: { name: jt('gothic', '灯町ハウジング'), sub: jt('gothic', '賃貸・売買'), tag: jt('gothic', '不動産') },
  records: { name: jt('mincho', '夜の音'), sub: jt('gothic', '中古レコード') },
  pharmacy: { name: jt('heavy', 'くすり'), sub: jt('gothic', 'ドラッグ ミドリ'), pops: [jt('heavy', '特価'), jt('heavy', '激安'), jt('gothic', '化粧品'), jt('gothic', '日用品'), jt('heavy', 'ポイント5倍')] },
  soba: { name: jt('heavy', '立ち食いそば'), sub: jt('gothic', 'そば・うどん'), menu: [jt('gothic', 'かけそば'), jt('gothic', 'かき揚げ'), jt('gothic', 'コロッケ'), jt('gothic', '天玉')] },
  tobacco: jt('mincho', 'たばこ'), shutterName: jt('mincho', '松本商店'), mahjong: jt('gothic', '麻雀'),
  koban: jt('gothic', '交番'), kobanBoard: [jt('gothic', '本日の交通事故'), jt('gothic', '死者'), jt('gothic', '負傷者'), jt('gothic', '件')],
  shrine: jt('mincho', '稲荷神社'), shrineFlag: jt('mincho', '正一位稲荷大明神'), shrineLantern: jt('mincho', '献灯'),
  alley: jt('mincho', '灯り横丁'), alleyShops: [jt('brush', 'やきとん'), jt('brush', 'おでん'), jt('brush', 'もつ焼'), jt('brush', '立呑み'), jt('brush', '小町'), jt('mincho', '酒場')],
  gyudon: jt('heavy', '牛丼'), gyudonSub: jt('gothic', 'つゆだく'), yakiniku: jt('brush', '焼肉 炎'), atm: jt('gothic', 'ATMコーナー'), bank: jt('gothic', 'あかり信用金庫'),
  station: jt('gothic', '灯町'), stationSub: jt('gothic', '駅'), garage: jt('brush', 'ガード下'), clearance: jt('gothic', '高さ制限'),
  busStop: jt('gothic', '灯町三丁目'), busLine: jt('gothic', 'コミュニティバス'), busName: jt('round', 'あかり号'),
  parking: jt('gothic', '空'), parkingSub: jt('gothic', '駐車場'),
  bigAd: jt('heavy', 'ヨゾラ生'), bigAdSub: jt('gothic', '冷えてます'), pawn: jt('mincho', '質'), pawnName: jt('mincho', 'かんだ'),
  vending: { hot: jt('round', 'あったか〜い'), cold: jt('round', 'つめた〜い'), items: [jt('gothic', 'お茶'), jt('gothic', '緑茶'), jt('gothic', '珈琲'), jt('gothic', '水'), jt('gothic', 'ほうじ茶'), jt('gothic', 'コーンスープ'), jt('gothic', 'おしるこ')] },
  stop: jt('gothic', '止まれ'), schoolZone: jt('gothic', 'スクールゾーン'),
  posters: [jt('gothic', '防犯カメラ作動中'), jt('mincho', '秋祭り'), jt('gothic', '自転車放置禁止'), jt('gothic', 'ゴミ集積所'), jt('gothic', '燃えるごみ'), jt('gothic', '月・木'), jt('gothic', '資源ごみ'), jt('gothic', 'ポイ捨て禁止'), jt('gothic', '迷い猫'), jt('gothic', '探しています'), jt('gothic', '入居者募集'), jt('gothic', '駐車禁止')],
  poleAds: [jt('gothic', '山田内科'), jt('gothic', 'この先50m'), jt('gothic', '灯町駅'), jt('gothic', '鈴木歯科'), jt('gothic', '質 かんだ'), jt('gothic', '小林接骨院'), jt('gothic', '右折すぐ')],
  address: jt('gothic', '灯町三丁目'),
  hydrant: jt('gothic', '消火栓'),
  noEntry: jt('gothic', '歩行者専用'),
  tenants: [
    jt('gothic', '整体院 ほぐし'), jt('gothic', '英会話 ABC'), jt('mincho', 'スナック 夢'), jt('latin', 'BAR 月光'), jt('gothic', 'カラオケ ルーム7'),
    jt('gothic', '雀荘 東'), jt('mincho', 'スナック 花子'), jt('gothic', '鍼灸院'), jt('gothic', '税理士事務所'), jt('gothic', '囲碁クラブ'),
    jt('round', 'そろばん教室'), jt('gothic', '学習塾 ひかり'), jt('mincho', '小料理 あや'), jt('gothic', 'ネイル サロン'), jt('gothic', '美容室 LUCE'),
    jt('gothic', '接骨院'), jt('mincho', 'BAR 灯台'), jt('gothic', 'テナント募集'), jt('mincho', 'ラウンジ 蘭'), jt('gothic', '写真スタジオ'),
    jt('gothic', 'ヨガ教室'), jt('heavy', '焼肉'), jt('mincho', '割烹 松'), jt('gothic', '司法書士'), jt('gothic', 'ダンス教室'),
  ],
  shops: [
    jt('mincho', '和菓子 松屋'), jt('gothic', 'クリーニング'), jt('heavy', 'パン'), jt('round', 'カフェ'), jt('gothic', '美容室'), jt('mincho', '酒'),
    jt('gothic', '眼鏡'), jt('heavy', 'たこ焼'), jt('gothic', '整骨院'), jt('mincho', 'うなぎ'), jt('gothic', '文具'), jt('brush', 'おでん'), jt('heavy', '餃子'),
    jt('gothic', '自転車'), jt('mincho', '鮨 一'), jt('gothic', '古着'), jt('gothic', '書店'), jt('brush', '天ぷら'), jt('gothic', '時計'), jt('heavy', 'カレー'),
  ],
  windows: [jt('gothic', '鍼灸院'), jt('gothic', '英会話'), jt('gothic', '税理士事務所'), jt('gothic', '写真館'), jt('gothic', '整体'), jt('gothic', '学習塾'), jt('gothic', '空室あり'), jt('gothic', 'テナント募集中'), jt('gothic', '囲碁'), jt('gothic', '社労士')],
  plates: [jt('gothic', '第二ミヤコビル'), jt('gothic', 'メゾン灯'), jt('gothic', '灯町ハイツ'), jt('gothic', 'サンライズ灯町'), jt('gothic', '松本ビル'), jt('gothic', '第三長谷川ビル'), jt('gothic', 'コーポ桜')],
  ledScroll: jt('dot', 'いらっしゃいませ ★ 本日ポイント5倍 ★ かぜ薬 花粉 目薬 ★ 夜10時まで営業 ★ '),
  screen: [jt('heavy', '夜空ラガー'), jt('gothic', '明日 晴れ'), jt('mincho', '秋祭り'), jt('gothic', '10月11日'), jt('gothic', '最高'), jt('gothic', '最低')],
  taxi: [jt('gothic', '空車'), jt('gothic', '賃走')],
  misc: [jt('gothic', '営業中'), jt('gothic', '準備中'), jt('gothic', '本日休業'), jt('round', 'ようこそ'), jt('gothic', '駐輪場'), jt('gothic', '月極'), jt('gothic', '東京都')],
};

/* ---------- frontage buildings, hand placed around the hero, generated further out ---------- */
// side: 'W'|'E'; z0<z1 along the street; floors above ground; gh ground floor height; fh typical floor height
const BUILDINGS = [
  // ---- west side, north to south ----
  { id: 'W1', side: 'W', z0: 38, z1: 50, depth: 14, floors: 4, gh: 3.4, fh: 2.9, wall: '#c9bea8', style: 'tile', win: 'apt', setback: 1.1, shop: 'estate', plate: 2, roof: 'flat' },
  { id: 'W2', side: 'W', z0: 30, z1: 38, depth: 11, floors: 2, gh: 3.3, fh: 2.8, wall: '#a49a8c', style: 'mortar', win: 'old', shop: 'shutter', mahjong: true, roof: 'flat', laundryBar: true },
  { id: 'W3', side: 'W', z0: 16, z1: 30, depth: 16, floors: 3, gh: 3.6, fh: 2.9, wall: '#dcd8cf', style: 'tile', win: 'apt', setback: 1.0, shop: 'conbini', roof: 'flat', plate: 3 },
  { id: 'W4', side: 'W', z0: 10, z1: 16, depth: 12, floors: 3, gh: 3.3, fh: 2.9, wall: '#8a8478', style: 'concrete', win: 'office', shop: 'stairs', vinyl: true, roof: 'flat' },
  { id: 'W5', side: 'W', z0: 4, z1: 10, depth: 10, floors: 1, gh: 3.2, fh: 2.7, wall: '#5b4a3c', style: 'wood', win: 'old', shop: 'records', roof: 'pitched' },
  { id: 'W6', side: 'W', z0: -5, z1: 4, depth: 13, floors: 1, gh: 3.5, fh: 2.8, wall: '#b9b2a6', style: 'mortar', win: 'old', shop: 'ramen', roof: 'flat', tank: true },
  { id: 'W7', side: 'W', z0: -13, z1: -5, depth: 13, floors: 3, gh: 3.6, fh: 3.0, wall: '#7c6a5c', style: 'brick', win: 'apt', setback: 1.2, shop: 'izakaya', roof: 'flat' },
  { id: 'W8', side: 'W', z0: -21, z1: -13, depth: 14, floors: 6, gh: 3.8, fh: 3.0, wall: '#a7a49c', style: 'panel', win: 'office', shop: 'pharmacy', tower: { at: 0.55, panels: [0, 1, 2, 3, 4, 5] }, vinyl: true, roof: 'flat', plate: 0 },
  // W9 is the shrine plot (-27..-21)
  { id: 'W10', side: 'W', z0: -34, z1: -27, depth: 14, floors: 4, gh: 3.8, fh: 3.0, wall: '#d2c7b4', style: 'tile', win: 'office', shop: 'atm', billboard: true, corner: 'S', roof: 'flat', sideAd: 'pawn' },
  { id: 'W11', side: 'W', z0: -58, z1: -46, depth: 14, floors: 5, gh: 3.6, fh: 3.0, wall: '#857a6e', style: 'brick', win: 'apt', setback: 1.1, shop: 'yakiniku', corner: 'N', roof: 'flat' },
  // ---- east side, north to south ----
  { id: 'E1', side: 'E', z0: 36, z1: 52, depth: 15, floors: 6, gh: 3.3, fh: 2.9, wall: '#e2ddd2', style: 'tile', win: 'apt', setback: 1.2, shop: 'lobby', plate: 1, roof: 'flat' },
  { id: 'E2', side: 'E', z0: 28, z1: 36, depth: 12, floors: 2, gh: 3.4, fh: 3.0, wall: '#b8c0c2', style: 'panel', win: 'office', shop: 'dental', vinyl: true, roof: 'flat' },
  { id: 'E3', side: 'E', z0: 20, z1: 28, depth: 11, floors: 1, gh: 3.3, fh: 2.8, wall: '#4f6e62', style: 'copper', win: 'old', shop: 'florist', roof: 'kanban' },
  { id: 'E4', side: 'E', z0: 12, z1: 20, depth: 13, floors: 2, gh: 3.4, fh: 2.9, wall: '#cfc6b3', style: 'tile', win: 'office', shop: 'laundry', roof: 'flat' },
  { id: 'E5', side: 'E', z0: 4.5, z1: 12, depth: 10, floors: 1, gh: 3.1, fh: 2.7, wall: '#6b5747', style: 'wood', win: 'old', shop: 'tobacco', roof: 'pitched' },
  { id: 'E6', side: 'E', z0: -4.5, z1: 4.5, depth: 13, floors: 3, gh: 3.4, fh: 3.0, wall: '#7a5040', style: 'brick', win: 'mixed', shop: 'kissaten', pilotis: 2.4, roof: 'flat', tank: true },
  // alley -7..-4.5
  { id: 'E8', side: 'E', z0: -15, z1: -7, depth: 14, floors: 4, gh: 3.5, fh: 3.0, wall: '#9b9a94', style: 'concrete', win: 'office', shop: 'soba', vinyl: true, roof: 'flat', billboard: true },
  { id: 'E9', side: 'E', z0: -19, z1: -15, depth: 12, floors: 5, gh: 3.4, fh: 2.9, wall: '#c4b7a2', style: 'tile', win: 'office', shop: 'bar', tower: { at: 0.15, panels: [6, 7, 8, 9, 10] }, roof: 'flat', sideAd: 'stairs' },
  // E10 is the coin parking (-29..-19)
  { id: 'E11', side: 'E', z0: -34, z1: -29, depth: 14, floors: 4, gh: 3.6, fh: 3.0, wall: '#b4a892', style: 'tile', win: 'office', shop: 'koban', corner: 'S', roof: 'flat', sideAd: 'beer', setFront: 5.2 },
  { id: 'E12', side: 'E', z0: -58, z1: -46, depth: 15, floors: 5, gh: 3.7, fh: 3.0, wall: '#d8d2c4', style: 'tile', win: 'office', shop: 'gyudon', corner: 'N', tower: { at: 0.9, panels: [11, 12, 13, 14] }, roof: 'flat', billboard: true },
];

// Procedural continuation of the street beyond the hand-placed blocks.
function generateFarBuildings() {
  reseed(777);
  const styles = ['tile', 'tile', 'concrete', 'mortar', 'panel', 'brick', 'tile'];
  const walls = ['#cdc4b2', '#bdb8ad', '#9a958b', '#d9d4c8', '#8d7f71', '#a89f90', '#c8bca6', '#7d776f', '#b9aa95', '#e0dbd0', '#968a7c'];
  const wins = ['apt', 'office', 'mixed', 'old', 'apt'];
  const shops = ['generic', 'generic', 'generic', 'shutter', 'generic', 'bar', 'generic'];
  const out = [];
  const run = (side, from, to, dir) => {
    let z = from;
    while (dir > 0 ? z < to : z > to) {
      const w = rnd(5.5, 13);
      const z0 = dir > 0 ? z : z - w, z1 = dir > 0 ? z + w : z;
      if (z1 > VIADUCT.z0 - 0.5 && z0 < VIADUCT.z1 + 0.5) { z = dir > 0 ? VIADUCT.z1 + 0.5 : VIADUCT.z0 - 0.5; continue; }
      const floors = chance(0.15) ? rndi(7, 10) : rndi(1, 5);
      const b = {
        id: `${side}f${out.length}`, side, z0, z1, depth: rnd(10, 15), floors, gh: rnd(3.2, 3.8), fh: rnd(2.8, 3.1),
        wall: pick(walls), style: pick(styles), win: pick(wins), shop: pick(shops), roof: floors <= 1 && chance(0.5) ? 'pitched' : 'flat',
        far: true, setback: floors > 3 && chance(0.4) ? rnd(0.9, 1.2) : 0, vinyl: chance(0.4), tank: chance(0.4),
      };
      if (floors >= 4 && chance(0.35)) b.tower = { at: chance(0.5) ? 0.12 : 0.88, panels: Array.from({ length: Math.min(floors, 6) }, () => rndi(0, TX.tenants.length - 1)) };
      if (chance(0.12)) b.billboard = true;
      out.push(b);
      z = dir > 0 ? z1 : z0;
    }
  };
  run('W', 56, 120, 1); run('E', 52, 120, 1);
  run('W', -58, -170, -1); run('E', -58, -170, -1);
  // a narrow side street on the west at z 50..56 leaves a gap
  return out;
}
