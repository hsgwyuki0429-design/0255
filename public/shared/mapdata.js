// ============================================================
// ONI RUSH - 共有マップデータ (サーバー/クライアント両用)
// 座標系: x,z = ボックス中心 / y = ボックスの底面
// 設計方針: 行き止まりを作らない・回遊ループ・高低差と階段・
//           跳び越えられる低障害物 (jump高さ ≈ 1.1m)
// ============================================================

function B(x, y, z, w, h, d, c = 0x888888, m = 'stone', opt = {}) {
  return { x, y, z, w, h, d, c, m, ...opt };
}

// 階段: (x,z)開始点から dir 方向へ上っていく (各段は地面まで詰まった中実ブロック)
// y = 階段の基準面 (この高さから上り始める)
function stairs(x, y, z, dir, width, steps, stepH, stepD, c, m = 'stone') {
  const out = [];
  for (let i = 0; i < steps; i++) {
    const t = i * stepD + stepD / 2;
    let sx = x, sz = z;
    if (dir === 'n') sz = z - t;
    else if (dir === 's') sz = z + t;
    else if (dir === 'e') sx = x + t;
    else sx = x - t;
    const isX = (dir === 'e' || dir === 'w');
    out.push(B(sx, y, sz, isX ? stepD + 0.02 : width, (i + 1) * stepH, isX ? width : stepD + 0.02, c, m));
  }
  return out;
}

// X方向に伸びる壁 (x1..x2, 位置z)。gaps=[[gx1,gx2],...] はドア開口。開口上部にまぐさを付ける
function wallX(x1, x2, z, y, h, t, gaps, c, m = 'stone') {
  const out = []; let cur = x1;
  const gs = [...(gaps || [])].sort((a, b) => a[0] - b[0]);
  for (const [g1, g2] of gs) {
    if (g1 > cur + 0.01) out.push(B((cur + g1) / 2, y, z, g1 - cur, h, t, c, m));
    if (h > 2.3) out.push(B((g1 + g2) / 2, y + 2.1, z, g2 - g1, h - 2.1, t, c, m));
    cur = g2;
  }
  if (cur < x2 - 0.01) out.push(B((cur + x2) / 2, y, z, x2 - cur, h, t, c, m));
  return out;
}

// Z方向に伸びる壁 (z1..z2, 位置x)
function wallZ(z1, z2, x, y, h, t, gaps, c, m = 'stone') {
  const out = []; let cur = z1;
  const gs = [...(gaps || [])].sort((a, b) => a[0] - b[0]);
  for (const [g1, g2] of gs) {
    if (g1 > cur + 0.01) out.push(B(x, y, (cur + g1) / 2, t, h, g1 - cur, c, m));
    if (h > 2.3) out.push(B(x, y + 2.1, (g1 + g2) / 2, t, h - 2.1, g2 - g1, c, m));
    cur = g2;
  }
  if (cur < z2 - 0.01) out.push(B(x, y, (cur + z2) / 2, t, h, z2 - cur, c, m));
  return out;
}

// 1mグリッドでrects内をopen(空洞)にマークし、残りを貪欲法で直方体の岩にまとめる
// baseY..baseY+height の層を埋める。色は市松で2色をゆらす
function carveRock(boxes, rects, baseY, height, N, off, cA, cB) {
  const open = [];
  for (let i = 0; i < N; i++) {
    open.push(new Array(N).fill(false));
    for (let j = 0; j < N; j++) {
      const cx = off + i + 0.5, cz = off + j + 0.5;
      for (const [x1, x2, z1, z2] of rects) {
        if (cx > x1 && cx < x2 && cz > z1 && cz < z2) { open[i][j] = true; break; }
      }
    }
  }
  const used = open.map(row => row.map(v => v));
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      if (used[i][j]) continue;
      let w = 1;
      while (i + w < N && !used[i + w][j]) w++;
      let d = 1;
      outer: while (j + d < N) {
        for (let k = 0; k < w; k++) if (used[i + k][j + d]) break outer;
        d++;
      }
      for (let a = 0; a < w; a++) for (let b = 0; b < d; b++) used[i + a][j + b] = true;
      const x = off + i + w / 2, z = off + j + d / 2;
      boxes.push(B(x, baseY, z, w, height, d, ((i + j) % 3 === 0) ? cB : cA));
    }
  }
}

