// ============================================================
// 豆キャラ (まめっこ) + 手続きアニメーション
// 緑のカプセル型ボディ・黒い点目・頭に芽 (細い茎+黄色い玉)。
// 関節ジョイント (骨盤/背骨/胸/首/腕) は残してあり、歩行/走行時の
// 前傾・ひねり・呼吸・凍結/捕縛ポーズ・タッチペイントを表現する。
// 手足はほぼ見えない豆型なので、移動感は体の傾き・バウンドで出す。
// ============================================================
import * as THREE from 'three';

// 体の大きさ (以前の人型の半分)
export const MODEL_SCALE = 0.5;

// プレイヤー識別用のボディ色 (豆の色。緑系を軸にカラフルに)
export const BODY_COLORS = [0x5f8f4e, 0x4bb5c9, 0xe0a94a, 0x9b6fd0, 0x66c48a, 0xe0738f, 0xb7c959, 0xd88a55, 0x7f93b0, 0xcf5b5b];

function mat(color) { return new THREE.MeshStandardMaterial({ color, roughness: 0.62 }); }

// 丸い縦長パーツ (カプセル)。py = 中心のy位置
function capsule(r, len, color, py = 0) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 12), mat(color));
  m.position.y = py;
  m.castShadow = true;
  return m;
}
// 球パーツ (sx,sy,sz でつぶして丸みを調整)
function ball(r, color, py = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 12), mat(color));
  m.position.y = py;
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  return m;
}

