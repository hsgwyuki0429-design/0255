// レート計算: 全員の増減の和が必ずゼロになるゼロサム方式
// score = そのゲームでの活躍度 (勝敗 + 捕獲/救出/凍結解除など)
// delta_i = K * (score_i - 平均score) を整数化し、端数調整で合計を厳密に0へ

const K = 9;
const CLAMP = 60;

export function computeDeltas(entries) {
  // entries: [{id, score, rating}]
  if (entries.length < 2) return entries.map(e => ({ id: e.id, delta: 0 }));
  const avg = entries.reduce((s, e) => s + e.score, 0) / entries.length;
  // レート差補正: 高レートは同じ活躍でも増えにくく、負けると減りやすい
  const avgRating = entries.reduce((s, e) => s + e.rating, 0) / entries.length;
  const raw = entries.map(e => {
    const base = K * (e.score - avg);
    const bias = (avgRating - e.rating) / 400; // -1〜+1程度
    const v = base * (1 + 0.25 * Math.sign(base) * bias);
    return Math.max(-CLAMP, Math.min(CLAMP, v));
  });
  // ゼロサム化: 平均を引いてから丸め、丸め誤差を大きい順に配って合計0に
  const mean = raw.reduce((s, v) => s + v, 0) / raw.length;
  const centered = raw.map(v => v - mean);
  const deltas = centered.map(v => Math.round(v));
  let rem = deltas.reduce((s, v) => s + v, 0);
  const order = centered.map((v, i) => i).sort((a, b) => Math.abs(centered[b]) - Math.abs(centered[a]));
  let idx = 0;
  while (rem !== 0 && order.length) {
    const i = order[idx % order.length];
    deltas[i] -= Math.sign(rem);
    rem -= Math.sign(rem);
    idx++;
  }
  return entries.map((e, i) => ({ id: e.id, delta: deltas[i] }));
}

// CPU戦専用レート: CPUの強さは常に自分のCPUレートに追従するので
// 期待勝率≈50%とみなし、勝敗ベース + 活躍ボーナスで増減する。
// perf = タッチ*1.5 + 救出*2 - つかまり回数
export function computeCpuDelta(cpuRating, win, perf) {
  const p = Math.max(-4, Math.min(6, Math.round(perf)));
  let d = win ? 16 + Math.max(0, p) : -13 + Math.min(0, p);
  return Math.max(-25, Math.min(28, d));
}
