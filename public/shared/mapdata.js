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

// ============================================================
// マップ1: 地下洞窟 ─ 「地下に掘られた坑道ネットワーク」
// 空間+障害物ではなく、岩盤に通路が掘られて互いに繋がっている構造。
// 中央広場・4隅のチェンバー・外周坑道・ジグザグ連絡坑が全てループする。
// ============================================================
function buildCave() {
  const ROCK = 0x4a3f35, ROCK2 = 0x5a4a3f, DK = 0x362d26, WOOD = 0x6a5138;
  const boxes = [];
  boxes.push(B(0, -0.5, 0, 62, 0.5, 62, 0x453a30, 'dirt')); // 床(掘られた地面)

  // ---- 掘られている通路・部屋 (openな矩形) : ここ以外は全て岩盤 ----
  const cor = [
    [-8, 8, -8, 8],        // 中央大広場
    [-2, 2, -24, -8],      // 北坑道
    [-2, 2, 8, 24],        // 南坑道
    [8, 24, -2, 2],        // 東坑道
    [-24, -8, -2, 2],      // 西坑道
    [-24, 24, -28, -24],   // 北外周坑道
    [-24, 24, 24, 28],     // 南外周坑道
    [24, 28, -24, 24],     // 東外周坑道
    [-28, -24, -24, 24],   // 西外周坑道
    [20, 30, 20, 30],      // 南東チェンバー (牢屋)
    [-30, -20, 20, 30],    // 南西チェンバー (クリスタル鉱床)
    [-30, -20, -30, -20],  // 北西チェンバー
    [20, 30, -30, -20],    // 北東チェンバー
    [-2, 16, -16, -12],    // 北東ジグザグ坑 (横)
    [12, 16, -26, -12],    // 北東ジグザグ坑 (縦)
    [-16, 2, 12, 16],      // 南西ジグザグ坑 (横)
    [-16, -12, 12, 26],    // 南西ジグザグ坑 (縦)
    [14, 18, 2, 26],       // 南東連絡坑
    [-18, -14, -26, -2],   // 北西連絡坑
  ];

  // 1mグリッドで通路をマークし、残り(岩盤)を貪欲法で直方体にまとめる
  const N = 62, off = -31;
  const open = [];
  for (let i = 0; i < N; i++) {
    open.push(new Array(N).fill(false));
    for (let j = 0; j < N; j++) {
      const cx = off + i + 0.5, cz = off + j + 0.5;
      for (const [x1, x2, z1, z2] of cor) {
        if (cx > x1 && cx < x2 && cz > z1 && cz < z2) { open[i][j] = true; break; }
      }
    }
  }
  const used = open.map(row => row.map(v => v)); // openなセルは使用済み扱い
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      if (used[i][j]) continue;
      // 横に伸ばす
      let w = 1;
      while (i + w < N && !used[i + w][j]) w++;
      // 縦に伸ばす (幅wの行が全て岩なら)
      let d = 1;
      outer: while (j + d < N) {
        for (let k = 0; k < w; k++) if (used[i + k][j + d]) break outer;
        d++;
      }
      for (let a = 0; a < w; a++) for (let b = 0; b < d; b++) used[i + a][j + b] = true;
      const x = off + i + w / 2, z = off + j + d / 2;
      boxes.push(B(x, 0, z, w, 5.5, d, ((i + j) % 3 === 0) ? ROCK2 : ROCK));
    }
  }

  // ---- 坑道の演出: 木の支保工 (デコ・当たりなし) ----
  const frames = [[0, -18, 'z'], [0, 16, 'z'], [16, 0, 'x'], [-16, 0, 'x'], [14, -14, 'z'], [-14, 20, 'x'], [16, 12, 'z']];
  for (const [fx, fz, axis] of frames) {
    const along = axis === 'x'; // 通路がX方向 → 支柱はZ両脇
    boxes.push(B(fx + (along ? 0 : -1.7), 0, fz + (along ? -1.7 : 0), 0.3, 3.1, 0.3, WOOD, 'wood', { deco: 1 }));
    boxes.push(B(fx + (along ? 0 : 1.7), 0, fz + (along ? 1.7 : 0), 0.3, 3.1, 0.3, WOOD, 'wood', { deco: 1 }));
    boxes.push(B(fx, 3.1, fz, along ? 0.4 : 3.7, 0.35, along ? 3.7 : 0.4, WOOD, 'wood', { deco: 1 }));
  }

  // ---- 中央広場: 石筍と登れる岩・トロッコ跡 ----
  boxes.push(B(-5, 0, -5, 1.5, 3.2, 1.5, ROCK2), B(-5, 3.2, -5, 0.8, 1.0, 0.8, ROCK));
  boxes.push(B(5, 0, 4, 1.7, 2.6, 1.7, ROCK2));
  boxes.push(B(0, 0, 5.5, 2.6, 1.0, 2.6, ROCK2), B(0, 1.0, 5.5, 1.6, 0.9, 1.6, ROCK)); // 2段の登れる岩
  boxes.push(B(-4, 0, 4.5, 1.4, 0.55, 2.0, 0x7a6248, 'wood')); // トロッコ(乗れる)
  // ---- チェンバーの小物 ----
  boxes.push(B(-25, 0, 25, 2.4, 0.9, 2.4, ROCK2), B(25, 0, -25, 2.2, 1.0, 2.2, ROCK2), B(-25, 0, -25, 2.0, 0.8, 2.0, ROCK2));
  // きのこトランポリン (乗ると跳ねる)
  boxes.push(B(-26, 0, 21.5, 1.9, 0.5, 1.9, 0x66ddff, 'crystal', { bounce: 1, glow: 1 }));
  boxes.push(B(6, 0, -6, 1.9, 0.5, 1.9, 0x8f7bff, 'crystal', { bounce: 1, glow: 1 }));

  // ---- 牢屋 (南東チェンバー): 骨の檻 ----
  for (let i = 0; i < 5; i++) boxes.push(B(21.8 + i * 1.6, 0, 22.2, 0.22, 3.0, 0.22, 0xe8e0d2, 'bone', { deco: 1 }));
  boxes.push(B(25, 3.0, 25, 7, 0.3, 7, 0xd8cfc0, 'bone', { deco: 1 }));

  // ---- クリスタル (発光デコ) ----
  const crys = [
    [0, 0, -11, 0x66ffee], [0, 0, 14, 0xbb88ff], [16, 0, 0, 0x88aaff], [-14, 0, 0, 0x66ffee],
    [-25, 0, 25, 0xbb88ff], [25, 0, 25, 0x88ffcc], [25, 0, -25, 0x66ffee], [-25, 0, -25, 0xbb88ff],
    [14, 0, -14, 0x88aaff], [-14, 0, 14, 0x66ffee]
  ];
  for (const [cx, cy, cz, cc] of crys) {
    boxes.push(B(cx, cy, cz, 0.7, 1.6, 0.7, cc, 'crystal', { deco: 1, glow: 1 }));
    boxes.push(B(cx + 0.5, cy, cz - 0.3, 0.4, 0.9, 0.4, cc, 'crystal', { deco: 1, glow: 1 }));
  }
  return {
    id: 'cave', name: '地下洞窟', boxes,
    sky: 0x07070c, fog: { color: 0x0a0a12, near: 9, far: 42 },
    ambient: 0.5, sun: 0.35, sunColor: 0x8899cc,
    lights: crys.slice(0, 8).map(([x, y, z, c]) => ({ x, y: y + 1.9, z, c, i: 26, d: 20 })),
    bounds: { minX: -30, maxX: 30, minZ: -30, maxZ: 30 },
    jail: { x: 25, y: 0, z: 25, w: 6, d: 6 },
    spawns: {
      oni: [[0, 0.1, 0], [2, 0.1, 2], [-2, 0.1, -2], [2, 0.1, -2], [-2, 0.1, 2], [0, 0.1, 3], [3, 0.1, 0], [0, 0.1, -3]],
      run: [[-25, 0.1, -25], [25, 0.1, -25], [-25, 0.1, 25], [0, 0.1, 26], [26, 0.1, 0], [-26, 0.1, 0], [0, 0.1, -26], [14, 0.1, -14], [-14, 0.1, 14], [16, 0.1, 22], [-16, 0.1, -24], [26, 0.1, 10]]
    }
  };
}

