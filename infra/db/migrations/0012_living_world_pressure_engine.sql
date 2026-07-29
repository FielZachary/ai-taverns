create table if not exists campaign_dm_guidance (
  campaign_id uuid primary key references campaigns(id) on delete cascade,
  trace_id text,
  covered_message_count int not null default 0,
  guidance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists living_world_engine_runs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  trace_id text not null,
  turn_id uuid references turns(id) on delete set null,
  covered_message_count int not null,
  provider text,
  model text,
  raw_response text,
  accepted_patch_count int not null default 0,
  discarded_patch_count int not null default 0,
  guidance jsonb,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists living_world_engine_runs_campaign_covered_idx
  on living_world_engine_runs(campaign_id, covered_message_count desc, created_at desc);

create unique index if not exists living_world_engine_runs_campaign_covered_unique_idx
  on living_world_engine_runs(campaign_id, covered_message_count);

drop trigger if exists campaign_dm_guidance_set_updated_at on campaign_dm_guidance;
create trigger campaign_dm_guidance_set_updated_at
before update on campaign_dm_guidance
for each row execute function set_updated_at();

alter table campaign_dm_guidance enable row level security;
alter table living_world_engine_runs enable row level security;

revoke all on campaign_dm_guidance from anon, authenticated;
revoke all on living_world_engine_runs from anon, authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'campaign_dm_guidance',
    'living_world_engine_runs'
  ]
  loop
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = table_name
        and policyname = 'deny_client_access_until_auth_is_designed'
    ) then
      execute format(
        'create policy deny_client_access_until_auth_is_designed on %I for all to anon, authenticated using (false) with check (false)',
        table_name
      );
    end if;
  end loop;
end $$;

comment on policy deny_client_access_until_auth_is_designed on campaign_dm_guidance
  is 'Browser clients must use server routes for current DM guidance.';
comment on policy deny_client_access_until_auth_is_designed on living_world_engine_runs
  is 'Browser clients must use server routes for living world engine run logs.';
