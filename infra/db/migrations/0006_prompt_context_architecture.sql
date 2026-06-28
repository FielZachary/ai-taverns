create table if not exists turn_summaries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  turn_id uuid not null references turns(id) on delete cascade,
  sequence_number bigint not null,
  source_event_ids uuid[] not null default '{}'::uuid[],
  summary_text text not null,
  token_estimate int not null default 0,
  entities text[] not null default '{}'::text[],
  location_refs text[] not null default '{}'::text[],
  quest_refs text[] not null default '{}'::text[],
  has_unresolved_question boolean not null default false,
  has_state_change boolean not null default false,
  created_at timestamptz not null default now(),
  unique(campaign_id, turn_id)
);

create table if not exists campaign_current_state (
  campaign_id uuid primary key references campaigns(id) on delete cascade,
  style jsonb not null default '{}'::jsonb,
  current_scene jsonb not null default '{}'::jsonb,
  source_event_ids uuid[] not null default '{}'::uuid[],
  updated_at timestamptz not null default now()
);

create table if not exists campaign_memories (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  memory_type text not null,
  title text not null,
  summary text not null,
  entities text[] not null default '{}'::text[],
  location_refs text[] not null default '{}'::text[],
  quest_refs text[] not null default '{}'::text[],
  status text not null default 'active',
  importance int not null default 3,
  first_seen_turn_id uuid references turns(id) on delete set null,
  last_mentioned_turn_id uuid references turns(id) on delete set null,
  source_event_ids uuid[] not null default '{}'::uuid[],
  embedding double precision[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_memories_type_check check (
    memory_type in (
      'npc',
      'location',
      'quest',
      'clue',
      'item',
      'lore',
      'relationship',
      'threat'
    )
  ),
  constraint campaign_memories_status_check check (
    status in ('active', 'resolved', 'stale')
  ),
  constraint campaign_memories_importance_check check (
    importance between 1 and 5
  )
);

create unique index if not exists campaign_memories_campaign_type_title_idx
  on campaign_memories(campaign_id, memory_type, lower(title));

create index if not exists turn_summaries_campaign_sequence_idx
  on turn_summaries(campaign_id, sequence_number desc);

create index if not exists campaign_memories_campaign_status_idx
  on campaign_memories(campaign_id, status, importance desc, updated_at desc);

create index if not exists campaign_memories_entities_idx
  on campaign_memories using gin(entities);

create index if not exists campaign_memories_location_refs_idx
  on campaign_memories using gin(location_refs);

create index if not exists campaign_memories_quest_refs_idx
  on campaign_memories using gin(quest_refs);

alter table turn_summaries enable row level security;
alter table campaign_current_state enable row level security;
alter table campaign_memories enable row level security;

revoke all on turn_summaries from anon, authenticated;
revoke all on campaign_current_state from anon, authenticated;
revoke all on campaign_memories from anon, authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'turn_summaries',
    'campaign_current_state',
    'campaign_memories'
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

comment on policy deny_client_access_until_auth_is_designed on turn_summaries
  is 'Browser clients must use Next.js server routes for prompt context records.';
comment on policy deny_client_access_until_auth_is_designed on campaign_current_state
  is 'Browser clients must use Next.js server routes for prompt context records.';
comment on policy deny_client_access_until_auth_is_designed on campaign_memories
  is 'Browser clients must use Next.js server routes for prompt context records.';

drop trigger if exists campaign_memories_set_updated_at on campaign_memories;
create trigger campaign_memories_set_updated_at
before update on campaign_memories
for each row execute function set_updated_at();