// ============================================================
// マップ2: イオン風ショッピングモール (2フロア吹き抜けアトリウム)
// ============================================================
function buildMall() {
  const WALL = 0xe8e2d8, F1C = 0xcfc8bc, F2C = 0xd8d2c6, SHOP = 0xb8b0a4;
  const boxes = [];
  const F2 = 3.5; // 2F歩行面
  // 1F床・外壁
  boxes.push(B(0, -0.5, 0, 74, 0.5, 50, F1C, 'tile'));
  boxes.push(...wallX(-37, 37, -24.7, 0, 8.5, 1.0, [], WALL), ...wallX(-37, 37, 24.7, 0, 8.5, 1.0, [], WALL));
  boxes.push(...wallZ(-25, 25, -36.7, 0, 8.5, 1.0, [], WALL), ...wallZ(-25, 25, 36.7, 0, 8.5, 1.0, [], WALL));
  // ---- 1F 北側ショップ4軒 (各12m幅, 入口2つ = 店内ループ可) ----
  const shopColors = [0xff6b81, 0x54c2ff, 0xffd166, 0x8ce99a];
  for (let i = 0; i < 4; i++) {
    const cx = -21 + i * 14; // 店中心x
    boxes.push(...wallX(cx - 6.5, cx + 6.5, -15.5, 0, 3.2, 0.5, [[cx - 5, cx - 2.6], [cx + 2.6, cx + 5]], SHOP)); // 店前面(ドア2)
    if (i < 3) boxes.push(...wallZ(-24.2, -15.5, cx + 7, 0, 3.2, 0.5, [], SHOP)); // 隣店との仕切り
    boxes.push(B(cx, 0, -19, 3.2, 0.95, 1.1, 0x9c8f80, 'wood'));   // カウンター(跳び乗れる)
    boxes.push(B(cx - 4, 0, -21, 1.0, 1.8, 3.5, 0x8a7f72, 'wood')); // 棚
    boxes.push(B(cx + 4, 0, -21, 1.0, 1.8, 3.5, 0x8a7f72, 'wood'));
    boxes.push(B(cx, 3.6, -15.5, 9, 1.1, 0.3, shopColors[i], 'sign', { deco: 1, glow: 1 })); // 看板
  }
  boxes.push(...wallZ(-24.2, -15.5, -28, 0, 3.2, 0.5, [], SHOP), ...wallZ(-24.2, -15.5, 28, 0, 3.2, 0.5, [], SHOP));
  // ---- 1F 南側: 西=スーパー(棚の列) / 東=フードコート ----
  boxes.push(...wallX(-36.7, 2, 15.5, 0, 3.2, 0.5, [[-30, -26], [-13, -9], [-2, 1]], SHOP)); // スーパー前面(入口3)
  for (let r = 0; r < 3; r++) { // 陳列棚: 3列, 中央に通り抜けギャップ
    const gz = 17.5 + r * 2.6;
    boxes.push(B(-25, 0, gz, 12, 1.7, 0.9, 0x7fa8d0, 'shelf'));
    boxes.push(B(-9, 0, gz, 12, 1.7, 0.9, 0x7fa8d0, 'shelf'));
  }
  boxes.push(B(-17.5, 3.6, 15.5, 12, 1.1, 0.3, 0x35c46e, 'sign', { deco: 1, glow: 1 }));
  // フードコート (東南): テーブルと椅子 = 低障害物ゾーン
  for (const [tx, tz] of [[10, 19], [16, 21], [22, 18], [28, 21], [32, 17], [13, 15.5] , [25, 15]]) {
    boxes.push(B(tx, 0, tz, 1.7, 0.8, 1.7, 0xc9a06a, 'wood'));
    boxes.push(B(tx + 1.4, 0, tz, 0.55, 0.5, 0.55, 0x8a6a44, 'wood'), B(tx - 1.4, 0, tz, 0.55, 0.5, 0.55, 0x8a6a44, 'wood'));
  }
  boxes.push(B(20, 0, 23.5, 14, 1.0, 1.4, 0x9c8f80, 'wood')); // フードカウンター
  // ---- 中央アトリウム: 噴水 + プランター + キッズトランポリン ----
  boxes.push(B(0, 0, 0, 5.2, 0.65, 5.2, 0xbfd8e8, 'tile'));
  boxes.push(B(0, 0.65, 0, 3.6, 0.25, 3.6, 0x58b8e8, 'water', { deco: 1, glow: 1 }));
  boxes.push(B(0, 0.65, 0, 0.9, 1.9, 0.9, 0xbfd8e8, 'tile'));
  boxes.push(B(9, 0, -10.5, 2.2, 0.45, 2.2, 0xff8fb3, 'metal', { bounce: 1, glow: 1 })); // トランポリン(2Fへ跳べる)
  for (const [px, pz] of [[-9, -6], [9, -6], [-9, 6], [9, 6]]) {
    boxes.push(B(px, 0, pz, 1.8, 0.75, 1.8, 0x7a6a55, 'wood'));
    boxes.push(B(px, 0.75, pz, 1.1, 1.5, 1.1, 0x3f9b4f, 'leaf', { deco: 1 }));
  }
  for (const [bx, bz] of [[-5, -10.5], [5, 10.5], [17, -3], [-17, 3]]) boxes.push(B(bx, 0, bz, 2.6, 0.55, 0.8, 0xaa8866, 'wood')); // ベンチ
  // ---- エスカレーター相当の階段 (東西2基) + 西奥のスタッフ階段 ----
  boxes.push(...stairs(6.2, 0, -4, 'e', 2.3, 14, 0.25, 0.5, 0x99a0aa, 'metal'));   // 上端x≈13.2で東スラブに接続
  boxes.push(...stairs(-6.2, 0, 4, 'w', 2.3, 14, 0.25, 0.5, 0x99a0aa, 'metal'));   // 上端x≈-13.2で西スラブに接続
  boxes.push(...stairs(-32, 0, -20, 's', 2.4, 14, 0.25, 0.5, WALL));               // 西端バック階段(スーパー奥→2F, 上端z≈-13.0)
  // ---- 2F スラブ (中央 x∈[-13,13], z∈[-9,9] は吹き抜け / 西端はバック階段用の開口) ----
  const slab = (x, z, w, d) => boxes.push(B(x, F2 - 0.4, z, w, 0.4, d, F2C, 'tile'));
  slab(-34.7, 0, 2.6, 48);         // 最西帯
  slab(-21.8, 0, 17.6, 48);        // 西側 (バック階段開口の東)
  slab(-32, -22.25, 2.8, 3.5);     // バック階段開口の北
  slab(-32, 5.5, 2.8, 37);         // バック階段開口の南
  slab(24.5, 0, 23, 48);           // 東側全面
  slab(0, -16.5, 26, 15);          // 北側
  slab(0, 16.5, 26, 15);           // 南側
  slab(0, 0, 26, 2.6);             // 中央ブリッジ (吹き抜けを渡る)
  // 吹き抜けの手すり (h=1.05 → ジャンプで飛び越えて1Fへ落下ショートカット可)
  boxes.push(...wallX(-13, 13, -9, F2, 1.05, 0.25, [], 0xcc4444, 'rail'));
  boxes.push(...wallX(-13, 13, 9, F2, 1.05, 0.25, [], 0xcc4444, 'rail'));
  boxes.push(...wallZ(-9, 9, -13, F2, 1.05, 0.25, [[-1.5, 1.5], [2.6, 5.4]], 0xcc4444, 'rail'));  // 西: 橋+階段開口
  boxes.push(...wallZ(-9, 9, 13, F2, 1.05, 0.25, [[-5.4, -2.6], [-1.5, 1.5]], 0xcc4444, 'rail')); // 東: 階段+橋開口
  // ---- 2F ショップ (北3軒 / 南3軒, 各2ドア) ----
  for (let i = 0; i < 3; i++) {
    const cx = -18 + i * 18;
    boxes.push(...wallX(cx - 7, cx + 7, -15.5, F2, 3.0, 0.5, [[cx - 5.5, cx - 3], [cx + 3, cx + 5.5]], SHOP));
    boxes.push(...wallX(cx - 7, cx + 7, 15.5, F2, 3.0, 0.5, [[cx - 5.5, cx - 3], [cx + 3, cx + 5.5]], SHOP));
    if (i < 2) {
      boxes.push(...wallZ(-24.2, -15.5, cx + 9, F2, 3.0, 0.5, [], SHOP));
      boxes.push(...wallZ(15.5, 24.2, cx + 9, F2, 3.0, 0.5, [], SHOP));
    }
    boxes.push(B(cx, F2, -20, 3.0, 0.9, 1.0, 0x9c8f80, 'wood'));
    boxes.push(B(cx, F2, 20, 3.0, 0.9, 1.0, 0x9c8f80, 'wood'));
    boxes.push(B(cx, F2 + 3.4, -15.5, 10, 1.0, 0.3, shopColors[(i + 1) % 4], 'sign', { deco: 1, glow: 1 }));
    boxes.push(B(cx, F2 + 3.4, 15.5, 10, 1.0, 0.3, shopColors[(i + 2) % 4], 'sign', { deco: 1, glow: 1 }));
  }
  // ---- 牢屋: 1F 東南角の警備室 (広い入口1 + 低い窓カウンター) ----
  boxes.push(...wallX(26, 36.7, 8, 0, 3.2, 0.5, [[29.5, 32.5]], 0x8a94a8));
  boxes.push(...wallZ(8, 24.2, 26, 0, 3.2, 0.5, [], 0x8a94a8));
  boxes.push(B(31.5, 0, 12, 3.5, 0.9, 1.0, 0x707a90, 'metal')); // デスク
  boxes.push(B(31, 3.4, 8, 5.5, 0.9, 0.3, 0xff5555, 'sign', { deco: 1, glow: 1 }));
  return {
    id: 'mall', name: 'ショッピングモール', boxes,
    sky: 0x20242e, fog: { color: 0x252a36, near: 30, far: 95 },
    ambient: 0.75, sun: 0.65, sunColor: 0xfff2dd,
    lights: [{ x: 0, y: 7, z: 0, c: 0xffeecc, i: 30, d: 30 }, { x: -24, y: 6, z: 0, c: 0xffeecc, i: 20, d: 24 }, { x: 24, y: 6, z: 0, c: 0xffeecc, i: 20, d: 24 }],
    bounds: { minX: -36, maxX: 36, minZ: -24, maxZ: 24 },
    jail: { x: 31.5, y: 0, z: 16, w: 9, d: 14 },
    spawns: {
      oni: [[0, 0.1, -4.2], [3.4, 0.1, 0], [-3.4, 0.1, 0], [0, 0.1, 4.2], [3.4, 0.1, 3.4], [-3.4, 0.1, -3.4], [3.4, 0.1, -3.4], [-3.4, 0.1, 3.4]],
      run: [[-35, 0.1, -22], [33, 0.1, -20], [-33, 0.1, 20], [12, 0.1, 20], [-21, 0.1, -20], [21, 0.1, -20], [-17, 0.1, 20], [-24, 3.6, 0], [24, 3.6, 0], [0, 3.6, -18], [0, 3.6, 18], [30, 0.1, -5]]
    }
  };
}