// ============================================================
// マップ1: 地下洞窟 ─ 「自然にえぐられた3層の迷宮洞窟」
// 3つの層 (y=0 / 5 / 10) を岩盤から掘り出す。
//  ・地下1層: 中央大空洞 + 4方の大洞窟をつなぐ曲がりくねった坑道網
//  ・中層(5m): 外周をめぐる岩棚回廊 + 空洞を見下ろすバルコニー
//  ・上層(10m): 大空洞を囲む高所テラス + 洞窟をまたぐ天然の岩橋
// 層の間は岩を削った自然な坂道(階段)と、飛び降り穴でつながる。
// ============================================================
function buildCave() {
  const boxes = [];
  const N = 90, OFF = -45, LH = 5;

  boxes.push(B(0, -0.5, 0, 92, 0.5, 92, 0x40352b, 'dirt')); // 洞窟の地面

  // ---- 地下1層 (y=0) の空洞 ----
  const H = [-11, 11, -11, 11]; // 中央大空洞 (3層吹き抜け)
  const L0 = [
    H,
    [-3, 2, -27, -11],     // 北坑道
    [-16, 13, -39, -27],   // 北の大洞窟
    [11, 27, -3, 3],       // 東坑道
    [27, 40, -9, 9],       // 東の洞窟 (地底湖)
    [-2, 4, 11, 25],       // 南坑道
    [-7, 19, 25, 39],      // 南の洞窟 (骨の牢獄)
    [-27, -11, -4, 2],     // 西坑道
    [-40, -27, -11, 7],    // 西の洞窟 (水晶窟)
    [-35, -30, -30, -8],   // 北西連絡洞 (縦)
    [-30, -16, -33, -28],  // 北西連絡洞 (横)
    [12, 18, -27, -19],    // 北東の裂け目 (縦・狭い)
    [14, 30, -19, -14],    // 北東連絡洞 (横)
    [26, 33, -14, -9],     // 北東連絡洞 (縦)
    [27, 33, 9, 21],       // 南東連絡洞 (縦)
    [15, 33, 21, 26],      // 南東連絡洞 (横)
    [-31, -25, 7, 21],     // 南西連絡洞 (縦)
    [-25, -9, 15, 21],     // 南西連絡洞 (横)
    [-11, -7, 21, 31],     // 南西連絡洞 (南下)
    [4, 9, -19, -11],      // 抜け穴 (縦)
    [4, 16, -19, -15],     // 抜け穴 (横)
    [-9, -4, 11, 19],      // 抜け穴 (南西)
    [-20, -11, 28, 31],    // 落とし穴の受けポケット
    [-14, -10, -44, -39],  // 北スロープ坑 (外周へ)
    [40, 44, -2, 2],       // 東スロープ坑
    [2, 6, 39, 44],        // 南スロープ坑
    [-44, -40, -2, 2],     // 西スロープ坑
  ];

  // ---- 中層 (y=5) : 外周の岩棚回廊 + バルコニー ----
  const r1 = [[-14, 14, -14, -11], [-14, 14, 11, 14], [-14, -11, -11, 11], [11, 14, -11, 11]]; // 大空洞を囲む岩棚テラス
  const L1 = [
    [-44, 44, -44, -40],   // 北の回廊
    [-44, 44, 40, 44],     // 南の回廊
    [40, 44, -40, 40],     // 東の回廊
    [-44, -40, -40, 40],   // 西の回廊
    H, ...r1,
    [-14, -10, -44, -33],  // 北スロープの吹き抜け
    [30, 44, -2, 2],       // 東スロープの吹き抜け
    [2, 6, 33, 44],        // 南スロープの吹き抜け
    [-44, -30, -2, 2],     // 西スロープの吹き抜け
    [20, 24, -40, -24],    // 北東バルコニー (縦)
    [20, 34, -28, -24],    // 北東バルコニー (横)
    [33, 37, -24, -6],     // 北東バルコニー→東洞窟へ飛び降り
    [-34, -28, 19, 40],    // 南西バルコニー→南西洞へ飛び降り
    [-26, -22, -40, -31],  // 北西バルコニー→北西洞へ飛び降り
    [24, 28, 24, 40],      // 南東バルコニー→南東洞へ飛び降り
    [-17, -14, -14, -11],  // 上層への坂の踊り場ポケット (西)
    [14, 17, 11, 14],      // 上層への坂の踊り場ポケット (東)
  ];

  // ---- 上層 (y=10) : 高所テラス + 岩橋 ----
  const L2 = [
    H, ...r1,
    [-18, 18, -18, -14],   // 高所テラス北
    [-18, 18, 14, 18],     // 高所テラス南
    [-18, -14, -14, 14],   // 高所テラス西
    [14, 18, -14, 14],     // 高所テラス東
    [-2, 2, -44, -18],     // 北の岩橋 (北の大洞窟の上をまたぐ)
    [-2, 2, 18, 44],       // 南の岩橋
    [-30, -18, -2, 2],     // 西の岩橋
    [18, 30, -2, 2],       // 東の岩橋
    [30, 44, -2, 2],       // 東スロープ上部の裂け目
    [-44, -30, -2, 2],     // 西スロープ上部の裂け目
  ];

  carveRock(boxes, L0, 0, LH, N, OFF, 0x483a2e, 0x544435);
  carveRock(boxes, L1, LH, LH, N, OFF, 0x554637, 0x61503e);
  carveRock(boxes, L2, LH * 2, LH, N, OFF, 0x625340, 0x6f5f49);

  // ---- 層をつなぐ岩の坂 (0→5m: 外周回廊へ / 岩を削った自然なスロープ) ----
  const RS = 0x5c4c3a;
  const SH = 5 / 16, SD = 0.6; // 16段で5m
  boxes.push(...stairs(-12, 0, -34.5, 'n', 3.4, 16, SH, SD, RS)); // 北の大洞窟 → 北回廊
  boxes.push(...stairs(33, 0, 0, 'e', 3.4, 16, SH, SD, RS));      // 東の洞窟 → 東回廊
  boxes.push(...stairs(4, 0, 34.5, 's', 3.4, 16, SH, SD, RS));    // 南の洞窟 → 南回廊
  boxes.push(...stairs(-33, 0, 0, 'w', 3.4, 16, SH, SD, RS));     // 西の洞窟 → 西回廊
  // 大空洞の壁ぞいの岩ランプ (0→5m: 岩棚テラスへ)
  boxes.push(...stairs(-9.7, 0, 4.6, 'n', 2.6, 16, SH, SD, RS));  // 西壁ぞい
  boxes.push(...stairs(9.7, 0, -4.6, 's', 2.6, 16, SH, SD, RS));  // 東壁ぞい
  // 岩棚テラス → 高所テラス (5→10m)
  boxes.push(...stairs(-6.4, LH, -12.5, 'w', 2.6, 16, SH, SD, RS));
  boxes.push(...stairs(6.4, LH, 12.5, 'e', 2.6, 16, SH, SD, RS));

  // ---- 飛び降り穴の下の着地岩 (段差を3m台に割ってCPUも降りられる) ----
  boxes.push(B(-29.5, 0, 19.8, 2.6, 2, 2.2, RS));  // 南西バルコニー下
  boxes.push(B(-24, 0, -31.8, 2.6, 2, 2.2, RS));   // 北西バルコニー下
  boxes.push(B(35, 0, -7, 2.6, 2, 2.4, RS));       // 北東バルコニー下 (東の洞窟)
  boxes.push(B(26, 0, 24.8, 2.6, 2, 2.4, RS));     // 南東バルコニー下
  // 岩橋の端の降り岩 (橋10m → 岩7.5m → 回廊5m)
  boxes.push(B(0, LH, -42, 2.6, 2.5, 2, RS));
  boxes.push(B(0, LH, 42, 2.6, 2.5, 2, RS));

  // ---- 中央大空洞: 石柱・登れる岩・光るキノコ ----
  boxes.push(B(-6, 0, -6, 2.2, 10, 2.2, 0x554435)); // 天然の石柱 (天井まで)
  boxes.push(B(6, 0, 6, 2.0, 10, 2.0, 0x554435));
  boxes.push(B(0, 0, 6.5, 2.6, 1.0, 2.6, 0x5c4c3a), B(0, 1.0, 6.5, 1.6, 0.9, 1.6, 0x554435)); // 2段の登れる岩
  boxes.push(B(9, 0, -9, 2, 2.2, 2, 0x5c4c3a));    // キノコ台座
  boxes.push(B(9, 2.2, -9, 1.8, 0.5, 1.8, 0x66ddff, 'crystal', { bounce: 1, glow: 1 })); // 跳ねると岩棚テラスへ届く
  // ---- 各洞窟のキノコトランポリン ----
  boxes.push(B(-6, 0, -33, 1.9, 0.5, 1.9, 0x8f7bff, 'crystal', { bounce: 1, glow: 1 }));
  boxes.push(B(-36, 0, 3, 1.9, 0.5, 1.9, 0x66ddff, 'crystal', { bounce: 1, glow: 1 }));
  boxes.push(B(0, 0, 36, 1.9, 0.5, 1.9, 0x8f7bff, 'crystal', { bounce: 1, glow: 1 }));

  // ---- 地底湖 (東の洞窟: 当たりなしの浅い水面) ----
  boxes.push(B(34, 0, 2, 9, 0.25, 10, 0x2b6f8f, 'water', { deco: 1, glow: 1 }));
  boxes.push(B(-34, 0, -3, 6, 0.2, 5, 0x2b6f8f, 'water', { deco: 1 })); // 西の水たまり
  boxes.push(B(-30.5, 0, 0, 3, 0.2, 3, 0x2b6f8f, 'water', { deco: 1 })); // 西スロープ下の水たまり

  // ---- 骨の牢獄 (南の洞窟) ----
  for (let i = 0; i < 5; i++) boxes.push(B(8.7 + i * 1.5, 0, 30.4, 0.22, 3.0, 0.22, 0xe8e0d2, 'bone', { deco: 1 }));
  boxes.push(B(11.5, 3.0, 33.5, 7, 0.3, 7, 0xd8cfc0, 'bone', { deco: 1 }));
  boxes.push(B(4, 0, 36, 2.6, 0.8, 1.2, 0xd8cfc0, 'bone', { deco: 1 })); // あばら骨
  boxes.push(B(16, 0, 27, 1.4, 1.0, 1.4, 0xe8e0d2, 'bone', { deco: 1 })); // 大きな頭骨

  // ---- 石筍 (デコ) ----
  const stal = [[-13, -35], [8, -31], [-33, -25], [30, -16], [-15, 17], [22, 23], [-36, 5], [36, 6], [12, 34], [-4, 28]];
  for (const [sx, sz] of stal) {
    boxes.push(B(sx, 0, sz, 0.8, 2.2 + ((sx * 7 + sz * 13) % 10) / 8, 0.8, 0x51443a, 'stone', { deco: 1 }));
    boxes.push(B(sx + 0.6, 0, sz - 0.4, 0.45, 1.1, 0.45, 0x51443a, 'stone', { deco: 1 }));
  }

  // ---- クリスタル (発光デコ) ----
  const crys = [
    [0, 0, -9.5, 0x66ffee], [-9, 0, 3, 0xbb88ff], [16, 0, 0, 0x88aaff], [-16, 0, 0, 0x66ffee],
    [-34, 0, -33, 0xbb88ff], [-6, 0, -36, 0x88ffcc], [37, 0, -6, 0x66ffee], [-36, 0, -8, 0xbb88ff],
    [-4, 0, 36, 0x88ffcc], [16, 0, 36, 0xffaa66],
    [-16, 10, -16, 0x66ffee], [16, 10, 16, 0xbb88ff], [12, 5, -12.8, 0x88aaff], [-12, 5, 12.8, 0x88ffcc]
  ];
  for (const [cx, cy, cz, cc] of crys) {
    boxes.push(B(cx, cy, cz, 0.7, 1.6, 0.7, cc, 'crystal', { deco: 1, glow: 1 }));
    boxes.push(B(cx + 0.5, cy, cz - 0.3, 0.4, 0.9, 0.4, cc, 'crystal', { deco: 1, glow: 1 }));
  }
  return {
    id: 'cave', name: '地下洞窟', boxes,
    sky: 0x07070c, fog: { color: 0x0a0a12, near: 10, far: 58 },
    ambient: 0.5, sun: 0.35, sunColor: 0x8899cc,
    lights: [
      { x: 0, y: 4, z: -9.5, c: 0x66ffee, i: 30, d: 24 }, { x: 16, y: 2, z: 0, c: 0x88aaff, i: 24, d: 20 },
      { x: -16, y: 2, z: 0, c: 0x66ffee, i: 24, d: 20 }, { x: -34, y: 2, z: -33, c: 0xbb88ff, i: 26, d: 22 },
      { x: 37, y: 2, z: -6, c: 0x66ffee, i: 24, d: 20 }, { x: -4, y: 2, z: 36, c: 0x88ffcc, i: 26, d: 22 },
      { x: -16, y: 12, z: -16, c: 0x66ffee, i: 24, d: 22 }, { x: 16, y: 12, z: 16, c: 0xbb88ff, i: 24, d: 22 }
    ],
    bounds: { minX: -44, maxX: 44, minZ: -44, maxZ: 44 },
    jail: { x: 11.5, y: 0, z: 33.5, w: 6, d: 6 },
    spawns: {
      oni: [[0, 0.1, 0], [2.5, 0.1, 2.5], [-2.5, 0.1, -2.5], [2.5, 0.1, -2.5], [-2.5, 0.1, 2.5], [0, 0.1, 4], [4, 0.1, 0], [-4, 0.1, 0]],
      run: [
        [-6, 0.1, -30], [6, 0.1, -33], [34, 0.1, 6], [-34, 0.1, -6], [0, 0.1, 32], [20, 0.1, -16],
        [-16, 0.1, 18], [-30, 5.1, -42], [30, 5.1, 42], [16, 10.1, 0], [-32, 0.1, -18], [30, 0.1, 15]
      ]
    }
  };
}

