-- ============================================================
-- ONI RUSH - Supabase スキーマ
-- SQL Editor に貼り付けて実行してください
-- ============================================================

create table if not exists public.players (
  id         uuid primary key default gen_random_uuid(),
  device_id  text unique not null,           -- 端末ごとの匿名ID (クライアントが生成)
  name       text not null default 'プレイヤー',
  rating     integer not null default 1000,  -- 初期レート1000
  games      integer not null default 0,
  wins       integer not null default 0,
  updated_at timestamptz not null default now()
);

-- ランキング用インデックス
create index if not exists players_rating_idx on public.players (rating desc);

-- RLS: 書き込みはサーバー(service_role キー)のみ。
-- クライアントは Supabase に直接アクセスしないため、公開ポリシーは作らない。
alter table public.players enable row level security;