// ============================================================
// マップ3: 学校 ─ U字型4階建て校舎 + 中庭 + 体育館 + 校庭
// U字: 北の本棟 + 東西のウイングが南へ伸び、間が中庭。
// 各棟の端に折り返し階段室があり 1F〜4F〜屋上 まで繋がる。
// ============================================================
function buildSchool() {
  const WALL = 0xe6ddca, CORR = 0xcabfa8, CLS = 0xd8ceba, GYMC = 0xc8b494, SLAB = 0xb8ad96;
  const boxes = [];
  const FH = 3.3;                      // 1フロアの高さ
  const FLOORS = 4;                    // 4階建て
  const ROOF = FH * FLOORS;            // 屋上 13.2
  // 地面 (校庭含む全域) と外周フェンス
  boxes.push(B(0, -0.5, 0, 86, 0.5, 66, 0xb99a6b, 'dirt'));
  boxes.push(...wallX(-42, 42, -31.7, 0, 2.2, 0.5, [], 0x8a9aa8, 'fence'), ...wallX(-42, 42, 31.7, 0, 2.2, 0.5, [], 0x8a9aa8, 'fence'));
  boxes.push(...wallZ(-32, 32, -41.7, 0, 2.2, 0.5, [], 0x8a9aa8, 'fence'), ...wallZ(-32, 32, 41.7, 0, 2.2, 0.5, [], 0x8a9aa8, 'fence'));

  // ============ U字校舎 ============
  // 本棟: x[-30,30] z[-30,-16] (北=教室帯 z[-30,-20] / 南=廊下帯 z[-20,-16])
  // 西ウイング: x[-30,-18] z[-16,6] (廊下は中庭側 x[-22,-18])
  // 東ウイング: x[18,30]  z[-16,6] (廊下は中庭側 x[18,22])
  // 中庭: x[-18,18] z[-16,6] / U字の開口は南

  // ---- 1F土間 ----
  boxes.push(B(0, 0, -23, 60, 0.12, 14, 0x9aa4ae, 'tile'));                    // 本棟1F
  boxes.push(B(-24, 0, -5, 12, 0.12, 22, 0x9aa4ae, 'tile'));                  // 西ウイング1F
  boxes.push(B(24, 0, -5, 12, 0.12, 22, 0x9aa4ae, 'tile'));                   // 東ウイング1F

  // ---- 階段室 (本棟両端 x∓[18..30]): 折り返し2レーン ----
  // レーンA(外側): 1F→2F, 3F→4F を北向きに上る / レーンB(内側): 2F→3F, 4F→屋上 を南向きに上る
  // 各階スラブは「上ってくる側のレーン」だけ開口。落下ショートカットもできる。
  const stepH = FH / 14, stepD = 0.42;
  for (const s of [-1, 1]) { // -1=西階段室, +1=東階段室
    const laneA = s * 25.9, laneB = s * 23.7; // レーン中心x
    for (let fl = 0; fl < FLOORS; fl++) {
      const Y = fl * FH;
      if (fl % 2 === 0) boxes.push(...stairs(laneA, Y, -21.4, 'n', 2.2, 14, stepH, stepD, CORR)); // A: 北向き
      else boxes.push(...stairs(laneB, Y, -27.5, 's', 2.2, 14, stepH, stepD, CORR));              // B: 南向き
    }
  }

  // ---- 2F〜4F+屋上のスラブ ----
  // 階段室中間帯 z[-27.6,-21.5] は到着レーンの上だけ開口
  for (let fl = 1; fl <= FLOORS; fl++) {
    const Y = fl * FH, isRoof = fl === FLOORS;
    const c = isRoof ? 0xb0b8c0 : SLAB;
    const holeLaneA = fl % 2 === 1; // 2F/4Fに到着するのはレーンA
    boxes.push(B(0, Y - 0.35, -25, 36, 0.35, 10, c, 'tile'));                  // 教室帯 x[-18,18]
    boxes.push(B(0, Y - 0.35, -18, 60, 0.35, 4, c, 'tile'));                   // 廊下帯 x[-30,30]
    boxes.push(B(-24, Y - 0.35, -5, 12, 0.35, 22, c, 'tile'));                 // 西ウイング
    boxes.push(B(24, Y - 0.35, -5, 12, 0.35, 22, c, 'tile'));                  // 東ウイング
    for (const s of [-1, 1]) {
      // 階段室: 北ランディング + 南ストリップ + 中間帯(片レーン開口)
      boxes.push(B(s * 24, Y - 0.35, -28.8, 12, 0.35, 2.4, c, 'tile'));        // 北ランディング z[-30,-27.6]
      boxes.push(B(s * 24, Y - 0.35, -20.75, 12, 0.35, 1.5, c, 'tile'));       // 南ストリップ z[-21.5,-20]
      // 中間帯 x内訳: 外壁側[30..27], レーンA[27..24.8], レーンB[24.8..22.6], 内側[22.6..18]
      boxes.push(B(s * 28.5, Y - 0.35, -24.55, 3, 0.35, 6.1, c, 'tile'));      // 外壁側
      boxes.push(B(s * 20.3, Y - 0.35, -24.55, 4.6, 0.35, 6.1, c, 'tile'));    // 内側
      if (holeLaneA) boxes.push(B(s * 23.7, Y - 0.35, -24.55, 2.2, 0.35, 6.1, c, 'tile')); // Bを塞ぐ
      else boxes.push(B(s * 25.9, Y - 0.35, -24.55, 2.2, 0.35, 6.1, c, 'tile'));           // Aを塞ぐ
    }
  }

  // ---- 各階の壁 ----
  for (let fl = 0; fl < FLOORS; fl++) {
    const Y = fl * FH, is1F = fl === 0;
    // 本棟外壁
    boxes.push(...wallX(-30, 30, -30, Y, FH, 0.5, is1F ? [[-2, 2]] : [], WALL));            // 北面 (1Fに裏口)
    boxes.push(...wallZ(-30, -16, -30, Y, FH, 0.5, [], WALL));                              // 本棟西妻+西ウイング外壁
    boxes.push(...wallZ(-16, 6, -30, Y, FH, 0.5, [], WALL));
    boxes.push(...wallZ(-30, -16, 30, Y, FH, 0.5, [], WALL));                               // 東側
    boxes.push(...wallZ(-16, 6, 30, Y, FH, 0.5, [], WALL));
    // ウイング南端 (1Fの廊下端に出入口)
    boxes.push(...wallX(-30, -18, 6, Y, FH, 0.5, is1F ? [[-21.5, -18.8]] : [], WALL));
    boxes.push(...wallX(18, 30, 6, Y, FH, 0.5, is1F ? [[18.8, 21.5]] : [], WALL));
    // ---- 中庭側の窓壁: 腰壁0.9 + 上帯1.9〜 (窓のスリットは通り抜け不可の吹き抜き) ----
    // 本棟廊下南面 z=-16 (中庭側 x[-18,18]) : 1Fは昇降口2つ
    const doors = is1F ? [[-14, -10], [10, 14]] : [];
    boxes.push(...wallX(-18, 18, -16, Y, 0.9, 0.5, doors, WALL));
    boxes.push(...wallX(-18, 18, -16, Y + 1.9, FH - 1.9, 0.5, [], WALL));
    for (const px of [-18, -9, 0, 9, 18]) boxes.push(B(px, Y + 0.9, -16, 0.7, 1.0, 0.5, WALL)); // 窓柱
    // ウイング中庭側 x=∓18: 1Fにドア2つ
    for (const s of [-1, 1]) {
      const wd = is1F ? [[-11, -8], [0, 3]] : [];
      boxes.push(...wallZ(-16, 6, s * 18, Y, 0.9, 0.5, wd, WALL));
      boxes.push(...wallZ(-16, 6, s * 18, Y + 1.9, FH - 1.9, 0.5, [], WALL));
      for (const pz of [-16, -10, -4, 2, 6]) boxes.push(B(s * 18, Y + 0.9, pz, 0.5, 1.0, 0.7, WALL));
    }
    // ---- 本棟: 廊下と教室の仕切り z=-20 (教室3 + 両端は階段室) ----
    const roomsX = [[-18, -6], [-6, 6], [6, 18]];
    const gaps = [];
    for (const [x1, x2] of roomsX) gaps.push([x1 + 1.5, x1 + 3.5], [x2 - 3.5, x2 - 1.5]);
    gaps.push([-27, -25], [-21.5, -19.5], [25, 27], [19.5, 21.5]); // 階段室のドア
    boxes.push(...wallX(-30, 30, -20, Y, FH, 0.4, gaps, CLS));
    for (const dx of [-18, -6, 6, 18]) boxes.push(...wallZ(-30, -20, dx, Y, FH, 0.4, [], CLS)); // 仕切り
    // 教室の机 (1F/2Fのみ, 跳び乗れる)
    if (fl < 2) {
      for (const [x1, x2] of roomsX) {
        const cx = (x1 + x2) / 2;
        for (const [dx, dz] of [[-2.5, -26], [0, -26], [2.5, -26], [-2.5, -23], [0, -23], [2.5, -23]])
          boxes.push(B(cx + dx, Y, dz, 1.5, 0.75, 1.1, 0xc9a878, 'wood'));
        boxes.push(B(cx, Y, -28.6, 2.0, 0.85, 0.9, 0x8a6a44, 'wood')); // 教卓
      }
    } else {
      for (const [x1, x2] of roomsX) boxes.push(B((x1 + x2) / 2, Y, -28.8, 5, 1.8, 0.8, 0x8a92a0, 'metal')); // ロッカー
    }
    // ---- ウイング: 廊下(中庭側) と教室の仕切り x=∓22 ----
    for (const s of [-1, 1]) {
      boxes.push(...wallZ(-16, 6, s * 22, Y, FH, 0.4, [[-13, -11], [-7, -5], [-1, 1], [3, 5]], CLS));
      boxes.push(...wallX(s === -1 ? -30 : 22, s === -1 ? -22 : 30, -5, Y, FH, 0.4, [], CLS)); // 教室仕切り
      // 特別教室の家具
      boxes.push(B(s * 26, Y, -11, 3.2, 0.8, 1.4, 0xc9a878, 'wood'));
      boxes.push(B(s * 26, Y, 1, 3.2, 0.8, 1.4, 0xc9a878, 'wood'));
    }
  }

  // ---- 屋上: フェンス + 給水塔 (フェンスh1.1は跳び越え可 → 中庭へダイブ) ----
  boxes.push(...wallX(-30, 30, -30, ROOF, 1.1, 0.3, [], 0x8a9aa8, 'fence'));
  boxes.push(...wallX(-18, 18, -16, ROOF, 1.1, 0.3, [], 0x8a9aa8, 'fence'));
  boxes.push(...wallX(-30, -18, 6, ROOF, 1.1, 0.3, [], 0x8a9aa8, 'fence'));
  boxes.push(...wallX(18, 30, 6, ROOF, 1.1, 0.3, [], 0x8a9aa8, 'fence'));
  boxes.push(...wallZ(-30, 6, -30, ROOF, 1.1, 0.3, [], 0x8a9aa8, 'fence'));
  boxes.push(...wallZ(-30, 6, 30, ROOF, 1.1, 0.3, [], 0x8a9aa8, 'fence'));
  boxes.push(...wallZ(-16, 6, -18, ROOF, 1.1, 0.3, [], 0x8a9aa8, 'fence'));
  boxes.push(...wallZ(-16, 6, 18, ROOF, 1.1, 0.3, [], 0x8a9aa8, 'fence'));
  boxes.push(B(-10, ROOF, -26, 3.2, 2.8, 3.2, 0x98a2ac, 'metal'));  // 給水塔
  boxes.push(B(8, ROOF, -26, 5, 0.6, 2, 0xb0b8c0, 'metal'));        // 室外機

  // ---- 中庭 (U字の内側): 池・花壇・桜・ベンチ ----
  boxes.push(B(0, 0, -8, 6.5, 0.35, 4.5, 0xbfd8e8, 'tile'));
  boxes.push(B(0, 0.35, -8, 5.2, 0.15, 3.2, 0x58b8e8, 'water', { deco: 1, glow: 1 })); // 池
  for (const [px, pz] of [[-10, -12], [10, -12], [-10, 0], [10, 0]]) {
    boxes.push(B(px, 0, pz, 2.2, 0.6, 2.2, 0x8a6a44, 'wood'));
    boxes.push(B(px, 0.6, pz, 1.4, 1.1, 1.4, 0x3f9b4f, 'leaf', { deco: 1 }));  // 花壇
  }
  for (const [tx, tz] of [[-5, 2], [5, 2]]) {
    boxes.push(B(tx, 0, tz, 0.7, 2.6, 0.7, 0x6a4a34, 'wood'));
    boxes.push(B(tx, 2.4, tz, 3.6, 2.6, 3.6, 0xf0a8c0, 'leaf', { deco: 1 }));  // 桜
  }
  for (const [bx, bz] of [[-3, -13], [3, -13], [-14, -6], [14, -6]]) boxes.push(B(bx, 0, bz, 2.4, 0.5, 0.8, 0xaa8866, 'wood'));

  // ============ 体育館 (南西 x[-40,-16] z[12,30]) ============
  boxes.push(B(-28, 0, 21, 24, 0.12, 18, 0xd8b06a, 'wood'));
  boxes.push(...wallX(-40, -16, 12, 0, 6.5, 0.5, [[-34, -31], [-22, -19]], GYMC));  // 北面: 校庭側に入口2
  boxes.push(...wallX(-40, -16, 30, 0, 6.5, 0.5, [], GYMC));
  boxes.push(...wallZ(12, 30, -40, 0, 6.5, 0.5, [], GYMC));
  boxes.push(...wallZ(12, 30, -16, 0, 6.5, 0.5, [[19, 22]], GYMC));                 // 東面にも入口
  boxes.push(B(-38, 0, 21, 4, 1.1, 14, 0xb08a54, 'wood'));                          // ステージ
  boxes.push(...stairs(-35.7, 0, 16, 'w', 1.6, 4, 0.275, 0.4, 0xb08a54, 'wood'));   // ステージ階段
  boxes.push(B(-26, 0, 26, 1.3, 1.0, 1.3, 0xcc6655, 'wood'), B(-22, 0, 16, 1.3, 1.3, 1.3, 0xcc6655, 'wood')); // 跳び箱
  // 牢屋: 体育館の器具倉庫 (北東角, 広い開口)
  boxes.push(...wallX(-20.5, -16, 25.5, 0, 3.0, 0.4, [[-19.4, -17.2]], 0x9a8a74));
  boxes.push(...wallZ(25.5, 30, -20.5, 0, 3.0, 0.4, [], 0x9a8a74));
  boxes.push(B(-17.5, 0, 29, 2.5, 0.9, 1.2, 0x8a7a64, 'wood'));

  // ============ 校庭 (南側 + 東側) ============
  // ジャングルジム (3段の登れる台)
  boxes.push(B(20, 0, 16, 4.2, 0.95, 4.2, 0xd07070, 'metal'));
  boxes.push(B(20, 0.95, 16, 2.8, 0.95, 2.8, 0xd0a070, 'metal'));
  boxes.push(B(20, 1.9, 16, 1.5, 0.9, 1.5, 0x70a0d0, 'metal'));
  // トランポリン (校庭に2台: 大ジャンプで屋上は無理でも2F窓下まで跳べる)
  boxes.push(B(8, 0, 12, 2.2, 0.45, 2.2, 0x66ddff, 'metal', { bounce: 1, glow: 1 }));
  boxes.push(B(34, 0, 10, 2.2, 0.45, 2.2, 0x66ddff, 'metal', { bounce: 1, glow: 1 }));
  // 朝礼台・鉄棒・砂場
  boxes.push(B(12, 0, 24, 2.2, 1.0, 2.2, 0xa0a8b0, 'metal'));
  for (let i = 0; i < 3; i++) boxes.push(B(28 + i * 2.2, 0, 22, 0.15, 1.3 + i * 0.25, 0.15, 0x888888, 'metal', { deco: 1 }));
  boxes.push(B(34, 0, 27, 5, 0.25, 4, 0xe0cfa0, 'dirt'));
  // 桜並木 (幹=当たりあり, 葉=デコ)
  for (const [tx, tz] of [[38, -24], [38, -8], [38, 8], [38, 24], [0, 28], [-8, 28], [26, 28]]) {
    boxes.push(B(tx, 0, tz, 0.7, 2.6, 0.7, 0x6a4a34, 'wood'));
    boxes.push(B(tx, 2.4, tz, 3.4, 2.4, 3.4, 0xf0a8c0, 'leaf', { deco: 1 }));
  }
  return {
    id: 'school', name: '学校', boxes,
    sky: 0xffb37a, fog: { color: 0xffc490, near: 45, far: 145 },
    ambient: 0.65, sun: 0.9, sunColor: 0xffd9a8,
    lights: [{ x: -28, y: 5.5, z: 21, c: 0xfff4dd, i: 22, d: 26 }, { x: 0, y: 4, z: -5, c: 0xfff4dd, i: 16, d: 20 }],
    bounds: { minX: -41, maxX: 41, minZ: -31, maxZ: 31 },
    jail: { x: -18.2, y: 0, z: 27.7, w: 4.5, d: 4.5 },
    spawns: {
      oni: [[20, 0.1, 10], [22, 0.1, 12], [18, 0.1, 12], [20, 0.1, 14], [24, 0.1, 10], [16, 0.1, 8], [22, 0.1, 8], [18, 0.1, 20]],
      run: [[-28, 0.1, -18], [28, 0.1, -18], [0, 0.1, -18], [-20, 0.1, -5], [20, 0.1, -5], [0, 0.1, -2], [-14, 3.4, -18], [14, 6.7, -18], [-14, 9.95, -18], [0, 13.3, -25], [-28, 0.1, 21], [36, 0.1, -20]]
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
