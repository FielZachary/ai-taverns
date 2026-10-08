create table if not exists campaign_turn_summaries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  turn_id uuid not null references turns(id) on delete cascade,
  event_id uuid references campaign_events(id) on delete set null,
  summary text not null,
  entity_keys jsonb not null default '[]'::jsonb,
  open_thread_keys jsonb not null default '[]'::jsonb,
  certainty_notes jsonb not null default '[]'::jsonb,
  token_estimate int not null,
  source_checksum text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(turn_id)
);

create index if not exists campaign_turn_summaries_campaign_created_idx
  on campaign_turn_summaries(campaign_id, created_at desc);

drop trigger if exists campaign_turn_summaries_set_updated_at on campaign_turn_summaries;
create trigger campaign_turn_summaries_set_updated_at
before update on campaign_turn_summaries
for each row execute function set_updated_at();

alter table campaign_turn_summaries enable row level security;
revoke all on campaign_turn_summaries from anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'campaign_turn_summaries'
      and policyname = 'deny_client_access_until_auth_is_designed'
  ) then
    create policy deny_client_access_until_auth_is_designed
      on campaign_turn_summaries
      for all to anon, authenticated
      using (false)
      with check (false);
  end if;
end $$;

comment on policy deny_client_access_until_auth_is_designed on campaign_turn_summaries
  is 'Browser clients must use server routes for compressed campaign history.';
