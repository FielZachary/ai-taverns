alter table users
  add column if not exists subscription_tier text not null default 'free';

alter table users
  drop constraint if exists users_subscription_tier_check;

alter table users
  add constraint users_subscription_tier_check check (
    subscription_tier in ('free', 'premium', 'prestige')
  );

create table if not exists account_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  resource text not null,
  amount int not null default 1,
  period_start timestamptz not null,
  period_end timestamptz not null,
  idempotency_key text not null,
  status text not null default 'pending',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_usage_events_resource_check check (
    resource in ('dm_turn', 'image_generation', 'campaign_creation')
  ),
  constraint account_usage_events_status_check check (
    status in ('pending', 'committed', 'failed')
  ),
  constraint account_usage_events_amount_check check (amount > 0),
  constraint account_usage_events_period_check check (period_end > period_start),
  constraint account_usage_events_idempotency_unique unique (
    user_id,
    resource,
    idempotency_key
  )
);

create index if not exists account_usage_events_user_period_resource_idx
  on account_usage_events(user_id, period_start, resource)
  where status in ('pending', 'committed');

drop trigger if exists account_usage_events_set_updated_at on account_usage_events;
create trigger account_usage_events_set_updated_at
before update on account_usage_events
for each row execute function set_updated_at();
