// ============================================================
// 関節付き人型キャラクター + 手続きアニメーション
// 歩行/走行サイクル・腕振り+肘曲げ・膝上げ・骨盤の上下/左右動・
// 体幹のひねり・前傾・ジャンプ予備動作・空中姿勢・着地衝撃・
// 射撃構え・凍結/捕縛ポーズ・呼吸・首の向き まで表現する
// ============================================================
import * as THREE from 'three';

const SKIN = 0xf0c8a0;
export const BODY_COLORS = [0x4488ee, 0x44cc77, 0xeeaa33, 0xaa66ee, 0x66ccdd, 0xee6699, 0x99bb44, 0xdd8855, 0x8899aa, 0xcc5555];

function box(w, h, d, color, py = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.75 }));
  m.position.y = py;
  m.castShadow = true;
  return m;
}

export class Humanoid {
  constructor(colorIdx = 0, name = '') {
    const c = BODY_COLORS[colorIdx % BODY_COLORS.length];
    const dark = new THREE.Color(c).multiplyScalar(0.55).getHex();
    this.color = c;
    this.root = new THREE.Group();          // 地面基準
    this.body = new THREE.Group();          // 上下動用
    this.root.add(this.body);

    // ---- 骨盤・胴体・頭 ----
    this.pelvis = new THREE.Group(); this.pelvis.position.y = 0.94; this.body.add(this.pelvis);
    this.pelvis.add(box(0.34, 0.16, 0.2, dark, -0.02));
    this.spine = new THREE.Group(); this.spine.position.y = 0.06; this.pelvis.add(this.spine);
    this.chestG = new THREE.Group(); this.chestG.position.y = 0.18; this.spine.add(this.chestG);
    this.chestG.add(box(0.38, 0.4, 0.22, c, 0.16));
    this.neck = new THREE.Group(); this.neck.position.y = 0.4; this.chestG.add(this.neck);
    const head = box(0.24, 0.26, 0.24, SKIN, 0.15); this.neck.add(head);
    const hair = box(0.26, 0.1, 0.26, dark, 0.29); this.neck.add(hair);
    // 目 (前向きの目印)
    const eyeM = new THREE.MeshBasicMaterial({ color: 0x222222 });
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.05, 0.02), eyeM);
      eye.position.set(s * 0.06, 0.16, 0.125); this.neck.add(eye);
    }

    // ---- 腕 (肩ピボット → 上腕 → 肘ピボット → 前腕 → 手) ----
    this.arms = {};
    for (const s of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(s * 0.245, 0.33, 0); this.chestG.add(shoulder);
      const upper = box(0.11, 0.3, 0.11, c, -0.15); shoulder.add(upper);
      const elbow = new THREE.Group(); elbow.position.y = -0.3; shoulder.add(elbow);
      const fore = box(0.09, 0.26, 0.09, SKIN, -0.13); elbow.add(fore);
      const hand = box(0.1, 0.09, 0.1, SKIN, -0.3); elbow.add(hand);
      this.arms[s] = { shoulder, elbow };
    }
    // ---- 脚 (股関節 → 大腿 → 膝 → 下腿 → 足) ----
    this.legs = {};
    for (const s of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(s * 0.1, -0.06, 0); this.pelvis.add(hip);
      const thigh = box(0.13, 0.4, 0.14, dark, -0.2); hip.add(thigh);
      const knee = new THREE.Group(); knee.position.y = -0.42; hip.add(knee);
      const shin = box(0.11, 0.38, 0.12, dark, -0.19); knee.add(shin);
      const foot = box(0.12, 0.08, 0.24, 0x333344, -0.42); foot.position.z = 0.04; knee.add(foot);
      this.legs[s] = { hip, knee };
    }

    // ---- 銃 (鬼のときだけ表示) ----
    this.gun = new THREE.Group();
    const gunBody = box(0.06, 0.09, 0.26, 0x333340); gunBody.position.z = 0.1;
    const gunGrip = box(0.05, 0.12, 0.06, 0x554433, -0.08);
    this.gun.add(gunBody, gunGrip);
    this.gun.position.set(0, -0.3, 0.05);
    this.gun.visible = false;
    this.arms[1].elbow.add(this.gun);

    // ---- 鬼マーカー (頭上の角) と役割リング ----
    this.horn = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.16, 6), new THREE.MeshStandardMaterial({ color: 0xff3333, emissive: 0x881111 }));
    this.horn.position.y = 0.36; this.horn.visible = false; this.neck.add(this.horn);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.46, 24), new THREE.MeshBasicMaterial({ color: 0xff4444, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
    this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = 0.03; this.ring.visible = false;
    this.root.add(this.ring);

    // ---- 氷 (凍結時) ----
    this.ice = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.85, 0.7), new THREE.MeshStandardMaterial({ color: 0x88ccff, transparent: true, opacity: 0.42, roughness: 0.1, metalness: 0.3 }));
    this.ice.position.y = 0.92; this.ice.visible = false; this.root.add(this.ice);

    // ---- 名札 ----
    if (name) this.setName(name);

    // アニメ内部状態
    this.phase = 0;       // 歩行サイクル位相
    this.breath = Math.random() * 6;
    this.landT = 0;       // 着地からの経過
    this.shootT = 1;      // 射撃からの経過
    this.smoothedSpeed = 0;
    this.wasGround = true;
    this.leanF = 0; this.leanS = 0;
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
    this.tag.scale.set(1.5, 0.375, 1);
    this.tag.position.y = 2.15;
    this.root.add(this.tag);
  }

  setRole(role) {
    const oni = role === 'oni';
    this.gun.visible = oni;
    this.horn.visible = oni;
    this.ring.visible = oni;
  }
  setFrozen(f) { this.ice.visible = f; }

  triggerShoot() { this.shootT = 0; }

  // state: {speed(m/s), velY, onGround, moving, aiming, frozen, jailed, dt}
  update(st) {
    const dt = Math.min(st.dt, 0.05);
    this.breath += dt;
    this.shootT += dt;
    this.landT += dt;
    if (st.onGround && !this.wasGround && st.velY <= 0) this.landT = 0; // 着地検出
    this.wasGround = st.onGround;

    const sp = st.frozen || st.jailed ? 0 : st.speed;
    this.smoothedSpeed += (sp - this.smoothedSpeed) * Math.min(1, dt * 10);
    const s = this.smoothedSpeed;
    const runK = Math.min(1, s / 5.5);            // 0=静止 1=全力
    this.phase += dt * (2.1 + s * 1.9);           // 歩幅と歩調の連動
    const P = this.phase;
    const A = this.arms, L = this.legs;
    const swing = Math.sin(P), swing2 = Math.sin(P * 2);

    if (st.frozen) { this.poseFrozen(); return; }
    if (st.jailed) { this.poseJailed(dt); return; }

    if (!st.onGround) {
      // ---- 空中: 上昇=手を上げ膝を抱える / 下降=手足を広げて構える ----
      const up = THREE.MathUtils.clamp(st.velY / 6, -1, 1);
      this.body.position.y = 0;
      this.pelvis.rotation.set(0.12 - up * 0.1, 0, 0);
      this.spine.rotation.set(-0.15 + up * 0.1, 0, 0);
      L[-1].hip.rotation.x = -0.9 + up * 0.4; L[-1].knee.rotation.x = 1.3;
      L[1].hip.rotation.x = -0.35 + up * 0.2; L[1].knee.rotation.x = 0.75;
      A[-1].shoulder.rotation.set(-2.2 + up * 0.5, 0, -0.35);
      A[1].shoulder.rotation.set(-2.2 + up * 0.5, 0, 0.35);
      A[-1].elbow.rotation.x = -0.45; A[1].elbow.rotation.x = -0.45;
      this.neck.rotation.x = -0.1;
    } else if (s > 0.25) {
      // ---- 歩行/走行サイクル ----
      const stride = 0.55 + runK * 0.55;          // 脚の振り幅
      const lift = 0.35 + runK * 0.75;            // 膝の持ち上げ
      // 脚: 前へ振る脚は膝が伸び、後ろへ戻る脚は膝が曲がる
      for (const side of [-1, 1]) {
        const ph = P + (side === 1 ? Math.PI : 0);
        const sw = Math.sin(ph);
        L[side].hip.rotation.x = -sw * stride;
        L[side].knee.rotation.x = Math.max(0, Math.sin(ph - 1.3)) * lift + 0.08;
        // 腕は反対の脚と同期 + 肘は前で曲がる
        const asw = Math.sin(ph + Math.PI);
        A[side].shoulder.rotation.x = asw * (0.45 + runK * 0.65);
        A[side].shoulder.rotation.z = side * (0.06 + runK * 0.1);
        A[side].elbow.rotation.x = -0.35 - runK * 0.75 - Math.max(0, -asw) * 0.4;
      }
      // 骨盤: 上下バウンド(2倍周期)・左右体重移動・ヨー回旋
      this.body.position.y = Math.abs(swing2) * (0.02 + runK * 0.05) - runK * 0.03;
      this.pelvis.rotation.z = swing * (0.04 + runK * 0.04);
      this.pelvis.rotation.y = swing * (0.08 + runK * 0.1);
      this.pelvis.rotation.x = 0.04 + runK * 0.22;               // 前傾
      this.spine.rotation.y = -swing * (0.1 + runK * 0.14);       // 体幹の逆ひねり
      this.spine.rotation.z = -swing * 0.03;
      this.spine.rotation.x = runK * 0.1;
      this.neck.rotation.x = -0.08 - runK * 0.18;                 // 顔は前へ
      this.neck.rotation.y = swing * 0.05;
    } else {
      // ---- アイドル: 呼吸・重心の微揺れ・キョロキョロ ----
      const br = Math.sin(this.breath * 1.9);
      this.body.position.y = br * 0.008;
      this.pelvis.rotation.set(0.02, 0, Math.sin(this.breath * 0.7) * 0.015);
      this.spine.rotation.set(br * 0.02, 0, 0);
      this.chestG.rotation.x = br * 0.015;
      this.neck.rotation.x = br * 0.012;
      this.neck.rotation.y = Math.sin(this.breath * 0.35) * 0.3;
      for (const side of [-1, 1]) {
        A[side].shoulder.rotation.x = br * 0.03;
        A[side].shoulder.rotation.z = side * 0.07;
        A[side].elbow.rotation.x = -0.15 + br * 0.02;
        L[side].hip.rotation.x = -0.03;
        L[side].knee.rotation.x = 0.06;
      }
    }

    // ---- 着地の衝撃吸収 (しゃがみ→復帰) ----
    if (this.landT < 0.28 && st.onGround) {
      const t = this.landT / 0.28;
      const dip = Math.sin((1 - t) * Math.PI * 0.5) * 0.16;
      this.body.position.y -= dip;
      L[-1].knee.rotation.x += dip * 4; L[1].knee.rotation.x += dip * 4;
      L[-1].hip.rotation.x -= dip * 2; L[1].hip.rotation.x -= dip * 2;
      this.spine.rotation.x += dip * 1.2;
    }

    // ---- 射撃/構え: 右腕を正面へ + 反動 ----
    if (st.aiming || this.shootT < 0.35) {
      const recoil = Math.max(0, 1 - this.shootT / 0.18) * 0.5;
      A[1].shoulder.rotation.x = -Math.PI / 2 + 0.1 + recoil * 0.6;
      A[1].shoulder.rotation.z = 0.1;
      A[1].elbow.rotation.x = -0.12 - recoil * 0.5;
      this.chestG.rotation.y = -0.25;
    } else {
      this.chestG.rotation.y *= 1 - Math.min(1, st.dt * 8);
    }

    // 鬼リングの脈動
    if (this.ring.visible) {
      const k = 1 + Math.sin(this.breath * 4) * 0.1;
      this.ring.scale.set(k, k, 1);
    }
  }

  poseFrozen() {
    const A = this.arms, L = this.legs;
    this.body.position.y = -0.02;
    this.pelvis.rotation.set(0.05, 0, 0);
    this.spine.rotation.set(0.1, 0, 0);
    A[-1].shoulder.rotation.set(-0.5, 0, -0.5); A[1].shoulder.rotation.set(-0.5, 0, 0.5);
    A[-1].elbow.rotation.x = -1.4; A[1].elbow.rotation.x = -1.4;
    L[-1].hip.rotation.x = -0.1; L[1].hip.rotation.x = -0.1;
    L[-1].knee.rotation.x = 0.15; L[1].knee.rotation.x = 0.15;
    this.neck.rotation.set(0.15, 0, 0);
  }

  poseJailed(dt) {
    // うなだれて腕組み
    const br = Math.sin(this.breath * 1.4);
    this.body.position.y = br * 0.006;
    this.spine.rotation.set(0.22, 0, 0);
    this.neck.rotation.set(0.35, br * 0.05, 0);
    const A = this.arms, L = this.legs;
    A[-1].shoulder.rotation.set(-0.7, 0.5, -0.25); A[1].shoulder.rotation.set(-0.7, -0.5, 0.25);
    A[-1].elbow.rotation.x = -1.7; A[1].elbow.rotation.x = -1.7;
    L[-1].hip.rotation.x = -0.05; L[1].hip.rotation.x = -0.05;
    L[-1].knee.rotation.x = 0.1; L[1].knee.rotation.x = 0.1;
  }

  dispose() {
    this.root.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.map?.dispose(); m.dispose(); }); }
    });
  }
}
