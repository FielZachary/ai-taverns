create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_email_lower_check check (email = lower(email)),
  constraint users_email_not_blank_check check (length(trim(email)) > 0)
);

create unique index if not exists users_email_key
  on users(email);

create table if not exists auth_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  provider text not null,
  provider_subject text not null,
  email text not null,
  created_at timestamptz not null default now(),
  constraint auth_identities_provider_check check (provider in ('email', 'google')),
  constraint auth_identities_email_lower_check check (email = lower(email))
);

create unique index if not exists auth_identities_provider_subject_key
  on auth_identities(provider, provider_subject);

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_seen_at timestamptz,
  constraint sessions_expires_after_created_check check (expires_at > created_at)
);

create unique index if not exists sessions_token_hash_key
  on sessions(token_hash);

create index if not exists sessions_user_active_idx
  on sessions(user_id, expires_at)
  where revoked_at is null;

create table if not exists login_tokens (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  token_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  constraint login_tokens_email_lower_check check (email = lower(email)),
  constraint login_tokens_expires_after_created_check check (expires_at > created_at)
);

create unique index if not exists login_tokens_token_hash_key
  on login_tokens(token_hash);

create index if not exists login_tokens_email_active_idx
  on login_tokens(email, expires_at)
  where consumed_at is null;

drop trigger if exists users_set_updated_at on users;
create trigger users_set_updated_at
before update on users
for each row execute function set_updated_at();

alter table campaigns
  drop constraint if exists campaigns_owner_user_id_fkey;

alter table campaigns
  add constraint campaigns_owner_user_id_fkey
  foreign key (owner_user_id) references users(id);

alter table players
  drop constraint if exists players_user_id_fkey;

alter table players
  add constraint players_user_id_fkey
  foreign key (user_id) references users(id);
