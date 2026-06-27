create table if not exists campaign_join_codes (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  code text not null unique,
  enabled boolean not null default true,
  created_by_user_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  disabled_at timestamptz,
  constraint campaign_join_codes_code_format_check check (code ~ '^[A-Z0-9]{6}$')
);

create unique index if not exists campaign_join_codes_one_enabled_per_campaign
  on campaign_join_codes(campaign_id)
  where enabled;

create index if not exists campaign_join_codes_campaign_enabled_idx
  on campaign_join_codes(campaign_id, enabled);

create index if not exists campaign_join_codes_code_enabled_idx
  on campaign_join_codes(code, enabled);
