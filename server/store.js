import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, '..', 'data', 'ratings.json');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '';

let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  console.log('[store] Supabase 連携: 有効');
} else {
  console.log('[store] Supabase 未設定 → ローカルファイル (data/ratings.json) を使用');
}

function loadFile() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return {}; }
}
function saveFile(db) {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(db, null, 1));
  } catch (e) { console.error('[store] file save error', e.message); }
}

export async function getPlayer(deviceId, name) {
  if (supabase) {
    try {
      const { data } = await supabase.from('players').select('*').eq('device_id', deviceId).maybeSingle();
      if (data) {
        if (name && data.name !== name) await supabase.from('players').update({ name }).eq('device_id', deviceId);
        return { rating: data.rating, cpuRating: data.cpu_rating ?? 1000, games: data.games, wins: data.wins };
      }
      await supabase.from('players').insert({ device_id: deviceId, name: name || 'プレイヤー', rating: 1000, cpu_rating: 1000, games: 0, wins: 0 });
      return { rating: 1000, cpuRating: 1000, games: 0, wins: 0 };
    } catch (e) {
      console.error('[store] supabase getPlayer error:', e.message);
      return { rating: 1000, cpuRating: 1000, games: 0, wins: 0 };
    }
  }
  const db = loadFile();
  if (!db[deviceId]) { db[deviceId] = { name, rating: 1000, cpuRating: 1000, games: 0, wins: 0 }; saveFile(db); }
  return { rating: db[deviceId].rating, cpuRating: db[deviceId].cpuRating ?? 1000, games: db[deviceId].games, wins: db[deviceId].wins };
}

export async function saveCpuResult(deviceId, name, cpuRating) {
  if (!deviceId) return;
  if (supabase) {
    try {
      await supabase.from('players').upsert({
        device_id: deviceId, name, cpu_rating: cpuRating, updated_at: new Date().toISOString()
      }, { onConflict: 'device_id' });
      return;
    } catch (e) { console.error('[store] supabase saveCpuResult error:', e.message); }
  }
  const db = loadFile();
  const p = db[deviceId] || { name, rating: 1000, games: 0, wins: 0 };
  p.name = name; p.cpuRating = cpuRating;
  db[deviceId] = p;
  saveFile(db);
}

export async function saveResults(results) {
  if (supabase) {
    try {
      for (const r of results) {
        const { data } = await supabase.from('players').select('games,wins').eq('device_id', r.deviceId).maybeSingle();
        await supabase.from('players').upsert({
          device_id: r.deviceId, name: r.name, rating: r.rating,
          games: (data?.games || 0) + 1, wins: (data?.wins || 0) + (r.win ? 1 : 0),
          updated_at: new Date().toISOString()
        }, { onConflict: 'device_id' });
      }
      return;
    } catch (e) { console.error('[store] supabase saveResults error:', e.message); }
  }
  const db = loadFile();
  for (const r of results) {
    const p = db[r.deviceId] || { rating: 1000, games: 0, wins: 0 };
    p.name = r.name; p.rating = r.rating; p.games = (p.games || 0) + 1; p.wins = (p.wins || 0) + (r.win ? 1 : 0);
    db[r.deviceId] = p;
  }
  saveFile(db);
}

export async function topPlayers(limit = 10) {
  if (supabase) {
    try {
      const { data } = await supabase.from('players').select('name,rating,games,wins').order('rating', { ascending: false }).limit(limit);
      return data || [];
    } catch { return []; }
  }
  const db = loadFile();
  return Object.values(db).sort((a, b) => b.rating - a.rating).slice(0, limit)
    .map(p => ({ name: p.name, rating: p.rating, games: p.games, wins: p.wins }));
}
