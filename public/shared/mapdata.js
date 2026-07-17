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
// マップ1: 地下洞窟 (中央大空洞 + 外周回廊 + 上層バルコニー + 岩橋)
// ============================================================
function buildCave() {
  const R = 0x5a4a3f, R2 = 0x6b5748, DK = 0x3d332c;
  const boxes = [];
  // 地面と外壁
  boxes.push(B(0, -0.5, 0, 62, 0.5, 62, 0x4a3f35, 'dirt'));
  boxes.push(...wallX(-31, 31, -30.5, 0, 9, 1.4, [], DK), ...wallX(-31, 31, 30.5, 0, 9, 1.4, [], DK));
  boxes.push(...wallZ(-31, 31, -30.5, 0, 9, 1.4, [], DK), ...wallZ(-31, 31, 30.5, 0, 9, 1.4, [], DK));
  // 内側リング壁 (±18) : 大空洞と外周回廊を仕切る。四方 + 斜め計8箇所にトンネル開口
  const gapsMid = [[-2.2, 2.2]], gapsCor = [[-14.5, -11], [11, 14.5]];
  boxes.push(...wallX(-18, 18, -18, 0, 4.2, 1.2, [...gapsMid, ...gapsCor], R));
  boxes.push(...wallX(-18, 18, 18, 0, 4.2, 1.2, [...gapsMid, ...gapsCor], R));
  boxes.push(...wallZ(-18, 18, -18, 0, 4.2, 1.2, [...gapsMid, ...gapsCor], R));
  boxes.push(...wallZ(-18, 18, 18, 0, 4.2, 1.2, [...gapsMid, ...gapsCor], R));
  // 上層バルコニー (空洞を見下ろすリング, y=3.4 歩行面) : トンネル上を通るので開口部の上も繋がる
  for (const s of [-1, 1]) {
    boxes.push(B(0, 3.0, s * 15.9, 32.5, 0.4, 3.0, R2));           // 北/南バルコニー
    boxes.push(B(s * 15.9, 3.0, 0, 3.0, 0.4, 32.5, R2));           // 東/西バルコニー
    boxes.push(B(0, 3.4, s * 14.6, 29, 0.5, 0.25, DK));            // 内縁の低い岩柵(跳び越え可)
    boxes.push(B(s * 14.6, 3.4, -7, 0.25, 0.5, 11, DK));           // 東西柵は橋と階段の取付部を開ける
    boxes.push(B(s * 14.6, 3.4, 7, 0.25, 0.5, 11, DK));
  }
  // 岩橋 (東西バルコニーを空洞の真上で連結)
  boxes.push(B(0, 3.0, 0, 29, 0.4, 2.6, R2));
  boxes.push(B(0, 3.4, -1.35, 29, 0.4, 0.2, DK), B(0, 3.4, 1.35, 29, 0.4, 0.2, DK));
  // バルコニーへの岩階段 (北東・南西, 空洞床から)
  boxes.push(...stairs(8.5, 0, 13.5, 'e', 2.4, 12, 0.285, 0.5, R2));
  boxes.push(...stairs(-8.5, 0, -13.5, 'w', 2.4, 12, 0.285, 0.5, R2));
  // 空洞内の石筍ピラー (遮蔽物)
  const pillars = [[-7, -6, 1.6, 5], [6, 7, 1.9, 6], [9, -8, 1.3, 3.5], [-10, 6, 1.5, 4.5], [1, -11, 1.2, 3], [-3, 10.5, 1.4, 3.8]];
  for (const [px, pz, pw, ph] of pillars) {
    boxes.push(B(px, 0, pz, pw, ph, pw, R));
    boxes.push(B(px, ph, pz, pw * 0.55, ph * 0.35, pw * 0.55, R2));
  }
  // 外周回廊の岩塊 (遮蔽 + 跳び乗れる台)
  for (const [px, pz] of [[-24, -24], [24, 24], [-24, 12], [24, -12], [0, -24.5], [-12, 24.5]]) {
    boxes.push(B(px, 0, pz, 3.2, 1.0, 3.2, R2));
    boxes.push(B(px, 1.0, pz, 2.0, 0.9, 2.0, R));
  }
  // 牢屋: 北東の骨の檻 (開口は2方向 → 救出しやすい)
  boxes.push(...wallX(20.5, 28.5, 20.5, 0, 3.2, 0.5, [[23.2, 25.8]], 0xd8cfc0, 'bone'));
  boxes.push(...wallZ(20.5, 28.5, 20.5, 0, 3.2, 0.5, [[23.2, 25.8]], 0xd8cfc0, 'bone'));
  for (let i = 0; i < 5; i++) boxes.push(B(21.5 + i * 1.7, 0, 24.5, 0.22, 3.0, 0.22, 0xe8e0d2, 'bone', { deco: 1 }));
  // クリスタル (発光デコ・当たり判定なし)
  const crys = [[-16, 0, -16, 0x66ffee], [16, 0, 16, 0xbb88ff], [-27, 0, 5, 0x66ffee], [27, 0, -5, 0xbb88ff], [0, 3.4, 5, 0x88aaff], [-5, 0, -27, 0xbb88ff], [7, 3.4, -15.5, 0x66ffee], [22, 0, 24, 0x88ffcc]];
  for (const [cx, cy, cz, cc] of crys) {
    boxes.push(B(cx, cy, cz, 0.7, 1.6, 0.7, cc, 'crystal', { deco: 1, glow: 1 }));
    boxes.push(B(cx + 0.5, cy, cz - 0.3, 0.4, 0.9, 0.4, cc, 'crystal', { deco: 1, glow: 1 }));
  }
  return {
    id: 'cave', name: '地下洞窟', boxes,
    sky: 0x0a0a12, fog: { color: 0x0a0a14, near: 16, far: 58 },
    ambient: 0.55, sun: 0.4, sunColor: 0x8899cc,
    lights: crys.map(([x, y, z, c]) => ({ x, y: y + 1.8, z, c, i: 30, d: 22 })),
    bounds: { minX: -30, maxX: 30, minZ: -30, maxZ: 30 },
    jail: { x: 24.5, y: 0, z: 24.5, w: 7, d: 7 },
    spawns: {
      oni: [[0, 0.1, 0], [2, 0.1, 2], [-2, 0.1, -2], [2, 0.1, -2], [-2, 0.1, 2], [0, 0.1, 3], [3, 0.1, 0], [0, 0.1, -3]],
      run: [[-27.5, 0.1, -27.5], [24, 0.1, -24], [-24, 0.1, 24], [0, 0.1, 24.5], [-24.5, 0.1, 0], [24.5, 0.1, 0], [5, 0.1, -24.5], [12, 0.1, 24.5], [-12, 0.1, -24.5], [24, 0.1, 12], [-24, 0.1, -12], [16, 3.5, 0]]
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
  // ---- 中央アトリウム: 噴水 + プランター ----
  boxes.push(B(0, 0, 0, 5.2, 0.65, 5.2, 0xbfd8e8, 'tile'));
  boxes.push(B(0, 0.65, 0, 3.6, 0.25, 3.6, 0x58b8e8, 'water', { deco: 1, glow: 1 }));
  boxes.push(B(0, 0.65, 0, 0.9, 1.9, 0.9, 0xbfd8e8, 'tile'));
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
// マップ3: 学校 (2階建て校舎 + 屋上 + 体育館 + 校庭)
// ============================================================
function buildSchool() {
  const WALL = 0xe6ddca, CORR = 0xcabfa8, CLS = 0xd8ceba, GYMC = 0xc8b494;
  const boxes = [];
  const F2 = 3.5, ROOF = 7.0;
  // 地面 (校庭含む全域) と外周フェンス
  boxes.push(B(0, -0.5, 0, 80, 0.5, 56, 0xb99a6b, 'dirt'));
  boxes.push(...wallX(-40, 40, -27.7, 0, 2.2, 0.5, [], 0x8a9aa8, 'fence'), ...wallX(-40, 40, 27.7, 0, 2.2, 0.5, [], 0x8a9aa8, 'fence'));
  boxes.push(...wallZ(-28, 28, -39.7, 0, 2.2, 0.5, [], 0x8a9aa8, 'fence'), ...wallZ(-28, 28, 39.7, 0, 2.2, 0.5, [], 0x8a9aa8, 'fence'));
  // ============ 校舎 (x∈[-32,32], z∈[-26,-8]) 2階建て ============
  // 校舎床: 1F土間 / 2Fスラブ(階段開口つき) / 屋上スラブ(東階段開口つき)
  boxes.push(B(0, 0, -17, 64, 0.12, 18, 0x9aa4ae, 'tile'));
  boxes.push(B(0, F2 - 0.35, -20, 64, 0.35, 12, CORR, 'tile'));                 // 2F教室帯 (z -26..-14)
  boxes.push(B(0, F2 - 0.35, -11, 51.4, 0.35, 6, CORR, 'tile'));                // 2F廊下帯 中央 (x -25.7..25.7)
  for (const s of [-1, 1]) {                                                    // 2F廊下帯 端部 (階段開口の南北)
    boxes.push(B(s * 28.85, F2 - 0.35, -13.4, 6.3, 0.35, 1.2, CORR, 'tile'));
    boxes.push(B(s * 28.85, F2 - 0.35, -9.1, 6.3, 0.35, 2.2, CORR, 'tile'));
  }
  boxes.push(B(0, ROOF - 0.35, -18.3, 64, 0.35, 15.4, 0xb0b8c0, 'tile'));       // 屋上 北側 (z -26..-10.6)
  boxes.push(B(-3.15, ROOF - 0.35, -9.3, 57.7, 0.35, 2.6, 0xb0b8c0, 'tile'));   // 屋上 南帯 (東端は階段開口)
  for (const [Y, H] of [[0, F2], [F2, F2]]) { // 1F/2F 外壁 (南面=廊下側は窓 → 低壁+開口で乗り越え可の窓台)
    boxes.push(...wallX(-32, 32, -26, Y, H, 0.5, [], WALL));                    // 北面
    boxes.push(...wallZ(-26, -8, -32, Y, H, 0.5, Y === 0 ? [[-10.2, -8.4]] : [], WALL)); // 西妻面 (1Fに出入口)
    boxes.push(...wallZ(-26, -8, 32, Y, H, 0.5, Y === 0 ? [[-10.2, -8.4]] : [], WALL));  // 東妻面 (1Fに出入口)
    // 南面(校庭側): 昇降口2 + 窓 (窓 = 腰壁0.9 → 廊下から校庭へ跳び出せる!)
    boxes.push(...wallX(-32, 32, -8, Y, 0.9, 0.5, [[-20, -16], [16, 20]], WALL));
    boxes.push(...wallX(-32, 32, -8, Y + 2.2, H - 2.2, 0.5, [], WALL));
    for (const gx of [-26, -9, 2.5, 9, 26]) boxes.push(B(gx, Y, -8, 0.7, 2.2, 0.5, WALL)); // 窓間の柱
  }
  // 廊下と教室を仕切る壁 (z=-14): 各教室に前後2ドア
  const rooms = [[-32, -19.5, '1-A'], [-19.5, -7, '1-B'], [-7, 5.5, '1-C'], [5.5, 18, '1-D'], [18, 32, '職員室']];
  for (const [Y] of [[0], [F2]]) {
    const doorGaps = [];
    for (const [x1, x2] of rooms) doorGaps.push([x1 + 1.5, x1 + 3.5], [x2 - 3.5, x2 - 1.5]);
    boxes.push(...wallX(-32, 32, -14, Y, F2, 0.4, doorGaps, CLS));
    for (let i = 1; i < rooms.length; i++) boxes.push(...wallZ(-26, -14, rooms[i][0], Y, F2, 0.4, [], CLS)); // 教室間仕切り
    // 教室内: 机の島 (h=0.75 跳び乗り可) + 教卓
    for (const [x1, x2] of rooms) {
      const cx = (x1 + x2) / 2;
      for (const [dx, dz] of [[-2.5, -21], [0, -21], [2.5, -21], [-2.5, -18], [0, -18], [2.5, -18]])
        boxes.push(B(cx + dx, Y, dz, 1.5, 0.75, 1.1, 0xc9a878, 'wood'));
      boxes.push(B(cx, Y, -24.5, 2.0, 0.85, 0.9, 0x8a6a44, 'wood'));
    }
  }
  // 階段室: 廊下の東西端。中央側から壁際へ向かって上る直進階段 (スラブ開口の真下) + 壁際に踊り場
  boxes.push(...stairs(-24.5, 0, -11.5, 'w', 2.4, 14, 0.25, 0.42, CORR));  // 西: 1F→2F (上端x≈-30.2)
  boxes.push(B(-31.2, 0, -11.5, 1.8, 3.5, 2.4, CORR));                     // 西踊り場 (上面=2F)
  boxes.push(...stairs(24.5, 0, -11.5, 'e', 2.4, 14, 0.25, 0.42, CORR));   // 東: 1F→2F
  boxes.push(B(31.2, 0, -11.5, 1.8, 3.5, 2.4, CORR));                      // 東踊り場
  boxes.push(...stairs(24.5, F2, -9.4, 'e', 2.4, 14, 0.25, 0.42, CORR));   // 東: 2F→屋上 (南帯の開口から屋上へ)
  boxes.push(B(31.2, F2, -9.4, 1.8, 3.5, 2.4, CORR));                      // 屋上階段踊り場
  // 屋上: フェンス + 給水塔 (東階段からのみ / フェンスh1.15は跳び越えて下へ飛び降り可)
  boxes.push(...wallX(-32, 32, -26, ROOF, 1.15, 0.3, [], 0x8a9aa8, 'fence'));
  boxes.push(...wallX(-32, 32, -8, ROOF, 1.15, 0.3, [], 0x8a9aa8, 'fence'));
  boxes.push(...wallZ(-26, -8, -32, ROOF, 1.15, 0.3, [], 0x8a9aa8, 'fence'));
  boxes.push(...wallZ(-26, -8, 32, ROOF, 1.15, 0.3, [], 0x8a9aa8, 'fence'));
  boxes.push(B(-20, ROOF, -20, 3.5, 3.0, 3.5, 0x98a2ac, 'metal'));
  boxes.push(B(0, ROOF, -20, 5, 0.6, 2, 0xb0b8c0, 'metal'));
  // ============ 体育館 (x∈[-36,-10], z∈[6,26]) ============
  boxes.push(B(-23, 0, 16, 26, 0.12, 20, 0xd8b06a, 'wood'));
  boxes.push(...wallX(-36, -10, 6, 0, 6.5, 0.5, [[-30, -27], [-19, -16]], GYMC));  // 南... 校庭側に入口2
  boxes.push(...wallX(-36, -10, 26, 0, 6.5, 0.5, [], GYMC));
  boxes.push(...wallZ(6, 26, -36, 0, 6.5, 0.5, [], GYMC));
  boxes.push(...wallZ(6, 26, -10, 0, 6.5, 0.5, [[14, 17]], GYMC));                  // 東面にも入口
  boxes.push(B(-33, 0, 16, 5, 1.1, 16, 0xb08a54, 'wood'));                           // ステージ
  boxes.push(...stairs(-30.3, 0, 10, 'w', 1.6, 4, 0.275, 0.4, 0xb08a54, 'wood'));    // ステージ階段
  boxes.push(B(-20, 0, 21, 1.3, 1.0, 1.3, 0xcc6655, 'wood'), B(-15, 0, 12, 1.3, 1.3, 1.3, 0xcc6655, 'wood')); // 跳び箱
  // 牢屋: 体育館の器具倉庫 (東北角, 広い開口)
  boxes.push(...wallX(-16, -10, 18.5, 0, 3.0, 0.4, [[-14.5, -11.5]], 0x9a8a74));
  boxes.push(...wallZ(18.5, 26, -16, 0, 3.0, 0.4, [], 0x9a8a74));
  boxes.push(B(-12, 0, 24, 2.5, 0.9, 1.2, 0x8a7a64, 'wood'));
  // ============ 校庭 (東側 + 南側) ============
  // ジャングルジム (格子状の登れる台)
  const jg = [10, 14];
  boxes.push(B(jg[0], 0, jg[1], 4.2, 0.95, 4.2, 0xd07070, 'metal'));
  boxes.push(B(jg[0], 0.95, jg[1], 2.8, 0.95, 2.8, 0xd0a070, 'metal'));
  boxes.push(B(jg[0], 1.9, jg[1], 1.5, 0.9, 1.5, 0x70a0d0, 'metal'));
  // 朝礼台・鉄棒・砂場
  boxes.push(B(22, 0, 8, 2.2, 1.0, 2.2, 0xa0a8b0, 'metal'));
  for (let i = 0; i < 3; i++) boxes.push(B(28 + i * 2.2, 0, 14 + i * 0.0, 0.15, 1.3 + i * 0.25, 0.15, 0x888888, 'metal', { deco: 1 }));
  boxes.push(B(30, 0, 22, 5, 0.25, 4, 0xe0cfa0, 'dirt'));
  // 桜の木 (幹=当たりあり, 葉=デコ)
  for (const [tx, tz] of [[36, -2], [36, 10], [36, 22], [2, 24], [-4, 2], [18, 24]]) {
    boxes.push(B(tx, 0, tz, 0.7, 2.6, 0.7, 0x6a4a34, 'wood'));
    boxes.push(B(tx, 2.4, tz, 3.4, 2.4, 3.4, 0xf0a8c0, 'leaf', { deco: 1 }));
  }
  return {
    id: 'school', name: '学校', boxes,
    sky: 0xffb37a, fog: { color: 0xffc490, near: 40, far: 120 },
    ambient: 0.65, sun: 0.9, sunColor: 0xffd9a8,
    lights: [{ x: -23, y: 5.5, z: 16, c: 0xfff4dd, i: 22, d: 26 }],
    bounds: { minX: -39, maxX: 39, minZ: -27, maxZ: 27 },
    jail: { x: -13, y: 0, z: 22.5, w: 6, d: 7 },
    spawns: {
      oni: [[16, 0.1, 8], [18, 0.1, 10], [14, 0.1, 10], [16, 0.1, 12], [18, 0.1, 6], [14, 0.1, 6], [20, 0.1, 8], [12, 0.1, 8]],
      run: [[-28, 0.1, -20], [28, 0.1, -20], [0, 0.1, -11], [-23, 0.1, 16], [-32, 1.25, 16], [0, 3.6, -11], [-15, 3.6, -20], [15, 3.6, -20], [34, 0.1, -20], [26, 0.1, 18], [-13, 7.1, -17], [11, 0.1, -16]]
    }
  };
}

export const MAPS = { cave: buildCave(), mall: buildMall(), school: buildSchool() };
export const MAP_LIST = [
  { id: 'cave', name: '地下洞窟' },
  { id: 'mall', name: 'ショッピングモール' },
  { id: 'school', name: '学校' }
];
