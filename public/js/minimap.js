// ミニマップ (画面右側): マップの壁と牢屋 + 自分の位置・向きだけを表示
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

  // px,pz,py = 自分の位置 / ry = 向き
  draw(px, py, pz, ry) {
    if (!this.map) return;
    const ctx = this.ctx, s = this.scale;
    ctx.clearRect(0, 0, this.cv.width, this.cv.height);
    ctx.fillStyle = '#0a0f1add';
    ctx.fillRect(0, 0, this.cv.width, this.cv.height);
    // 自分がいる高さ周辺の壁だけ描く (今いるフロアの間取りが見える)
    ctx.fillStyle = '#8899bb55';
    for (const b of this.map.boxes) {
      if (b.deco) continue;
      if (b.h < 0.8) continue;                            // 低い家具は省く
      if (b.y > py + 2.0 || b.y + b.h < py + 0.4) continue; // フロア外
      ctx.fillRect(this.ox + (b.x - b.w / 2) * s, this.oz + (b.z - b.d / 2) * s, Math.max(1, b.w * s), Math.max(1, b.d * s));
    }
    // 牢屋
    const j = this.map.jail;
    ctx.strokeStyle = '#ffcc44';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(this.ox + (j.x - j.w / 2) * s, this.oz + (j.z - j.d / 2) * s, j.w * s, j.d * s);
    ctx.fillStyle = '#ffcc44';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('牢', this.ox + j.x * s, this.oz + j.z * s + 3);
    // 自分 (矢印)
    const mx = this.ox + px * s, mz = this.oz + pz * s;
    ctx.save();
    ctx.translate(mx, mz);
    ctx.rotate(Math.PI - ry); // モデルはry=0で+Z向き / キャンバスは上=-Z
    ctx.fillStyle = '#44ff88';
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // 外枠
    ctx.strokeStyle = '#ffffff22';
    ctx.strokeRect(1, 1, this.cv.width - 2, this.cv.height - 2);
  }
}
