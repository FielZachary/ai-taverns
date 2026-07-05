do $$
declare
  invalid_count integer;
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'campaigns'
      and column_name = 'owner_user_id'
  ) then
    alter table campaigns
      add column owner_user_id uuid;
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'campaigns'
      and column_name = 'owner_user_id'
      and udt_name <> 'uuid'
  ) then
    execute $check$
      select count(*)
      from campaigns
      where owner_user_id is not null
        and owner_user_id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    $check$ into invalid_count;

    if invalid_count > 0 then
      raise exception 'Cannot convert campaigns.owner_user_id to uuid: % invalid value(s).', invalid_count;
    end if;

    alter table campaigns
      alter column owner_user_id type uuid
      using owner_user_id::text::uuid;
  end if;

  alter table campaigns
    drop constraint if exists campaigns_owner_user_id_fkey;
end $$;

do $$
declare
  invalid_count integer;
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'players'
      and column_name = 'user_id'
  ) then
    alter table players
      add column user_id uuid;
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'players'
      and column_name = 'user_id'
      and udt_name <> 'uuid'
  ) then
    execute $check$
      select count(*)
      from players
      where user_id is not null
        and user_id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    $check$ into invalid_count;

    if invalid_count > 0 then
      raise exception 'Cannot convert players.user_id to uuid: % invalid value(s).', invalid_count;
    end if;

    alter table players
      alter column user_id type uuid
      using user_id::text::uuid;
  end if;

  alter table players
    drop constraint if exists players_user_id_fkey;
end $$;

create index if not exists campaigns_owner_user_id_idx
  on campaigns(owner_user_id)
  where status <> 'deleted';

create index if not exists players_user_campaign_idx
  on players(user_id, campaign_id)
  where status = 'active';
