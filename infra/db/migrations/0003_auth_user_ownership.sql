alter table campaigns
  add column if not exists owner_user_id uuid references auth.users(id);

alter table campaigns
  add column if not exists mode text not null default 'multiplayer';

alter table campaigns
  drop constraint if exists campaigns_mode_check;

alter table campaigns
  add constraint campaigns_mode_check check (mode in ('single_player', 'multiplayer'));

alter table players
  add column if not exists user_id uuid references auth.users(id);

create index if not exists campaigns_owner_user_id_idx
  on campaigns(owner_user_id)
  where status <> 'deleted';

create index if not exists players_user_campaign_idx
  on players(user_id, campaign_id)
  where status = 'active';
