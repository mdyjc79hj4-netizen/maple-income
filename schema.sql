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

-- Support board data is available only through authenticated Vercel server endpoints.
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('bug', 'data', 'feature', 'account', 'other')),
  title text not null check (char_length(title) between 1 and 100),
  content text not null check (char_length(content) between 1 and 5000),
  is_private boolean not null default true,
  status text not null default 'pending' check (status in ('pending', 'answered', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_replies (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  author_user_id uuid not null references auth.users(id) on delete cascade,
  author_role text not null check (author_role in ('user', 'admin')),
  content text not null check (char_length(content) between 1 and 5000),
  created_at timestamptz not null default now()
);

create index if not exists support_tickets_public_created_idx
  on public.support_tickets (created_at desc) where is_private = false;
create index if not exists support_tickets_user_created_idx
  on public.support_tickets (user_id, created_at desc);
create index if not exists support_tickets_status_updated_idx
  on public.support_tickets (status, updated_at desc);
create index if not exists support_replies_ticket_created_idx
  on public.support_replies (ticket_id, created_at);
create index if not exists support_replies_user_created_idx
  on public.support_replies (author_user_id, created_at desc);

alter table public.support_tickets enable row level security;
alter table public.support_replies enable row level security;

drop trigger if exists set_support_tickets_updated_at on public.support_tickets;
create trigger set_support_tickets_updated_at
before update on public.support_tickets
for each row execute function public.set_maple_income_updated_at();

revoke all on public.support_tickets from anon;
revoke all on public.support_tickets from authenticated;
revoke all on public.support_replies from anon;
revoke all on public.support_replies from authenticated;
grant all on public.support_tickets to service_role;
grant all on public.support_replies to service_role;

-- Privacy-preserving daily visit totals. Raw visitor IDs, IP addresses and user agents are not stored here.
create table if not exists public.site_daily_stats (
  visit_date date primary key,
  unique_visitors bigint not null default 0 check (unique_visitors >= 0),
  page_views bigint not null default 0 check (page_views >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.site_daily_visitor_keys (
  visit_date date not null,
  visitor_hash text not null check (char_length(visitor_hash) = 64),
  created_at timestamptz not null default now(),
  primary key (visit_date, visitor_hash)
);

alter table public.site_daily_stats enable row level security;
alter table public.site_daily_visitor_keys enable row level security;

revoke all on public.site_daily_stats from anon;
revoke all on public.site_daily_stats from authenticated;
revoke all on public.site_daily_visitor_keys from anon;
revoke all on public.site_daily_visitor_keys from authenticated;
grant all on public.site_daily_stats to service_role;
grant all on public.site_daily_visitor_keys to service_role;

create or replace function public.record_site_visit(p_visit_date date, p_visitor_hash text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  is_new_visitor integer := 0;
begin
  if p_visit_date is null or p_visitor_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid analytics input';
  end if;

  delete from public.site_daily_visitor_keys
  where visit_date < p_visit_date - 1;

  insert into public.site_daily_visitor_keys (visit_date, visitor_hash)
  values (p_visit_date, p_visitor_hash)
  on conflict do nothing;
  get diagnostics is_new_visitor = row_count;

  insert into public.site_daily_stats (visit_date, unique_visitors, page_views, updated_at)
  values (p_visit_date, is_new_visitor, 1, now())
  on conflict (visit_date) do update
  set unique_visitors = public.site_daily_stats.unique_visitors + is_new_visitor,
      page_views = public.site_daily_stats.page_views + 1,
      updated_at = now();
end;
$$;

revoke all on function public.record_site_visit(date, text) from public;
revoke all on function public.record_site_visit(date, text) from anon;
revoke all on function public.record_site_visit(date, text) from authenticated;
grant execute on function public.record_site_visit(date, text) to service_role;
