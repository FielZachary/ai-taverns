alter table users add column if not exists subscription_tier_id integer;
update users set subscription_tier_id = 4 where subscription_tier_id is null;
alter table users alter column subscription_tier_id set not null;
alter table users drop constraint if exists users_subscription_tier_id_check;
alter table users add constraint users_subscription_tier_id_check check (subscription_tier_id > 0);

create table if not exists user_usage_counters (
  user_id uuid not null references users(id) on delete cascade, resource_type text not null, period_start date not null,
  used integer not null default 0, updated_at timestamptz not null default now(), primary key (user_id, resource_type, period_start),
  constraint user_usage_counters_resource_type_check check (resource_type in ('dm_turn', 'campaign_creation')),
  constraint user_usage_counters_used_check check (used >= 0)
);
create table if not exists user_usage_events (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references users(id) on delete cascade,
  resource_type text not null, period_start date not null, amount integer not null default 1, idempotency_key text, source_id text,
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
  constraint user_usage_events_resource_type_check check (resource_type in ('dm_turn', 'campaign_creation', 'image_generation')),
  constraint user_usage_events_amount_check check (amount > 0)
);
create index if not exists user_usage_events_user_resource_period_idx on user_usage_events(user_id, resource_type, period_start);
create unique index if not exists user_usage_events_idempotency_key_idx on user_usage_events(user_id, resource_type, period_start, idempotency_key) where idempotency_key is not null;
create index if not exists media_assets_owner_kind_period_idx on media_assets(owner_user_id, kind, created_at desc) where status in ('pending', 'ready', 'deleted');
alter table user_usage_counters enable row level security; alter table user_usage_events enable row level security;
revoke all on user_usage_counters, user_usage_events from anon, authenticated;
