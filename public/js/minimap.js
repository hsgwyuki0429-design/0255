import { MAPS } from '/shared/mapdata.js';

export class Minimap {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.map = null;
  }

  setMap(mapId) {
    this.map = MAPS[mapId];
    const b = this.map.bounds;
    const w = b.maxX - b.minX, d = b.maxZ - b.minZ;
    this.scale = Math.min((this.cv.width - 20) / w, (this.cv.height - 20) / d);
    this.ox = this.cv.width / 2 - (b.minX + w / 2) * this.scale;
    this.oz = this.cv.height / 2 - (b.minZ + d / 2) * this.scale;
  }

  draw(px, py, pz, ry) {
    if (!this.map) return;
    const ctx = this.ctx, s = this.scale;
    ctx.clearRect(0, 0, this.cv.width, this.cv.height);
    ctx.fillStyle = '#0a0f1a88';
    ctx.fillRect(0, 0, this.cv.width, this.cv.height);
    ctx.fillStyle = '#8899bb55';
    for (const b of this.map.boxes) {
      if (b.deco) continue;
      if (b.h < 0.8) continue;
      if (b.y > py + 2.0 || b.y + b.h < py + 0.4) continue;
      ctx.fillRect(this.ox + (b.x - b.w / 2) * s, this.oz + (b.z - b.d / 2) * s, Math.max(1, b.w * s), Math.max(1, b.d * s));
    }
    const j = this.map.jail;
    ctx.strokeStyle = '#ffcc44';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(this.ox + (j.x - j.w / 2) * s, this.oz + (j.z - j.d / 2) * s, j.w * s, j.d * s);
    ctx.fillStyle = '#ffcc44';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('牢', this.ox + j.x * s, this.oz + j.z * s + 3);
    const mx = this.ox + px * s, mz = this.oz + pz * s;
    ctx.save();
    ctx.translate(mx, mz);
    ctx.rotate(Math.PI - ry);
    ctx.fillStyle = '#44ff88';
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#ffffff22';
    ctx.strokeRect(1, 1, this.cv.width - 2, this.cv.height - 2);
  }
}
