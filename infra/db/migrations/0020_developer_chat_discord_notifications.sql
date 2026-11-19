create table if not exists developer_chat_discord_notifications (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null unique references developer_chat_messages(id) on delete cascade,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  locked_until timestamptz,
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create index if not exists developer_chat_discord_notifications_pending_idx
  on developer_chat_discord_notifications(next_attempt_at)
  where delivered_at is null;
