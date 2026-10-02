create table if not exists public.maple_income_sync (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  version bigint not null default 1 check (version > 0),
  state_updated_at timestamptz not null,
  updated_at timestamptz not null default now(),
  client_id text not null,
  content_hash text not null
);

alter table public.maple_income_sync enable row level security;

drop policy if exists "Users can read their maple income data" on public.maple_income_sync;
create policy "Users can read their maple income data"
on public.maple_income_sync for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their maple income data" on public.maple_income_sync;
create policy "Users can insert their maple income data"
on public.maple_income_sync for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their maple income data" on public.maple_income_sync;
create policy "Users can update their maple income data"
on public.maple_income_sync for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create or replace function public.set_maple_income_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_maple_income_sync_updated_at on public.maple_income_sync;
create trigger set_maple_income_sync_updated_at
before update on public.maple_income_sync
for each row execute function public.set_maple_income_updated_at();

revoke all on public.maple_income_sync from anon;
grant select, insert, update on public.maple_income_sync to authenticated;

-- Personal NEXON API credentials are server-only secrets. Browser roles receive no table access.
create table if not exists public.nexon_api_credentials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  ciphertext text not null,
  iv text not null,
  auth_tag text not null,
  key_version integer not null default 1 check (key_version > 0),
  verified_at timestamptz,
  account_count integer check (account_count is null or account_count >= 0),
  character_count integer check (character_count is null or character_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.nexon_api_credentials enable row level security;

create or replace function public.set_nexon_api_credentials_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_nexon_api_credentials_updated_at on public.nexon_api_credentials;
create trigger set_nexon_api_credentials_updated_at
before update on public.nexon_api_credentials
for each row execute function public.set_nexon_api_credentials_updated_at();

revoke all on public.nexon_api_credentials from anon;
revoke all on public.nexon_api_credentials from authenticated;
grant all on public.nexon_api_credentials to service_role;