// ============================================================
// マップ2: イオン風ショッピングモール 「ONI MALL」
// 実際のイオンモールの「2核1モール」構成を再現:
//  ・西の核 = 総合スーパー (食品売場+レジ+バックヤード)
//  ・東の核 = フードコート (2層吹き抜け)
//  ・間をつなぐメインモール通路 (天井高5m) + 中央の吹き抜けコート
//  ・南北に専門店街 (各店に2つの入口) とその裏のスタッフ通路
//  ・トイレはモール中程の通路奥 (イオンあるある)
//  ・2F = 書店 / ゲームコーナー / レストラン街 / 衣料品売場
// ============================================================
function buildMall() {
  const WALL = 0xf2efe9, F1C = 0xe8e4dc, F2C = 0xdfdbd2, SHOP = 0xcfc8bc, BACK = 0xb8b2a6;
  const boxes = [];
  const F2 = 5;      // 2F歩行面 (天井高5m = 圧迫感のない現代モール)
  const WH = 11;     // 外壁の高さ

  // ---- 1F床・外壁 ----
  boxes.push(B(0, -0.5, 0, 114, 0.5, 62, F1C, 'tile'));
  boxes.push(...wallX(-56, 56, -29.7, 0, WH, 0.8, [], WALL), ...wallX(-56, 56, 29.7, 0, WH, 0.8, [], WALL));
  boxes.push(...wallZ(-30, 30, -55.7, 0, WH, 0.8, [], WALL), ...wallZ(-30, 30, 55.7, 0, WH, 0.8, [], WALL));

  // ============ 西の核: 総合スーパー (イオンスタイル食品館) x[-56,-34] ============
  // モール側の壁 (大開口3つ + スタッフ通路への裏口2つ = 店内外をぐるぐる回れる)
  boxes.push(...wallZ(-30, 30, -34, 0, 4.6, 0.5, [[-23, -21], [-18, -13], [-3, 3], [13, 18], [21, 23]], WALL));
  // バックヤード (北側スタッフ通路 z[-30,-26]) と鮮魚・惣菜カウンター
  boxes.push(...wallX(-55.7, -34, -26, 0, 3.2, 0.4, [[-52, -50], [-40, -38]], BACK));
  boxes.push(B(-45, 0, -24.9, 14, 1.2, 1.4, 0xd8e2e8, 'metal')); // 鮮魚カウンター (跳び乗れる)
  // ゴンドラ陳列棚 6列 (中央に通り抜けギャップ)
  for (let r = 0; r < 6; r++) {
    const gz = -18 + r * 6;
    boxes.push(B(-49.5, 0, gz, 7, 1.9, 1.0, 0xbcc8d0, 'shelf'));
    boxes.push(B(-40.5, 0, gz, 7, 1.9, 1.0, 0xbcc8d0, 'shelf'));
  }
  // 冷蔵ケース (西壁ぞい) と青果平台
  boxes.push(B(-54.9, 0, -10, 1.2, 1.9, 26, 0x9fb8c8, 'metal'));
  boxes.push(B(-50, 0, 24, 4.5, 0.9, 3, 0x7aa86a, 'wood'), B(-42, 0, 24, 4.5, 0.9, 3, 0x7aa86a, 'wood'));
  // レジカウンター (跳び乗れる)
  boxes.push(B(-36, 0, -8, 2.6, 0.95, 1.1, 0xd0d5da, 'metal'), B(-36, 0, 8, 2.6, 0.95, 1.1, 0xd0d5da, 'metal'));
  boxes.push(B(-45, 4.8, -34, 16, 1.4, 0.3, 0xc42a76, 'sign', { deco: 1, glow: 1 })); // 核店舗の大看板

  // ============ メインモール通路 z[-7,7] + 中央吹き抜けコート x[-8,12] z[-16,16] ============
  // 噴水 (コート中央)
  boxes.push(B(2, 0, 0, 5.2, 0.65, 5.2, 0xdfe8ee, 'tile'));
  boxes.push(B(2, 0.65, 0, 3.8, 0.25, 3.8, 0x58b8e8, 'water', { deco: 1, glow: 1 }));
  boxes.push(B(2, 0.65, 0, 0.9, 2.2, 0.9, 0xdfe8ee, 'tile'));
  // 植栽プランター・ベンチ・キッズトランポリン (コート)
  for (const [px, pz] of [[-5, -12], [9, -12], [-5, 12], [9, 12]]) {
    boxes.push(B(px, 0, pz, 1.8, 0.75, 1.8, 0x8a7a64, 'wood'));
    boxes.push(B(px, 0.75, pz, 1.1, 1.5, 1.1, 0x3f9b4f, 'leaf', { deco: 1 }));
  }
  for (const [bx, bz] of [[-5, -5], [9, 5], [-20, 5.8], [24, -5.8], [-30, -5.8], [34, 5.8]]) {
    boxes.push(B(bx, 0, bz, 2.6, 0.55, 0.8, 0xb08a5f, 'wood')); // 木ベンチ
  }
  boxes.push(B(8, 0, -3, 2.2, 0.45, 2.2, 0xff8fb3, 'metal', { bounce: 1, glow: 1 })); // キッズトランポリン (2Fへ跳べる)
  // モール天井の間接照明ライン (デコ)
  for (const lx of [-24, -14, 18, 28, 38]) boxes.push(B(lx, 10.4, 0, 8, 0.15, 1.2, 0xfff2dd, 'sign', { deco: 1, glow: 1 }));

  // ============ 専門店街 (南北対称) ============
  // 北: 店z[-20,-7] / スタッフ通路z[-24,-20] / 最北バックヤード帯z[-30,-24]
  // 南: 店z[7,20]   / スタッフ通路z[20,24]   / 最南バックヤード帯z[24,30]
  const shopColors = [0xff6b81, 0x54c2ff, 0xffd166, 0x8ce99a, 0xffa94d, 0x9b8cff];
  const shopSegs = [[-34, -22], [-22, -8], [12, 24], [24, 34], [34, 42]]; // 店の間口
  for (const s of [-1, 1]) { // -1=北, +1=南
    const front = s * 7, back = s * 20, band = s * 24;
    // 店の前面 (各店ドア2つ) と店同士の仕切り・背面壁 (バックヤードへの小ドア付き)
    for (let i = 0; i < shopSegs.length; i++) {
      const [x1, x2] = shopSegs[i];
      const cx = (x1 + x2) / 2;
      boxes.push(...wallX(x1, x2, front, 0, 4.6, 0.5, [[x1 + 1.5, x1 + 4], [x2 - 4, x2 - 1.5]], SHOP));
      boxes.push(...wallX(x1, x2, back, 0, 4.6, 0.4, [[cx - 0.8, cx + 0.8]], BACK)); // 背面 (スタッフドア)
      if (x1 !== -34) boxes.push(...wallZ(Math.min(front, back), Math.max(front, back), x1, 0, 4.6, 0.4, [], SHOP));
      if (x2 !== 42) boxes.push(...wallZ(Math.min(front, back), Math.max(front, back), x2, 0, 4.6, 0.4, [], SHOP));
      boxes.push(B(cx, 4.7, front, (x2 - x1) - 3, 1.1, 0.3, shopColors[(i + (s === 1 ? 3 : 0)) % 6], 'sign', { deco: 1, glow: 1 }));
    }
    // コート脇: 売店キオスク + トイレへの通路 (x[0,6]が通路)
    boxes.push(...wallX(-8, 12, s * 16, 0, 4.6, 0.5, [[0, 6]], SHOP));
    boxes.push(B(-3.5, 0, s * 18, 5, 1.0, 1.2, 0xc9a06a, 'wood'));  // クレープ屋台カウンター
    boxes.push(B(9, 0, s * 18, 4, 1.0, 1.2, 0xc9a06a, 'wood'));     // タピオカ屋台カウンター
    boxes.push(B(-3.5, 4.7, s * 16, 6, 1.0, 0.3, shopColors[s === 1 ? 4 : 1], 'sign', { deco: 1, glow: 1 }));
    // スタッフ通路の外側壁 (バックヤード帯との仕切り: 倉庫ドア付き)
    boxes.push(...wallX(-34, 42, band, 0, 4.6, 0.4, [[0.5, 2.5], [3.5, 5.5], [-27, -25], [33, 36]], BACK));
    // トイレ (バックヤード帯の中央: 男女2室 + 個室ブース + 洗面台)
    const tz1 = s * 24, tz2 = s * 30; // 帯のz範囲
    boxes.push(...wallZ(Math.min(tz1, tz2), Math.max(tz1, tz2), -6, 0, 4.6, 0.4, [], BACK));
    boxes.push(...wallZ(Math.min(tz1, tz2), Math.max(tz1, tz2), 3, 0, 4.6, 0.4, [], BACK));  // 男女の仕切り
    boxes.push(...wallZ(Math.min(tz1, tz2), Math.max(tz1, tz2), 12, 0, 4.6, 0.4, [], BACK));
    for (let st = 0; st < 3; st++) { // 個室ブースの仕切り
      boxes.push(B(-4.5 + st * 1.6, 0, s * 28.6, 0.12, 1.6, 2.2, 0xd8d2c8, 'metal'));
      boxes.push(B(5 + st * 1.6, 0, s * 28.6, 0.12, 1.6, 2.2, 0xd8d2c8, 'metal'));
    }
    boxes.push(B(-1.5, 0, s * 25.5, 3.2, 0.85, 0.6, 0xe8e8ee, 'tile')); // 洗面台
    boxes.push(B(7.5, 0, s * 25.5, 3.2, 0.85, 0.6, 0xe8e8ee, 'tile'));
    // 倉庫の段ボール山 (バックヤード帯の残り)
    boxes.push(B(-16, 0, s * 27, 3, 1.4, 2.2, 0xc8a878, 'wood'));
    boxes.push(B(-30, 0, s * 27, 2.4, 1.1, 2, 0xc8a878, 'wood'));
    boxes.push(B(20, 0, s * 27, 2.6, 1.3, 2, 0xc8a878, 'wood'));
  }
  // スタッフ通路の端: 東=フードコートへ抜けるドア (回遊ループ)
  boxes.push(...wallZ(-24, -20, 42, 0, 4.6, 0.4, [[-23, -21]], BACK));
  boxes.push(...wallZ(20, 24, 42, 0, 4.6, 0.4, [[21, 23]], BACK));
  boxes.push(...wallZ(-30, -24, 42, 0, 4.6, 0.4, [], BACK));
  boxes.push(...wallZ(24, 30, 42, 0, 4.6, 0.4, [], BACK));

  // ---- 1F店内の什器 ----
  // 北A: ドラッグストア / 北B: 100均 (棚の迷路)
  for (const [cx, seg] of [[-28, 0], [-15, 1]]) {
    for (let r = 0; r < 2; r++) {
      boxes.push(B(cx - 2.5, 0, -17 + r * 4.5, 1.0, 1.7, 3.2, 0x7fa8d0, 'shelf'));
      boxes.push(B(cx + 2.5, 0, -17 + r * 4.5, 1.0, 1.7, 3.2, 0x7fa8d0, 'shelf'));
    }
    boxes.push(B(cx, 0, -9.5, 3, 0.95, 1.0, 0x9c8f80, 'wood'));
  }
  // 北C/D/E: アパレル・雑貨・スポーツ (ラック什器)
  for (const cx of [18, 29, 38]) {
    boxes.push(B(cx - 2, 0, -16, 2.6, 1.35, 1.2, 0xd0aab8, 'metal'));
    boxes.push(B(cx + 2, 0, -12, 2.6, 1.35, 1.2, 0xb8c8d8, 'metal'));
    boxes.push(B(cx, 0, -9.3, 2.6, 0.95, 1.0, 0x9c8f80, 'wood'));
  }
  // 南F: 靴屋 / 南G: 本・文具 / 南H/I/J: カフェ・雑貨
  for (const cx of [-28, -15]) {
    boxes.push(B(cx, 0, 13, 5.5, 1.5, 0.9, 0x8a7f72, 'shelf'));
    boxes.push(B(cx, 0, 17, 5.5, 1.5, 0.9, 0x8a7f72, 'shelf'));
  }
  for (const [tx, tz] of [[16, 13], [20, 16], [16, 18], [30, 13], [37, 16], [30, 18]]) {
    boxes.push(B(tx, 0, tz, 1.4, 0.75, 1.4, 0xc9a06a, 'wood')); // カフェテーブル
  }

  // ============ 東の核: フードコート x[42,56] (2層吹き抜け) ============
  boxes.push(...wallZ(-20, 20, 42, 0, 4.6, 0.5, [[-7, 7]], WALL)); // モールとの間の壁 (大開口)
  // テナントカウンター (東壁ぞい) + 看板
  boxes.push(B(54.6, 0, -14, 1.6, 1.05, 9, 0x9c8f80, 'wood'));
  boxes.push(B(54.6, 0, 2, 1.6, 1.05, 9, 0x9c8f80, 'wood'));
  boxes.push(B(54.6, 0, 16, 1.6, 1.05, 8, 0x9c8f80, 'wood'));
  boxes.push(B(54.8, 3.2, -14, 0.3, 1.0, 8, 0xff6b47, 'sign', { deco: 1, glow: 1 }));
  boxes.push(B(54.8, 3.2, 2, 0.3, 1.0, 8, 0xffd166, 'sign', { deco: 1, glow: 1 }));
  boxes.push(B(54.8, 3.2, 16, 0.3, 1.0, 7, 0x8ce99a, 'sign', { deco: 1, glow: 1 }));
  // フードコートのテーブル群 (低障害物ゾーン)
  for (const [tx, tz] of [[46, -16], [50, -12], [46, -7], [51, -3], [46, 2], [50, 7], [46, 12], [50, 17], [46, 21]]) {
    boxes.push(B(tx, 0, tz, 1.6, 0.78, 1.6, 0xc9a06a, 'wood'));
    boxes.push(B(tx + 1.3, 0, tz, 0.5, 0.48, 0.5, 0x8a6a44, 'wood'), B(tx - 1.3, 0, tz, 0.5, 0.48, 0.5, 0x8a6a44, 'wood'));
  }
  // キッズコーナー (南東角: トランポリン+ソフトブロック)
  boxes.push(B(50, 0, 26, 2.2, 0.45, 2.2, 0x66ddff, 'metal', { bounce: 1, glow: 1 }));
  boxes.push(B(45, 0, 26.5, 1.2, 0.6, 1.2, 0xff8fb3, 'metal'), B(46.8, 0, 27.5, 1.0, 0.9, 1.0, 0x8ce99a, 'metal'));
  // 自販機コーナー (北東角)
  boxes.push(B(47, 0, -27.5, 6, 1.9, 1.1, 0xdd4444, 'metal'));

  // ============ エスカレーター相当の階段 (勾配ゆるめ 20段) ============
  boxes.push(...stairs(-5.5, 0, -11, 'e', 2.2, 20, 0.25, 0.5, 0x99a0aa, 'metal'));  // 中央コート東行き (上端x≈4.3)
  boxes.push(...stairs(9.5, 0, 11, 'w', 2.2, 20, 0.25, 0.5, 0x99a0aa, 'metal'));    // 中央コート西行き (上端x≈-0.3)
  boxes.push(...stairs(44, 0, -14, 'e', 2.4, 20, 0.25, 0.5, 0x99a0aa, 'metal'));    // フードコート東 (上端x≈53.8)
  boxes.push(...stairs(-38, 0, -27, 'w', 2.4, 20, 0.25, 0.5, BACK));                // スーパー奥のスタッフ階段 (上端x≈-47.8)

  // ============ 2F スラブ (吹き抜け: 中央コート・フードコート・階段口) ============
  const slab = (x1, x2, z1, z2) => boxes.push(B((x1 + x2) / 2, F2 - 0.4, (z1 + z2) / 2, x2 - x1, 0.4, z2 - z1, F2C, 'tile'));
  // 西ブロック (スタッフ階段の開口を避ける)
  slab(-56, -48.4, -30, 30);
  slab(-48.4, -37.6, -30, -28.2);
  slab(-48.4, -37.6, -25.8, 30);
  slab(-37.6, -34, -30, 30);
  // 中央ブロック (中央吹き抜け x[-6,10] z[-8,8] / ブリッジ z[-1.5,1.5] / エスカレーター口2つ)
  slab(-34, 43.4, -30, -12.2);
  slab(-34, -6.2, -12.2, -9.8); slab(5.2, 43.4, -12.2, -9.8);
  slab(-34, 43.4, -9.8, -8);
  slab(-34, -6, -8, -1.5); slab(10, 43.4, -8, -1.5);
  slab(-34, 43.4, -1.5, 1.5);   // 吹き抜けを渡るブリッジ
  slab(-34, -6, 1.5, 8); slab(10, 43.4, 1.5, 8);
  slab(-34, 43.4, 8, 9.8);
  slab(-34, -1.2, 9.8, 12.2); slab(10.2, 43.4, 9.8, 12.2);
  slab(-34, 43.4, 12.2, 30);
  // 東ブロック (フードコート吹き抜け x[44,54] z[-8,8] / エスカレーター口)
  slab(43.4, 56, -30, -15.2);
  slab(54.6, 56, -15.2, -12.8);
  slab(43.4, 56, -12.8, -8);
  slab(43.4, 44, -8, 8); slab(54, 56, -8, 8);
  slab(43.4, 56, 8, 30);

  // ---- 吹き抜けの手すり (h1.0 → ジャンプで飛び越えて1Fへ落下ショートカット可) ----
  const RAIL = 0xc8ccd4;
  boxes.push(...wallZ(-8, -1.5, -6, F2, 1.0, 0.22, [], RAIL, 'rail'), ...wallZ(1.5, 8, -6, F2, 1.0, 0.22, [], RAIL, 'rail'));
  boxes.push(...wallZ(-8, -1.5, 10, F2, 1.0, 0.22, [], RAIL, 'rail'), ...wallZ(1.5, 8, 10, F2, 1.0, 0.22, [], RAIL, 'rail'));
  boxes.push(...wallX(-6, 10, -8, F2, 1.0, 0.22, [[-6, -5.2], [3.5, 5.2]], RAIL, 'rail'));
  boxes.push(...wallX(-6, 10, 8, F2, 1.0, 0.22, [[-1.2, 0.6], [9.2, 10]], RAIL, 'rail'));
  boxes.push(...wallX(-6, 10, -1.5, F2, 1.0, 0.22, [], RAIL, 'rail'), ...wallX(-6, 10, 1.5, F2, 1.0, 0.22, [], RAIL, 'rail')); // ブリッジ両脇
  boxes.push(...wallX(44, 54, -8, F2, 1.0, 0.22, [], RAIL, 'rail'), ...wallX(44, 54, 8, F2, 1.0, 0.22, [], RAIL, 'rail'));
  boxes.push(...wallZ(-8, 8, 44, F2, 1.0, 0.22, [], RAIL, 'rail'), ...wallZ(-8, 8, 54, F2, 1.0, 0.22, [[-14.8, -13]], RAIL, 'rail'));

  // ============ 2F テナント ============
  // 西: イオンスタイル2F (衣料品・暮らしの品)
  boxes.push(...wallZ(-30, 30, -34, F2, 4, 0.5, [[-23, -21], [-18, -13], [-3, 3], [13, 18], [21, 23]], WALL));
  for (let r = 0; r < 4; r++) {
    boxes.push(B(-49, F2, -15 + r * 8, 6, 1.4, 1.0, 0xd0aab8, 'metal')); // 衣料ラック
    boxes.push(B(-40, F2, -15 + r * 8, 6, 1.4, 1.0, 0xb8c8d8, 'metal'));
  }
  boxes.push(B(-52, F2, 24, 5, 2.1, 4, 0xcfc8bc, 'shelf')); // 試着室ブロック
  boxes.push(B(-45, F2 + 4.6, -34, 14, 1.2, 0.3, 0xc42a76, 'sign', { deco: 1, glow: 1 }));
  for (const s of [-1, 1]) {
    const front = s * 7, back = s * 20, band = s * 24;
    // 2Fの店壁 (北=未来屋風書店+雑貨 / 南=ゲームコーナー+レストラン街)
    boxes.push(...wallX(-34, -8, front, F2, 4, 0.5, [[-30, -26], [-16, -12]], SHOP));
    boxes.push(...wallX(12, 42, front, F2, 4, 0.5, [[14, 17], [25, 28], [36, 39]], SHOP));
    boxes.push(...wallX(-34, 42, back, F2, 4, 0.4, [[-0.8, 0.8], [-22, -20.5], [30, 31.5]], BACK));
    boxes.push(...wallX(-8, 12, s * 16, F2, 4, 0.5, [[0, 6]], SHOP));
    boxes.push(...wallX(-34, 42, band, F2, 4, 0.4, [[0.5, 2.5], [3.5, 5.5]], BACK));
    boxes.push(...wallZ(Math.min(tzz(s, 24), tzz(s, 30)), Math.max(tzz(s, 24), tzz(s, 30)), -6, F2, 4, 0.4, [], BACK));
    boxes.push(...wallZ(Math.min(tzz(s, 24), tzz(s, 30)), Math.max(tzz(s, 24), tzz(s, 30)), 12, F2, 4, 0.4, [], BACK));
    // 2Fトイレ (1Fと同じ位置)
    for (let st = 0; st < 3; st++) boxes.push(B(-4.5 + st * 1.6, F2, s * 28.6, 0.12, 1.6, 2.2, 0xd8d2c8, 'metal'));
    boxes.push(B(-1.5, F2, s * 25.5, 3.2, 0.85, 0.6, 0xe8e8ee, 'tile'));
  }
  // 北2F: 未来屋風書店 (本棚の迷路) x[-34,-8]
  for (let r = 0; r < 3; r++) {
    boxes.push(B(-28, F2, -17.5 + r * 3.6, 8, 2.1, 0.9, 0x8a6a44, 'shelf'));
    boxes.push(B(-15, F2, -17.5 + r * 3.6, 8, 2.1, 0.9, 0x8a6a44, 'shelf'));
  }
  boxes.push(B(-21, F2 + 4.6, -7, 10, 1.0, 0.3, 0x2a9d5c, 'sign', { deco: 1, glow: 1 }));
  // 北2F東側: 雑貨・携帯ショップ
  for (const cx of [18, 30, 38]) {
    boxes.push(B(cx, F2, -15, 3, 1.35, 1.1, 0xb8c8d8, 'metal'));
    boxes.push(B(cx, F2, -10.5, 3, 0.95, 1.0, 0x9c8f80, 'wood'));
  }
  // 南2F西側: ゲームコーナー (クレーンゲーム・メダル機の迷路)
  const gameCols = [0xff5f7a, 0x54c2ff, 0xffd166, 0x9b8cff, 0x66e0aa];
  let gi = 0;
  for (const gx of [-30, -25, -20, -15, -10]) {
    boxes.push(B(gx, F2, 11.5, 1.7, 1.75, 1.7, gameCols[gi % 5], 'metal', { glow: 1 }));
    boxes.push(B(gx, F2, 17.5, 1.7, 1.75, 1.7, gameCols[(gi + 2) % 5], 'metal', { glow: 1 }));
    gi++;
  }
  boxes.push(B(-21, F2 + 4.6, 7, 12, 1.1, 0.3, 0xffb14d, 'sign', { deco: 1, glow: 1 })); // ゲームコーナー看板
  // 南2F東側: レストラン街 (3店: テーブルと仕切り)
  for (const [x1, x2] of [[12, 22], [23, 32], [33, 42]]) {
    const cx = (x1 + x2) / 2;
    boxes.push(B(cx - 2, F2, 12, 1.4, 0.78, 1.4, 0xc9a06a, 'wood'));
    boxes.push(B(cx + 2, F2, 16, 1.4, 0.78, 1.4, 0xc9a06a, 'wood'));
    boxes.push(B(cx, F2, 19, 2.6, 0.95, 0.9, 0x9c8f80, 'wood'));
    boxes.push(B(cx, F2 + 4.6, 7, (x2 - x1) - 2, 1.0, 0.3, shopColors[(cx | 0) % 6], 'sign', { deco: 1, glow: 1 }));
  }
  // 東2F: フードコートを見下ろす休憩デッキ (観葉植物+ソファ)
  boxes.push(B(49, F2, -20, 2.6, 0.55, 1.1, 0xb08a5f, 'wood'), B(49, F2, 20, 2.6, 0.55, 1.1, 0xb08a5f, 'wood'));
  boxes.push(B(45, F2, -24, 1.4, 0.7, 1.4, 0x8a7a64, 'wood'));
  boxes.push(B(45, F2 + 0.7, -24, 0.9, 1.3, 0.9, 0x3f9b4f, 'leaf', { deco: 1 }));

  // ============ 牢屋: 1F北東バックヤードの警備室 ============
  // (スタッフ通路からドアで入る。壁は低めで外から中が見える)
  boxes.push(B(35, 0, -26, 3.5, 0.9, 1.0, 0x707a90, 'metal')); // 警備デスク
  boxes.push(B(38.5, 0, -28.5, 2.2, 1.6, 1.2, 0x8a94a8, 'metal')); // モニターラック
  boxes.push(B(35, 4.7, -24, 6, 1.0, 0.3, 0xff5555, 'sign', { deco: 1, glow: 1 }));

  return {
    id: 'mall', name: 'ショッピングモール', boxes,
    sky: 0x252a34, fog: { color: 0x2a303c, near: 34, far: 140 },
    ambient: 0.78, sun: 0.62, sunColor: 0xfff2dd,
    lights: [
      { x: 2, y: 8, z: 0, c: 0xffeecc, i: 34, d: 34 }, { x: -45, y: 7, z: 0, c: 0xffeecc, i: 24, d: 28 },
      { x: 49, y: 8, z: 0, c: 0xffeecc, i: 26, d: 28 }, { x: -20, y: 7, z: 0, c: 0xffeecc, i: 18, d: 22 },
      { x: 26, y: 7, z: 0, c: 0xffeecc, i: 18, d: 22 }
    ],
    bounds: { minX: -55, maxX: 55, minZ: -29, maxZ: 29 },
    jail: { x: 36, y: 0, z: -27, w: 8, d: 4.5 },
    spawns: {
      oni: [[2, 0.1, -4.5], [5.5, 0.1, 0], [-1.5, 0.1, 0], [2, 0.1, 4.5], [5.5, 0.1, 4.5], [-1.5, 0.1, -4.5], [5.5, 0.1, -4.5], [-1.5, 0.1, 4.5]],
      run: [
        [-45, 0.1, 0], [-50, 0.1, -20], [-51, 0.1, -28], [50, 0.1, 12], [48, 0.1, -20],
        [-28, 0.1, -13], [18, 0.1, -13], [-28, 0.1, 15], [18, 0.1, 13],
        [-20, 5.1, -13], [-20, 5.1, 13], [30, 5.1, 13]
      ]
    }
  };
}
// wallZのmin/max簡略用 (南北対称の帯のz範囲)
function tzz(s, v) { return s * v; }

