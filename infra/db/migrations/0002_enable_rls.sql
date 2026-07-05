do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;

  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;

alter table campaigns enable row level security;
alter table players enable row level security;
alter table turns enable row level security;
alter table submissions enable row level security;
alter table campaign_events enable row level security;

revoke all on campaigns from anon, authenticated;
revoke all on players from anon, authenticated;
revoke all on turns from anon, authenticated;
revoke all on submissions from anon, authenticated;
revoke all on campaign_events from anon, authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'campaigns',
    'players',
    'turns',
    'submissions',
    'campaign_events'
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

comment on policy deny_client_access_until_auth_is_designed on campaigns
  is 'Temporary first-migration guard: browsers must use Next.js server routes until auth/owner rules are designed.';
comment on policy deny_client_access_until_auth_is_designed on players
  is 'Temporary first-migration guard: browsers must use Next.js server routes until auth/owner rules are designed.';
comment on policy deny_client_access_until_auth_is_designed on turns
  is 'Temporary first-migration guard: browsers must use Next.js server routes until auth/owner rules are designed.';
comment on policy deny_client_access_until_auth_is_designed on submissions
  is 'Temporary first-migration guard: browsers must use Next.js server routes until auth/owner rules are designed.';
comment on policy deny_client_access_until_auth_is_designed on campaign_events
  is 'Temporary first-migration guard: browsers must use Next.js server routes until auth/owner rules are designed.';
