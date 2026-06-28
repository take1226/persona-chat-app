-- ペルソナ（演じる人物）
create table personas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  profile jsonb default '{}',
  system_prompt text,
  raw_analysis jsonb default '{}',
  avatar_url text,
  -- 自発メッセージ設定
  auto_message_enabled boolean default true,
  auto_message_interval_min int default 5,   -- 最小インターバル（分）
  auto_message_interval_max int default 30,  -- 最大インターバル（分）
  last_auto_message_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 画像プール
create table persona_images (
  id uuid primary key default gen_random_uuid(),
  persona_id uuid references personas(id) on delete cascade,
  storage_path text not null,
  public_url text not null,
  category text,
  description text,
  tags text[] default '{}',
  send_count int default 0,
  created_at timestamptz default now()
);

-- チャット会話履歴
create table messages (
  id uuid primary key default gen_random_uuid(),
  persona_id uuid references personas(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text,
  image_id uuid references persona_images(id),
  message_type text default 'text' check (message_type in ('text', 'image', 'read_receipt')),
  is_auto_message boolean default false,  -- 自発メッセージかどうか
  created_at timestamptz default now()
);

-- アップロード元データ
create table upload_sources (
  id uuid primary key default gen_random_uuid(),
  persona_id uuid references personas(id) on delete cascade,
  source_type text not null check (source_type in ('text', 'screenshot', 'image')),
  storage_path text,
  raw_text text,
  ocr_confidence float,
  processed bool default false,
  created_at timestamptz default now()
);

-- Web Push サブスクリプション（iPhoneの通知センター向け）
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS有効化（プライベート利用のため、ポリシーは全許可で設定）
alter table personas enable row level security;
alter table persona_images enable row level security;
alter table messages enable row level security;
alter table upload_sources enable row level security;
alter table push_subscriptions enable row level security;

-- 全許可ポリシー（プライベート利用前提）
create policy "allow_all_personas" on personas for all using (true) with check (true);
create policy "allow_all_persona_images" on persona_images for all using (true) with check (true);
create policy "allow_all_messages" on messages for all using (true) with check (true);
create policy "allow_all_upload_sources" on upload_sources for all using (true) with check (true);
create policy "allow_all_push_subscriptions" on push_subscriptions for all using (true) with check (true);
