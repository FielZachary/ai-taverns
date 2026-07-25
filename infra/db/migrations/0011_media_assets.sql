create table if not exists media_assets (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references users(id) on delete set null,
  campaign_id uuid references campaigns(id) on delete cascade,
  player_id uuid references players(id) on delete set null,
  kind text not null,
  status text not null default 'pending',
  storage_provider text not null,
  bucket text,
  object_key text,
  public_url text,
  content_type text not null default 'image/webp',
  byte_size int,
  width int,
  height int,
  sha256 text,
  prompt text,
  negative_prompt text,
  provider text,
  model text,
  provider_request_id text,
  generation_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint media_assets_kind_check check (
    kind in ('character_portrait', 'campaign_cover', 'npc_portrait')
  ),
  constraint media_assets_status_check check (
    status in ('pending', 'ready', 'failed', 'deleted')
  ),
  constraint media_assets_storage_provider_check check (
    storage_provider in ('local', 'digitalocean_spaces', 's3')
  ),
  constraint media_assets_byte_size_check check (
    byte_size is null or byte_size >= 0
  ),
  constraint media_assets_dimensions_check check (
    (width is null or width > 0) and (height is null or height > 0)
  )
);

create index if not exists media_assets_campaign_kind_idx
  on media_assets(campaign_id, kind, created_at desc)
  where status <> 'deleted';

create index if not exists media_assets_player_kind_idx
  on media_assets(player_id, kind, created_at desc)
  where status <> 'deleted';

create index if not exists media_assets_owner_created_idx
  on media_assets(owner_user_id, created_at desc)
  where status <> 'deleted';

drop trigger if exists media_assets_set_updated_at on media_assets;
create trigger media_assets_set_updated_at
before update on media_assets
for each row execute function set_updated_at();

alter table players
  add column if not exists portrait_asset_id uuid references media_assets(id) on delete set null;

create index if not exists players_portrait_asset_idx
  on players(portrait_asset_id)
  where portrait_asset_id is not null;
