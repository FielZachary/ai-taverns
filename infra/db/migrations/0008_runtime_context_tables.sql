create table if not exists campaign_context_chunks (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  context_key text not null,
  category text not null,
  title text not null,
  visibility text not null,
  priority int not null default 0,
  body_markdown text not null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(campaign_id, context_key),
  constraint campaign_context_chunks_category_check check (
    category in (
      'npc_context',
      'player_character_context',
      'combat_context',
      'relevant_world_context',
      'quests_open_threads',
      'overarching_big_plot_secrets'
    )
  ),
  constraint campaign_context_chunks_visibility_check check (
    visibility in ('player_safe', 'dm_only')
  )
);

create index if not exists campaign_context_chunks_campaign_category_idx
  on campaign_context_chunks(campaign_id, category, priority desc, updated_at desc)
  where archived_at is null;

create table if not exists active_combats (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  turn_id uuid references turns(id) on delete set null,
  status text not null default 'active',
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ended_at timestamptz,
  constraint active_combats_status_check check (
    status in ('active', 'ended', 'archived')
  )
);

create unique index if not exists active_combats_one_active_per_campaign_idx
  on active_combats(campaign_id)
  where status = 'active';

create table if not exists combat_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  active_combat_id uuid references active_combats(id) on delete set null,
  turn_id uuid references turns(id) on delete set null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists combat_events_campaign_created_idx
  on combat_events(campaign_id, created_at);

create table if not exists dm_turn_traces (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  trace_id text not null,
  turn_id uuid references turns(id) on delete set null,
  phase text not null,
  elapsed_ms int,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists dm_turn_traces_campaign_trace_idx
  on dm_turn_traces(campaign_id, trace_id, created_at desc);

create table if not exists dm_context_snapshots (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  trace_id text not null,
  turn_id uuid references turns(id) on delete set null,
  selected_job text not null,
  requested_context_keys jsonb not null default '{}'::jsonb,
  included_context_keys jsonb not null default '[]'::jsonb,
  omitted_context_keys jsonb not null default '[]'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists dm_context_snapshots_campaign_trace_idx
  on dm_context_snapshots(campaign_id, trace_id, created_at desc);

create table if not exists dm_model_calls (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  trace_id text not null,
  turn_id uuid references turns(id) on delete set null,
  phase text not null,
  provider text,
  model text,
  raw_response text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists dm_model_calls_campaign_trace_idx
  on dm_model_calls(campaign_id, trace_id, created_at desc);

create table if not exists dm_output_reports (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  trace_id text not null,
  turn_id uuid references turns(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists dm_output_reports_campaign_trace_idx
  on dm_output_reports(campaign_id, trace_id, created_at desc);

create table if not exists dm_memory_patch_logs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  trace_id text not null,
  turn_id uuid references turns(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists dm_memory_patch_logs_campaign_trace_idx
  on dm_memory_patch_logs(campaign_id, trace_id, created_at desc);

drop trigger if exists campaign_context_chunks_set_updated_at on campaign_context_chunks;
create trigger campaign_context_chunks_set_updated_at
before update on campaign_context_chunks
for each row execute function set_updated_at();

drop trigger if exists active_combats_set_updated_at on active_combats;
create trigger active_combats_set_updated_at
before update on active_combats
for each row execute function set_updated_at();

alter table campaign_context_chunks enable row level security;
alter table active_combats enable row level security;
alter table combat_events enable row level security;
alter table dm_turn_traces enable row level security;
alter table dm_context_snapshots enable row level security;
alter table dm_model_calls enable row level security;
alter table dm_output_reports enable row level security;
alter table dm_memory_patch_logs enable row level security;

revoke all on campaign_context_chunks from anon, authenticated;
revoke all on active_combats from anon, authenticated;
revoke all on combat_events from anon, authenticated;
revoke all on dm_turn_traces from anon, authenticated;
revoke all on dm_context_snapshots from anon, authenticated;
revoke all on dm_model_calls from anon, authenticated;
revoke all on dm_output_reports from anon, authenticated;
revoke all on dm_memory_patch_logs from anon, authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'campaign_context_chunks',
    'active_combats',
    'combat_events',
    'dm_turn_traces',
    'dm_context_snapshots',
    'dm_model_calls',
    'dm_output_reports',
    'dm_memory_patch_logs'
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

comment on policy deny_client_access_until_auth_is_designed on campaign_context_chunks
  is 'Browser clients must use server routes for DM runtime context records.';
comment on policy deny_client_access_until_auth_is_designed on active_combats
  is 'Browser clients must use server routes for combat state.';
comment on policy deny_client_access_until_auth_is_designed on combat_events
  is 'Browser clients must use server routes for combat event ledgers.';
comment on policy deny_client_access_until_auth_is_designed on dm_turn_traces
  is 'Browser clients must use server routes for DM runtime traces.';
comment on policy deny_client_access_until_auth_is_designed on dm_context_snapshots
  is 'Browser clients must use server routes for DM context snapshots.';
comment on policy deny_client_access_until_auth_is_designed on dm_model_calls
  is 'Browser clients must use server routes for DM model call logs.';
comment on policy deny_client_access_until_auth_is_designed on dm_output_reports
  is 'Browser clients must use server routes for DM output reports.';
comment on policy deny_client_access_until_auth_is_designed on dm_memory_patch_logs
  is 'Browser clients must use server routes for DM memory patch logs.';
