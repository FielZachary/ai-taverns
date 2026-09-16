alter table users
  add column if not exists onboarding_completed_at timestamptz;

update users
set onboarding_completed_at = users.created_at
where users.onboarding_completed_at is null
  and (
    exists (
      select 1
      from campaigns
      where campaigns.owner_user_id = users.id
    )
    or exists (
      select 1
      from players
      where players.user_id = users.id
    )
  );
