do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_name = 'campaigns'
      and column_name = 'hermes_session_id'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_name = 'campaigns'
      and column_name = 'session_id'
  ) then
    alter table campaigns rename column hermes_session_id to session_id;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_name = 'turns'
      and column_name = 'hermes_message_id'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_name = 'turns'
      and column_name = 'model_message_id'
  ) then
    alter table turns rename column hermes_message_id to model_message_id;
  end if;
end $$;
