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
    this.rings = [];
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

  paintBurst(pos, color) { this.spawn(pos, color, 26, 3.2, 0.65, -5, 2.2); }

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
