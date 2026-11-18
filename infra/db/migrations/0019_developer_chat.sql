create table if not exists developer_chat_threads (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null unique references campaigns(id) on delete cascade,
  user_last_read_at timestamptz,
  developer_last_read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists developer_chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references developer_chat_threads(id) on delete cascade,
  author_user_id uuid references users(id) on delete set null,
  author_player_id uuid references players(id) on delete set null,
  sender_role text not null check (sender_role in ('user', 'developer')),
  body text not null check (length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists developer_chat_messages_thread_created_idx
  on developer_chat_messages(thread_id, created_at);
create index if not exists developer_chat_threads_updated_idx
  on developer_chat_threads(updated_at desc);

drop trigger if exists developer_chat_threads_set_updated_at on developer_chat_threads;
create trigger developer_chat_threads_set_updated_at
before update on developer_chat_threads
for each row execute function set_updated_at();
