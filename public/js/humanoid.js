// ============================================================
// ============================================================
import * as THREE from 'three';

export const MODEL_SCALE = 0.5;

export const BODY_COLORS = [0x5f8f4e, 0x4bb5c9, 0xe0a94a, 0x9b6fd0, 0x66c48a, 0xe0738f, 0xb7c959, 0xd88a55, 0x7f93b0, 0xcf5b5b];
// 肌・髪のバリエーション (プレイヤーごとに見分けがつく人型にする)
const SKINS = [0xf0c39a, 0xe8b088, 0xd9a074, 0xf2cba6, 0xc88e62, 0xecbf96, 0xdda880, 0xf0c8a2, 0xcf9a70, 0xe6b48c];
const HAIRS = [0x2a1e18, 0x1c1c22, 0x4a3222, 0x30241c, 0x141416, 0x5a3a26, 0x24201e, 0x3a2a20, 0x201a16, 0x2e2622];

function mat(color, rough = 0.7) { return new THREE.MeshStandardMaterial({ color, roughness: rough }); }

function capsule(r, len, color, py = 0) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 12), mat(color));
  m.position.y = py;
  m.castShadow = true;
  return m;
}
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
    // 人型リアル寄り: シャツ=プレイヤー色 c / ズボン=暗色 / 肌・髪・靴
    const skin = SKINS[colorIdx % SKINS.length];
    const pants = new THREE.Color(c).multiplyScalar(0.4).getHex();
    const shoe = 0x2b2e36;
    const hair = HAIRS[colorIdx % HAIRS.length];
    this.color = c;
    this.root = new THREE.Group();
    this.root.scale.setScalar(MODEL_SCALE);
    this.body = new THREE.Group();
    this.root.add(this.body);

    this.pelvis = new THREE.Group(); this.pelvis.position.y = 0.94; this.body.add(this.pelvis);
    this.spine = new THREE.Group(); this.spine.position.y = 0.06; this.pelvis.add(this.spine);
    this.chestG = new THREE.Group(); this.chestG.position.y = 0.18; this.spine.add(this.chestG);
    this.neck = new THREE.Group(); this.neck.position.y = 0.4; this.chestG.add(this.neck);

    // --- 胴 (シャツ): 肩から腰へ細くなるトルソ ---
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.3, 5, 14), mat(c, 0.68));
    torso.scale.set(1.16, 1, 0.66); torso.position.y = -0.02; torso.castShadow = true;
    this.chestG.add(torso);
    // 襟元・肩の丸み
    const collar = ball(0.1, skin, 0.28, 1, 0.8, 0.9); this.chestG.add(collar);
    // 腰 (ズボン)
    const hips = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.06, 4, 12), mat(pants, 0.72));
    hips.scale.set(1.12, 1, 0.66); hips.position.y = 0; hips.castShadow = true;
    this.pelvis.add(hips);

    // --- 首 + 頭 ---
    this.neck.add(capsule(0.058, 0.05, skin, 0.0));
    const head = new THREE.Group(); head.position.y = 0.15; this.neck.add(head);
    const skull = ball(0.152, skin, 0, 0.96, 1.06, 0.98); head.add(skull); // 肌のベース頭
    // 髪: 頭頂の半球キャップ + 後頭部。生え際は目の上に来るよう高めに。
    const hairMat = mat(hair, 0.82);
    const hairTop = new THREE.Mesh(new THREE.SphereGeometry(0.164, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.52), hairMat);
    hairTop.scale.set(1.02, 1.06, 1.06); hairTop.position.set(0, 0.028, -0.006); hairTop.castShadow = true; head.add(hairTop);
    const hairBack = new THREE.Mesh(new THREE.SphereGeometry(0.15, 18, 14), hairMat);
    hairBack.scale.set(0.98, 0.86, 0.72); hairBack.position.set(0, -0.005, -0.05); head.add(hairBack);
    // 耳
    for (const s of [-1, 1]) { const ear = ball(0.03, skin, 0, 0.65, 1.1, 1); ear.position.set(s * 0.15, -0.02, -0.005); head.add(ear); }
    // 目 (白目 + 虹彩) — 控えめなサイズ
    const eyeW = new THREE.MeshStandardMaterial({ color: 0xf4f0e8, roughness: 0.3 });
    const eyeM = new THREE.MeshStandardMaterial({ color: 0x2a1c14, roughness: 0.2 });
    for (const s of [-1, 1]) {
      const white = new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 10), eyeW);
      white.scale.set(1.2, 0.85, 0.5); white.position.set(s * 0.055, -0.012, 0.14); head.add(white);
      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 10), eyeM);
      iris.position.set(s * 0.058, -0.014, 0.152); head.add(iris);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.013, 0.02), hairMat);
      brow.position.set(s * 0.056, 0.035, 0.145); brow.rotation.z = s * 0.12; head.add(brow);
    }
    // 鼻・口
    const nose = ball(0.02, skin, 0, 1, 1.5, 1.3); nose.position.set(0, -0.05, 0.155); head.add(nose);
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.02), new THREE.MeshStandardMaterial({ color: 0xa85e52, roughness: 0.5 }));
    mouth.position.set(0, -0.095, 0.14); head.add(mouth);
    this.head = head;

    // --- 腕: 上腕(シャツ) + 前腕(肌) + 手 ---
    this.arms = {};
    for (const s of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(s * 0.225, 0.05, 0); this.chestG.add(shoulder);
      shoulder.add(capsule(0.06, 0.14, c, -0.1));                     // 上腕
      const elbow = new THREE.Group(); elbow.position.y = -0.23; shoulder.add(elbow);
      elbow.add(capsule(0.05, 0.13, skin, -0.1));                     // 前腕
      elbow.add(ball(0.058, skin, -0.24, 1, 1, 0.9));                 // 手
      this.arms[s] = { shoulder, elbow };
    }
    // --- 脚: 太もも(ズボン) + すね(ズボン) + 靴 ---
    this.legs = {};
    for (const s of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(s * 0.095, -0.1, 0); this.pelvis.add(hip);
      hip.add(capsule(0.088, 0.16, pants, -0.14));                    // 太もも
      const knee = new THREE.Group(); knee.position.y = -0.34; hip.add(knee);
      knee.add(capsule(0.072, 0.16, pants, -0.14));                   // すね
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.075, 0.22), mat(shoe, 0.55));
      foot.position.set(0, -0.35, 0.045); foot.castShadow = true; knee.add(foot);
      this.legs[s] = { hip, knee };
    }

    // --- 鬼のツノ (頭に2本) ---
    this.horn = new THREE.Group(); this.horn.visible = false; head.add(this.horn);
    const hornMat = new THREE.MeshStandardMaterial({ color: 0xf2e6d0, roughness: 0.5 });
    for (const s of [-1, 1]) {
      const hn = new THREE.Mesh(new THREE.ConeGeometry(0.038, 0.13, 8), hornMat);
      hn.position.set(s * 0.09, 0.17, 0.02); hn.rotation.z = s * 0.35; this.horn.add(hn);
    }
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.46, 24), new THREE.MeshBasicMaterial({ color: 0xff4444, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
    this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = 0.03; this.ring.visible = false;
    this.root.add(this.ring);

    this.ice = new THREE.Mesh(new THREE.BoxGeometry(0.82, 1.7, 0.82), new THREE.MeshStandardMaterial({ color: 0x88ccff, transparent: true, opacity: 0.42, roughness: 0.1, metalness: 0.3 }));
    this.ice.position.y = 0.82; this.ice.visible = false; this.root.add(this.ice);

    if (name) this.setName(name);

    this.phase = 0;
    this.breath = Math.random() * 6;
    this.landT = 0;
    this.smoothedSpeed = 0;
    this.wasGround = true;
    this.leanF = 0; this.leanS = 0;
    this.paints = [];
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
    this.tag.scale.set(2.4, 0.6, 1);
    this.tag.position.y = 2.4;
    this.root.add(this.tag);
  }

  setRole(role) {
    const oni = role === 'oni';
    this.horn.visible = oni;
    this.ring.visible = oni;
  }
  setFrozen(f) { this.ice.visible = f; }

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
    splat.scale.set(1, 0.85 + Math.random() * 0.4, 0.3);
    splat.position.set(
      (Math.random() - 0.5) * 0.28,
      onChest ? -0.05 + Math.random() * 0.3 : -0.05 + Math.random() * 0.12,
      front * 0.3
    );
    splat.rotation.z = Math.random() * Math.PI;
    parent.add(splat);
    this.paints.push(splat);
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
    if (st.onGround && !this.wasGround && st.velY <= 0) this.landT = 0;
    this.wasGround = st.onGround;

    const sp = st.frozen || st.jailed ? 0 : st.speed;
    this.smoothedSpeed += (sp - this.smoothedSpeed) * Math.min(1, dt * 10);
    const s = this.smoothedSpeed;
    const runK = Math.min(1, s / 5.5);
    this.phase += dt * (2.1 + s * 2.4);
    const P = this.phase;
    const A = this.arms, L = this.legs;
    const swing = Math.sin(P), swing2 = Math.sin(P * 2);

    if (st.frozen) { this.poseFrozen(); return; }
    if (st.jailed) { this.poseJailed(dt); return; }

    if (!st.onGround) {
      const up = THREE.MathUtils.clamp(st.velY / 6, -1, 1);
      this.body.position.y = 0;
      this.pelvis.rotation.set(0.05 - up * 0.06, 0, 0);
      this.spine.rotation.set(-0.05 + up * 0.05, 0, 0);
      A[-1].shoulder.rotation.set(-1.6 + up * 0.5, 0, -0.4);
      A[1].shoulder.rotation.set(-1.6 + up * 0.5, 0, 0.4);
      A[-1].elbow.rotation.x = -0.2; A[1].elbow.rotation.x = -0.2;
      this.neck.rotation.set(-0.05, 0, 0);
      // 跳躍中は脚を前後に開く
      L[-1].hip.rotation.set(-0.2 - up * 0.15, 0, 0.03); L[1].hip.rotation.set(0.35 + up * 0.1, 0, -0.03);
      L[-1].knee.rotation.x = 0.55; L[1].knee.rotation.x = 0.25;
    } else if (s > 0.25) {
      for (const side of [-1, 1]) {
        const ph = P + (side === 1 ? Math.PI : 0);
        const asw = Math.sin(ph + Math.PI);
        A[side].shoulder.rotation.x = asw * (0.35 + runK * 0.55);
        A[side].shoulder.rotation.z = side * (0.2 + runK * 0.15);
        A[side].elbow.rotation.x = -0.2 - runK * 0.3;
        // 脚は同じ側の腕と逆位相で振る + すねを曲げる
        const legPh = P + (side === 1 ? 0 : Math.PI);
        L[side].hip.rotation.x = Math.sin(legPh) * (0.5 + runK * 0.55);
        L[side].hip.rotation.z = 0;
        L[side].knee.rotation.x = 0.12 + (0.55 - 0.55 * Math.cos(legPh)) * (0.5 + runK * 0.6);
      }
      this.body.position.y = Math.abs(swing2) * (0.05 + runK * 0.09);
      this.pelvis.rotation.z = swing * (0.1 + runK * 0.12);
      this.pelvis.rotation.y = swing * (0.06 + runK * 0.08);
      this.pelvis.rotation.x = 0.05 + runK * 0.16;
      this.spine.rotation.y = -swing * (0.06 + runK * 0.1);
      this.spine.rotation.z = -swing * 0.05;
      this.spine.rotation.x = runK * 0.1;
      this.neck.rotation.x = -0.04 - runK * 0.06;
      this.neck.rotation.z = swing * 0.1;
    } else {
      const br = Math.sin(this.breath * 1.9);
      this.body.position.y = br * 0.02;
      this.pelvis.rotation.set(0.02, 0, Math.sin(this.breath * 0.7) * 0.03);
      this.spine.rotation.set(br * 0.03, 0, 0);
      this.chestG.rotation.set(br * 0.02, 0, 0);
      this.neck.rotation.set(br * 0.02, Math.sin(this.breath * 0.35) * 0.35, Math.sin(this.breath * 0.9) * 0.05);
      for (const side of [-1, 1]) {
        A[side].shoulder.rotation.set(br * 0.04, 0, side * (0.16 + br * 0.03));
        A[side].elbow.rotation.x = -0.12 + br * 0.02;
        // 直立: 脚はまっすぐ、わずかに体重移動
        L[side].hip.rotation.set(Math.sin(this.breath * 0.7 + side) * 0.015, 0, side * 0.02);
        L[side].knee.rotation.x = 0.04;
      }
    }

    if (this.landT < 0.28 && st.onGround) {
      const t = this.landT / 0.28;
      const dip = Math.sin((1 - t) * Math.PI * 0.5) * 0.14;
      this.body.position.y -= dip;
      this.body.scale.set(1 + dip * 0.9, 1 - dip * 1.1, 1 + dip * 0.9);
      this.spine.rotation.x += dip * 0.6;
    } else {
      this.body.scale.set(1, 1, 1);
    }

    this.chestG.rotation.y *= 1 - Math.min(1, st.dt * 8);

    if (this.ring.visible) {
      const k = 1 + Math.sin(this.breath * 4) * 0.1;
      this.ring.scale.set(k, k, 1);
    }
  }

  poseFrozen() {
    const A = this.arms, L = this.legs;
    this.body.position.y = -0.02; this.body.scale.set(1, 1, 1);
    this.pelvis.rotation.set(0.05, 0, 0);
    this.spine.rotation.set(0.06, 0, 0);
    this.neck.rotation.set(0.1, 0, 0);
    A[-1].shoulder.rotation.set(-0.4, 0, -0.6); A[1].shoulder.rotation.set(-0.4, 0, 0.6);
    A[-1].elbow.rotation.x = -0.6; A[1].elbow.rotation.x = -0.6;
    for (const side of [-1, 1]) { L[side].hip.rotation.set(0, 0, side * 0.05); L[side].knee.rotation.x = 0.05; }
  }

  poseJailed(dt) {
    const br = Math.sin(this.breath * 1.4);
    this.body.position.y = -0.04 + br * 0.01; this.body.scale.set(1, 1, 1);
    this.pelvis.rotation.set(0.12, 0, 0);
    this.spine.rotation.set(0.14, 0, 0);
    this.neck.rotation.set(0.4, br * 0.06, 0);
    const A = this.arms, L = this.legs;
    A[-1].shoulder.rotation.set(-0.2, 0, -0.35); A[1].shoulder.rotation.set(-0.2, 0, 0.35);
    A[-1].elbow.rotation.x = -0.4; A[1].elbow.rotation.x = -0.4;
    for (const side of [-1, 1]) { L[side].hip.rotation.set(0.05, 0, side * 0.04); L[side].knee.rotation.x = 0.08; }
  }

  dispose() {
    this.root.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.map?.dispose(); m.dispose(); }); }
    });
  }
}