// ============================================================
// マップ3: 学校 ─ U字型4階建て校舎 + 中庭 + 体育館 + 武道場 + 校庭
// U字: 北の本棟 + 東西のウイングが南へ伸び、間が中庭。
// 各棟の端に折り返し階段室があり 1F〜4F〜屋上 まで繋がる。
// 本棟1Fに図書館、各階のウイングにトイレ。
// 校庭には部室棟・自転車置き場・倉庫で路地と隠れ場所を作る。
// ============================================================
function buildSchool() {
  const WALL = 0xe6ddca, CORR = 0xcabfa8, CLS = 0xd8ceba, GYMC = 0xc8b494, SLAB = 0xb8ad96, FENCE = 0x8a9aa8;
  const boxes = [];
  const FH = 4.2;                      // 1フロアの高さ (天井高め)
  const FLOORS = 4;                    // 4階建て
  const ROOF = FH * FLOORS;            // 屋上 16.8
  // 地面 (校庭含む全域) と外周フェンス
  boxes.push(B(0, -0.5, 0, 106, 0.5, 82, 0xb99a6b, 'dirt'));
  boxes.push(...wallX(-52, 52, -39.7, 0, 2.2, 0.5, [], FENCE, 'fence'), ...wallX(-52, 52, 39.7, 0, 2.2, 0.5, [], FENCE, 'fence'));
  boxes.push(...wallZ(-40, 40, -51.7, 0, 2.2, 0.5, [], FENCE, 'fence'), ...wallZ(-40, 40, 51.7, 0, 2.2, 0.5, [], FENCE, 'fence'));

  // ============ U字校舎 ============
  // 本棟: x[-34,34] z[-38,-24] (北=教室帯 z[-38,-28] / 南=廊下帯 z[-28,-24])
  // 西ウイング: x[-34,-20] z[-24,8] (廊下は中庭側 x[-24,-20])
  // 東ウイング: x[20,34]  z[-24,8] (廊下は中庭側 x[20,24])
  // 中庭: x[-20,20] z[-24,8] / U字の開口は南

  // ---- 1F土間 ----
  boxes.push(B(0, 0, -31, 68, 0.12, 14, 0x9aa4ae, 'tile'));                    // 本棟1F
  boxes.push(B(-27, 0, -8, 14, 0.12, 32, 0x9aa4ae, 'tile'));                   // 西ウイング1F
  boxes.push(B(27, 0, -8, 14, 0.12, 32, 0x9aa4ae, 'tile'));                    // 東ウイング1F

  // ---- 階段室 (本棟両端 x∓[22..34]): 折り返し2レーン ----
  // レーンA(外側): 1F→2F, 3F→4F を北向きに上る / レーンB(内側): 2F→3F, 4F→屋上 を南向きに上る
  const stepH = FH / 14, stepD = 0.42;
  for (const s of [-1, 1]) { // -1=西階段室, +1=東階段室
    const laneA = s * 29.9, laneB = s * 27.7;
    for (let fl = 0; fl < FLOORS; fl++) {
      const Y = fl * FH;
      if (fl % 2 === 0) boxes.push(...stairs(laneA, Y, -29.4, 'n', 2.2, 14, stepH, stepD, CORR)); // A: 北向き
      else boxes.push(...stairs(laneB, Y, -35.5, 's', 2.2, 14, stepH, stepD, CORR));              // B: 南向き
    }
  }

  // ---- 2F〜4F+屋上のスラブ ----
  for (let fl = 1; fl <= FLOORS; fl++) {
    const Y = fl * FH, isRoof = fl === FLOORS;
    const c = isRoof ? 0xb0b8c0 : SLAB;
    const holeLaneA = fl % 2 === 1; // 2F/4Fに到着するのはレーンA
    boxes.push(B(0, Y - 0.35, -33, 44, 0.35, 10, c, 'tile'));                  // 教室帯 x[-22,22]
    boxes.push(B(0, Y - 0.35, -26, 68, 0.35, 4, c, 'tile'));                   // 廊下帯 x[-34,34]
    boxes.push(B(-27, Y - 0.35, -8, 14, 0.35, 32, c, 'tile'));                 // 西ウイング
    boxes.push(B(27, Y - 0.35, -8, 14, 0.35, 32, c, 'tile'));                  // 東ウイング
    for (const s of [-1, 1]) {
      // 階段室: 北ランディング + 南ストリップ + 中間帯(片レーン開口)
      boxes.push(B(s * 28, Y - 0.35, -36.8, 12, 0.35, 2.4, c, 'tile'));        // 北ランディング z[-38,-35.6]
      boxes.push(B(s * 28, Y - 0.35, -28.75, 12, 0.35, 1.5, c, 'tile'));       // 南ストリップ z[-29.5,-28]
      // 中間帯 x内訳: 外壁側[34..31], レーンA[31..28.8], レーンB[28.8..26.6], 内側[26.6..22]
      boxes.push(B(s * 32.5, Y - 0.35, -32.55, 3, 0.35, 6.1, c, 'tile'));      // 外壁側
      boxes.push(B(s * 24.3, Y - 0.35, -32.55, 4.6, 0.35, 6.1, c, 'tile'));    // 内側
      if (holeLaneA) boxes.push(B(s * 27.7, Y - 0.35, -32.55, 2.2, 0.35, 6.1, c, 'tile')); // Bを塞ぐ
      else boxes.push(B(s * 29.9, Y - 0.35, -32.55, 2.2, 0.35, 6.1, c, 'tile'));           // Aを塞ぐ
    }
  }

  // ---- 各階の壁 ----
  for (let fl = 0; fl < FLOORS; fl++) {
    const Y = fl * FH, is1F = fl === 0;
    // 本棟外壁
    boxes.push(...wallX(-34, 34, -38, Y, FH, 0.5, is1F ? [[-2, 2]] : [], WALL));            // 北面 (1Fに裏口)
    boxes.push(...wallZ(-38, -24, -34, Y, FH, 0.5, [], WALL));                              // 西妻
    boxes.push(...wallZ(-24, 8, -34, Y, FH, 0.5, [], WALL));                                // 西ウイング外壁
    boxes.push(...wallZ(-38, -24, 34, Y, FH, 0.5, [], WALL));                               // 東妻
    boxes.push(...wallZ(-24, 8, 34, Y, FH, 0.5, [], WALL));                                 // 東ウイング外壁
    // ウイング南端 (1Fの廊下端に出入口)
    boxes.push(...wallX(-34, -20, 8, Y, FH, 0.5, is1F ? [[-23.5, -20.8]] : [], WALL));
    boxes.push(...wallX(20, 34, 8, Y, FH, 0.5, is1F ? [[20.8, 23.5]] : [], WALL));
    // ---- 中庭側の窓壁: 腰壁0.9 + 上帯1.9〜 ----
    // 本棟廊下南面 z=-24 (中庭側 x[-20,20]) : 1Fは昇降口2つ
    const doors = is1F ? [[-14, -10], [10, 14]] : [];
    boxes.push(...wallX(-20, 20, -24, Y, 0.9, 0.5, doors, WALL));
    boxes.push(...wallX(-20, 20, -24, Y + 1.9, FH - 1.9, 0.5, [], WALL));
    for (const px of [-20, -10, 0, 10, 20]) boxes.push(B(px, Y + 0.9, -24, 0.7, 1.0, 0.5, WALL)); // 窓柱
    // ウイング中庭側 x=∓20: 1Fにドア2つ
    for (const s of [-1, 1]) {
      const wd = is1F ? [[-16, -13], [0, 3]] : [];
      boxes.push(...wallZ(-24, 8, s * 20, Y, 0.9, 0.5, wd, WALL));
      boxes.push(...wallZ(-24, 8, s * 20, Y + 1.9, FH - 1.9, 0.5, [], WALL));
      for (const pz of [-24, -16, -8, 0, 8]) boxes.push(B(s * 20, Y + 0.9, pz, 0.5, 1.0, 0.7, WALL));
    }
    // ---- 本棟: 廊下と教室の仕切り z=-28 ----
    // 1F: 職員室 [-22,-11] / 保健室 [-11,0] / 図書館 [0,22] (広い2部屋分)
    // 2F/3F: 教室4部屋 / 4F: 特別教室 (音楽・理科・美術)
    const roomsX = is1F ? [[-22, -11], [-11, 0], [0, 22]] : [[-22, -11], [-11, 0], [0, 11], [11, 22]];
    const gaps = [];
    for (const [x1, x2] of roomsX) gaps.push([x1 + 1.5, x1 + 3.5], [x2 - 3.5, x2 - 1.5]);
    gaps.push([-31, -29], [-25.5, -23.5], [23.5, 25.5], [29, 31]); // 階段室のドア
    boxes.push(...wallX(-34, 34, -28, Y, FH, 0.4, gaps, CLS));
    const divs = is1F ? [-22, -11, 0, 22] : [-22, -11, 0, 11, 22];
    for (const dx of divs) boxes.push(...wallZ(-38, -28, dx, Y, FH, 0.4, [], CLS)); // 仕切り
    if (is1F) {
      // 図書館: 本棚の列 (間を通り抜けられる) + 閲覧テーブル + カウンター
      for (const sz of [-35.6, -33.2, -30.8]) {
        boxes.push(B(5.5, Y, sz, 7, 2.0, 0.8, 0x8a6a44, 'shelf'));
        boxes.push(B(15.5, Y, sz, 7, 2.0, 0.8, 0x8a6a44, 'shelf'));
      }
      boxes.push(B(4, Y, -29.3, 3.2, 0.75, 1.1, 0xc9a878, 'wood')); // 閲覧テーブル
      boxes.push(B(17, Y, -29.3, 3.2, 0.75, 1.1, 0xc9a878, 'wood'));
      boxes.push(B(10.5, Y + 3.0, -28, 6, 0.8, 0.3, 0x2a9d5c, 'sign', { deco: 1, glow: 1 })); // 図書館の緑看板
      // 職員室・保健室の机とベッド
      boxes.push(B(-16.5, Y, -33, 5, 0.78, 2.4, 0xc9a878, 'wood'));
      boxes.push(B(-6, Y, -35, 2.2, 0.6, 4, 0xe8e8f0, 'tile')); // 保健室ベッド
    } else if (fl < 3) {
      // 教室の机 (2F/3F, 跳び乗れる)
      for (const [x1, x2] of roomsX) {
        const cx = (x1 + x2) / 2;
        for (const [dx, dz] of [[-2.5, -34.5], [0, -34.5], [2.5, -34.5], [-2.5, -31.5], [0, -31.5], [2.5, -31.5]])
          boxes.push(B(cx + dx, Y, dz, 1.5, 0.75, 1.1, 0xc9a878, 'wood'));
        boxes.push(B(cx, Y, -36.8, 2.0, 0.85, 0.9, 0x8a6a44, 'wood')); // 教卓
      }
    } else {
      for (const [x1, x2] of roomsX) boxes.push(B((x1 + x2) / 2, Y, -36.9, 5, 1.8, 0.8, 0x8a92a0, 'metal')); // ロッカー
      boxes.push(B(-16.5, Y, -32, 2.6, 1.0, 1.6, 0x2a2a30, 'wood')); // グランドピアノ (音楽室)
    }
    // ---- ウイング: 廊下(中庭側 x∓[20,24]) と部屋 x∓[24,34] ----
    // 部屋割り(z): トイレ[-24,-16] / 特別教室[-16,-4] / 教室[-4,8]
    for (const s of [-1, 1]) {
      boxes.push(...wallZ(-24, 8, s * 24, Y, FH, 0.4, [[-22, -20], [-14, -12], [-8, -6], [-2, 0], [4, 6]], CLS));
      boxes.push(...wallX(Math.min(s * 24, s * 34), Math.max(s * 24, s * 34), -24, Y, FH, 0.4, [], CLS)); // 本棟廊下との仕切り
      boxes.push(...wallX(Math.min(s * 24, s * 34), Math.max(s * 24, s * 34), -16, Y, FH, 0.4, [], CLS)); // トイレと教室の仕切り
      boxes.push(...wallX(Math.min(s * 24, s * 34), Math.max(s * 24, s * 34), -4, Y, FH, 0.4, [], CLS));
      // トイレ: 個室ブース3つ + 洗面台 (各階にある!)
      for (let st = 0; st < 4; st++) boxes.push(B(s * (26 + st * 1.5), Y, -17.1, 0.12, 1.6, 1.9, 0xd8d2c8, 'metal'));
      boxes.push(B(s * 28.5, Y, -23.3, 4, 0.85, 0.6, 0xe8e8ee, 'tile')); // 洗面台
      // 特別教室の家具
      boxes.push(B(s * 29, Y, -10, 3.2, 0.8, 1.4, 0xc9a878, 'wood'));
      boxes.push(B(s * 29, Y, 3, 3.2, 0.8, 1.4, 0xc9a878, 'wood'));
    }
  }

  // ---- 屋上: フェンス + 給水塔 (フェンスh1.1は跳び越え可 → 中庭へダイブ) ----
  boxes.push(...wallX(-34, 34, -38, ROOF, 1.1, 0.3, [], FENCE, 'fence'));
  boxes.push(...wallX(-20, 20, -24, ROOF, 1.1, 0.3, [], FENCE, 'fence'));
  boxes.push(...wallX(-34, -20, 8, ROOF, 1.1, 0.3, [], FENCE, 'fence'));
  boxes.push(...wallX(20, 34, 8, ROOF, 1.1, 0.3, [], FENCE, 'fence'));
  boxes.push(...wallZ(-38, 8, -34, ROOF, 1.1, 0.3, [], FENCE, 'fence'));
  boxes.push(...wallZ(-38, 8, 34, ROOF, 1.1, 0.3, [], FENCE, 'fence'));
  boxes.push(...wallZ(-24, 8, -20, ROOF, 1.1, 0.3, [], FENCE, 'fence'));
  boxes.push(...wallZ(-24, 8, 20, ROOF, 1.1, 0.3, [], FENCE, 'fence'));
  boxes.push(B(-12, ROOF, -34, 3.2, 2.8, 3.2, 0x98a2ac, 'metal'));  // 給水塔
  boxes.push(B(10, ROOF, -34, 5, 0.6, 2, 0xb0b8c0, 'metal'));       // 室外機

  // ---- 中庭 (U字の内側): 池・花壇・桜・ベンチ ----
  boxes.push(B(0, 0, -14, 6.5, 0.35, 4.5, 0xbfd8e8, 'tile'));
  boxes.push(B(0, 0.35, -14, 5.2, 0.15, 3.2, 0x58b8e8, 'water', { deco: 1, glow: 1 })); // 池
  for (const [px, pz] of [[-12, -18], [12, -18], [-12, -4], [12, -4]]) {
    boxes.push(B(px, 0, pz, 2.2, 0.6, 2.2, 0x8a6a44, 'wood'));
    boxes.push(B(px, 0.6, pz, 1.4, 1.1, 1.4, 0x3f9b4f, 'leaf', { deco: 1 }));  // 花壇
  }
  for (const [tx, tz] of [[-6, 3], [6, 3]]) {
    boxes.push(B(tx, 0, tz, 0.7, 2.6, 0.7, 0x6a4a34, 'wood'));
    boxes.push(B(tx, 2.4, tz, 3.6, 2.6, 3.6, 0xf0a8c0, 'leaf', { deco: 1 }));  // 桜
  }
  for (const [bx, bz] of [[-3, -19], [3, -19], [-16, -10], [16, -10]]) boxes.push(B(bx, 0, bz, 2.4, 0.5, 0.8, 0xaa8866, 'wood'));

  // ============ 体育館 (南西 x[-46,-22] z[14,34]) 天井高め ============
  boxes.push(B(-34, 0, 24, 24, 0.12, 20, 0xd8b06a, 'wood'));
  boxes.push(...wallX(-46, -22, 14, 0, 7.5, 0.5, [[-40, -37], [-28, -25]], GYMC));  // 北面: 校庭側に入口2
  boxes.push(...wallX(-46, -22, 34, 0, 7.5, 0.5, [], GYMC));
  boxes.push(...wallZ(14, 34, -46, 0, 7.5, 0.5, [], GYMC));
  boxes.push(...wallZ(14, 34, -22, 0, 7.5, 0.5, [[21, 24]], GYMC));               // 東面にも入口
  boxes.push(B(-43.5, 0, 24, 4, 1.1, 14, 0xb08a54, 'wood'));                       // ステージ
  boxes.push(...stairs(-41.2, 0, 18.5, 'w', 1.6, 4, 0.275, 0.4, 0xb08a54, 'wood')); // ステージ階段
  boxes.push(B(-32, 0, 30, 1.3, 1.0, 1.3, 0xcc6655, 'wood'), B(-28, 0, 18, 1.3, 1.3, 1.3, 0xcc6655, 'wood')); // 跳び箱
  boxes.push(B(-34, 6.2, 16, 1.8, 1.2, 0.3, 0xffffff, 'metal', { deco: 1 })); // バスケゴール板
  boxes.push(B(-34, 6.2, 32, 1.8, 1.2, 0.3, 0xffffff, 'metal', { deco: 1 }));
  // 牢屋: 体育館の器具倉庫 (北東角, 広い開口)
  boxes.push(...wallX(-27, -22, 28, 0, 3.0, 0.4, [[-26.2, -24.2]], 0x9a8a74));
  boxes.push(...wallZ(28, 34, -27, 0, 3.0, 0.4, [], 0x9a8a74));
  boxes.push(B(-23.5, 0, 33, 2.5, 0.9, 1.2, 0x8a7a64, 'wood')); // マット置き場

  // ============ 武道場 (南東 x[24,46] z[16,34]) ============
  boxes.push(B(35, 0, 25, 22, 0.12, 18, 0xb08a54, 'wood'));                        // 板の間
  boxes.push(B(33, 0.12, 25, 16, 0.1, 14, 0x9fb27a, 'tile'));                      // 畳 (乗れる)
  boxes.push(...wallX(24, 46, 16, 0, 5.5, 0.5, [[28, 31], [39, 42]], GYMC));       // 北面: 入口2
  boxes.push(...wallX(24, 46, 34, 0, 5.5, 0.5, [], GYMC));
  boxes.push(...wallZ(16, 34, 24, 0, 5.5, 0.5, [[22, 25]], GYMC));                 // 西面にも入口
  boxes.push(...wallZ(16, 34, 46, 0, 5.5, 0.5, [], GYMC));
  boxes.push(B(45.2, 3.6, 25, 0.6, 0.7, 3.2, 0x8a6a44, 'wood', { deco: 1 }));      // 神棚
  boxes.push(B(43.5, 0, 30.5, 1.5, 1.7, 1.5, 0x8a4a3a, 'wood'));                   // 太鼓 (乗れる)
  boxes.push(B(43.5, 0, 19.5, 2.6, 1.2, 0.8, 0x8a6a44, 'wood'));                   // 防具棚
  boxes.push(B(35, 4.6, 16, 8, 0.8, 0.3, 0x8060c0, 'sign', { deco: 1, glow: 1 })); // 武道場の看板

  // ============ 校庭 ============
  // ジャングルジム (3段の登れる台)
  boxes.push(B(8, 0, 18, 4.2, 0.95, 4.2, 0xd07070, 'metal'));
  boxes.push(B(8, 0.95, 18, 2.8, 0.95, 2.8, 0xd0a070, 'metal'));
  boxes.push(B(8, 1.9, 18, 1.5, 0.9, 1.5, 0x70a0d0, 'metal'));
  // トランポリン (校庭に2台)
  boxes.push(B(-4, 0, 12, 2.2, 0.45, 2.2, 0x66ddff, 'metal', { bounce: 1, glow: 1 }));
  boxes.push(B(18, 0, 24, 2.2, 0.45, 2.2, 0x66ddff, 'metal', { bounce: 1, glow: 1 }));
  // 朝礼台・鉄棒・砂場
  boxes.push(B(-8, 0, 26, 2.2, 1.0, 2.2, 0xa0a8b0, 'metal'));
  for (let i = 0; i < 3; i++) boxes.push(B(12 + i * 2.2, 0, 32, 0.15, 1.3 + i * 0.25, 0.15, 0x888888, 'metal', { deco: 1 }));
  boxes.push(B(20, 0, 32.5, 5, 0.25, 4, 0xe0cfa0, 'dirt'));
  // 部室棟 (3部屋: サッカー部・野球部・バスケ部 → 路地と隠れ場所)
  boxes.push(B(-8, 0, 30.5, 16, 0.12, 5, 0x9aa4ae, 'tile'));
  boxes.push(...wallX(-16, 0, 28, 0, 3.2, 0.4, [[-14.5, -12.8], [-9.2, -7.5], [-3.8, -2.1]], 0x9a8a74));
  boxes.push(...wallX(-16, 0, 33, 0, 3.2, 0.4, [], 0x9a8a74));
  boxes.push(...wallZ(28, 33, -16, 0, 3.2, 0.4, [], 0x9a8a74));
  boxes.push(...wallZ(28, 33, 0, 0, 3.2, 0.4, [], 0x9a8a74));
  boxes.push(...wallZ(28, 33, -10.7, 0, 3.2, 0.3, [], 0x9a8a74), ...wallZ(28, 33, -5.3, 0, 3.2, 0.3, [], 0x9a8a74));
  boxes.push(B(-8, 3.2, 30.5, 16.4, 0.3, 5.4, 0x8a8478, 'tile'));                // 部室棟の屋根
  for (const cx of [-13.5, -8, -2.7]) boxes.push(B(cx, 0, 31.8, 2.2, 0.6, 0.9, 0xaa8866, 'wood')); // ベンチ
  // 自転車置き場 (東側: 屋根付き)
  for (const [px, pz] of [[38.5, 0.8], [47.5, 0.8], [38.5, 9.2], [47.5, 9.2]]) boxes.push(B(px, 0, pz, 0.3, 2.4, 0.3, 0x98a2ac, 'metal'));
  boxes.push(B(43, 2.4, 5, 10.5, 0.2, 10.5, 0xb0b8c0, 'metal'));                 // 屋根
  boxes.push(B(43, 0, 2.5, 9, 0.85, 0.5, 0x98a2ac, 'metal'));                    // ラック2列
  boxes.push(B(43, 0, 7.5, 9, 0.85, 0.5, 0x98a2ac, 'metal'));
  // 倉庫 (東側)
  boxes.push(...wallX(42, 48, -16, 0, 3.2, 0.4, [], 0x9a8a74), ...wallX(42, 48, -8, 0, 3.2, 0.4, [], 0x9a8a74));
  boxes.push(...wallZ(-16, -8, 48, 0, 3.2, 0.4, [], 0x9a8a74));
  boxes.push(...wallZ(-16, -8, 42, 0, 3.2, 0.4, [[-13.5, -11]], 0x9a8a74));      // 西向きのドア
  boxes.push(B(45.5, 3.2, -12, 6.4, 0.3, 8.4, 0x8a8478, 'tile'));                // 倉庫の屋根
  boxes.push(B(46, 0, -14, 2.2, 1.2, 1.6, 0xc8a878, 'wood'));                    // ライン引き・用具
  // 桜並木 (幹=当たりあり, 葉=デコ)
  for (const [tx, tz] of [[49, -30], [49, -22], [49, 20], [49, 30], [4, 37], [-14, 37], [26, 37], [-49, -20], [-49, 0], [-49, 10], [-42, -34], [40, -34]]) {
    boxes.push(B(tx, 0, tz, 0.7, 2.6, 0.7, 0x6a4a34, 'wood'));
    boxes.push(B(tx, 2.4, tz, 3.4, 2.4, 3.4, 0xf0a8c0, 'leaf', { deco: 1 }));
  }
  return {
    id: 'school', name: '学校', boxes,
    sky: 0xffb37a, fog: { color: 0xffc490, near: 55, far: 185 },
    ambient: 0.65, sun: 0.9, sunColor: 0xffd9a8,
    lights: [{ x: -34, y: 6.5, z: 24, c: 0xfff4dd, i: 24, d: 28 }, { x: 0, y: 4, z: -10, c: 0xfff4dd, i: 16, d: 20 }, { x: 35, y: 4.5, z: 25, c: 0xfff4dd, i: 20, d: 24 }],
    bounds: { minX: -51, maxX: 51, minZ: -39, maxZ: 39 },
    jail: { x: -24.5, y: 0, z: 31, w: 4.5, d: 5 },
    spawns: {
      oni: [[4, 0.1, 16], [-2, 0.1, 20], [1, 0.1, 18], [4, 0.1, 20], [8, 0.1, 14], [0, 0.1, 14], [12, 0.1, 18], [4, 0.1, 12]],
      run: [
        [-28, 0.3, -26], [28, 0.3, -26], [0, 0.3, -26], [-22, 0.3, -8], [22, 0.3, -8], [0, 0.1, -10],
        [-12, FH + 0.3, -26], [12, FH * 2 + 0.3, -26], [0, FH * 3 + 0.3, -26], [0, ROOF + 0.1, -31],
        [-34, 0.3, 24], [35, 0.4, 25], [11, 0.3, -33], [45, 0.1, -2]
      ]
    }
  };
}

export const MAPS = { cave: buildCave(), mall: buildMall(), school: buildSchool() };
export const MAP_LIST = [
  { id: 'cave', name: '地下洞窟' },
  { id: 'mall', name: 'ショッピングモール' },
  { id: 'school', name: '学校' }
];

// マップの当たり判定AABBリスト (クライアント描画/サーバーCPUボット共用)
export function solidsOf(map) {
  const solids = [];
  for (const b of map.boxes) {
    if (b.deco || b.w <= 0 || b.h <= 0 || b.d <= 0) continue;
    solids.push({
      minX: b.x - b.w / 2, maxX: b.x + b.w / 2,
      minY: b.y, maxY: b.y + b.h,
      minZ: b.z - b.d / 2, maxZ: b.z + b.d / 2,
      bounce: b.bounce ? 1 : 0
    });
  }
  return solids;
}
