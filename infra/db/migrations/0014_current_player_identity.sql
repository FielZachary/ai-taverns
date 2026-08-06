update players
set user_id = campaigns.owner_user_id
from campaigns
where players.campaign_id = campaigns.id
  and players.client_id = campaigns.owner_client_id
  and players.user_id is null
  and campaigns.owner_user_id is not null
  and players.status = 'active';

create index if not exists players_campaign_user_active_idx
  on players(campaign_id, user_id)
  where status = 'active' and user_id is not null;
