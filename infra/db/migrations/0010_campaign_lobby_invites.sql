create table if not exists campaign_invites (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  token_hash text not null unique,
  enabled boolean not null default true,
  max_uses integer,
  use_count integer not null default 0,
  expires_at timestamptz,
  created_by_user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  disabled_at timestamptz,
  disabled_by_user_id uuid references users(id) on delete set null,
  constraint campaign_invites_max_uses_check check (max_uses is null or max_uses > 0),
  constraint campaign_invites_use_count_check check (use_count >= 0)
);

create index if not exists campaign_invites_campaign_enabled_idx
  on campaign_invites(campaign_id, enabled);

create index if not exists campaign_invites_token_enabled_idx
  on campaign_invites(token_hash, enabled);

create table if not exists campaign_invite_uses (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references campaign_invites(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  joined_user_id uuid not null references users(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  used_at timestamptz not null default now()
);

create index if not exists campaign_invite_uses_invite_idx
  on campaign_invite_uses(invite_id, used_at desc);
