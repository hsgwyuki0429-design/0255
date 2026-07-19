export class Input {
  constructor() {
    this.move = { x: 0, y: 0 };     // -1..1
    this.jumpQueued = false;
    this.lookDX = 0; this.lookDY = 0;
    this.isTouch = 'ontouchstart' in window;
    this.keys = {};
    this.stickId = null;
    this.lookId = null;
    this.stickOrigin = { x: 0, y: 0 };
    this.lookLast = { x: 0, y: 0 };
    this.lookMoved = 0;
    this.lookStart = 0;
    this.lastLookT = 0;
    this.sprintTouch = false;
    this.enabled = false;
    // ジャイロ (端末の傾きで視点移動)
    this.gyro = false;
    this.gyroSens = 1;
    this._gyroLast = null;
  }

  // iOS 13+ は明示的な許可リクエスト (ユーザー操作起点) が必要
  async enableGyro() {
    const DOE = window.DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === 'function') {
      try {
        const res = await DOE.requestPermission();
        if (res !== 'granted') return false;
      } catch { return false; }
    } else if (!DOE) {
      return false; // 非対応端末
    }
    this._gyroLast = null;
    this.gyro = true;
    return true;
  }
  disableGyro() { this.gyro = false; this._gyroLast = null; }

  attach() {
    const stickZone = document.getElementById('stick-zone');
    const rightZone = document.getElementById('right-zone');
    const base = document.getElementById('stick-base');
    const knob = document.getElementById('stick-knob');

    stickZone.addEventListener('touchstart', e => {
      if (!this.enabled) return;
      e.preventDefault();
      const t = e.changedTouches[0];
      if (this.stickId !== null) return;
      this.stickId = t.identifier;
      this.stickOrigin = { x: t.clientX, y: t.clientY };
      base.classList.remove('hidden');
      base.style.left = t.clientX + 'px';
      base.style.top = t.clientY + 'px';
      knob.style.transform = 'translate(-50%,-50%)';
    }, { passive: false });
    stickZone.addEventListener('touchmove', e => {
      if (!this.enabled) return;
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier !== this.stickId) continue;
        const dx = t.clientX - this.stickOrigin.x, dy = t.clientY - this.stickOrigin.y;
        // 縦長カプセル型スティック: 横26px / 縦52px の楕円にクランプ
        const RX = 26, RY = 52;
        let nx = dx / RX, ny = dy / RY;
        const l = Math.hypot(nx, ny);
        if (l > 1) { nx /= l; ny /= l; }
        // 前進バイアス: 前方±120°の入力を±42°へ圧縮し、真横に倒してもほぼ前進にする。
        // 残りの後方60°は後退(180°)まで連続に引き伸ばす
        const mag = Math.min(1, Math.hypot(nx, ny));
        let a = Math.atan2(nx, -ny);
        const FZ = 2.1, K = 0.35;
        if (Math.abs(a) <= FZ) a *= K;
        else a = Math.sign(a) * (FZ * K + (Math.abs(a) - FZ) * (Math.PI - FZ * K) / (Math.PI - FZ));
        this.move.x = Math.sin(a) * mag;
        this.move.y = -Math.cos(a) * mag;
        knob.style.transform = `translate(calc(-50% + ${nx * RX}px), calc(-50% + ${ny * RY}px))`;
      }
    }, { passive: false });
    const stickEnd = e => {
      for (const t of e.changedTouches) {
        if (t.identifier !== this.stickId) continue;
        this.stickId = null;
        this.move.x = 0; this.move.y = 0;
        base.classList.add('hidden');
      }
    };
    stickZone.addEventListener('touchend', stickEnd);
    stickZone.addEventListener('touchcancel', stickEnd);

    rightZone.addEventListener('touchstart', e => {
      if (!this.enabled) return;
      e.preventDefault();
      const t = e.changedTouches[0];
      if (this.lookId !== null) return;
      this.lookId = t.identifier;
      this.lookLast = { x: t.clientX, y: t.clientY };
      this.lookMoved = 0;
      this.lookStart = performance.now();
    }, { passive: false });
    rightZone.addEventListener('touchmove', e => {
      if (!this.enabled) return;
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier !== this.lookId) continue;
        const dx = t.clientX - this.lookLast.x, dy = t.clientY - this.lookLast.y;
        this.lookMoved += Math.abs(dx) + Math.abs(dy);
        this.lookDX += dx; this.lookDY += dy;
        if (Math.abs(dx) + Math.abs(dy) > 1) this.lastLookT = performance.now();
        this.lookLast = { x: t.clientX, y: t.clientY };
      }
    }, { passive: false });
    const lookEnd = e => {
      for (const t of e.changedTouches) {
        if (t.identifier !== this.lookId) continue;
        if (this.lookMoved < 14 && performance.now() - this.lookStart < 260) this.jumpQueued = true;
        this.lookId = null;
      }
    };
    rightZone.addEventListener('touchend', lookEnd);
    rightZone.addEventListener('touchcancel', lookEnd);

    const dashBtn = document.getElementById('btn-dash');
    if (dashBtn) {
      dashBtn.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); this.sprintTouch = true; }, { passive: false });
      const dashEnd = e => { e.preventDefault(); this.sprintTouch = false; };
      dashBtn.addEventListener('touchend', dashEnd, { passive: false });
      dashBtn.addEventListener('touchcancel', dashEnd, { passive: false });
      dashBtn.addEventListener('mousedown', e => { e.stopPropagation(); this.sprintTouch = true; });
      window.addEventListener('mouseup', () => { this.sprintTouch = false; });
    }

    window.addEventListener('keydown', e => {
      this.keys[e.code] = true;
      if (e.code === 'Space' && this.enabled) { this.jumpQueued = true; e.preventDefault(); }
    });
    window.addEventListener('keyup', e => { this.keys[e.code] = false; });
    let mouseDown = false, lastM = null;
    window.addEventListener('mousedown', e => {
      if (!this.enabled || this.isTouch) return;
      if (e.target.closest('button')) return;
      mouseDown = true; lastM = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('mousemove', e => {
      if (!mouseDown || !this.enabled) return;
      const dx = e.clientX - lastM.x, dy = e.clientY - lastM.y;
      this.lookDX += dx;
      this.lookDY += dy;
      if (Math.abs(dx) + Math.abs(dy) > 1) this.lastLookT = performance.now();
      lastM = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('mouseup', () => { mouseDown = false; });

    // ジャイロ: 端末の向きの変化量(相対デルタ)を視点入力に加算する。
    // alpha(鉛直軸まわり)→ヨー / beta(前後傾き)→ピッチ。縦持ち前提。
    window.addEventListener('deviceorientation', e => {
      if (!this.gyro || !this.enabled || e.alpha == null) return;
      const cur = { a: e.alpha, b: e.beta };
      // 右半画面を押している間だけ視点に反映する。離している間も基準値は
      // 更新し続け、押し直した瞬間に視点が飛ばないようにする
      if (this.lookId === null) { this._gyroLast = cur; return; }
      if (this._gyroLast) {
        let da = cur.a - this._gyroLast.a;
        if (da > 180) da -= 360; else if (da < -180) da += 360;
        let db = cur.b - this._gyroLast.b;
        if (db > 180) db -= 360; else if (db < -180) db += 360;
        // 1度あたりの視点移動量(タッチのlookピクセル換算)。ほぼ等倍を基準に感度で調整
        const K = 4.2 * this.gyroSens;
        this.lookDX += -da * K;   // 端末を右へ回す→視点右
        this.lookDY += -db * K;   // 端末を前へ倒す→視点下
        if (Math.abs(da) + Math.abs(db) > 0.15) this.lastLookT = performance.now();
      }
      this._gyroLast = cur;
    });
  }

  getMove() {
    let x = this.move.x, y = this.move.y;
    if (this.keys['KeyW'] || this.keys['ArrowUp']) y -= 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) y += 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) x -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) x += 1;
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }

  consumeLook() {
    const r = { dx: this.lookDX, dy: this.lookDY };
    this.lookDX = 0; this.lookDY = 0;
    return r;
  }
  consumeJump() { const j = this.jumpQueued; this.jumpQueued = false; return j; }
  getSprint() { return !!(this.sprintTouch || this.keys['ShiftLeft'] || this.keys['ShiftRight']); }
}
