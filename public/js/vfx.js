// 視覚エフェクト: パーティクルプール + 弾道トレーサー + ヒットリング
import * as THREE from 'three';

const MAX = 240;

export class VFX {
  constructor(scene) {
    this.scene = scene;
    this.parts = [];
    const geo = new THREE.BufferGeometry();
    this.positions = new Float32Array(MAX * 3);
    this.colors = new Float32Array(MAX * 3);
    this.sizes = new Float32Array(MAX);
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    const mat = new THREE.PointsMaterial({ size: 0.16, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    for (let i = 0; i < MAX; i++) this.parts.push({ life: 0, ttl: 1, p: new THREE.Vector3(), v: new THREE.Vector3(), c: new THREE.Color(), grav: 0 });
    this.tracers = [];
    this.rings = [];
    this.bullets = [];
    // 弾のジオメトリ/マテリアルは共有
    this.bulletGeo = new THREE.SphereGeometry(0.07, 8, 8);
  }

  spawn(pos, color, n, speed, ttl = 0.6, grav = -4, spread = 1) {
    let made = 0;
    for (const pt of this.parts) {
      if (pt.life > 0) continue;
      pt.life = ttl; pt.ttl = ttl;
      pt.p.copy(pos);
      pt.v.set((Math.random() - 0.5) * spread, Math.random() * 0.9 + 0.15, (Math.random() - 0.5) * spread).normalize().multiplyScalar(speed * (0.5 + Math.random() * 0.7));
      pt.c.set(color);
      pt.grav = grav;
      if (++made >= n) break;
    }
  }

  burst(pos, color, n = 18, speed = 4) { this.spawn(pos, color, n, speed, 0.55, -6, 2); }
  dust(pos) { this.spawn(pos, 0xccbbaa, 5, 1.2, 0.4, 1.5, 2.5); }
  sparkle(pos, color = 0x88ffcc) { this.spawn(pos, color, 22, 2.4, 0.9, 1.2, 2); }

  // 短射程の弾道 (発射点→方向, 1m級)
  tracer(origin, dir, color = 0xffcc44, range = 1.9) {
    const from = new THREE.Vector3(...origin);
    const to = from.clone().addScaledVector(new THREE.Vector3(...dir), range);
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1 });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.tracers.push({ line, life: 0.16 });
    // マズルフラッシュ
    this.spawn(from, color, 6, 1.5, 0.15, 0, 2.5);
  }

  // 飛翔するペイント弾: 光る球が射線に沿って飛ぶ
  bullet(origin, dir, color = 0xffee55, range = 1.9) {
    const speed = 13;
    const mesh = new THREE.Mesh(this.bulletGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 }));
    mesh.position.set(...origin);
    this.scene.add(mesh);
    this.bullets.push({
      mesh,
      v: new THREE.Vector3(...dir).multiplyScalar(speed),
      life: range / speed, ttl: range / speed, color
    });
  }

  // ペイントが弾ける飛沫
  paintBurst(pos, color) { this.spawn(pos, color, 26, 3.2, 0.65, -5, 2.2); }

  // 捕獲/救出のリング波
  ring(pos, color = 0xff4444) {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 0.34, 28),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(pos).y += 0.1;
    this.scene.add(mesh);
    this.rings.push({ mesh, life: 0.6, ttl: 0.6 });
  }

  update(dt) {
    let i = 0;
    for (const pt of this.parts) {
      if (pt.life > 0) {
        pt.life -= dt;
        pt.v.y += pt.grav * dt;
        pt.p.addScaledVector(pt.v, dt);
        const a = Math.max(0, pt.life / pt.ttl);
        this.positions[i * 3] = pt.p.x; this.positions[i * 3 + 1] = pt.p.y; this.positions[i * 3 + 2] = pt.p.z;
        this.colors[i * 3] = pt.c.r * a; this.colors[i * 3 + 1] = pt.c.g * a; this.colors[i * 3 + 2] = pt.c.b * a;
      } else {
        this.positions[i * 3 + 1] = -999;
      }
      i++;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;

    for (let j = this.bullets.length - 1; j >= 0; j--) {
      const b = this.bullets[j];
      b.life -= dt;
      b.mesh.position.addScaledVector(b.v, dt);
      if (b.life <= 0) {
        // 射程の終端で小さくインクが散る
        this.spawn(b.mesh.position, b.color, 6, 1.8, 0.3, -4, 2);
        this.scene.remove(b.mesh); b.mesh.material.dispose();
        this.bullets.splice(j, 1);
      }
    }
    for (let j = this.tracers.length - 1; j >= 0; j--) {
      const t = this.tracers[j];
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.16);
      if (t.life <= 0) { this.scene.remove(t.line); t.line.geometry.dispose(); t.line.material.dispose(); this.tracers.splice(j, 1); }
    }
    for (let j = this.rings.length - 1; j >= 0; j--) {
      const r = this.rings[j];
      r.life -= dt;
      const k = 1 + (1 - r.life / r.ttl) * 5;
      r.mesh.scale.set(k, k, 1);
      r.mesh.material.opacity = Math.max(0, r.life / r.ttl);
      if (r.life <= 0) { this.scene.remove(r.mesh); r.mesh.geometry.dispose(); r.mesh.material.dispose(); this.rings.splice(j, 1); }
    }
  }
}
