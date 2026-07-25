create extension if not exists pgcrypto;

create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  session_id text unique not null,
  title text not null,
  mode text not null default 'multiplayer',
  status text not null default 'active',
  has_begun boolean not null default false,
  owner_client_id text,
  metadata jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaigns_status_check check (status in ('active', 'archived', 'deleted')),
  constraint campaigns_mode_check check (mode in ('single_player', 'multiplayer'))
);

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  client_id text not null,
  username text not null default '',
  character_name text not null default '',
  character_sheet text not null default '',
  slot int,
  status text not null default 'active',
  last_seen_at timestamptz not null default now(),
  kicked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(campaign_id, client_id),
  constraint players_status_check check (status in ('active', 'left', 'kicked')),
  constraint players_slot_check check (slot is null or (slot >= 0 and slot < 4))
);

create table if not exists turns (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  status text not null default 'collecting',
  model_message_id text,
  error text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint turns_status_check check (status in ('collecting', 'resolving', 'resolved', 'failed', 'cancelled'))
);

create table if not exists submissions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  turn_id uuid not null references turns(id) on delete cascade,
  player_id uuid references players(id) on delete set null,
  content text not null,
  status text not null default 'submitted',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(turn_id, player_id),
  constraint submissions_status_check check (status in ('submitted', 'included_in_turn', 'cancelled', 'superseded'))
);

create table if not exists campaign_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists turns_one_collecting_per_campaign
  on turns(campaign_id)
  where status = 'collecting';

create unique index if not exists turns_one_resolving_per_campaign
  on turns(campaign_id)
  where status = 'resolving';

create index if not exists players_campaign_slot_idx
  on players(campaign_id, slot)
  where status <> 'kicked';

create index if not exists submissions_turn_idx
  on submissions(turn_id, created_at);

create index if not exists campaign_events_campaign_created_idx
  on campaign_events(campaign_id, created_at);

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists campaigns_set_updated_at on campaigns;
create trigger campaigns_set_updated_at
before update on campaigns
for each row execute function set_updated_at();

drop trigger if exists players_set_updated_at on players;
create trigger players_set_updated_at
before update on players
for each row execute function set_updated_at();

drop trigger if exists turns_set_updated_at on turns;
create trigger turns_set_updated_at
before update on turns
for each row execute function set_updated_at();

drop trigger if exists submissions_set_updated_at on submissions;
create trigger submissions_set_updated_at
before update on submissions
for each row execute function set_updated_at();