export class Humanoid {
  constructor(colorIdx = 0, name = '') {
    const c = BODY_COLORS[colorIdx % BODY_COLORS.length];
    const dark = new THREE.Color(c).multiplyScalar(0.6).getHex();
    const sproutStem = 0x6f9a3e, sproutBall = 0xf2e6a0;
    this.color = c;
    this.root = new THREE.Group();          // 地面基準
    this.root.scale.setScalar(MODEL_SCALE); // 半分サイズ
    this.body = new THREE.Group();          // 上下動用
    this.root.add(this.body);

    // ---- アニメ用ジョイント (見た目は豆ひとつだが内部骨格は残す) ----
    this.pelvis = new THREE.Group(); this.pelvis.position.y = 0.94; this.body.add(this.pelvis);
    this.spine = new THREE.Group(); this.spine.position.y = 0.06; this.pelvis.add(this.spine);       // 体幹中心 (body空間 y≈1.0)
    this.chestG = new THREE.Group(); this.chestG.position.y = 0.18; this.spine.add(this.chestG);      // body空間 y≈1.18
    this.neck = new THREE.Group(); this.neck.position.y = 0.4; this.chestG.add(this.neck);            // body空間 y≈1.58

    // ---- 豆型ボディ本体 (地面〜頭までの一本カプセル。spineに付けて一体で動く) ----
    const bean = capsule(0.35, 0.76, c, -0.21);   // spine基準: body空間 y≈0.06〜1.52
    bean.scale.set(1, 1, 0.9);
    this.spine.add(bean);

    // ---- 黒い点目 (体の上寄り前面) ----
    const eyeM = new THREE.MeshStandardMaterial({ color: 0x1b1b22, roughness: 0.4 });
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 12), eyeM);
      eye.scale.set(1, 1.25, 0.6);
      eye.position.set(s * 0.11, 0.06, 0.3); // spine基準: body空間 y≈1.06
      this.spine.add(eye);
    }

    // ---- 頭の芽 (細い茎 + 黄色い玉) : 首に付けて向きに合わせて揺れる ----
    const stem = capsule(0.02, 0.13, sproutStem, 0.0); this.neck.add(stem);   // body空間 y≈1.51〜1.65
    this.neck.add(ball(0.055, sproutBall, 0.12, 1, 1.1, 1));                  // 芽の玉 body空間 y≈1.70
    // 芽の小さな葉
    for (const s of [-1, 1]) {
      const leaf = ball(0.03, sproutStem, 0.05, 1.6, 0.6, 0.5);
      leaf.position.set(s * 0.035, 0.05, 0); leaf.rotation.z = s * 0.5; this.neck.add(leaf);
    }

    // ---- 腕 (小さな手。銃の取り付け & 構え用にジョイントは残す) ----
    this.arms = {};
    for (const s of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(s * 0.29, 0.02, 0.02); this.chestG.add(shoulder); // 体の側面 (body空間 y≈1.2)
      shoulder.add(capsule(0.05, 0.08, c, -0.09));                            // 短い腕
      const elbow = new THREE.Group(); elbow.position.y = -0.18; shoulder.add(elbow);
      elbow.add(ball(0.055, c, -0.05, 1, 0.9, 1));                            // 手
      this.arms[s] = { shoulder, elbow };
    }
    // ---- 脚ジョイント (豆なので見た目は無し。アニメ用の空グループのみ) ----
    this.legs = {};
    for (const s of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(s * 0.1, -0.06, 0); this.pelvis.add(hip);
      const knee = new THREE.Group(); knee.position.y = -0.42; hip.add(knee);
      this.legs[s] = { hip, knee };
    }

    // ---- 鬼マーカー (頭上の角) と役割リング ----
    this.horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 6), new THREE.MeshStandardMaterial({ color: 0xff3333, emissive: 0x881111 }));
    this.horn.position.set(0.13, 0.14, 0); this.horn.rotation.z = -0.3; this.horn.visible = false; this.neck.add(this.horn);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.46, 24), new THREE.MeshBasicMaterial({ color: 0xff4444, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
    this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = 0.03; this.ring.visible = false;
    this.root.add(this.ring);

    // ---- 氷 (凍結時) ----
    this.ice = new THREE.Mesh(new THREE.BoxGeometry(0.82, 1.7, 0.82), new THREE.MeshStandardMaterial({ color: 0x88ccff, transparent: true, opacity: 0.42, roughness: 0.1, metalness: 0.3 }));
    this.ice.position.y = 0.82; this.ice.visible = false; this.root.add(this.ice);

    // ---- 名札 ----
    if (name) this.setName(name);

    // アニメ内部状態
    this.phase = 0;       // 歩行サイクル位相
    this.breath = Math.random() * 6;
    this.landT = 0;       // 着地からの経過
    this.smoothedSpeed = 0;
    this.wasGround = true;
    this.leanF = 0; this.leanS = 0;
    this.paints = [];     // 被弾ペイント
  }

  setName(name) {
    if (this.tag) this.root.remove(this.tag);
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
    const ctx = cv.getContext('2d');
    ctx.font = 'bold 34px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000a'; const w = Math.min(240, ctx.measureText(name).width + 24);
    ctx.beginPath(); ctx.roundRect(128 - w / 2, 8, w, 48, 12); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText(name, 128, 34);
    const tex = new THREE.CanvasTexture(cv);
    this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    this.tag.scale.set(2.7, 0.675, 1);      // rootが0.5倍なので見かけ上は約1.35幅
    this.tag.position.y = 4.1;               // rootスケール後 world≈2.05
    this.root.add(this.tag);
  }

  setRole(role) {
    const oni = role === 'oni';
    this.horn.visible = oni;
    this.ring.visible = oni;
  }
  setFrozen(f) { this.ice.visible = f; }

  // タッチされた痕: 体にインクの飛沫を貼り付ける
  addPaint(color) {
    if (this.paints.length >= 10) {
      const old = this.paints.shift();
      old.parent?.remove(old);
      old.geometry.dispose(); old.material.dispose();
    }
    const front = Math.random() < 0.5 ? 1 : -1;
    const onChest = Math.random() < 0.65;
    const parent = onChest ? this.chestG : this.pelvis;
    const splat = new THREE.Mesh(
      new THREE.SphereGeometry(0.06 + Math.random() * 0.05, 10, 8),
      new THREE.MeshStandardMaterial({ color, roughness: 0.35, emissive: color, emissiveIntensity: 0.25 })
    );
    splat.scale.set(1, 0.85 + Math.random() * 0.4, 0.3); // 平たい飛沫
    splat.position.set(
      (Math.random() - 0.5) * 0.28,
      onChest ? -0.05 + Math.random() * 0.3 : -0.05 + Math.random() * 0.12,
      front * 0.3
    );
    splat.rotation.z = Math.random() * Math.PI;
    parent.add(splat);
    this.paints.push(splat);
    // 小さな飛び散り
    for (let i = 0; i < 2; i++) {
      const drop = new THREE.Mesh(new THREE.SphereGeometry(0.022 + Math.random() * 0.016, 6, 6), splat.material);
      drop.scale.set(1, 1, 0.4);
      drop.position.copy(splat.position).add(new THREE.Vector3((Math.random() - 0.5) * 0.18, (Math.random() - 0.5) * 0.18, 0));
      parent.add(drop);
      this.paints.push(drop);
    }
  }

  // state: {speed(m/s), velY, onGround, moving, frozen, jailed, dt}
  update(st) {
    const dt = Math.min(st.dt, 0.05);
    this.breath += dt;
    this.landT += dt;
    if (st.onGround && !this.wasGround && st.velY <= 0) this.landT = 0; // 着地検出
    this.wasGround = st.onGround;

    const sp = st.frozen || st.jailed ? 0 : st.speed;
    this.smoothedSpeed += (sp - this.smoothedSpeed) * Math.min(1, dt * 10);
    const s = this.smoothedSpeed;
    const runK = Math.min(1, s / 5.5);            // 0=静止 1=全力
    this.phase += dt * (2.1 + s * 2.4);           // 歩幅と歩調の連動 (脚が無いので少し速めのバウンド)
    const P = this.phase;
    const A = this.arms, L = this.legs;
    const swing = Math.sin(P), swing2 = Math.sin(P * 2);

    if (st.frozen) { this.poseFrozen(); return; }
    if (st.jailed) { this.poseJailed(dt); return; }

    if (!st.onGround) {
      // ---- 空中: ちょっと縦に伸びて手を上げる ----
      const up = THREE.MathUtils.clamp(st.velY / 6, -1, 1);
      this.body.position.y = 0;
      this.pelvis.rotation.set(0.05 - up * 0.06, 0, 0);
      this.spine.rotation.set(-0.05 + up * 0.05, 0, 0);
      A[-1].shoulder.rotation.set(-1.6 + up * 0.5, 0, -0.4);
      A[1].shoulder.rotation.set(-1.6 + up * 0.5, 0, 0.4);
      A[-1].elbow.rotation.x = -0.2; A[1].elbow.rotation.x = -0.2;
      this.neck.rotation.set(-0.05, 0, 0);
    } else if (s > 0.25) {
      // ---- 移動: 体を前傾させ左右にプリッと弾む (脚なしの豆歩き) ----
      for (const side of [-1, 1]) {
        const ph = P + (side === 1 ? Math.PI : 0);
        const asw = Math.sin(ph + Math.PI);
        A[side].shoulder.rotation.x = asw * (0.35 + runK * 0.55);
        A[side].shoulder.rotation.z = side * (0.2 + runK * 0.15);
        A[side].elbow.rotation.x = -0.2 - runK * 0.3;
      }
      // 体: 上下バウンド(2倍周期) + 左右の傾き + ヨー回旋 + 前傾
      this.body.position.y = Math.abs(swing2) * (0.05 + runK * 0.09);
      this.pelvis.rotation.z = swing * (0.1 + runK * 0.12);
      this.pelvis.rotation.y = swing * (0.06 + runK * 0.08);
      this.pelvis.rotation.x = 0.06 + runK * 0.28;               // 前傾
      this.spine.rotation.y = -swing * (0.06 + runK * 0.1);
      this.spine.rotation.z = -swing * 0.05;
      this.spine.rotation.x = runK * 0.08;
      this.neck.rotation.x = -0.04 - runK * 0.1;
      this.neck.rotation.z = swing * 0.12;                        // 芽がぷるぷる揺れる
    } else {
      // ---- アイドル: 呼吸・キョロキョロ・芽の揺れ ----
      const br = Math.sin(this.breath * 1.9);
      this.body.position.y = br * 0.02;
      this.pelvis.rotation.set(0.02, 0, Math.sin(this.breath * 0.7) * 0.03);
      this.spine.rotation.set(br * 0.03, 0, 0);
      this.chestG.rotation.set(br * 0.02, 0, 0);
      this.neck.rotation.set(br * 0.02, Math.sin(this.breath * 0.35) * 0.35, Math.sin(this.breath * 0.9) * 0.05);
      for (const side of [-1, 1]) {
        A[side].shoulder.rotation.set(br * 0.04, 0, side * (0.25 + br * 0.03));
        A[side].elbow.rotation.x = -0.12 + br * 0.02;
      }
    }

    // ---- 着地の衝撃吸収 (ぺちゃんこ→復帰) ----
    if (this.landT < 0.28 && st.onGround) {
      const t = this.landT / 0.28;
      const dip = Math.sin((1 - t) * Math.PI * 0.5) * 0.14;
      this.body.position.y -= dip;
      this.body.scale.set(1 + dip * 0.9, 1 - dip * 1.1, 1 + dip * 0.9); // 潰れる
      this.spine.rotation.x += dip * 0.6;
    } else {
      this.body.scale.set(1, 1, 1);
    }

    this.chestG.rotation.y *= 1 - Math.min(1, st.dt * 8);

    // 鬼リングの脈動
    if (this.ring.visible) {
      const k = 1 + Math.sin(this.breath * 4) * 0.1;
      this.ring.scale.set(k, k, 1);
    }
  }

  poseFrozen() {
    const A = this.arms;
    this.body.position.y = -0.02; this.body.scale.set(1, 1, 1);
    this.pelvis.rotation.set(0.05, 0, 0);
    this.spine.rotation.set(0.06, 0, 0);
    this.neck.rotation.set(0.1, 0, 0);
    A[-1].shoulder.rotation.set(-0.4, 0, -0.6); A[1].shoulder.rotation.set(-0.4, 0, 0.6);
    A[-1].elbow.rotation.x = -0.6; A[1].elbow.rotation.x = -0.6;
  }

  poseJailed(dt) {
    // うなだれてしょんぼり
    const br = Math.sin(this.breath * 1.4);
    this.body.position.y = -0.04 + br * 0.01; this.body.scale.set(1, 1, 1);
    this.pelvis.rotation.set(0.12, 0, 0);
    this.spine.rotation.set(0.14, 0, 0);
    this.neck.rotation.set(0.4, br * 0.06, 0);
    const A = this.arms;
    A[-1].shoulder.rotation.set(-0.2, 0, -0.35); A[1].shoulder.rotation.set(-0.2, 0, 0.35);
    A[-1].elbow.rotation.x = -0.4; A[1].elbow.rotation.x = -0.4;
  }

  dispose() {
    this.root.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.map?.dispose(); m.dispose(); }); }
    });
  }
}
